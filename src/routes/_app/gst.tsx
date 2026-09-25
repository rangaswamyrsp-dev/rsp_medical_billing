import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Percent, Download, Printer, Building2, TrendingUp, TrendingDown,
  IndianRupee, FileText, BarChart3, Users, Truck, Save,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import type { GSTProfile } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/gst")({
  head: () => ({
    meta: [
      { title: "GST Reports · RSP Medical Billing" },
      { name: "description", content: "Comprehensive GST Reports & Filing Support — automatic data from all invoices." },
    ],
  }),
  component: GstPage,
});

// ─── helpers ─────────────────────────────────────────────────────────────────
const nowYYYYMM = () => new Date().toISOString().slice(0, 7);
const fmtAmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtFull = (n: number) => "₹" + n.toFixed(2);

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type ReportTab = "dashboard" | "sales" | "purchase" | "taxbreakup" | "hsnwise" | "customerwise" | "supplierwise" | "itc" | "profile";

const REPORT_TABS: { id: ReportTab; label: string; icon: any }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "sales", label: "Sales GST", icon: TrendingUp },
  { id: "purchase", label: "Purchase GST", icon: TrendingDown },
  { id: "taxbreakup", label: "Tax Breakup", icon: Percent },
  { id: "hsnwise", label: "HSN-wise", icon: FileText },
  { id: "customerwise", label: "Customer-wise", icon: Users },
  { id: "supplierwise", label: "Supplier-wise", icon: Truck },
  { id: "itc", label: "ITC Summary", icon: IndianRupee },
  { id: "profile", label: "GST Profile", icon: Building2 },
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Chandigarh", "Puducherry",
];

