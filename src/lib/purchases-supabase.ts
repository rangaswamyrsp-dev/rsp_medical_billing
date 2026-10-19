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
  status?: string | null;
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

export function parsePurchaseStatus(row: any): "PENDING" | "RECEIVED" | "RETURNED" {
  if (row.status) {
    const s = String(row.status).trim().toUpperCase();
    if (s === "PENDING" || s === "DRAFT") return "PENDING";
    if (s === "RETURNED") return "RETURNED";
    if (s === "RECEIVED" || s === "FINAL") return "RECEIVED";
  }
  if (row.notes) {
    const m = String(row.notes).match(/\[STATUS:(PENDING|DRAFT|RECEIVED|RETURNED|FINAL)\]/i);
    if (m) {
      const s = m[1].toUpperCase();
      if (s === "DRAFT" || s === "PENDING") return "PENDING";
      if (s === "RETURNED") return "RETURNED";
      return "RECEIVED";
    }
  }
  return "RECEIVED";
}

export function encodeStatusNote(status: string | undefined, notes: string | null | undefined): string {
  const s = status ? status.toUpperCase() : "RECEIVED";
  const cleanNotes = (notes || "").replace(/\[STATUS:[^\]]+\]\s*/g, "").trim();
  return `[STATUS:${s}] ${cleanNotes}`.trim();
}

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
      mrp: it.mrp ? Number(it.mrp) : undefined,
      expiry: it.expiry ?? undefined,
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
    status: parsePurchaseStatus(r),
    notes: r.notes ? r.notes.replace(/\[STATUS:[^\]]+\]\s*/g, "").trim() : undefined,
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

  // 2. Insert header using exact database columns with status preserved in notes
  const statusVal = purchase.status || "RECEIVED";
  const headerRow: Record<string, any> = {
    id: purchase.id,
    tenant_id: tenantId,
    supplier_id: resolvedSupplierId,
    supplier_name: purchase.supplier.trim(),
    invoice_no: purchase.invoiceNo.trim(),
    purchase_date: purchase.date,
    total: Number(purchase.total) || 0,
    notes: encodeStatusNote(statusVal, purchase.notes),
    created_at: new Date().toISOString(),
  };

  const { error: pError } = await supabase
    .from("purchases")
    .insert(headerRow);

  if (pError) return { error: pError.message };

  // 3. Insert line items using exact database columns
  if (purchase.items && purchase.items.length > 0) {
    const itemRows = purchase.items.map((it, idx) => {
      const lineTotal = Math.round(it.qty * it.rate * (1 + it.gst / 100));
      return {
        id: `${purchase.id}_ITEM_${idx + 1}`,
        purchase_id: purchase.id,
        tenant_id: tenantId,
        medicine_name: it.name.trim(),
        batch: it.batch.trim(),
        expiry: it.expiry ? it.expiry.trim() : null,
        quantity: Number(it.qty) || 0,
        purchase_rate: Number(it.rate) || 0,
        mrp: it.mrp ? Number(it.mrp) : Math.round(Number(it.rate) * 1.4),
        gst: Number(it.gst) || 0,
        discount: 0,
        total: lineTotal,
        created_at: new Date().toISOString(),
      };
    });

    const CHUNK_SIZE = 200;
    for (let i = 0; i < itemRows.length; i += CHUNK_SIZE) {
      const chunk = itemRows.slice(i, i + CHUNK_SIZE);
      const { error: iError } = await supabase
        .from("purchase_items")
        .insert(chunk);

      if (iError) return { error: iError.message };
    }
  }

  return { error: null };
}

export async function sb_updatePurchase(
  tenantId: string,
  id: string,
  purchase: Partial<Purchase>
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const updateData: Record<string, any> = {};
  if (purchase.supplier !== undefined) updateData.supplier_name = purchase.supplier.trim();
  if (purchase.supplierId !== undefined) updateData.supplier_id = purchase.supplierId || null;
  if (purchase.invoiceNo !== undefined) updateData.invoice_no = purchase.invoiceNo.trim();
  if (purchase.date !== undefined) updateData.purchase_date = purchase.date;
  if (purchase.total !== undefined) updateData.total = Number(purchase.total) || 0;
  if (purchase.status !== undefined || purchase.notes !== undefined) {
    updateData.notes = encodeStatusNote(purchase.status, purchase.notes);
  }

  if (Object.keys(updateData).length > 0) {
    const { error: pError } = await supabase
      .from("purchases")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (pError) return { error: pError.message };
  }

  // Update line items if provided
  if (purchase.items && Array.isArray(purchase.items)) {
    // Delete old items
    await supabase
      .from("purchase_items")
      .delete()
      .eq("purchase_id", id)
      .eq("tenant_id", tenantId);

    // Insert new items
    if (purchase.items.length > 0) {
      const itemRows = purchase.items.map((it, idx) => {
        const lineTotal = Math.round(it.qty * it.rate * (1 + it.gst / 100));
        return {
          id: `${id}_ITEM_${idx + 1}_${Date.now()}`,
          purchase_id: id,
          tenant_id: tenantId,
          medicine_name: it.name.trim(),
          batch: it.batch.trim(),
          expiry: it.expiry ? it.expiry.trim() : null,
          quantity: Number(it.qty) || 0,
          purchase_rate: Number(it.rate) || 0,
          mrp: it.mrp ? Number(it.mrp) : Math.round(Number(it.rate) * 1.4),
          gst: Number(it.gst) || 0,
          discount: 0,
          total: lineTotal,
          created_at: new Date().toISOString(),
        };
      });

      const CHUNK_SIZE = 200;
      for (let i = 0; i < itemRows.length; i += CHUNK_SIZE) {
        const chunk = itemRows.slice(i, i + CHUNK_SIZE);
        const { error: iError } = await supabase
          .from("purchase_items")
          .insert(chunk);
        if (iError) return { error: iError.message };
      }
    }
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
