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

  // Safe category resolution: strictly "Branded" or "Generic"
  let category: "Branded" | "Generic" = "Branded";
  let generic: string | undefined = row.generic ? row.generic.trim() : undefined;

  const rawGenericLower = (row.generic || "").trim().toLowerCase();
  const rawBoxLower = (row.box_no || "").trim().toLowerCase();

  if (rawBoxLower === "generic" || rawGenericLower === "generic") {
    category = "Generic";
    if (rawGenericLower === "generic") {
      generic = undefined;
    }
  } else if (rawBoxLower === "branded" || rawGenericLower === "branded") {
    category = "Branded";
    if (rawGenericLower === "branded") {
      generic = undefined;
    }
  } else {
    // Legacy row with chemical composition (e.g. "AMLODIPINE 5 MG + LOSARTAN 50 MG"):
    // Retain chemical composition as generic, and default retail brand category to "Branded"
    category = "Branded";
  }

  return {
    id: row.id,
    code: row.code ?? undefined,
    name: row.name,
    generic: generic || undefined,
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
    box_no: row.box_no && row.box_no !== "Branded" && row.box_no !== "Generic" ? row.box_no : undefined,
    rack: row.rack ?? undefined,
    min_stock: row.min_stock !== null && row.min_stock !== undefined ? Number(row.min_stock) : 10,
    schedule_h: Boolean(row.schedule_h),
    category,
    type: row.units ?? undefined,
    created_at: row.created_at || undefined,
  };
}

