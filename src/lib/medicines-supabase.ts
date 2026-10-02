// ── Medicines Supabase Service (Tenant-isolated) ─────────────────────────────
//
// Interacts with `public.medicines` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { Medicine } from "@/data/medicines";

type DbMedicineRow = {
  id: string;
  tenant_id: string;
  code: string | null;
  name: string;
  generic?: string | null;
  company: string | null;
  supplier?: string | null;
  supplier_id?: string | null;
  hsn?: string | null;
  pack?: string | null;
  batch: string;
  expiry: string;
  mrp: number;
  cost: number;
  old_rate?: number | null;
  new_rate?: number | null;
  gst: number;
  stock: number;
  units?: string | null;
  box_no?: string | null;
  rack: string | null;
  min_stock: number;
  schedule_h: boolean;
  created_at: string;
  updated_at: string;
};

function rowToMedicine(row: DbMedicineRow): Medicine {
  const costVal = Number(row.cost) || Number(row.new_rate) || 0;
  const mrpVal = Number(row.mrp) || 0;
  return {
    id: row.id,
    code: row.code ?? undefined,
    name: row.name,
    generic: row.generic ?? undefined,
    company: row.company ?? "",
    supplier: row.supplier ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    hsn: row.hsn ?? undefined,
    pack: row.pack ?? undefined,
    batch: row.batch,
    expiry: row.expiry,
    mrp: mrpVal,
    cost: costVal,
    old_rate: row.old_rate !== null && row.old_rate !== undefined ? Number(row.old_rate) : undefined,
    new_rate: row.new_rate !== null && row.new_rate !== undefined ? Number(row.new_rate) : (costVal || undefined),
    profit: Math.max(0, mrpVal - costVal),
    gst: Number(row.gst) || 0,
    stock: Number(row.stock) || 0,
    units: row.units ?? undefined,
    box_no: row.box_no ?? undefined,
    rack: row.rack ?? undefined,
    min_stock: row.min_stock !== null && row.min_stock !== undefined ? Number(row.min_stock) : 10,
    schedule_h: Boolean(row.schedule_h),
    category: row.generic ?? undefined,
    type: row.units ?? undefined,
    created_at: row.created_at || undefined,
  };
}

function medicineToRow(tenantId: string, m: Medicine): Record<string, any> {
  const currentRate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
  return {
    id: m.id,
    tenant_id: tenantId,
    code: m.code || null,
    name: m.name.trim(),
    generic: m.generic?.trim() || m.category?.trim() || null,
    company: m.company?.trim() || null,
    supplier: m.supplier?.trim() || null,
    supplier_id: m.supplierId || null,
    hsn: m.hsn?.trim() || null,
    pack: m.pack?.trim() || m.type?.trim() || null,
    batch: m.batch.trim(),
    expiry: m.expiry.trim(),
    mrp: Number(m.mrp) || 0,
    cost: currentRate,
    old_rate: m.old_rate !== undefined ? Number(m.old_rate) : null,
    new_rate: currentRate,
    gst: Number(m.gst) || 0,
    stock: Number(m.stock) || 0,
    units: m.units?.trim() || m.type?.trim() || null,
    box_no: m.box_no?.trim() || null,
    rack: m.rack?.trim() || null,
    min_stock: m.min_stock !== undefined ? Number(m.min_stock) : 10,
    schedule_h: Boolean(m.schedule_h),
    updated_at: new Date().toISOString(),
  };
}

// ── READ ──────────────────────────────────────────────────────────────────────

export async function sb_fetchMedicines(tenantId: string): Promise<{ medicines: Medicine[]; error: string | null }> {
  if (!tenantId) return { medicines: [], error: "Tenant ID required" };

  const { data, error } = await supabase
    .from("medicines")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) return { medicines: [], error: error.message };
  return {
    medicines: (data ?? []).map((r) => rowToMedicine(r as DbMedicineRow)),
    error: null,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function sb_insertMedicine(tenantId: string, medicine: Medicine): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const row = medicineToRow(tenantId, medicine);
  const { error } = await supabase
    .from("medicines")
    .insert(row);

  return { error: error?.message ?? null };
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

export async function sb_updateMedicine(
  tenantId: string,
  id: string,
  patch: Partial<Medicine>,
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) updateData.name = patch.name.trim();
  if (patch.generic !== undefined) updateData.generic = patch.generic?.trim() || null;
  if (patch.company !== undefined) updateData.company = patch.company?.trim() || null;
  if (patch.supplier !== undefined) updateData.supplier = patch.supplier?.trim() || null;
  if (patch.supplierId !== undefined) updateData.supplier_id = patch.supplierId || null;
  if (patch.hsn !== undefined) updateData.hsn = patch.hsn?.trim() || null;
  if (patch.pack !== undefined) updateData.pack = patch.pack?.trim() || null;
  if (patch.batch !== undefined) updateData.batch = patch.batch.trim();
  if (patch.expiry !== undefined) updateData.expiry = patch.expiry.trim();
  if (patch.mrp !== undefined) updateData.mrp = Number(patch.mrp) || 0;
  if (patch.cost !== undefined) updateData.cost = Number(patch.cost) || 0;
  if (patch.old_rate !== undefined) updateData.old_rate = Number(patch.old_rate);
  if (patch.new_rate !== undefined) {
    updateData.new_rate = Number(patch.new_rate);
    updateData.cost = Number(patch.new_rate);
  }
  if (patch.gst !== undefined) updateData.gst = Number(patch.gst) || 0;
  if (patch.stock !== undefined) updateData.stock = Number(patch.stock) || 0;
  if (patch.units !== undefined) updateData.units = patch.units?.trim() || null;
  if (patch.box_no !== undefined) updateData.box_no = patch.box_no?.trim() || null;
  if (patch.code !== undefined) updateData.code = patch.code?.trim() || null;
  if (patch.rack !== undefined) updateData.rack = patch.rack?.trim() || null;
  if (patch.min_stock !== undefined) updateData.min_stock = Number(patch.min_stock);
  if (patch.schedule_h !== undefined) updateData.schedule_h = Boolean(patch.schedule_h);

  const { error } = await supabase
    .from("medicines")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function sb_deleteMedicine(tenantId: string, id: string): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const { error } = await supabase
    .from("medicines")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

// ── BULK INSERT ───────────────────────────────────────────────────────────────

export async function sb_bulkInsertMedicines(tenantId: string, list: Medicine[]): Promise<{ error: string | null }> {
  if (!tenantId || list.length === 0) return { error: null };

  const rows = list.map((m) => medicineToRow(tenantId, m));
  const CHUNK_SIZE = 200;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("medicines")
      .insert(chunk);

    if (error) return { error: error.message };
  }

  return { error: null };
}
