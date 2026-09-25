// ── Purchases Supabase Service (Tenant-isolated) ────────────────────────────
//
// Interacts with `public.purchases` and `public.purchase_items` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { Purchase } from "@/lib/store";

type DbPurchaseRow = {
  id: string;
  tenant_id: string;
  supplier_name: string;
  supplier_id?: string | null;
  invoice_no: string;
  purchase_date: string;
  subtotal?: number;
  total: number;
  notes?: string | null;
  created_at?: string;
};

type DbPurchaseItemRow = {
  id: string;
  purchase_id: string;
  tenant_id: string;
  medicine_id?: string | null;
  medicine_name: string;
  batch: string;
  expiry?: string | null;
  quantity: number;
  purchase_rate: number;
  mrp?: number;
  gst: number;
  discount?: number;
  total: number;
  created_at?: string;
};

// ── READ ──────────────────────────────────────────────────────────────────────

export async function sb_fetchPurchases(tenantId: string): Promise<{ purchases: Purchase[]; error: string | null }> {
  if (!tenantId) return { purchases: [], error: "Tenant ID required" };

  // 1. Fetch purchase headers
  const { data: purchaseRows, error: pError } = await supabase
    .from("purchases")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (pError) return { purchases: [], error: pError.message };
  if (!purchaseRows || purchaseRows.length === 0) return { purchases: [], error: null };

  // 2. Fetch purchase items for this tenant
  const { data: itemRows, error: iError } = await supabase
    .from("purchase_items")
    .select("*")
    .eq("tenant_id", tenantId);

  if (iError) return { purchases: [], error: iError.message };

  // 3. Group items by purchase_id
  const itemsByPurchaseId = new Map<string, Purchase["items"]>();
  (itemRows ?? []).forEach((it: any) => {
    const pId = it.purchase_id;
    if (!itemsByPurchaseId.has(pId)) {
      itemsByPurchaseId.set(pId, []);
    }
    itemsByPurchaseId.get(pId)!.push({
      name: it.medicine_name ?? it.name ?? "",
      batch: it.batch ?? "",
      qty: Number(it.quantity ?? it.qty) || 0,
      rate: Number(it.purchase_rate ?? it.rate) || 0,
      gst: Number(it.gst) || 0,
    });
  });

  // 4. Assemble complete Purchase objects
  const purchases: Purchase[] = purchaseRows.map((r: any) => ({
    id: r.id,
    date: r.purchase_date ?? r.date ?? r.created_at?.slice(0, 10) ?? "",
    supplier: r.supplier_name ?? r.supplier ?? "",
    supplierId: r.supplier_id ?? undefined,
    invoiceNo: r.invoice_no ?? r.invoiceNo ?? "",
    total: Number(r.total) || 0,
    items: itemsByPurchaseId.get(r.id) ?? [],
  }));

  return { purchases, error: null };
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function sb_insertPurchase(tenantId: string, purchase: Purchase): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  // 1. Resolve supplier_id for current tenant
  let resolvedSupplierId = purchase.supplierId || null;
  if (!resolvedSupplierId && purchase.supplier) {
    const { data: matchedSupplier } = await supabase
      .from("suppliers")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", purchase.supplier.trim())
      .limit(1)
      .maybeSingle();

    if (matchedSupplier?.id) {
      resolvedSupplierId = matchedSupplier.id;
    }
  }

  // 2. Insert header using exact database columns
  const headerRow: Record<string, any> = {
    id: purchase.id,
    tenant_id: tenantId,
    supplier_id: resolvedSupplierId,
    supplier_name: purchase.supplier.trim(),
    invoice_no: purchase.invoiceNo.trim(),
    purchase_date: purchase.date,
    total: Number(purchase.total) || 0,
    created_at: new Date().toISOString(),
  };

  const { error: pError } = await supabase
    .from("purchases")
    .insert(headerRow);

  if (pError) return { error: pError.message };

  // 2. Insert line items using exact database columns
  if (purchase.items && purchase.items.length > 0) {
    const itemRows = purchase.items.map((it, idx) => {
      const lineTotal = Math.round(it.qty * it.rate * (1 + it.gst / 100));
      return {
        id: `${purchase.id}_ITEM_${idx + 1}`,
        purchase_id: purchase.id,
        tenant_id: tenantId,
        medicine_name: it.name.trim(),
        batch: it.batch.trim(),
        quantity: Number(it.qty) || 0,
        purchase_rate: Number(it.rate) || 0,
        mrp: Math.round(Number(it.rate) * 1.4),
        gst: Number(it.gst) || 0,
        discount: 0,
        total: lineTotal,
        created_at: new Date().toISOString(),
      };
    });

    const { error: iError } = await supabase
      .from("purchase_items")
      .insert(itemRows);

    if (iError) return { error: iError.message };
  }

  return { error: null };
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function sb_deletePurchase(tenantId: string, id: string): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  // Delete line items first
  await supabase
    .from("purchase_items")
    .delete()
    .eq("purchase_id", id)
    .eq("tenant_id", tenantId);

  // Delete header
  const { error } = await supabase
    .from("purchases")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