function medicineToRow(tenantId: string, m: Medicine): Record<string, any> {
  const currentRate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
  const normalizedCategory = (m.category || "").toLowerCase() === "generic" ? "Generic" : "Branded";
  return {
    id: m.id,
    tenant_id: tenantId,
    code: m.code || null,
    name: m.name.trim(),
    generic: m.generic?.trim() || null,
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
    box_no: m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic" ? m.box_no.trim() : null,
    category: normalizedCategory,
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

// ── MEDICINE CODE GENERATION (Format: ACA0001, ACE0001..ACE0006) ─────────────
//
// Generates permanent, unique medicine codes from the database in the format:
//   First 3 alphabetic letters of medicine name + 4-digit sequential number.
// Examples:
//   ACARDIS         → ACA0001
//   ACE CLO PLUS    → ACE0001
//   Next with ACE   → ACE0002, ACE0003...
//   ACI...          → ACI0001, ACI0002...
//
// Rules:
//   - Each prefix maintains its own sequence per tenant.
//   - Generated automatically and atomically via Supabase RPC or DB query fallback.
//   - Existing codes (e.g. MED-000853, M0001) are strictly preserved and never overwritten.
// ─────────────────────────────────────────────────────────────────────────────

/** Extract first 3 alphabetic letters uppercase (ignoring spaces, digits, and special chars). */
export function extractMedicinePrefix(name: string): string {
  const alpha = (name ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (alpha.length >= 3) return alpha.slice(0, 3);
  if (alpha.length > 0) return alpha.padEnd(3, "X");
  return "MED";
}

/** Format a prefix and sequence number into a 4-digit code: e.g. "ACE" + 1 → "ACE0001". */
export function formatMedicineId(prefix: string, seq: number): string {
  const safePfx = (prefix || "MED").toUpperCase().slice(0, 3).padEnd(3, "X");
  return safePfx + String(Math.max(1, seq)).padStart(4, "0");
}

/** Parse sequence number from a 4-digit code matching the prefix (e.g. "ACE0002" → 2). Returns -1 if not matching. */
export function parsePrefixCodeSeq(code: string | null | undefined, prefix: string): number {
  if (!code) return -1;
  const safePfx = prefix.toUpperCase().slice(0, 3);
  const regex = new RegExp(`^${safePfx}(\\d{4,})$`, "i");
  const m = regex.exec(code.trim());
  return m ? parseInt(m[1], 10) : -1;
}

/**
 * Generate atomic sequential Medicine ID(s) for a given medicine name and tenant.
 * Uses the first 3 letters as prefix + 4-digit sequence (e.g. ACA0001, ACE0001).
 *
 * 1. Tries Supabase RPC `generate_medicine_id(p_tenant_id, p_med_name, p_count)`
 * 2. Fallback: queries maximum sequence of existing codes with this prefix from `medicines` table.
 */
export async function sb_generateMedicineId(
  tenantId: string,
  medName: string,
  count = 1,
): Promise<{ codes: string[]; error: string | null }> {
  if (!tenantId) return { codes: [], error: "Tenant ID required" };
  const prefix = extractMedicinePrefix(medName);

  // 1. Try Supabase RPC first
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "generate_medicine_id",
      { p_tenant_id: tenantId, p_med_name: medName, p_count: count },
    );
    if (!rpcErr && Array.isArray(rpcData) && rpcData.length === count) {
      return { codes: rpcData as string[], error: null };
    }
  } catch {
    // RPC not available yet – proceed to fallback
  }

  // 2. Fallback: query existing codes matching this prefix for this tenant
  const { data, error } = await supabase
    .from("medicines")
    .select("code")
    .eq("tenant_id", tenantId)
    .ilike("code", `${prefix}%`);

  if (error) {
    console.warn("[medicines-supabase] sb_generateMedicineId fallback query error:", error.message);
  }

  let maxSeq = 0;
  (data ?? []).forEach((row) => {
    const n = parsePrefixCodeSeq(row.code, prefix);
    if (n > maxSeq) maxSeq = n;
  });

  const codes = Array.from({ length: count }, (_, i) => formatMedicineId(prefix, maxSeq + 1 + i));
  return { codes, error: null };
}

/** Backwards-compatible alias for existing callers. */
export async function sb_generateMedicineCode(
  tenantId: string,
  count = 1,
  medName = "MED",
): Promise<{ codes: string[]; error: string | null }> {
  return sb_generateMedicineId(tenantId, medName, count);
}

// ── MEDICINE NAME NORMALIZATION & DUPLICATE DETECTION ────────────────────────
//
// Normalization rule:
//   Convert letters to uppercase and remove all characters except A–Z and 0–9.
//   Ignore spaces, extra spaces, hyphens, slashes, and special characters.
//
// Examples:
//   "ACE CLO PLUS -AT" → "ACECLOPLUSAT"
//   "ACE CLO PLUS AT"   → "ACECLOPLUSAT"
//   "ACE  CLO  PLUS AT" → "ACECLOPLUSAT"
//   "ace-clo-plus-at"   → "ACECLOPLUSAT"
//   "PARACETAMOL 500 MG"→ "PARACETAMOL500MG"
//   "PARACETAMOL 650 MG"→ "PARACETAMOL650MG" (different strength → separate IDs!)
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize medicine name strictly: uppercase letters and digits only ([A-Z0-9]). */
export function normalizeMedName(name: string): string {
  return (name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Alias for compatibility. */
export const normaliseMedName = normalizeMedName;

export type MedicineDuplicateStatus =
  | "existing"     // Same normalized product (same name, strength, composition)
  | "review"       // Name matches but composition/strength/company differ
  | "new";         // Completely new medicine

export interface MedicineDuplicateResult {
  status: MedicineDuplicateStatus;
  /** The best-matching existing medicine (if status is "existing" or "review"). */
  match?: Medicine;
}

/**
 * Find an existing product matching candidate by normalized name, strength, and composition.
 * Differentiates strengths like 500 MG vs 650 MG.
 */
export function findMatchingMedicine(
  candidate: { name: string; generic?: string; company?: string },
  existingMedicines: Medicine[],
): Medicine | null {
  const normName = normalizeMedName(candidate.name);
  if (!normName) return null;

  // Filter existing medicines whose normalized name is identical
  const nameMatches = existingMedicines.filter(
    (m) => normalizeMedName(m.name) === normName,
  );
  if (nameMatches.length === 0) return null;

  // Check composition / generic if provided
  const candGen = normalizeMedName(candidate.generic ?? "");
  if (candGen) {
    const exactGen = nameMatches.filter(
      (m) => !m.generic || normalizeMedName(m.generic) === candGen,
    );
    if (exactGen.length > 0) {
      const normComp = normalizeMedName(candidate.company ?? "");
      if (normComp) {
        const sameComp = exactGen.find((m) => normalizeMedName(m.company ?? "") === normComp);
        if (sameComp) return sameComp;
      }
      return exactGen[0];
    }
    // Generic specified and differs -> distinct product!
    return null;
  }

  // If candidate has no generic specified, prefer matching manufacturer if available
  const normComp = normalizeMedName(candidate.company ?? "");
  if (normComp) {
    const sameComp = nameMatches.find((m) => normalizeMedName(m.company ?? "") === normComp);
    if (sameComp) return sameComp;
  }

  return nameMatches[0];
}

/**
 * Check a list of candidate medicines against existing medicines for a tenant.
 */
export function detectDuplicates(
  candidates: Array<{ name: string; company?: string; generic?: string }>,
  existingMedicines: Medicine[],
): MedicineDuplicateResult[] {
  return candidates.map((cand) => {
    const normName = normalizeMedName(cand.name);
    if (!normName) return { status: "new" };

    const nameMatches = existingMedicines.filter(
      (m) => normalizeMedName(m.name) === normName,
    );
    if (nameMatches.length === 0) return { status: "new" };

    const match = findMatchingMedicine(cand, existingMedicines);
    if (match) {
      return { status: "existing", match };
    }

    // Name matched but composition differed
    return { status: "review", match: nameMatches[0] };
  });
}


