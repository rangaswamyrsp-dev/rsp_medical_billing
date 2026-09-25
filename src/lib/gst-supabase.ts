// ── GST Profiles Supabase Service (Tenant-isolated) ────────────────────────
//
// Interacts with `public.gst_profiles` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// Handles graceful fallback if record doesn't exist yet.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { GSTProfile } from "@/lib/store";

export type DbGSTProfileRow = {
  id: string;
  tenant_id: string;
  business_name: string;
  gstin: string;
  pan: string;
  address: string;
  state: string;
  state_code: string;
  contact: string;
  email: string;
  financial_year: string;
  registration_type: "Regular" | "Composition" | "Unregistered";
  created_at?: string;
  updated_at?: string;
};

export async function sb_fetchGSTProfile(
  tenantId: string
): Promise<{ profile: GSTProfile | null; error: string | null }> {
  if (!tenantId) return { profile: null, error: "Tenant ID required" };

  try {
    const { data, error } = await supabase
      .from("gst_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      return { profile: null, error: error.message };
    }

    if (!data) {
      return { profile: null, error: null };
    }

    const row = data as DbGSTProfileRow;
    const profile: GSTProfile = {
      businessName: row.business_name ?? "",
      gstin: row.gstin ?? "",
      pan: row.pan ?? "",
      address: row.address ?? "",
      state: row.state ?? "Andhra Pradesh",
      stateCode: row.state_code ?? "37",
      contact: row.contact ?? "",
      email: row.email ?? "",
      financialYear: row.financial_year ?? "2026-27",
      registrationType: (row.registration_type as GSTProfile["registrationType"]) || "Regular",
    };

    return { profile, error: null };
  } catch (err: any) {
    return { profile: null, error: err?.message ?? String(err) };
  }
}

export async function sb_upsertGSTProfile(
  tenantId: string,
  profile: GSTProfile
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  try {
    const row: DbGSTProfileRow = {
      id: "GST_" + tenantId,
      tenant_id: tenantId,
      business_name: profile.businessName || "",
      gstin: profile.gstin || "",
      pan: profile.pan || "",
      address: profile.address || "",
      state: profile.state || "Andhra Pradesh",
      state_code: profile.stateCode || "37",
      contact: profile.contact || "",
      email: profile.email || "",
      financial_year: profile.financialYear || "2026-27",
      registration_type: profile.registrationType || "Regular",
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("gst_profiles")
      .upsert(row, { onConflict: "tenant_id" });

    return { error: error ? error.message : null };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}
