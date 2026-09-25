// ── Super Admin: Supabase persistence for tenant/client management ────────────
//
// This file ONLY touches the `public.tenants` Supabase table.
// It does NOT affect billing, sales, inventory, medicines, employees, loans,
// accounts, reports, customers, or any other application module.
//
// ── Required Supabase table schema ──────────────────────────────────────────
// If the table does not exist yet, run this SQL in the Supabase SQL Editor
// (Dashboard → SQL Editor → New Query):
//
//   CREATE TABLE IF NOT EXISTS public.tenants (
//     id             text PRIMARY KEY,
//     name           text NOT NULL,
//     type           text NOT NULL,
//     store_key      text NOT NULL,
//     admin_name     text NOT NULL,
//     admin_phone    text UNIQUE NOT NULL,
//     admin_password text NOT NULL,
//     features       jsonb NOT NULL DEFAULT '{}'::jsonb,
//     active         boolean NOT NULL DEFAULT true,
//     created_at     text NOT NULL
//   );
//
//   -- Allow the anon key used by the browser to read/write:
//   ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "anon_all" ON public.tenants
//     FOR ALL TO anon USING (true) WITH CHECK (true);
//
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { defaultFeatures } from "@/lib/tenant";
import type { Tenant, BusinessType, Features } from "@/lib/tenant";

// ── Internal DB row type (PostgreSQL snake_case convention) ───────────────────

type DbRow = {
  id: string;
  name: string;
  type: string;
  store_key: string;
  admin_name: string;
  admin_phone: string;
  admin_password: string;
  features: Record<string, boolean>;
  active: boolean;
  created_at: string;
};

// ── Converters ────────────────────────────────────────────────────────────────

function rowToTenant(row: DbRow): Tenant {
  const type = row.type as BusinessType;
  return {
    id: row.id,
    name: row.name,
    type,
    storeKey: row.store_key,
    admin: {
      name: row.admin_name,
      phone: row.admin_phone,
      password: row.admin_password,
    },
    // Merge DB flags on top of the type defaults so new flags always have a value
    features: { ...defaultFeatures(type), ...(row.features ?? {}) } as Features,
    active: row.active ?? true,
    createdAt: row.created_at,
  };
}

function tenantToRow(t: Tenant): DbRow {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    store_key: t.storeKey,
    admin_name: t.admin.name,
    admin_phone: t.admin.phone,
    admin_password: t.admin.password,
    features: t.features as unknown as Record<string, boolean>,
    active: t.active,
    created_at: t.createdAt,
  };
}

// ── READ ──────────────────────────────────────────────────────────────────────

export async function sb_fetchTenants(): Promise<{ tenants: Tenant[]; error: string | null }> {
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { tenants: [], error: error.message };
  return {
    tenants: (data ?? []).map((r) => rowToTenant(r as DbRow)),
    error: null,
  };
}

export async function sb_fetchTenantByPhone(phone: string): Promise<{ tenant: Tenant | null; error: string | null }> {
  const cleanPhone = phone.trim();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("admin_phone", cleanPhone)
    .limit(1);

  if (error) return { tenant: null, error: error.message };
  if (!data || data.length === 0) return { tenant: null, error: null };
  return {
    tenant: rowToTenant(data[0] as DbRow),
    error: null,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function sb_insertTenant(tenant: Tenant): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("tenants")
    .insert(tenantToRow(tenant));

  return { error: error?.message ?? null };
}

// ── UPDATE (active toggle or feature flags) ───────────────────────────────────

export async function sb_updateTenant(
  id: string,
  patch: { active?: boolean; features?: Record<string, boolean> },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("tenants")
    .update(patch)
    .eq("id", id);

  return { error: error?.message ?? null };
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function sb_deleteTenant(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("tenants")
    .delete()
    .eq("id", id);

  return { error: error?.message ?? null };
}
