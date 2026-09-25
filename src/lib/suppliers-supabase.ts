// ── Suppliers Supabase Service (Tenant-isolated) ────────────────────────────
//
// Interacts with `public.suppliers` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { Supplier } from "@/lib/store";

type DbSupplierRow = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  created_at: string;
  updated_at: string;
};

function rowToSupplier(row: DbSupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    gstin: row.gstin ?? undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function supplierToRow(tenantId: string, s: Supplier): Record<string, any> {
  return {
    id: s.id,
    tenant_id: tenantId,
    name: s.name.trim(),
    phone: s.phone?.trim() || null,
    email: s.email?.trim() || null,
    address: s.address?.trim() || null,
    gstin: s.gstin?.trim() || null,
    created_at: s.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── READ ──────────────────────────────────────────────────────────────────────

export async function sb_fetchSuppliers(tenantId: string): Promise<{ suppliers: Supplier[]; error: string | null }> {
  if (!tenantId) return { suppliers: [], error: "Tenant ID required" };

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) return { suppliers: [], error: error.message };
  return {
    suppliers: (data ?? []).map((r) => rowToSupplier(r as DbSupplierRow)),
    error: null,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function sb_insertSupplier(tenantId: string, supplier: Supplier): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const row = supplierToRow(tenantId, supplier);
  const { error } = await supabase
    .from("suppliers")
    .insert(row);

  return { error: error?.message ?? null };
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

export async function sb_updateSupplier(
  tenantId: string,
  id: string,
  patch: Partial<Supplier>,
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) updateData.name = patch.name.trim();
  if (patch.phone !== undefined) updateData.phone = patch.phone?.trim() || null;
  if (patch.email !== undefined) updateData.email = patch.email?.trim() || null;
  if (patch.address !== undefined) updateData.address = patch.address?.trim() || null;
  if (patch.gstin !== undefined) updateData.gstin = patch.gstin?.trim() || null;

  const { error } = await supabase
    .from("suppliers")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function sb_deleteSupplier(tenantId: string, id: string): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
