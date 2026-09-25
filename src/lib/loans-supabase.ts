// ── Loans Supabase Service (Tenant-isolated) ──────────────────────────────
//
// Interacts with `public.loans` and `public.loan_transactions` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DbLoan = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  customer_name: string;
  phone: string | null;
  sale_id: string | null;
  amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: "outstanding" | "partially_paid" | "cleared";
  loan_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type DbLoanTransaction = {
  id: string;
  tenant_id: string;
  loan_id: string;
  customer_id: string | null;
  amount: number;
  transaction_type: "issue" | "repayment";
  transaction_date: string;
  note: string | null;
  created_at: string;
};

// ─── Fetch all loans for a tenant ────────────────────────────────────────────

export async function sb_fetchLoans(
  tenantId: string,
): Promise<{ loans: DbLoan[]; error: string | null }> {
  if (!tenantId) return { loans: [], error: "Tenant ID required" };

  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return { loans: [], error: error.message };
  return { loans: (data ?? []) as DbLoan[], error: null };
}

// ─── Fetch loans for a specific customer ─────────────────────────────────────

export async function sb_fetchCustomerLoans(
  tenantId: string,
  customerId: string,
): Promise<{ loans: DbLoan[]; error: string | null }> {
  if (!tenantId) return { loans: [], error: "Tenant ID required" };

  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) return { loans: [], error: error.message };
  return { loans: (data ?? []) as DbLoan[], error: null };
}

// ─── Fetch outstanding balance for a customer ─────────────────────────────────

export async function sb_fetchCustomerOutstanding(
  tenantId: string,
  customerId: string,
): Promise<{ outstanding: number; error: string | null }> {
  if (!tenantId || !customerId) return { outstanding: 0, error: null };

  const { data, error } = await supabase
    .from("loans")
    .select("outstanding_amount")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .neq("status", "cleared");

  if (error) return { outstanding: 0, error: error.message };
  const total = (data ?? []).reduce(
    (sum: number, r: any) => sum + (Number(r.outstanding_amount) || 0),
    0,
  );
  return { outstanding: total, error: null };
}

// ─── Create a new loan (from billing "Save as Loan" or manual issue) ──────────

export type CreateLoanInput = {
  tenantId: string;
  customerId: string | null;
  customerName: string;
  phone: string | null;
  saleId: string | null;
  amount: number;
  note?: string;
};

export async function sb_createLoan(
  input: CreateLoanInput,
): Promise<{ loan: DbLoan | null; error: string | null }> {
  const { tenantId, customerId, customerName, phone, saleId, amount, note } = input;
  if (!tenantId) return { loan: null, error: "Tenant ID required" };
  if (!amount || amount <= 0) return { loan: null, error: "Loan amount must be positive" };

  // Duplicate-safe: if a loan already exists for the same sale_id, return it
  if (saleId) {
    const { data: existing } = await supabase
      .from("loans")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("sale_id", saleId)
      .maybeSingle();
    if (existing) {
      console.warn("[loans-supabase] Loan already exists for sale", saleId);
      return { loan: existing as DbLoan, error: null };
    }
  }

  const now = new Date().toISOString();
  const loanId = "LN" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);

  const loanRow: DbLoan = {
    id: loanId,
    tenant_id: tenantId,
    customer_id: customerId,
    customer_name: customerName.trim(),
    phone: phone?.trim() || null,
    sale_id: saleId,
    amount,
    paid_amount: 0,
    outstanding_amount: amount,
    status: "outstanding",
    loan_date: now,
    note: note?.trim() || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("loans")
    .insert(loanRow)
    .select()
    .single();

  if (error) return { loan: null, error: error.message };

  // Also insert a "issue" transaction record
  const txId = "LT" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
  await supabase.from("loan_transactions").insert({
    id: txId,
    tenant_id: tenantId,
    loan_id: loanId,
    customer_id: customerId,
    amount,
    transaction_type: "issue",
    transaction_date: now,
    note: note?.trim() || (saleId ? `Credit sale - ${saleId}` : "Loan issued"),
    created_at: now,
  });

  return { loan: data as DbLoan, error: null };
}

// ─── Record a repayment for a loan ────────────────────────────────────────────

export type RecordRepaymentInput = {
  tenantId: string;
  customerId: string;
  amount: number;
  note?: string;
};

export async function sb_recordRepayment(
  input: RecordRepaymentInput,
): Promise<{ totalRemaining: number; error: string | null }> {
  const { tenantId, customerId, amount, note } = input;
  if (!tenantId) return { totalRemaining: 0, error: "Tenant ID required" };
  if (!amount || amount <= 0) return { totalRemaining: 0, error: "Repayment amount must be positive" };

  // Fetch all outstanding loans for this customer, oldest first
  const { data: loans, error: fetchErr } = await supabase
    .from("loans")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .neq("status", "cleared")
    .order("created_at", { ascending: true });

  if (fetchErr) return { totalRemaining: 0, error: fetchErr.message };
  if (!loans || loans.length === 0) return { totalRemaining: 0, error: null };

  let remaining = amount;
  const now = new Date().toISOString();

  for (const loan of loans as DbLoan[]) {
    if (remaining <= 0) break;
    const apply = Math.min(remaining, loan.outstanding_amount);
    const newPaid = (loan.paid_amount || 0) + apply;
    const newOutstanding = Math.max(0, loan.outstanding_amount - apply);
    const newStatus: DbLoan["status"] = newOutstanding <= 0
      ? "cleared"
      : "partially_paid";

    // Update loan
    await supabase.from("loans").update({
      paid_amount: newPaid,
      outstanding_amount: newOutstanding,
      status: newStatus,
      updated_at: now,
    }).eq("id", loan.id).eq("tenant_id", tenantId);

    // Insert transaction
    const txId = "LT" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
    await supabase.from("loan_transactions").insert({
      id: txId,
      tenant_id: tenantId,
      loan_id: loan.id,
      customer_id: customerId,
      amount: apply,
      transaction_type: "repayment",
      transaction_date: now,
      note: note?.trim() || "Repayment received",
      created_at: now,
    });

    remaining -= apply;
  }

  // Recalculate total remaining outstanding for the customer
  const { outstanding } = await sb_fetchCustomerOutstanding(tenantId, customerId);
  return { totalRemaining: outstanding, error: null };
}

// ─── Fetch loan transactions for a customer ────────────────────────────────────

export async function sb_fetchLoanTransactions(
  tenantId: string,
  customerId?: string,
): Promise<{ transactions: DbLoanTransaction[]; error: string | null }> {
  if (!tenantId) return { transactions: [], error: "Tenant ID required" };

  let query = supabase
    .from("loan_transactions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;
  if (error) return { transactions: [], error: error.message };
  return { transactions: (data ?? []) as DbLoanTransaction[], error: null };
}
