import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Copy, Eye, EyeOff, Plus, Trash2, UserCog, Shield, IndianRupee, Receipt,
  CalendarCheck, Printer, CheckCircle2, Clock, XCircle, Users, Wallet,
  ChevronDown,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import type { AttendanceRecord, SalaryPayment, Employee } from "@/lib/store";
import { generatePassword, getUser } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/employees")({
  head: () => ({ meta: [{ title: "Employees · RSP Medical Billing" }] }),
  component: EmployeesPage,
});

// ─── helpers ─────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowYYYYMM = () => new Date().toISOString().slice(0, 7);

function fmtMonthLabel(yyyymm: string) {
  return new Date(yyyymm + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function dutyDays(records: AttendanceRecord[]) {
  return records.reduce((n, r) => n + (r.status === "full" ? 1 : r.status === "half" ? 0.5 : 0), 0);
}

// ─── Tab Types ────────────────────────────────────────────────────────────────
type Tab = "directory" | "attendance" | "payroll";

// ─── Salary Slip Dialog ───────────────────────────────────────────────────────
function SalarySlipDialog({
  open, onClose, empId, month,
}: {
  open: boolean; onClose: () => void; empId: string | null; month: string;
}) {
  const employees = useStore((s) => s.employees);
  const attendance = useStore((s) => s.attendance);
  const salaryPayments = useStore((s) => s.salaryPayments);
  const printRef = useRef<HTMLDivElement>(null);

  const emp = employees.find((e) => e.id === empId);
  const records = attendance.filter((a) => a.employeeId === empId && a.date.startsWith(month));
  const duty = dutyDays(records);
  const absent = records.filter((r) => r.status === "absent").length;
  const full = records.filter((r) => r.status === "full").length;
  const half = records.filter((r) => r.status === "half").length;

  const dailyRate = emp ? emp.salary / 26 : 0;
  const netPay = Math.round(dailyRate * duty);
  const payment = salaryPayments.find((p) => p.employeeId === empId && p.month === month);

  const handlePrint = () => {
    if (!emp) return;

    const monthName = fmtMonthLabel(month);
    const isPaid = payment?.status === "paid";
    const isPartial = payment?.status === "partial";
    const isPending = !payment;
    const paidAmt = payment ? (payment.amountPaid ?? payment.amount ?? 0) : 0;
    const remainingAmt = Math.max(0, netPay - paidAmt);
    const payDate = payment ? fmtDate(payment.paymentDate || payment.paidAt.slice(0, 10)) : "—";
    const payMode = payment?.paymentMode || "Cash";

    const fullHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Salary Slip — ${emp.name} — ${monthName}</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      body {
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        color: #1f2937;
        background: #ffffff;
        padding: 24px;
      }
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      .slip-container {
        max-width: 740px;
        margin: 0 auto;
        border: 2px solid #059669;
        border-radius: 12px;
        overflow: hidden;
        background: #ffffff;
      }
      /* Header Banner */
      .slip-header {
        background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
        background-color: #059669 !important;
        color: #ffffff !important;
        padding: 16px 20px;
        text-align: center;
      }
      .company-title {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: #ffffff !important;
        margin-bottom: 2px;
      }
      .slip-subtitle {
        font-size: 13px;
        font-weight: 600;
        color: #ecfdf5 !important;
        letter-spacing: 0.3px;
      }
      .slip-month-pill {
        display: inline-block;
        margin-top: 6px;
        background: rgba(255, 255, 255, 0.25) !important;
        border: 1px solid rgba(255, 255, 255, 0.45);
        color: #ffffff !important;
        padding: 3px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 700;
      }

      .slip-body {
        padding: 18px 22px;
      }

      /* Section styling */
      .section-title {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #065f46 !important;
        border-bottom: 2px solid #d1fae5;
        padding-bottom: 4px;
        margin-bottom: 10px;
        margin-top: 14px;
      }
      .section-title:first-child {
        margin-top: 0;
      }

      /* Employee Details Table */
      .info-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 12px;
      }
      .info-table td {
        padding: 6px 8px;
        font-size: 12.5px;
        vertical-align: middle;
        border-bottom: 1px solid #f3f4f6;
      }
      .info-label {
        width: 25%;
        color: #6b7280 !important;
        font-weight: 500;
      }
      .info-val {
        width: 25%;
        color: #111827 !important;
        font-weight: 700;
      }

      /* Attendance Summary Cards (horizontal row) */
      .attendance-cards-table {
        width: 100%;
        border-collapse: separate !important;
        border-spacing: 8px 0 !important;
        margin: 6px -8px 14px -8px;
      }
      .att-box {
        width: 25%;
        text-align: center;
        padding: 10px 8px;
        border-radius: 8px;
        vertical-align: middle;
      }
      .att-box-total {
        background-color: #f8fafc !important;
        border: 1.5px solid #cbd5e1 !important;
      }
      .att-box-full {
        background-color: #ecfdf5 !important;
        border: 1.5px solid #6ee7b7 !important;
      }
      .att-box-half {
        background-color: #fffbeb !important;
        border: 1.5px solid #fcd34d !important;
      }
      .att-box-absent {
        background-color: #fff1f2 !important;
        border: 1.5px solid #fda4af !important;
      }
      .att-num {
        font-size: 20px;
        font-weight: 800;
        line-height: 1.1;
      }
      .att-num-total { color: #334155 !important; }
      .att-num-full { color: #047857 !important; }
      .att-num-half { color: #b45309 !important; }
      .att-num-absent { color: #e11d48 !important; }
      .att-lbl {
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-top: 3px;
      }
      .att-lbl-total { color: #64748b !important; }
      .att-lbl-full { color: #059669 !important; }
      .att-lbl-half { color: #d97706 !important; }
      .att-lbl-absent { color: #f43f5e !important; }

      /* Salary & Working Days Calculation Breakdown */
      .calc-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        overflow: hidden;
      }
      .calc-table th {
        background-color: #f3f4f6 !important;
        color: #374151 !important;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1.5px solid #e5e7eb;
      }
      .calc-table th:last-child {
        text-align: right;
      }
      .calc-table td {
        padding: 7px 12px;
        font-size: 12.5px;
        border-bottom: 1px solid #f3f4f6;
      }
      .calc-table td:last-child {
        text-align: right;
        font-weight: 600;
        color: #111827 !important;
      }
      .calc-table tr:nth-child(even) td {
        background-color: #fafafa !important;
      }
      .net-pay-row td {
        background-color: #ecfdf5 !important;
        border-top: 2px solid #059669 !important;
        border-bottom: 2px solid #059669 !important;
        padding: 10px 12px !important;
      }
      .net-pay-title {
        font-size: 14px !important;
        font-weight: 800 !important;
        color: #065f46 !important;
        text-transform: uppercase;
      }
      .net-pay-amt {
        font-size: 18px !important;
        font-weight: 900 !important;
        color: #047857 !important;
      }

      /* Payment Record Box */
      .payment-box {
        border: 1.5px solid #a7f3d0;
        background-color: #f0fdf4 !important;
        border-radius: 8px;
        padding: 12px 14px;
        margin-bottom: 16px;
      }
      .payment-box-partial {
        border-color: #fde68a !important;
        background-color: #fffbeb !important;
      }
      .payment-box-pending {
        border-color: #fde047 !important;
        background-color: #fefce8 !important;
      }
      .pay-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .pay-badge {
        display: inline-block;
        padding: 3px 12px;
        border-radius: 14px;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .badge-paid {
        background-color: #dcfce7 !important;
        color: #047857 !important;
        border: 1.5px solid #86efac;
      }
      .badge-partial {
        background-color: #fef3c7 !important;
        color: #b45309 !important;
        border: 1.5px solid #fcd34d;
      }
      .badge-pending {
        background-color: #fef9c3 !important;
        color: #a16207 !important;
        border: 1.5px solid #fde047;
      }
      .pay-grid {
        width: 100%;
        border-collapse: collapse;
      }
      .pay-grid td {
        padding: 3px 6px;
        font-size: 12px;
      }

      /* Signatures */
      .sign-table {
        width: 100%;
        margin-top: 36px;
        border-collapse: collapse;
      }
      .sign-col {
        width: 50%;
        text-align: center;
        padding: 0 28px;
      }
      .sign-line {
        border-top: 1.5px dashed #9ca3af;
        margin-bottom: 6px;
      }
      .sign-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #374151 !important;
        letter-spacing: 0.04em;
      }
      .sign-sub {
        font-size: 10px;
        color: #6b7280 !important;
      }

      /* Footer */
      .slip-footer {
        background-color: #f9fafb !important;
        border-top: 1px dashed #e5e7eb;
        padding: 8px 20px;
        font-size: 10px;
        color: #6b7280 !important;
        display: flex;
        justify-content: space-between;
      }
    </style>
  </head>
  <body>
    <div class="slip-container">
      <!-- Header -->
      <div class="slip-header">
        <div class="company-title">RSP Medicals &amp; Pharmacy</div>
        <div class="slip-subtitle">OFFICIAL EMPLOYEE SALARY SLIP</div>
        <div class="slip-month-pill">${monthName}</div>
      </div>

      <div class="slip-body">
        <!-- 1. Employee Details -->
        <div class="section-title">1. Employee Details</div>
        <table class="info-table">
          <tbody>
            <tr>
              <td class="info-label">Employee Name:</td>
              <td class="info-val">${emp.name}</td>
              <td class="info-label">Employee ID:</td>
              <td class="info-val" style="font-family: monospace;">${emp.id}</td>
            </tr>
            <tr>
              <td class="info-label">Designation / Role:</td>
              <td class="info-val">${emp.role}</td>
              <td class="info-label">Phone (User ID):</td>
              <td class="info-val" style="font-family: monospace;">${emp.phone}</td>
            </tr>
          </tbody>
        </table>

        <!-- 2. Attendance & Working Days Summary -->
        <div class="section-title">2. Attendance &amp; Working Days Summary (${monthName})</div>
        <table class="attendance-cards-table">
          <tbody>
            <tr>
              <td class="att-box att-box-total">
                <div class="att-num att-num-total">${records.length}</div>
                <div class="att-lbl att-lbl-total">Total Marked</div>
              </td>
              <td class="att-box att-box-full">
                <div class="att-num att-num-full">${full}</div>
                <div class="att-lbl att-lbl-full">Full Duty (1.0d)</div>
              </td>
              <td class="att-box att-box-half">
                <div class="att-num att-num-half">${half}</div>
                <div class="att-lbl att-lbl-half">Half Duty (0.5d)</div>
              </td>
              <td class="att-box att-box-absent">
                <div class="att-num att-num-absent">${absent}</div>
                <div class="att-lbl att-lbl-absent">Absent (0.0d)</div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 3. Salary Breakdown -->
        <div class="section-title">3. Salary &amp; Working Days Computation</div>
        <table class="calc-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Rate / Basis</th>
              <th>Days</th>
              <th>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Monthly Base Salary</td>
              <td>Full Monthly Base</td>
              <td>26 days/mo</td>
              <td>₹${emp.salary.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td>Working Days Basis</td>
              <td>Standard Working Days</td>
              <td>26 days</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Daily Rate Basis</td>
              <td>Monthly Base ÷ 26 Days</td>
              <td>1 day</td>
              <td>₹${dailyRate.toFixed(2)} / day</td>
            </tr>
            <tr>
              <td>Total Duty Days Worked</td>
              <td>Full (${full} × 1.0) + Half (${half} × 0.5)</td>
              <td style="color: #047857; font-weight: 700;">${duty} days</td>
              <td>${duty}d × ₹${dailyRate.toFixed(2)}</td>
            </tr>
            <tr class="net-pay-row">
              <td colspan="3" class="net-pay-title">Net Payable Salary</td>
              <td class="net-pay-amt">₹${netPay.toLocaleString("en-IN")}</td>
            </tr>
          </tbody>
        </table>

        <!-- 4. Payout Record -->
        <div class="section-title">4. Payment &amp; Disbursement Record</div>
        <div class="payment-box ${isPartial ? "payment-box-partial" : isPending ? "payment-box-pending" : ""}">
          <div class="pay-header">
            <span style="font-size: 12px; font-weight: 700; color: #374151;">Payment Status</span>
            ${isPaid
              ? `<span class="pay-badge badge-paid">✓ PAID FULLY</span>`
              : isPartial
                ? `<span class="pay-badge badge-partial">⚠ PARTIALLY PAID</span>`
                : `<span class="pay-badge badge-pending">⏳ PENDING PAYMENT</span>`
            }
          </div>
          <table class="pay-grid">
            <tbody>
              <tr>
                <td style="color: #4b5563; width: 25%;">Actual Amount Paid:</td>
                <td style="font-weight: 800; font-size: 13px; color: ${isPaid || isPartial ? "#047857" : "#6b7280"}; width: 25%;">
                  ${isPending ? "₹0 (Pending)" : "₹" + paidAmt.toLocaleString("en-IN")}
                </td>
                <td style="color: #4b5563; width: 25%;">Payment Date:</td>
                <td style="font-weight: 600; width: 25%;">${payDate}</td>
              </tr>
              <tr>
                <td style="color: #4b5563;">Payment Mode:</td>
                <td style="font-weight: 600;">${isPending ? "—" : payMode}</td>
                ${isPartial ? `
                  <td style="color: #b45309; font-weight: 700;">Remaining Balance:</td>
                  <td style="color: #b45309; font-weight: 800;">₹${remainingAmt.toLocaleString("en-IN")}</td>
                ` : `
                  <td style="color: #4b5563;">Reference / Notes:</td>
                  <td style="font-weight: 500; font-style: italic;">${payment?.notes || "—"}</td>
                `}
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 5. Signatures -->
        <table class="sign-table">
          <tbody>
            <tr>
              <td class="sign-col">
                <div class="sign-line"></div>
                <div class="sign-label">Employee Signature</div>
                <div class="sign-sub">${emp.name}</div>
              </td>
              <td class="sign-col">
                <div class="sign-line"></div>
                <div class="sign-label">Authorized Signatory</div>
                <div class="sign-sub">RSP Medicals Administration</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div class="slip-footer">
        <span>Generated on: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <span>Official Salary Voucher · RSP Medical Billing Software</span>
      </div>
    </div>
  </body>
</html>`;

    // Method 1: Invisible iframe (immune to popup blockers)
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(fullHtml);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.error("Iframe print error:", err);
          } finally {
            setTimeout(() => {
              try { document.body.removeChild(iframe); } catch {}
            }, 3000);
          }
        }, 300);
        return;
      }
    } catch (err) {
      console.warn("Iframe print fallback triggered:", err);
    }

    // Method 2: Fallback window.open
    try {
      const win = window.open("", "_blank", "width=750,height=900");
      if (win) {
        win.document.open();
        win.document.write(fullHtml);
        win.document.close();
        win.focus();
        setTimeout(() => {
          win.print();
          win.onafterprint = () => win.close();
        }, 300);
        return;
      }
    } catch (err) {
      console.warn("Window print fallback failed:", err);
    }

    window.print();
  };

  if (!emp) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="shrink-0 flex flex-row items-center justify-between pb-2 border-b">
          <div>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Receipt className="h-5 w-5 text-primary" /> Salary Slip
            </DialogTitle>
            <DialogDescription className="text-xs">{emp.name} — {fmtMonthLabel(month)}</DialogDescription>
          </div>
          <Button size="sm" onClick={handlePrint} className="bg-primary text-primary-foreground gap-1.5 h-8 mr-6">
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </DialogHeader>

        {/* Scrollable Printable content container */}
        <div className="flex-1 overflow-y-auto pr-1 my-2">
          <div ref={printRef} className="rounded-lg border bg-white p-4 sm:p-5 space-y-3 sm:space-y-4 text-sm">
            {/* Header */}
          <div className="header text-center pb-3 border-b-2 border-primary">
            <div className="text-lg font-bold text-primary">RSP Medical Billing</div>
            <div className="text-xs text-muted-foreground">Employee Salary Slip</div>
            <div className="text-xs text-muted-foreground">{fmtMonthLabel(month)}</div>
          </div>

          {/* Employee Info */}
          <div className="section">
            <div className="section-title text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1 mb-2">
              Employee Details
            </div>
            <table className="w-full">
              <tbody>
                <tr><td className="text-muted-foreground">Employee Name</td><td className="font-semibold text-right">{emp.name}</td></tr>
                <tr><td className="text-muted-foreground">Employee ID</td><td className="font-mono text-right">{emp.id}</td></tr>
                <tr><td className="text-muted-foreground">Role</td><td className="text-right">{emp.role}</td></tr>
                <tr><td className="text-muted-foreground">Phone</td><td className="font-mono text-right">{emp.phone}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Attendance */}
          <div className="section">
            <div className="section-title text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1 mb-2">
              Attendance Summary
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold">{records.length}</div>
                <div className="text-[10px] text-muted-foreground">Total Days</div>
              </div>
              <div className="rounded-md border p-2 border-emerald-200 bg-emerald-50">
                <div className="text-lg font-bold text-emerald-600">{full}</div>
                <div className="text-[10px] text-emerald-600">Full Day</div>
              </div>
              <div className="rounded-md border p-2 border-yellow-200 bg-yellow-50">
                <div className="text-lg font-bold text-yellow-600">{half}</div>
                <div className="text-[10px] text-yellow-600">Half Day</div>
              </div>
              <div className="rounded-md border p-2 border-red-200 bg-red-50">
                <div className="text-lg font-bold text-red-500">{absent}</div>
                <div className="text-[10px] text-red-500">Absent</div>
              </div>
            </div>
          </div>

          {/* Salary Breakdown */}
          <div className="section">
            <div className="section-title text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1 mb-2">
              Salary Breakdown
            </div>
            <table className="w-full">
              <tbody>
                <tr className="py-1">
                  <td className="text-muted-foreground py-1">Monthly Base Salary</td>
                  <td className="text-right font-medium">₹{emp.salary.toLocaleString("en-IN")}</td>
                </tr>
                <tr>
                  <td className="text-muted-foreground py-1">Working Days Basis</td>
                  <td className="text-right font-medium">26 days/month</td>
                </tr>
                <tr>
                  <td className="text-muted-foreground py-1">Daily Rate</td>
                  <td className="text-right font-medium">₹{dailyRate.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="text-muted-foreground py-1">Duty Days Worked</td>
                  <td className="text-right font-medium">{duty}d</td>
                </tr>
                <tr className="total-row border-t">
                  <td className="pt-2 font-bold">Net Payable</td>
                  <td className="text-right pt-2 font-bold text-primary text-base">₹{netPay.toLocaleString("en-IN")}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Status */}
          <div className="section rounded-lg bg-muted/60 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">Payment Status</span>
              {payment ? (
                payment.status === "partial" ? (
                  <span className="badge badge-yellow">PARTIALLY PAID</span>
                ) : (
                  <span className="badge badge-green">PAID</span>
                )
              ) : (
                <span className="badge badge-yellow">PENDING</span>
              )}
            </div>
            {payment && (
              <table className="w-full text-xs mt-1">
                <tbody>
                  <tr>
                    <td className="text-muted-foreground py-0.5">Amount Paid</td>
                    <td className="text-right font-bold text-emerald-600">
                      ₹{(payment.amountPaid ?? payment.amount ?? 0).toLocaleString("en-IN")}
                    </td>
                  </tr>
                  {payment.status === "partial" && (
                    <tr>
                      <td className="text-amber-700 font-medium py-0.5">Remaining Balance</td>
                      <td className="text-right font-bold text-amber-700">
                        ₹{Math.max(0, netPay - (payment.amountPaid ?? payment.amount ?? 0)).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="text-muted-foreground py-0.5">Payment Date</td>
                    <td className="text-right font-medium">
                      {fmtDate(payment.paymentDate || payment.paidAt.slice(0, 10))}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-0.5">Payment Mode</td>
                    <td className="text-right font-medium">
                      {payment.paymentMode || "Cash"}
                    </td>
                  </tr>
                  {payment.notes && (
                    <tr>
                      <td className="text-muted-foreground py-0.5">Notes</td>
                      <td className="text-right italic">
                        {payment.notes}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="footer text-[10px] text-muted-foreground flex justify-between border-t pt-2">
            <span>Generated: {new Date().toLocaleDateString("en-IN")}</span>
            <span>RSP Medical Billing Software</span>
          </div>
        </div>
        </div>

        <DialogFooter className="gap-2 shrink-0 pt-2 border-t mt-auto flex flex-row justify-end items-center">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button onClick={handlePrint} size="sm" className="bg-primary text-primary-foreground">
            <Printer className="h-4 w-4 mr-1.5" /> Print Salary Slip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Salary Payment Confirmation Popup ────────────────────────────────────────
function SalaryPaymentDialog({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: {
    emp: Employee;
    month: string;
    netPay: number;
    existingPayment?: SalaryPayment;
  } | null;
}) {
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      const defaultAmt = data.existingPayment
        ? String(data.existingPayment.amountPaid ?? data.existingPayment.amount)
        : String(data.netPay);
      setAmountPaid(defaultAmt);
      setPaymentDate(data.existingPayment?.paymentDate || todayISO());
      setPaymentMode(data.existingPayment?.paymentMode || "Cash");
      setNotes(data.existingPayment?.notes || "");
    }
  }, [data]);

  if (!data) return null;

  const handleConfirm = async () => {
    if (!data.emp) return toast.error("Employee not selected");
    const amt = Number(amountPaid);
    if (isNaN(amt) || amt <= 0) {
      return toast.error("Please enter a valid amount paid (greater than 0)");
    }

    setSaving(true);
    const status: "paid" | "partial" = amt >= data.netPay ? "paid" : "partial";

    const { error } = await actions.addSalaryPayment({
      employeeId: data.emp.id,
      employeeName: data.emp.name,
      month: data.month,
      netPayable: data.netPay,
      amountPaid: amt,
      amount: amt,
      paymentDate: paymentDate || todayISO(),
      paymentMode,
      status,
      notes: notes.trim() || undefined,
    });
    setSaving(false);

    if (error) {
      toast.error(`Saved locally (Supabase note: ${error})`);
    } else {
      toast.success(status === "paid" ? "Salary marked as Paid ✓" : `Partial payment of ₹${amt.toLocaleString("en-IN")} recorded ✓`);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="shrink-0 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Wallet className="h-5 w-5" /> Salary Payment Payout
          </DialogTitle>
          <DialogDescription>
            Confirm and record salary payout for {data.emp.name} ({fmtMonthLabel(data.month)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto pr-1">
          {/* Employee & Month Summary Header Card */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employee Name</span>
              <span className="font-semibold text-sm text-foreground">{data.emp.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employee ID</span>
              <span className="font-mono text-foreground">{data.emp.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salary Month</span>
              <span className="font-medium text-foreground">{fmtMonthLabel(data.month)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-bold text-sm">
              <span className="text-foreground">Net Payable Amount</span>
              <span className="text-primary font-bold text-base">₹{data.netPay.toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Amount Paid */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Amount Paid (₹) *</span>
              <span className="text-[11px] text-muted-foreground font-normal">Editable</span>
            </Label>
            <div className="relative">
              <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="salary-amount-paid"
                type="number"
                min={1}
                className="pl-8 text-base font-semibold"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
            {Number(amountPaid) > 0 && Number(amountPaid) < data.netPay && (
              <p className="text-[11px] text-amber-600 font-medium">
                ⚠ Partial payment: Remaining balance ₹{(data.netPay - Number(amountPaid)).toLocaleString("en-IN")} will stay pending.
              </p>
            )}
          </div>

          {/* Payment Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Payment Date</Label>
            <Input
              id="salary-payment-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          {/* Payment Mode */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Payment Mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger id="salary-payment-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Online / UPI">Online / UPI</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="salary-payment-notes"
              placeholder="Cheque no., transaction ref, remarks…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 shrink-0 border-t mt-auto">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving} className="bg-primary text-primary-foreground">
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Salary Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Employees Page ──────────────────────────────────────────────────────
function EmployeesPage() {
  const employees = useStore((s) => s.employees);
  const sales = useStore((s) => s.sales);
  const attendance = useStore((s) => s.attendance);
  const salaryPayments = useStore((s) => s.salaryPayments);

  const [tab, setTab] = useState<Tab>("directory");
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);

  useEffect(() => {
    setMe(getUser());
    actions.syncSalaryPayments().catch(() => {});
    actions.syncAttendance().catch(() => {});
  }, []);
  const isAdmin = me?.role === "Admin";

  // ── Directory state ──────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "Cashier", phone: "", salary: 0, password: "" });
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<{ id: string; phone: string; password: string; name: string } | null>(null);

  // ── Attendance state ─────────────────────────────────────────
  const [attEmpId, setAttEmpId] = useState(employees[0]?.id ?? "");
  const [attDate, setAttDate] = useState(todayISO());
  const [attStatus, setAttStatus] = useState<"full" | "half" | "absent">("full");
  const [attTasks, setAttTasks] = useState("0");
  const [attMonth, setAttMonth] = useState(nowYYYYMM());

  // ── Payroll state ─────────────────────────────────────────────
  const [payMonth, setPayMonth] = useState(nowYYYYMM());
  const [slipEmpId, setSlipEmpId] = useState<string | null>(null);
  const [payDialogData, setPayDialogData] = useState<{
    emp: Employee;
    month: string;
    netPay: number;
    existingPayment?: SalaryPayment;
  } | null>(null);

  // ── Per-employee billing stats ────────────────────────────────
  const perEmp = useMemo(() => {
    const m: Record<string, { bills: number; revenue: number; cancelled: number }> = {};
    sales.forEach((s) => {
      const id = s.cashierId ?? "unknown";
      if (!m[id]) m[id] = { bills: 0, revenue: 0, cancelled: 0 };
      if (s.status === "cancelled") m[id].cancelled++;
      else { m[id].bills++; m[id].revenue += s.grand; }
    });
    return m;
  }, [sales]);

  // ── Directory actions ─────────────────────────────────────────
  const save = () => {
    if (!form.name.trim()) return toast.error("Name required");
    if (!form.phone.trim()) return toast.error("Phone (user ID) required");
    if (employees.some((e) => e.phone === form.phone.trim())) return toast.error("Phone already used");
    const password = form.password || generatePassword();
    const rec = actions.addEmployee(
      { name: form.name, role: form.role, phone: form.phone.trim(), salary: Number(form.salary) || 0, password, active: true },
      me ? { id: me.id, name: me.name } : undefined,
    );
    setCreated({ id: rec.id, phone: rec.phone, password, name: rec.name });
    setForm({ name: "", role: "Cashier", phone: "", salary: 0, password: "" });
    setOpen(false);
  };

  const remove = (id: string) => {
    if (id === "E001") return toast.error("Main admin can't be removed");
    if (!confirm("Delete this employee?")) return;
    actions.deleteEmployee(id, me ? { id: me.id, name: me.name } : undefined);
    toast.success("Employee removed");
  };

  const resetPw = (id: string) => {
    const pw = generatePassword();
    actions.updateEmployee(id, { password: pw });
    const emp = employees.find((e) => e.id === id);
    if (emp) setCreated({ id: emp.id, phone: emp.phone, password: pw, name: emp.name });
  };

  const copyCreds = () => {
    if (!created) return;
    navigator.clipboard.writeText(`Login: ${created.phone}\nPassword: ${created.password}`);
    toast.success("Credentials copied");
  };

  // ── Attendance actions ────────────────────────────────────────
  const markAttendance = async () => {
    const emp = employees.find((e) => e.id === attEmpId);
    if (!emp) return toast.error("Select an employee");
    if (!attDate) return toast.error("Select a date");
    const { error } = await actions.addAttendance({
      employeeId: emp.id,
      employeeName: emp.name,
      date: attDate,
      status: attStatus,
      tasks: Number(attTasks) || 0,
    });
    if (error) {
      toast.warning(`Attendance saved locally. (Supabase: ${error})`);
    } else {
      toast.success(`Attendance marked for ${emp.name}`);
    }
  };

  // Filtered attendance for the selected month
  const filteredAttendance = useMemo(() =>
    attendance.filter((a) => a.date.startsWith(attMonth))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [attendance, attMonth]);

  // Per-employee attendance summary for selected month
  const attSummary = useMemo(() => {
    const map: Record<string, { emp: typeof employees[0]; records: AttendanceRecord[] }> = {};
    employees.forEach((e) => { map[e.id] = { emp: e, records: [] }; });
    filteredAttendance.forEach((a) => {
      if (map[a.employeeId]) map[a.employeeId].records.push(a);
    });
    return Object.values(map);
  }, [employees, filteredAttendance]);

  // ── Payroll ───────────────────────────────────────────────────
  const payrollData = useMemo(() => {
    return employees.map((emp) => {
      const records = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(payMonth));
      const duty = dutyDays(records);
      const dailyRate = emp.salary / 26;
      const netPay = Math.round(dailyRate * duty);
      const payment = salaryPayments.find((p) => p.employeeId === emp.id && p.month === payMonth);
      return { emp, records, duty, netPay, payment };
    });
  }, [employees, attendance, salaryPayments, payMonth]);

  const openPayDialog = (emp: Employee, netPay: number, existingPayment?: SalaryPayment) => {
    setPayDialogData({ emp, month: payMonth, netPay, existingPayment });
  };

  // ── Tab button style ──────────────────────────────────────────
  const tabCls = (t: Tab) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      tab === t
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* ── Page Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" /> Employees
          </h1>
          <p className="text-sm text-muted-foreground">
            {employees.length} staff · Attendance, salary & payroll management
          </p>
        </div>
        {isAdmin && tab === "directory" && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Employee
          </Button>
        )}
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-2 flex-wrap bg-muted/50 p-1.5 rounded-xl w-fit">
        <button id="tab-directory" className={tabCls("directory")} onClick={() => setTab("directory")}>
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Directory</span>
        </button>
        <button id="tab-attendance" className={tabCls("attendance")} onClick={() => setTab("attendance")}>
          <CalendarCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Attendance</span>
        </button>
        <button id="tab-payroll" className={tabCls("payroll")} onClick={() => setTab("payroll")}>
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">Salary & Payroll</span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB 1 — Directory
      ════════════════════════════════════════════════════════ */}
      {tab === "directory" && (
        <>
          {!isAdmin && (
            <Card className="p-3 bg-muted/50 text-sm text-muted-foreground border-dashed">
              Only Admin can add or remove employees or view passwords.
            </Card>
          )}

          {/* Desktop Table */}
          <Card className="overflow-hidden hidden sm:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Emp ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Phone (Login)</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead className="text-right">Salary</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((e) => {
                    const stats = perEmp[e.id] ?? { bills: 0, revenue: 0, cancelled: 0 };
                    const isSeed = e.id === "E001";
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs">{e.id}</TableCell>
                        <TableCell className="font-medium">
                          {e.name}
                          {isSeed && <Badge variant="secondary" className="ml-2 gap-1"><Shield className="h-3 w-3" /> Admin</Badge>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{e.role}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{e.phone}</TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-sm">{reveal[e.id] ? (e.password || "—") : "••••••••"}</span>
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => setReveal((r) => ({ ...r, [e.id]: !r[e.id] }))}>
                                {reveal[e.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                              {!isSeed && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => resetPw(e.id)}>Reset</Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">hidden</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">₹{e.salary.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stats.bills}
                          {stats.cancelled > 0 && <span className="text-xs text-destructive ml-1">({stats.cancelled} cx)</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-primary font-semibold">₹{stats.revenue.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && !isSeed && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(e.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {employees.map((e) => {
              const stats = perEmp[e.id] ?? { bills: 0, revenue: 0, cancelled: 0 };
              const isSeed = e.id === "E001";
              return (
                <Card key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{e.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
                        {isSeed && <Badge variant="secondary" className="gap-1 text-xs"><Shield className="h-3 w-3" /> Admin</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">{e.role}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">{e.phone}</span>
                      </div>
                      <div className="mt-2 flex gap-4 text-sm">
                        <div><span className="text-muted-foreground text-xs">Salary</span><div className="font-semibold">₹{e.salary.toLocaleString("en-IN")}</div></div>
                        <div><span className="text-muted-foreground text-xs">Bills</span><div className="font-semibold">{stats.bills}</div></div>
                        <div><span className="text-muted-foreground text-xs">Revenue</span><div className="font-semibold text-primary">₹{stats.revenue.toLocaleString("en-IN")}</div></div>
                      </div>
                    </div>
                    {isAdmin && !isSeed && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => remove(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Bills summary */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
              <Receipt className="h-4 w-4" /> Recent bills per employee
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {employees.map((e) => {
                const s = perEmp[e.id];
                return (
                  <div key={e.id} className="rounded-md border p-3">
                    <div className="text-sm font-medium">{e.name} <span className="text-xs text-muted-foreground">({e.id})</span></div>
                    <div className="text-xs text-muted-foreground">{e.role}</div>
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <span><Receipt className="inline h-3.5 w-3.5" /> {s?.bills ?? 0} bills</span>
                      <span className="text-primary"><IndianRupee className="inline h-3.5 w-3.5" />{(s?.revenue ?? 0).toLocaleString("en-IN")}</span>
                    </div>
                    {s?.cancelled ? (
                      <div className="text-[11px] text-destructive mt-1">
                        ⚠ {s.cancelled} cancelled bill(s)
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB 2 — Attendance Register
      ════════════════════════════════════════════════════════ */}
      {tab === "attendance" && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Mark Attendance form */}
          <Card className="p-5 lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">Mark Attendance</div>
                <div className="text-xs text-muted-foreground">Record duty status for an employee</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Select Employee</Label>
              <Select value={attEmpId} onValueChange={setAttEmpId}>
                <SelectTrigger id="att-emp-select">
                  <SelectValue placeholder="Choose employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} — {e.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Attendance Date</Label>
              <Input
                id="att-date"
                type="date" value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Duty Status</Label>
              <div className="flex flex-col gap-2">
                <button
                  id="att-full"
                  onClick={() => setAttStatus("full")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    attStatus === "full"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "hover:bg-muted"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" /> Full Duty (1.0)
                </button>
                <button
                  id="att-half"
                  onClick={() => setAttStatus("half")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    attStatus === "half"
                      ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                      : "hover:bg-muted"
                  }`}
                >
                  <Clock className="h-4 w-4" /> Half Duty (0.5)
                </button>
                <button
                  id="att-absent"
                  onClick={() => setAttStatus("absent")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    attStatus === "absent"
                      ? "border-red-400 bg-red-50 text-red-600"
                      : "hover:bg-muted"
                  }`}
                >
                  <XCircle className="h-4 w-4" /> Absent (0.0)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tasks / Work Count <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="att-tasks"
                type="number" min={0} placeholder="0"
                value={attTasks}
                onChange={(e) => setAttTasks(e.target.value)}
              />
            </div>

            <Button className="w-full" onClick={markAttendance}>
              <CalendarCheck className="h-4 w-4 mr-1.5" /> Mark Attendance
            </Button>
          </Card>

          {/* Attendance Log */}
          <div className="lg:col-span-3 space-y-3">
            {/* Month Summary Cards */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Month:</span>
                <Input
                  type="month" value={attMonth}
                  onChange={(e) => setAttMonth(e.target.value)}
                  className="w-40 h-8 text-sm"
                />
              </div>
              <span className="text-sm font-semibold">{fmtMonthLabel(attMonth)}</span>
            </div>

            {/* Per-employee summary */}
            <div className="grid gap-2 sm:grid-cols-2">
              {attSummary.map(({ emp, records }) => {
                const duty = dutyDays(records);
                const absent = records.filter((r) => r.status === "absent").length;
                return (
                  <Card key={emp.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">{emp.name}</div>
                        <div className="text-xs text-muted-foreground">{emp.role}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-primary font-bold tabular-nums">{duty}d</div>
                        <div className="text-[11px] text-muted-foreground">Duty Days</div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2 text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{records.filter((r) => r.status === "full").length} Full</span>
                      <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">{records.filter((r) => r.status === "half").length} Half</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600">{absent} Absent</span>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Attendance Log Table — desktop */}
            <Card className="overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Attendance Log History</div>
                  <div className="text-xs text-muted-foreground">Daily duty records — {fmtMonthLabel(attMonth)}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Duty Status</TableHead>
                      <TableHead className="text-right">Tasks</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttendance.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                          No attendance records for {fmtMonthLabel(attMonth)}
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredAttendance.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm tabular-nums">{fmtDate(a.date)}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{a.employeeName}</div>
                        </TableCell>
                        <TableCell>
                          {a.status === "full"
                            ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Full Duty (1.0)</Badge>
                            : a.status === "half"
                              ? <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 gap-1"><Clock className="h-3 w-3" /> Half Duty (0.5)</Badge>
                              : <Badge className="bg-red-100 text-red-600 border-red-200 gap-1"><XCircle className="h-3 w-3" /> Absent (0.0)</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {(a.tasks ?? 0) > 0 ? `${a.tasks} tasks` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                              onClick={async () => {
                                const { error } = await actions.deleteAttendance(a.id);
                                if (error) toast.warning(`Deleted locally. (Supabase: ${error})`);
                                else toast.success("Record deleted");
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile attendance list */}
              <div className="sm:hidden divide-y">
                {filteredAttendance.length === 0 && (
                  <div className="py-10 text-center text-muted-foreground text-sm">No records</div>
                )}
                {filteredAttendance.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3">
                    <div className={`rounded-full p-1.5 shrink-0 ${
                      a.status === "full" ? "bg-emerald-100" : a.status === "half" ? "bg-yellow-100" : "bg-red-100"
                    }`}>
                      {a.status === "full"
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        : a.status === "half"
                          ? <Clock className="h-4 w-4 text-yellow-600" />
                          : <XCircle className="h-4 w-4 text-red-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{a.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(a.date)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-semibold ${
                        a.status === "full" ? "text-emerald-600" : a.status === "half" ? "text-yellow-600" : "text-red-500"
                      }`}>
                        {a.status === "full" ? "1.0d" : a.status === "half" ? "0.5d" : "0d"}
                      </div>
                      {isAdmin && (
                        <button onClick={async () => {
                          const { error } = await actions.deleteAttendance(a.id);
                          if (error) toast.warning(`Deleted locally. (Supabase: ${error})`);
                          else toast.success("Deleted");
                        }}
                          className="mt-0.5 text-destructive/60 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB 3 — Salary & Payroll
      ════════════════════════════════════════════════════════ */}
      {tab === "payroll" && (
        <div className="space-y-4">
          {/* Month selector */}
          <Card className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Wallet className="h-5 w-5 text-primary" />
              <span className="font-semibold">Monthly Salary Calculator &amp; Payroll</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-muted-foreground">Salary pro-rated: base ÷ 26 × duty days</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Month:</span>
                <Input
                  type="month" value={payMonth}
                  onChange={(e) => setPayMonth(e.target.value)}
                  className="w-40 h-8 text-sm"
                />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {payrollData.map(({ emp, records, duty, netPay, payment }) => {
              const dailyRate = emp.salary / 26;
              const absent = records.filter((r) => r.status === "absent").length;
              return (
                <Card key={emp.id} className="p-4 space-y-3">
                  {/* Emp name + status */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{emp.name}</div>
                      <div className="text-xs text-muted-foreground">{emp.role}</div>
                    </div>
                    {payment ? (
                      payment.status === "partial" ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">PARTIALLY PAID</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">PAID</Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 text-xs">PENDING</Badge>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted p-2">
                      <div className="text-base font-bold tabular-nums">{duty}d</div>
                      <div className="text-[10px] text-muted-foreground">Duty Days</div>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <div className="text-base font-bold tabular-nums">{records.length}</div>
                      <div className="text-[10px] text-muted-foreground">Total Marked</div>
                    </div>
                    <div className="rounded-lg bg-red-50 p-2">
                      <div className="text-base font-bold tabular-nums text-red-500">{absent}</div>
                      <div className="text-[10px] text-red-400">Absent</div>
                    </div>
                  </div>

                  {/* Salary breakdown */}
                  <div className="space-y-1 text-sm border rounded-lg p-3 bg-muted/30">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base Salary</span>
                      <span>₹{emp.salary.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Daily Rate (÷26)</span>
                      <span>₹{dailyRate.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duty Days</span>
                      <span>{duty}d × ₹{dailyRate.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-1 border-t mt-1">
                      <span>Net Payable</span>
                      <span className="text-primary">₹{netPay.toLocaleString("en-IN")}</span>
                    </div>
                    {payment && (
                      <div className="pt-1.5 border-t space-y-1 text-xs">
                        <div className="flex justify-between font-semibold text-emerald-600">
                          <span>Amount Paid</span>
                          <span>₹{(payment.amountPaid ?? payment.amount ?? 0).toLocaleString("en-IN")}</span>
                        </div>
                        {payment.status === "partial" && (
                          <div className="flex justify-between font-semibold text-amber-700">
                            <span>Remaining</span>
                            <span>₹{Math.max(0, netPay - (payment.amountPaid ?? payment.amount ?? 0)).toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>Paid on</span>
                          <span>{fmtDate(payment.paymentDate || payment.paidAt.slice(0, 10))} · {payment.paymentMode || "Cash"}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!payment && isAdmin && (
                      <Button
                        className="flex-1 bg-primary text-primary-foreground"
                        onClick={() => openPayDialog(emp, netPay)}
                        disabled={duty === 0}
                        size="sm"
                      >
                        <IndianRupee className="h-4 w-4 mr-1" /> Pay Salary
                      </Button>
                    )}
                    {payment && payment.status === "partial" && isAdmin && (
                      <Button
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={() => openPayDialog(emp, netPay, payment)}
                        size="sm"
                      >
                        <IndianRupee className="h-4 w-4 mr-1" /> Pay Remaining
                      </Button>
                    )}
                    {payment && payment.status === "paid" && (
                      <div className="flex-1 flex items-center gap-1 text-emerald-600 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Paid
                      </div>
                    )}
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setSlipEmpId(emp.id)}
                    >
                      <Printer className="h-4 w-4 mr-1" /> Slip
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add Employee Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>Phone number is their login ID. Password is auto-generated if left blank.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Full name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="Pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="Cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone (login ID) *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="10 digits" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Salary (₹)</Label>
              <Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password (blank = auto)</Label>
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="auto-generate" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Create login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Credentials created dialog ── */}
      <Dialog open={!!created} onOpenChange={(v) => !v && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login credentials</DialogTitle>
            <DialogDescription>Share this with {created?.name}. You can view them again on this page (Admin only).</DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 font-mono text-sm">
              <div>Employee ID: <b>{created.id}</b></div>
              <div>Login (phone): <b>{created.phone}</b></div>
              <div>Password: <b>{created.password}</b></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreated(null)}>Close</Button>
            <Button onClick={copyCreds}><Copy className="h-4 w-4 mr-1.5" /> Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Salary Slip Dialog ── */}
      <SalarySlipDialog
        open={!!slipEmpId}
        onClose={() => setSlipEmpId(null)}
        empId={slipEmpId}
        month={payMonth}
      />

      {/* ── Salary Payment Confirmation Popup ── */}
      <SalaryPaymentDialog
        open={!!payDialogData}
        onClose={() => setPayDialogData(null)}
        data={payDialogData}
      />
    </div>
  );
}
