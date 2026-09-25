// ── Audit Supabase Service (Tenant-isolated) ──────────────────────────────
//
// Interacts with `public.audit_logs` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// Handles graceful fallback if table does not yet exist.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { AuditEntry } from "@/lib/store";

export type DbAuditLogRow = {
  id: string;
  tenant_id: string;
  actor: string;
  action: string;
  module: string;
  target?: string | null;
  detail?: string | null;
  created_at: string;
};

export async function sb_fetchAuditLogs(
  tenantId: string,
  limit: number = 200
): Promise<{ logs: AuditEntry[]; error: string | null }> {
  if (!tenantId) return { logs: [], error: "Tenant ID required" };

  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { logs: [], error: error.message };
    }

    const logs: AuditEntry[] = (data ?? []).map((r: DbAuditLogRow) => ({
      id: r.id,
      tenantId: r.tenant_id,
      at: r.created_at || new Date().toISOString(),
      actor: r.actor || "system",
      action: r.action,
      module: r.module || "General",
      target: r.target || undefined,
      detail: r.detail || undefined,
    }));

    return { logs, error: null };
  } catch (err: any) {
    return { logs: [], error: err?.message ?? String(err) };
  }
}

export async function sb_insertAuditLog(
  tenantId: string,
  entry: AuditEntry
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  try {
    const row: DbAuditLogRow = {
      id: entry.id,
      tenant_id: tenantId,
      actor: entry.actor || "system",
      action: entry.action,
      module: entry.module || "General",
      target: entry.target || null,
      detail: entry.detail || null,
      created_at: entry.at || new Date().toISOString(),
    };

    const { error } = await supabase.from("audit_logs").insert(row);
    return { error: error ? error.message : null };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}
