// ── Sales Returns Supabase Service (Tenant-isolated) ──────────────────────────
//
// Interacts with `public.sales_returns` and `public.sales_return_items`.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { SalesReturn } from "@/lib/store";

// ── READ ──────────────────────────────────────────────────────────────────────

export async function sb_fetchSalesReturns(
  tenantId: string,
): Promise<{ returns: SalesReturn[]; error: string | null }> {
  if (!tenantId) return { returns: [], error: "Tenant ID required" };

  const { data: headers, error: hErr } = await supabase
    .from("sales_returns")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("return_date", { ascending: false });

  if (hErr) return { returns: [], error: hErr.message };
  if (!headers || headers.length === 0) return { returns: [], error: null };

  const { data: items, error: iErr } = await supabase
    .from("sales_return_items")
    .select("*")
    .eq("tenant_id", tenantId);

  if (iErr) return { returns: [], error: iErr.message };

  const itemsByReturnId = new Map<string, SalesReturn["items"]>();
  (items ?? []).forEach((it: any) => {
    const rid = it.return_id;
    if (!itemsByReturnId.has(rid)) itemsByReturnId.set(rid, []);
    itemsByReturnId.get(rid)!.push({
      medicineId: it.medicine_id ?? "",
      medicineName: it.medicine_name ?? "",
      batch: it.batch ?? "",
      expiry: it.expiry ?? "",
      returnedQty: Number(it.returned_qty) || 0,
      unit: it.unit ?? "Units",
      rate: Number(it.rate) || 0,
      gst: Number(it.gst) || 0,
      returnAmount: Number(it.return_amount) || 0,
      originalQty: Number(it.original_qty) || 0,
    });
  });

  const returns: SalesReturn[] = headers.map((r: any) => ({
    id: r.id,
    tenantId: r.tenant_id,
    returnNo: r.return_no ?? r.id,
    originalSaleId: r.original_sale_id,
    customerId: r.customer_id ?? null,
    customerName: r.customer_name ?? "Walk-in",
    phone: r.phone ?? "",
    items: itemsByReturnId.get(r.id) ?? [],
    returnAmount: Number(r.return_amount) || 0,
    gstAmount: Number(r.gst_amount) || 0,
    reason: r.reason ?? "",
    returnDate: r.return_date ?? r.created_at ?? "",
    status: r.status ?? "completed",
    processedBy: r.processed_by ?? "",
    processedByName: r.processed_by_name ?? "",
    createdAt: r.created_at ?? "",
  }));

  return { returns, error: null };
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function sb_insertSalesReturn(
  tenantId: string,
  ret: SalesReturn,
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const { error: hErr } = await supabase.from("sales_returns").insert({
    id: ret.id,
    tenant_id: tenantId,
    return_no: ret.returnNo,
    original_sale_id: ret.originalSaleId,
    customer_id: ret.customerId ?? null,
    customer_name: ret.customerName,
    phone: ret.phone ?? null,
    return_amount: Number(ret.returnAmount) || 0,
    gst_amount: Number(ret.gstAmount) || 0,
    reason: ret.reason ?? "",
    return_date: ret.returnDate,
    status: ret.status ?? "completed",
    processed_by: ret.processedBy ?? null,
    processed_by_name: ret.processedByName ?? null,
    created_at: ret.createdAt ?? new Date().toISOString(),
  });

  if (hErr) return { error: hErr.message };

  if (ret.items && ret.items.length > 0) {
    const itemRows = ret.items.map((it, idx) => ({
      id: `${ret.id}_ITEM_${idx + 1}`,
      return_id: ret.id,
      tenant_id: tenantId,
      medicine_id: it.medicineId || null,
      medicine_name: it.medicineName,
      batch: it.batch,
      expiry: it.expiry ?? null,
      returned_qty: Number(it.returnedQty) || 0,
      original_qty: Number(it.originalQty) || 0,
      unit: it.unit ?? "Units",
      rate: Number(it.rate) || 0,
      gst: Number(it.gst) || 0,
      return_amount: Number(it.returnAmount) || 0,
      created_at: new Date().toISOString(),
    }));

    const { error: iErr } = await supabase.from("sales_return_items").insert(itemRows);
    if (iErr) {
      // Rollback header on item failure
      await supabase.from("sales_returns").delete().eq("id", ret.id).eq("tenant_id", tenantId);
      return { error: `Failed to save return items: ${iErr.message}` };
    }
  }

  return { error: null };
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function sb_deleteSalesReturn(
  tenantId: string,
  id: string,
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  await supabase.from("sales_return_items").delete().eq("return_id", id).eq("tenant_id", tenantId);

  const { error } = await supabase
    .from("sales_returns")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
