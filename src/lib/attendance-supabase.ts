// ── Attendance Supabase Service (Tenant-isolated) ──────────────────────────
//
// Interacts with `public.attendance` in Supabase.
// Every query is strictly filtered/scoped by `tenant_id`.
// Handles graceful fallback if table is not yet created in Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import type { AttendanceRecord } from "@/lib/store";

export type DbAttendanceRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  employee_name: string;
  attendance_date: string; // YYYY-MM-DD
  status: "full" | "half" | "absent";
  tasks: number;
  created_at?: string;
  updated_at?: string;
};

export async function sb_fetchAttendance(
  tenantId: string
): Promise<{ records: AttendanceRecord[]; error: string | null }> {
  if (!tenantId) return { records: [], error: "Tenant ID required" };

  try {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("attendance_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      // Table might not exist yet or connection issue
      return { records: [], error: error.message };
    }

    const records: AttendanceRecord[] = (data ?? []).map((r: DbAttendanceRow) => ({
      id: r.id,
      tenantId: r.tenant_id,
      employeeId: r.employee_id,
      employeeName: r.employee_name || "",
      date: r.attendance_date,
      status: (r.status as "full" | "half" | "absent") || "full",
      tasks: Number(r.tasks) || 0,
      createdAt: r.created_at || new Date().toISOString(),
      updatedAt: r.updated_at,
    }));

    return { records, error: null };
  } catch (err: any) {
    return { records: [], error: err?.message ?? String(err) };
  }
}

export async function sb_upsertAttendance(
  tenantId: string,
  record: AttendanceRecord
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  try {
    const row: DbAttendanceRow = {
      id: record.id,
      tenant_id: tenantId,
      employee_id: record.employeeId,
      employee_name: record.employeeName || "",
      attendance_date: record.date,
      status: record.status,
      tasks: record.tasks ?? 0,
      created_at: record.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upsert using the unique constraint (tenant_id, employee_id, attendance_date)
    // so marking attendance for the same employee + date will update the record
    const { error } = await supabase
      .from("attendance")
      .upsert(row, { onConflict: "tenant_id,employee_id,attendance_date" });

    return { error: error ? error.message : null };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

export async function sb_deleteAttendance(
  tenantId: string,
  id: string
): Promise<{ error: string | null }> {
  if (!tenantId) return { error: "Tenant ID required" };

  try {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", id);

    return { error: error ? error.message : null };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}
