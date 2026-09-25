// ── Customers Supabase Service (Tenant-isolated) ────────────────────────────
//
// Interacts with `public.customers` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { Customer } from "@/lib/store";

type DbCustomerRow = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  doctor: string | null;
  address: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
};

function rowToCustomer(row: DbCustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    doctor: row.doctor ?? undefined,
    address: row.address ?? undefined,
    balance: Number(row.balance) || 0,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function customerToRow(tenantId: string, c: Customer): Record<string, any> {
  return {
    id: c.id,
    tenant_id: tenantId,
    name: c.name.trim(),
    phone: c.phone.trim(),
    doctor: c.doctor?.trim() || null,
    address: c.address?.trim() || null,
    balance: Number(c.balance) || 0,
    created_at: c.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── READ ──────────────────────────────────────────────────────────────────────

export async function sb_fetchCustomers(tenantId: string): Promise<{ customers: Customer[]; error: string | null }> {
  if (!tenantId) return { customers: [], error: "Tenant ID required" };

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return { customers: [], error: error.message };
  return {
    customers: (data ?? []).map((r) => rowToCustomer(r as DbCustomerRow)),
    error: null,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function sb_insertCustomer(tenantId: string, customer: Customer): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const row = customerToRow(tenantId, customer);
  const { error } = await supabase
    .from("customers")
    .insert(row);

  return { error: error?.message ?? null };
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

export async function sb_updateCustomer(
  tenantId: string,
  id: string,
  patch: Partial<Customer>,
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) updateData.name = patch.name.trim();
  if (patch.phone !== undefined) updateData.phone = patch.phone.trim();
  if (patch.doctor !== undefined) updateData.doctor = patch.doctor?.trim() || null;
  if (patch.address !== undefined) updateData.address = patch.address?.trim() || null;
  if (patch.balance !== undefined) updateData.balance = Number(patch.balance) || 0;

  const { error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function sb_deleteCustomer(tenantId: string, id: string): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

// ── BULK INSERT ───────────────────────────────────────────────────────────────

export async function sb_bulkInsertCustomers(tenantId: string, list: Customer[]): Promise<{ error: string | null }> {
  if (!tenantId || list.length === 0) return { error: null };

  const rows = list.map((c) => customerToRow(tenantId, c));
  const { error } = await supabase
    .from("customers")
    .insert(rows);

  return { error: error?.message ?? null };
}
