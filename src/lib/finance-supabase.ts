// ── Finance Supabase Service (Tenant-isolated) ───────────────────────────────
//
// Interacts with `public.finance_entries` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { FinanceEntry } from "@/lib/store";

export type DbFinanceEntryRow = {
  id: string;
  tenant_id: string;
  entry_date: string;
  type: "income" | "expense";
  title: string;
  category: string;
  amount: number;
  payment_mode: string;
  reference: string | null;
  source_type: string;
  created_at?: string;
  updated_at?: string;
};

export async function sb_fetchFinanceEntries(tenantId: string): Promise<{ entries: FinanceEntry[]; error: string | null }> {
  if (!tenantId) return { entries: [], error: "Tenant ID required" };

  const { data, error } = await supabase
    .from("finance_entries")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { entries: [], error: error.message };

  const entries: FinanceEntry[] = (data ?? []).map((r: DbFinanceEntryRow) => ({
    id: r.id,
    tenantId: r.tenant_id,
    date: r.entry_date ?? (r.created_at ? r.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
    type: r.type,
    title: r.title,
    category: r.category,
    amount: Number(r.amount) || 0,
    paymentMode: r.payment_mode,
    reference: r.reference || undefined,
    sourceType: r.source_type,
    createdAt: r.created_at,
  }));

  return { entries, error: null };
}

export async function sb_insertFinanceEntry(tenantId: string, entry: FinanceEntry): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const row: DbFinanceEntryRow = {
    id: entry.id,
    tenant_id: tenantId,
    entry_date: entry.date || new Date().toISOString().slice(0, 10),
    type: entry.type,
    title: entry.title,
    category: entry.category,
    amount: Number(entry.amount) || 0,
    payment_mode: entry.paymentMode || "Cash",
    reference: entry.reference || null,
    source_type: entry.sourceType || (entry.type === "income" ? "MANUAL_INCOME" : "MANUAL_EXPENSE"),
    created_at: entry.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("finance_entries").insert(row);
  return { error: error ? error.message : null };
}

export async function sb_deleteFinanceEntry(tenantId: string, id: string): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  const { error } = await supabase
    .from("finance_entries")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);

  return { error: error ? error.message : null };
}
