// ── Sales Supabase Service (Tenant-isolated) ───────────────────────────────
//
// Interacts with `public.sales` and `public.sale_items` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { Sale, SaleItem } from "@/lib/store";

type DbSaleRow = {
  id: string;
  tenant_id: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string;
  phone: string | null;
  doctor: string | null;
  subtotal: number;
  discount: number;
  gst: number;
  grand_total: number;
  payment_mode: string;
  status: "paid" | "held" | "cancelled";
  cashier_id: string | null;
  cashier_name: string | null;
  created_at?: string;
  updated_at?: string;
};

type DbSaleItemRow = {
  id: string;
  sale_id: string;
  tenant_id: string;
  medicine_id: string | null;
  medicine_name: string;
  batch: string;
  quantity: number;
  mrp: number;
  gst: number;
  discount: number;
  total: number;
  created_at?: string;
};

// ── READ ──────────────────────────────────────────────────────────────────────

export async function sb_fetchSales(tenantId: string): Promise<{ sales: Sale[]; error: string | null }> {
  if (!tenantId) return { sales: [], error: "Tenant ID required" };

  // 1. Fetch sale headers for current tenant
  const { data: saleRows, error: sError } = await supabase
    .from("sales")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sale_date", { ascending: false });

  if (sError) return { sales: [], error: sError.message };
  if (!saleRows || saleRows.length === 0) return { sales: [], error: null };

  // 2. Fetch sale items for current tenant
  const { data: itemRows, error: iError } = await supabase
    .from("sale_items")
    .select("*")
    .eq("tenant_id", tenantId);

  if (iError) return { sales: [], error: iError.message };

  // 3. Group items by sale_id
  const itemsBySaleId = new Map<string, SaleItem[]>();
  (itemRows ?? []).forEach((it: any) => {
    const sId = it.sale_id;
    if (!itemsBySaleId.has(sId)) {
      itemsBySaleId.set(sId, []);
    }
    itemsBySaleId.get(sId)!.push({
      id: it.medicine_id ?? it.id,
      name: it.medicine_name,
      batch: it.batch ?? "",
      qty: Number(it.quantity) || 0,
      mrp: Number(it.mrp) || 0,
      gst: Number(it.gst) || 0,
      discount: Number(it.discount) || 0,
      total: Number(it.total) || 0,
    });
  });

  // 4. Assemble complete Sale objects matching app model
  const sales: Sale[] = saleRows.map((r: any) => ({
    id: r.id,
    date: r.sale_date ?? r.created_at ?? new Date().toISOString(),
    customerId: r.customer_id ?? null,
    customerName: r.customer_name ?? "Walk-in customer",
    phone: r.phone ?? "",
    doctor: r.doctor ?? undefined,
    items: itemsBySaleId.get(r.id) ?? [],
    sub: Number(r.subtotal) || 0,
    disc: Number(r.discount) || 0,
    gst: Number(r.gst) || 0,
    grand: Number(r.grand_total) || 0,
    payment: r.payment_mode ?? "cash",
    status: (r.status as "paid" | "held" | "cancelled") ?? "paid",
    cashierId: r.cashier_id ?? undefined,
    cashierName: r.cashier_name ?? undefined,
  }));

  return { sales, error: null };
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function sb_insertSale(tenantId: string, sale: Sale): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  // 1. Insert header
  const saleRow: DbSaleRow = {
    id: sale.id,
    tenant_id: tenantId,
    sale_date: sale.date || new Date().toISOString(),
    customer_id: sale.customerId || null,
    customer_name: (sale.customerName || "Walk-in customer").trim(),
    phone: sale.phone?.trim() || null,
    doctor: sale.doctor?.trim() || null,
    subtotal: Number(sale.sub) || 0,
    discount: Number(sale.disc) || 0,
    gst: Number(sale.gst) || 0,
    grand_total: Number(sale.grand) || 0,
    payment_mode: sale.payment || "cash",
    status: sale.status || "paid",
    cashier_id: sale.cashierId || null,
    cashier_name: sale.cashierName || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: sError } = await supabase
    .from("sales")
    .insert(saleRow);

  if (sError) return { error: sError.message };

  // 2. Insert line items
  if (sale.items && sale.items.length > 0) {
    const itemRows: DbSaleItemRow[] = sale.items.map((it, idx) => ({
      id: `${sale.id}_ITEM_${idx + 1}`,
      sale_id: sale.id,
      tenant_id: tenantId,
      medicine_id: it.id || null,
      medicine_name: it.name.trim(),
      batch: it.batch.trim(),
      quantity: Number(it.totalUnits !== undefined ? it.totalUnits : it.qty) || 1,
      mrp: Number(it.unitMrp !== undefined ? it.unitMrp : it.mrp) || 0,
      gst: Number(it.gst) || 0,
      discount: Number(it.discount) || 0,
      total: Number(it.total) || 0,
      created_at: new Date().toISOString(),
    }));

    const { error: iError } = await supabase
      .from("sale_items")
      .insert(itemRows);

    if (iError) {
      // Transaction Safety: avoid leaving an orphaned header if items fail to insert
      await supabase
        .from("sales")
        .delete()
        .eq("id", sale.id)
        .eq("tenant_id", tenantId);

      return { error: `Failed to save sale items: ${iError.message}` };
    }
  }

  return { error: null };
}

// ── UPDATE STATUS ─────────────────────────────────────────────────────────────

export async function sb_updateSaleStatus(
  tenantId: string,
  id: string,
  status: "paid" | "held" | "cancelled",
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const { error } = await supabase
    .from("sales")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function sb_deleteSale(tenantId: string, id: string): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  // Delete line items first
  await supabase
    .from("sale_items")
    .delete()
    .eq("sale_id", id)
    .eq("tenant_id", tenantId);

  // Delete header
  const { error } = await supabase
    .from("sales")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
