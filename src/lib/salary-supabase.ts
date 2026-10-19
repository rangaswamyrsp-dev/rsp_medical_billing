// ── Salary Payments Supabase Service (Tenant-isolated) ────────────────────────
//
// Interacts with `public.salary_payments` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// Handles graceful fallback if table is not yet created in Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { SalaryPayment } from "@/lib/store";

export type DbSalaryPaymentRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  employee_name: string;
  salary_month: string;
  net_payable: number;
  amount_paid: number;
  payment_date: string;
  payment_mode: string;
  status: "paid" | "partial";
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function sb_fetchSalaryPayments(
  tenantId: string
): Promise<{ payments: SalaryPayment[]; error: string | null }> {
  if (!tenantId) return { payments: [], error: "Tenant ID required" };

  try {
    const { data, error } = await supabase
      .from("salary_payments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      // Return error message gracefully (e.g. relation does not exist)
      return { payments: [], error: error.message };
    }

    const payments: SalaryPayment[] = (data ?? []).map((r: DbSalaryPaymentRow) => {
      const amt = Number(r.amount_paid) || 0;
      return {
        id: r.id,
        tenantId: r.tenant_id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        month: r.salary_month,
        netPayable: Number(r.net_payable) || amt,
        amountPaid: amt,
        amount: amt,
        paymentDate: r.payment_date,
        paymentMode: r.payment_mode || "Cash",
        status: r.status || (amt >= (Number(r.net_payable) || amt) ? "paid" : "partial"),
        notes: r.notes || undefined,
        paidAt: r.created_at || new Date().toISOString(),
        createdAt: r.created_at,
      };
    });

    return { payments, error: null };
  } catch (err: any) {
    return { payments: [], error: err?.message ?? String(err) };
  }
}

export async function sb_insertSalaryPayment(
  tenantId: string,
  payment: SalaryPayment
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  try {
    const amt = Number(payment.amountPaid ?? payment.amount) || 0;
    const net = Number(payment.netPayable) || amt;

    // Check if payment already exists for this tenant + employee + month
    const { data: existing } = await supabase
      .from("salary_payments")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("employee_id", payment.employeeId)
      .eq("salary_month", payment.month)
      .maybeSingle();

    const targetId = existing?.id || payment.id;

    const row: DbSalaryPaymentRow = {
      id: targetId,
      tenant_id: tenantId,
      employee_id: payment.employeeId,
      employee_name: payment.employeeName || payment.employeeId,
      salary_month: payment.month,
      net_payable: net,
      amount_paid: amt,
      payment_date: payment.paymentDate || (payment.paidAt ? payment.paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
      payment_mode: payment.paymentMode || "Cash",
      status: payment.status || (amt >= net ? "paid" : "partial"),
      notes: payment.notes || null,
      created_at: payment.paidAt || payment.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("salary_payments")
        .update({
          employee_name: row.employee_name,
          net_payable: row.net_payable,
          amount_paid: row.amount_paid,
          payment_date: row.payment_date,
          payment_mode: row.payment_mode,
          status: row.status,
          notes: row.notes,
          updated_at: row.updated_at,
        })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
      return { error: error ? error.message : null };
    } else {
      const { error } = await supabase.from("salary_payments").insert(row);
      return { error: error ? error.message : null };
    }
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

export async function sb_deleteSalaryPayment(
  tenantId: string,
  id: string
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  try {
    const { error } = await supabase
      .from("salary_payments")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", id);

    return { error: error ? error.message : null };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}