// ─── CSV Export ───────────────────────────────────────────────────────────────
function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Summary Stat Card ────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "primary" }: { label: string; value: string; sub?: string; color?: "primary" | "warning" | "emerald" | "blue" | "red" }) {
  const clr = {
    primary: "text-primary border-l-primary",
    warning: "text-amber-600 border-l-amber-500",
    emerald: "text-emerald-600 border-l-emerald-500",
    blue: "text-blue-600 border-l-blue-500",
    red: "text-red-500 border-l-red-500",
  }[color];
  return (
    <Card className={`p-4 border-l-4 ${clr.split(" ")[1]}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${clr.split(" ")[0]}`}>{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${clr.split(" ")[0]}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function GstPage() {
  const sales = useStore((s) => s.sales);
  const purchases = useStore((s) => s.purchases);
  const customers = useStore((s) => s.customers);
  const suppliers = useStore((s) => s.suppliers);
  const gstProfile = useStore((s) => s.gstProfile);

  const [tab, setTab] = useState<ReportTab>("dashboard");
  const [filterMonth, setFilterMonth] = useState(nowYYYYMM());
  const [profileForm, setProfileForm] = useState<GSTProfile>(gstProfile);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    actions.syncGSTProfile().catch(() => {});
  }, []);

  useEffect(() => {
    setProfileForm(gstProfile);
  }, [gstProfile]);

  // ── Core GST computation ──────────────────────────────────────────────────
  const { salesData, purchaseData } = useMemo(() => {
    const paidSales = sales.filter((s) => s.status === "paid" && (!filterMonth || s.date.startsWith(filterMonth)));
    const allPurchases = purchases.filter((p) => !filterMonth || p.date.startsWith(filterMonth));

    const salesData = paidSales.map((s) => {
      let taxable = 0, cgst = 0, sgst = 0, igst = 0, total = 0;
      s.items.forEach((it) => {
        const line = it.mrp * it.qty * (1 - it.discount / 100);
        const gstAmt = (line * it.gst) / 100;
        taxable += line;
        cgst += gstAmt / 2;
        sgst += gstAmt / 2;
        total += line + gstAmt;
      });
      return { ...s, taxable, cgst, sgst, igst, total };
    });

    const purchaseData = allPurchases.map((p) => {
      let taxable = 0, cgst = 0, sgst = 0, igst = 0, total = 0;
      p.items.forEach((it) => {
        const line = it.rate * it.qty;
        const gstAmt = (line * it.gst) / 100;
        taxable += line;
        cgst += gstAmt / 2;
        sgst += gstAmt / 2;
        total += line + gstAmt;
      });
      return { ...p, taxable, cgst, sgst, igst, total };
    });

    return { salesData, purchaseData };
  }, [sales, purchases, filterMonth]);

  const totals = useMemo(() => {
    const totalSales = salesData.reduce((n, s) => n + s.total, 0);
    const totalPurchase = purchaseData.reduce((n, p) => n + p.total, 0);
    const taxableOut = salesData.reduce((n, s) => n + s.taxable, 0);
    const cgstOut = salesData.reduce((n, s) => n + s.cgst, 0);
    const sgstOut = salesData.reduce((n, s) => n + s.sgst, 0);
    const cgstIn = purchaseData.reduce((n, p) => n + p.cgst, 0);
    const sgstIn = purchaseData.reduce((n, p) => n + p.sgst, 0);
    const itc = cgstIn + sgstIn;
    const outputTax = cgstOut + sgstOut;
    const netGst = Math.max(0, outputTax - itc);
    return { totalSales, totalPurchase, taxableOut, cgstOut, sgstOut, igst: 0, itc, outputTax, netGst };
  }, [salesData, purchaseData]);

  // ── HSN-wise ─────────────────────────────────────────────────────────────
  const hsnData = useMemo(() => {
    const map = new Map<string, { hsn: string; name: string; qty: number; taxable: number; cgst: number; sgst: number; total: number }>();
    salesData.forEach((s) => {
      s.items.forEach((it) => {
        const key = it.gst + "%";
        const cur = map.get(key) ?? { hsn: key, name: `GST ${key}`, qty: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
        const line = it.mrp * it.qty * (1 - it.discount / 100);
        const gstAmt = (line * it.gst) / 100;
        cur.qty += it.qty;
        cur.taxable += line;
        cur.cgst += gstAmt / 2;
        cur.sgst += gstAmt / 2;
        cur.total += line + gstAmt;
        map.set(key, cur);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.taxable - a.taxable);
  }, [salesData]);

  // ── Customer-wise ─────────────────────────────────────────────────────────
  const customerData = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; bills: number; taxable: number; cgst: number; sgst: number; total: number }>();
    salesData.forEach((s) => {
      const key = s.customerId ?? s.customerName;
      const cur = map.get(key) ?? { name: s.customerName || "Walk-in", phone: s.phone, bills: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      cur.bills++;
      cur.taxable += s.taxable;
      cur.cgst += s.cgst;
      cur.sgst += s.sgst;
      cur.total += s.total;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [salesData]);

  // ── Supplier-wise ─────────────────────────────────────────────────────────
  const supplierData = useMemo(() => {
    const map = new Map<string, { name: string; invoices: number; taxable: number; cgst: number; sgst: number; total: number }>();
    purchaseData.forEach((p) => {
      const cur = map.get(p.supplier) ?? { name: p.supplier, invoices: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      cur.invoices++;
      cur.taxable += p.taxable;
      cur.cgst += p.cgst;
      cur.sgst += p.sgst;
      cur.total += p.total;
      map.set(p.supplier, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [purchaseData]);

  // ── Tax breakup by slab ───────────────────────────────────────────────────
  const taxBreakup = useMemo(() => {
    const map = new Map<number, { slab: number; taxable: number; cgst: number; sgst: number; total: number }>();
    salesData.forEach((s) => {
      s.items.forEach((it) => {
        const line = it.mrp * it.qty * (1 - it.discount / 100);
        const gstAmt = (line * it.gst) / 100;
        const cur = map.get(it.gst) ?? { slab: it.gst, taxable: 0, cgst: 0, sgst: 0, total: 0 };
        cur.taxable += line; cur.cgst += gstAmt / 2; cur.sgst += gstAmt / 2; cur.total += line + gstAmt;
        map.set(it.gst, cur);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.slab - b.slab);
  }, [salesData]);

  const monthLabel = filterMonth
    ? new Date(filterMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "All Time";

  const tabCls = (t: ReportTab) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  // ── Profile save ─────────────────────────────────────────────────────────
  const saveProfile = async () => {
    setSavingProfile(true);
    const { error } = await actions.updateGSTProfile(profileForm);
    setSavingProfile(false);
    if (error) {
      toast.error(`Failed to save to Supabase: ${error}`);
    } else {
      toast.success("GST profile saved successfully");
    }
  };

  // ── Print ────────────────────────────────────────────────────────────────
  const printReport = () => {
    const style = document.createElement("style");
    style.innerHTML = `@media print { .no-print { display: none !important; } }`;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Percent className="h-6 w-6 text-primary" /> GST Reports & Filing Support
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Auto-collected from all invoices · Billing Data → GST Reports → Accountant Filing
          </p>
        </div>
        <div className="flex gap-2 no-print flex-wrap shrink-0">
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="h-4 w-4 mr-1.5" /> Print / PDF
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => {
              if (tab === "sales") {
                downloadCSV(`GST_Sales_${filterMonth}.csv`,
                  ["Date", "Invoice", "Customer", "Phone", "Taxable", "CGST", "SGST", "Total"],
                  salesData.map((s) => [s.date.slice(0, 10), s.id, s.customerName, s.phone, s.taxable.toFixed(2), s.cgst.toFixed(2), s.sgst.toFixed(2), s.total.toFixed(2)]));
              } else if (tab === "purchase") {
                downloadCSV(`GST_Purchase_${filterMonth}.csv`,
                  ["Date", "Invoice", "Supplier", "Taxable", "CGST", "SGST", "Total"],
                  purchaseData.map((p) => [p.date, p.invoiceNo, p.supplier, p.taxable.toFixed(2), p.cgst.toFixed(2), p.sgst.toFixed(2), p.total.toFixed(2)]));
              } else if (tab === "taxbreakup") {
                downloadCSV(`GST_TaxBreakup_${filterMonth}.csv`,
                  ["GST Slab", "Taxable Amount", "CGST", "SGST", "Total Tax"],
                  taxBreakup.map((r) => [r.slab + "%", r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), (r.cgst + r.sgst).toFixed(2)]));
              } else {
                downloadCSV(`GST_Dashboard_${filterMonth}.csv`,
                  ["Metric", "Amount"],
                  [
                    ["Total Sales", totals.totalSales.toFixed(2)],
                    ["Taxable Amount", totals.taxableOut.toFixed(2)],
                    ["Output CGST", totals.cgstOut.toFixed(2)],
                    ["Output SGST", totals.sgstOut.toFixed(2)],
                    ["Total Purchases", totals.totalPurchase.toFixed(2)],
                    ["Input Tax Credit", totals.itc.toFixed(2)],
                    ["Net GST Payable", totals.netGst.toFixed(2)],
                  ]);
              }
              toast.success("CSV downloaded");
            }}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Month filter + tab bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2 no-print">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Filter Month:</span>
          <Input
            type="month" value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-40 h-8 text-sm"
          />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterMonth("")}>All</Button>
        </div>
        <div className="flex-1 text-sm font-semibold text-muted-foreground sm:text-right">{monthLabel}</div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 flex-wrap bg-muted/50 p-1.5 rounded-xl no-print overflow-x-auto">
        {REPORT_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tabCls(id)} onClick={() => setTab(id)}>
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════ DASHBOARD ══════════════════════════════ */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Total Sales" value={fmtAmt(totals.totalSales)} sub={`${salesData.length} invoices`} color="primary" />
            <StatCard label="Total Purchases" value={fmtAmt(totals.totalPurchase)} sub={`${purchaseData.length} invoices`} color="blue" />
            <StatCard label="Taxable Amount" value={fmtAmt(totals.taxableOut)} sub="On sales" color="emerald" />
            <StatCard label="Output CGST" value={fmtFull(totals.cgstOut)} color="warning" />
            <StatCard label="Output SGST" value={fmtFull(totals.sgstOut)} color="warning" />
            <StatCard label="IGST" value="₹0.00" sub="Inter-state (N/A)" color="blue" />
            <StatCard label="Input Tax Credit" value={fmtFull(totals.itc)} sub="From purchases" color="emerald" />
            <StatCard label="Net GST Payable" value={fmtAmt(totals.netGst)} sub="Output − ITC" color={totals.netGst > 0 ? "red" : "primary"} />
          </div>

          {/* Visual GST summary card */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Monthly GST Position — {monthLabel}</h3>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Output Tax (Sales)</div>
                <div className="space-y-1.5">
                  {[
                    { label: "Taxable Value", val: totals.taxableOut, cls: "text-foreground" },
                    { label: "CGST (Output)", val: totals.cgstOut, cls: "text-amber-600" },
                    { label: "SGST (Output)", val: totals.sgstOut, cls: "text-amber-600" },
                    { label: "Total Output Tax", val: totals.outputTax, cls: "text-red-500 font-bold" },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`tabular-nums ${cls}`}>{fmtFull(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Input Tax Credit (Purchases)</div>
                <div className="space-y-1.5">
                  {[
                    { label: "Taxable Purchases", val: purchaseData.reduce((n, p) => n + p.taxable, 0), cls: "text-foreground" },
                    { label: "CGST (Input)", val: purchaseData.reduce((n, p) => n + p.cgst, 0), cls: "text-emerald-600" },
                    { label: "SGST (Input)", val: purchaseData.reduce((n, p) => n + p.sgst, 0), cls: "text-emerald-600" },
                    { label: "Total ITC", val: totals.itc, cls: "text-emerald-600 font-bold" },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`tabular-nums ${cls}`}>{fmtFull(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-muted/60 p-4 flex flex-col justify-center gap-3">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Net GST Payable</div>
                <div className="text-3xl font-bold text-primary tabular-nums">{fmtAmt(totals.netGst)}</div>
                <div className="text-xs text-muted-foreground">Output Tax − Input Tax Credit</div>
                <div className="text-xs bg-primary/10 text-primary rounded-md px-2 py-1 font-medium">
                  {fmtFull(totals.outputTax)} − {fmtFull(totals.itc)} = {fmtFull(totals.netGst)}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════ SALES GST ══════════════════════════════ */}
      {tab === "sales" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Sales GST Report</h2>
              <p className="text-xs text-muted-foreground">{salesData.length} invoices · {monthLabel}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesData.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No sales in {monthLabel}</TableCell></TableRow>
                )}
                {salesData.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm tabular-nums">{fmtDate(s.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell className="text-sm">{s.customerName || "Walk-in"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.phone || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{fmtFull(s.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-amber-600">{fmtFull(s.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-amber-600">{fmtFull(s.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtFull(s.total)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">Paid</Badge></TableCell>
                  </TableRow>
                ))}
                {salesData.length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={4} className="text-sm">Totals</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(totals.taxableOut)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(totals.cgstOut)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(totals.sgstOut)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">{fmtFull(totals.totalSales)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ══════════════════════════════ PURCHASE GST ══════════════════════════ */}
      {tab === "purchase" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Purchase GST Report (Input Tax Credit)</h2>
            <p className="text-xs text-muted-foreground">{purchaseData.length} invoices · {monthLabel}</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST (ITC)</TableHead>
                  <TableHead className="text-right">SGST (ITC)</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseData.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No purchases in {monthLabel}</TableCell></TableRow>
                )}
                {purchaseData.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm tabular-nums">{fmtDate(p.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.invoiceNo}</TableCell>
                    <TableCell className="text-sm">{p.supplier}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{fmtFull(p.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-emerald-600">{fmtFull(p.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-emerald-600">{fmtFull(p.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtFull(p.total)}</TableCell>
                  </TableRow>
                ))}
                {purchaseData.length > 0 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3} className="text-sm">Totals</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(purchaseData.reduce((n, p) => n + p.taxable, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{fmtFull(purchaseData.reduce((n, p) => n + p.cgst, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{fmtFull(purchaseData.reduce((n, p) => n + p.sgst, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">{fmtFull(totals.totalPurchase)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ══════════════════════════════ TAX BREAKUP ═══════════════════════════ */}
      {tab === "taxbreakup" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Tax Breakup — GST Rate-wise</h2>
            <p className="text-xs text-muted-foreground">Sales tax grouped by GST slab · {monthLabel}</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GST Slab</TableHead>
                  <TableHead className="text-right">Taxable Amount</TableHead>
                  <TableHead className="text-right">CGST (@half)</TableHead>
                  <TableHead className="text-right">SGST (@half)</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                  <TableHead className="text-right">Invoice Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxBreakup.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No sales data.</TableCell></TableRow>
                )}
                {taxBreakup.map((r) => (
                  <TableRow key={r.slab}>
                    <TableCell><Badge variant="outline" className="font-mono">{r.slab}%</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(r.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(r.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(r.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtFull(r.cgst + r.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary font-semibold">{fmtFull(r.total)}</TableCell>
                  </TableRow>
                ))}
                {taxBreakup.length > 0 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(taxBreakup.reduce((n, r) => n + r.taxable, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(totals.cgstOut)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(totals.sgstOut)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(totals.outputTax)}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">{fmtFull(totals.totalSales)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ══════════════════════════════ HSN-WISE ══════════════════════════════ */}
      {tab === "hsnwise" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">HSN/SAC Wise Report</h2>
            <p className="text-xs text-muted-foreground">Grouped by GST rate slab · {monthLabel}</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GST Rate</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Taxable Value</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hsnData.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No data.</TableCell></TableRow>
                )}
                {hsnData.map((r) => (
                  <TableRow key={r.hsn}>
                    <TableCell><Badge className="font-mono">{r.hsn}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(r.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(r.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(r.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">{fmtFull(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ════════════════════════════ CUSTOMER-WISE ═══════════════════════════ */}
      {tab === "customerwise" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Customer-wise GST Report</h2>
            <p className="text-xs text-muted-foreground">GST collected per customer · {monthLabel}</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerData.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No data.</TableCell></TableRow>
                )}
                {customerData.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone || "—"}</TableCell>
                    <TableCell className="text-right">{c.bills}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(c.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(c.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{fmtFull(c.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">{fmtFull(c.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ════════════════════════════ SUPPLIER-WISE ═══════════════════════════ */}
      {tab === "supplierwise" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Supplier-wise GST Report (ITC)</h2>
            <p className="text-xs text-muted-foreground">Input Tax Credit per supplier · {monthLabel}</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST (ITC)</TableHead>
                  <TableHead className="text-right">SGST (ITC)</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierData.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No data.</TableCell></TableRow>
                )}
                {supplierData.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{s.name}</TableCell>
                    <TableCell className="text-right">{s.invoices}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFull(s.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{fmtFull(s.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{fmtFull(s.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">{fmtFull(s.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ════════════════════════════ ITC SUMMARY ═════════════════════════════ */}
      {tab === "itc" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Output Tax" value={fmtFull(totals.outputTax)} sub="CGST + SGST on sales" color="red" />
            <StatCard label="Total ITC Available" value={fmtFull(totals.itc)} sub="From purchases" color="emerald" />
            <StatCard label="Net GST Payable" value={fmtAmt(totals.netGst)} sub="Output − ITC" color="warning" />
            <StatCard label="Effective Rate" value={totals.taxableOut > 0 ? ((totals.netGst / totals.taxableOut) * 100).toFixed(1) + "%" : "—"} sub="Net / Taxable sales" color="primary" />
          </div>

          <Card className="p-5">
            <h3 className="font-semibold mb-4">ITC Utilization Summary — {monthLabel}</h3>
            <div className="space-y-3">
              {[
                { label: "CGST Output (Payable)", val: totals.cgstOut, cls: "text-red-500" },
                { label: "SGST Output (Payable)", val: totals.sgstOut, cls: "text-red-500" },
                { label: "CGST Input (ITC)", val: purchaseData.reduce((n, p) => n + p.cgst, 0), cls: "text-emerald-600" },
                { label: "SGST Input (ITC)", val: purchaseData.reduce((n, p) => n + p.sgst, 0), cls: "text-emerald-600" },
              ].map(({ label, val, cls }) => (
                <div key={label} className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={`font-semibold tabular-nums ${cls}`}>{fmtFull(val)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <span className="font-bold">Net GST Payable to Government</span>
                <span className={`text-xl font-bold tabular-nums ${totals.netGst > 0 ? "text-red-500" : "text-primary"}`}>{fmtAmt(totals.netGst)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ════════════════════════════ GST PROFILE ════════════════════════════ */}
      {tab === "profile" && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> GST Business Profile</h2>
              <p className="text-xs text-muted-foreground mt-0.5">These details appear on all GST reports and exported files</p>
            </div>
            <Button onClick={saveProfile} disabled={savingProfile}>
              <Save className="h-4 w-4 mr-1.5" /> {savingProfile ? "Saving..." : "Save Profile"}
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: "Business Name", key: "businessName" as const, placeholder: "Your medical store name" },
              { label: "GSTIN", key: "gstin" as const, placeholder: "15-digit GSTIN" },
              { label: "PAN", key: "pan" as const, placeholder: "AAAAA0000A" },
              { label: "Contact Number", key: "contact" as const, placeholder: "+91 98765 43210" },
              { label: "Email", key: "email" as const, placeholder: "gst@yourstore.com" },
              { label: "State Code", key: "stateCode" as const, placeholder: "37" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs font-medium">{label}</Label>
                <Input placeholder={placeholder} value={profileForm[key]} onChange={(e) => setProfileForm({ ...profileForm, [key]: e.target.value })} />
              </div>
            ))}

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium">Business Address</Label>
              <Input placeholder="Full address" value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">State</Label>
              <Select value={profileForm.state} onValueChange={(v) => setProfileForm({ ...profileForm, state: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">GST Registration Type</Label>
              <Select value={profileForm.registrationType} onValueChange={(v) => setProfileForm({ ...profileForm, registrationType: v as GSTProfile["registrationType"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="Composition">Composition</SelectItem>
                  <SelectItem value="Unregistered">Unregistered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Financial Year</Label>
              <Select value={profileForm.financialYear} onValueChange={(v) => setProfileForm({ ...profileForm, financialYear: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["2024-25", "2025-26", "2026-27", "2027-28"].map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-5 rounded-lg bg-muted/50 p-4 border">
            <div className="text-xs text-muted-foreground mb-2 font-semibold uppercase">Profile Preview (appears on reports)</div>
            <div className="text-sm space-y-0.5">
              <div className="font-bold text-base">{profileForm.businessName}</div>
              <div className="text-muted-foreground">{profileForm.address}</div>
              <div className="text-muted-foreground">{profileForm.state} — {profileForm.stateCode}</div>
              <div className="font-mono text-xs">GSTIN: {profileForm.gstin} · PAN: {profileForm.pan}</div>
              <div className="text-xs">Tel: {profileForm.contact} · {profileForm.email}</div>
              <div className="text-xs text-primary font-medium">{profileForm.registrationType} · FY {profileForm.financialYear}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
