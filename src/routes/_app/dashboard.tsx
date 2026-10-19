import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  IndianRupee, Receipt, ShoppingCart, TrendingUp, TrendingDown, Boxes, AlertTriangle, CalendarClock,
  Users, Plus, Printer, DatabaseBackup, UserPlus, Pill, Truck, Wallet, CreditCard, Calendar,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { actions, useStore, useHydrated } from "@/lib/store";
import { useTenant, useFeatures, TYPE_COPY } from "@/lib/tenant";
import { daysToExpiry } from "@/lib/expiry";
import { parsePaymentAmounts } from "@/lib/payment-utils";
import { parsePackInfo, formatStockBreakdown } from "@/lib/medicine-units";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · RSP Billing Software" },
      { name: "description", content: "Live sales, stock and expiry overview for your business." },
      { property: "og:title", content: "Dashboard · RSP Billing Software" },
      { property: "og:description", content: "Live sales, stock and expiry overview for your business." },
    ],
  }),
  component: Dashboard,
});

const TONE: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  info: "bg-[color:var(--info)]/10 text-[color:var(--info)]",
  warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
};

const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export type DashboardPeriod = "today" | "yesterday" | "week" | "month" | "custom";

function matchesPeriod(
  dateStr: string | undefined | null,
  period: DashboardPeriod,
  customFrom?: string,
  customTo?: string
): boolean {
  if (!dateStr) return false;
  const clean = dateStr.includes("T") ? dateStr : `${dateStr.replace(" ", "T")}`;
  const d = new Date(clean.length === 10 ? `${clean}T00:00:00` : clean);
  if (isNaN(d.getTime())) return false;

  const now = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const targetDateStr = `${y}-${m}-${day}`;

  const ny = now.getFullYear();
  const nm = String(now.getMonth() + 1).padStart(2, "0");
  const nd = String(now.getDate()).padStart(2, "0");
  const todayDateStr = `${ny}-${nm}-${nd}`;

  if (period === "today") {
    return targetDateStr === todayDateStr;
  }
  if (period === "yesterday") {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yy = yest.getFullYear();
    const ym = String(yest.getMonth() + 1).padStart(2, "0");
    const yd = String(yest.getDate()).padStart(2, "0");
    return targetDateStr === `${yy}-${ym}-${yd}`;
  }
  if (period === "week") {
    const currentDay = now.getDay();
    const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return d >= monday && d <= sunday;
  }
  if (period === "month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (period === "custom") {
    if (customFrom && targetDateStr < customFrom) return false;
    if (customTo && targetDateStr > customTo) return false;
    return true;
  }
  return true;
}

function formatTxDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const isT = d.toDateString() === new Date().toDateString();
  if (isT && dateStr.includes("T")) {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function Dashboard() {
  const hydrated = useHydrated();
  const sales = useStore((s) => s.sales);
  const purchases = useStore((s) => s.purchases);
  const medicines = useStore((s) => s.medicines);
  const customers = useStore((s) => s.customers);
  const employees = useStore((s) => s.employees);
  const loans = useStore((s) => s.loans);
  const financeEntries = useStore((s) => s.financeEntries);
  const salaryPayments = useStore((s) => s.salaryPayments);
  const printer = useStore((s) => s.printer);
  const tenant = useTenant();
  const f = useFeatures();
  const copy = TYPE_COPY[tenant.type];

  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [customFrom, setCustomFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    actions.syncSales().catch(() => {});
    actions.syncPurchases().catch(() => {});
    actions.syncMedicines().catch(() => {});
    actions.syncCustomers().catch(() => {});
    actions.syncFinanceEntries().catch(() => {});
    actions.syncSalaryPayments().catch(() => {});
  }, []);

  const data = useMemo(() => {
    const currentTid = tenant.id || "T001";

    // 1. Valid sales in period (exclude cancelled and held)
    const validSales = sales.filter((s) => s.status !== "cancelled" && s.status !== "held");
    const periodSales = validSales.filter((s) => matchesPeriod(s.date, period, customFrom, customTo));

    // Revenue = sum of valid sale grand totals
    const revenue = periodSales.reduce((sum, s) => sum + (Number(s.grand) || 0), 0);

    // 2. Purchases in period
    const periodPurchases = purchases.filter((p) => matchesPeriod(p.date, period, customFrom, customTo));
    const purchaseTotal = periodPurchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0);

    // 3. Manual expenses in period (exclude any auto-synced purchase/salary duplicates)
    const periodManualExpenses = financeEntries.filter((fe) => {
      if (fe.tenantId && fe.tenantId !== currentTid) return false;
      return (
        fe.type === "expense" &&
        fe.sourceType !== "PURCHASE" &&
        fe.sourceType !== "SALARY_PAYMENT" &&
        matchesPeriod(fe.date || fe.createdAt, period, customFrom, customTo)
      );
    });
    const manualExpenseTotal = periodManualExpenses.reduce((sum, fe) => sum + (Number(fe.amount) || 0), 0);

    // 4. Salary payments in period (actual paid amounts)
    const periodSalaries = salaryPayments.filter((sp) => {
      if (sp.tenantId && sp.tenantId !== currentTid) return false;
      const amt = Number(sp.amountPaid ?? sp.amount) || 0;
      return amt > 0 && matchesPeriod(sp.paymentDate || sp.paidAt || sp.createdAt, period, customFrom, customTo);
    });
    const salaryExpenseTotal = periodSalaries.reduce((sum, sp) => sum + (Number(sp.amountPaid ?? sp.amount) || 0), 0);

    // Total Expenses = Purchases + Manual expenses + Salary payments
    const totalExpenses = purchaseTotal + manualExpenseTotal + salaryExpenseTotal;

    // 5. Manual income in period
    const periodManualIncome = financeEntries.filter((fe) => {
      if (fe.tenantId && fe.tenantId !== currentTid) return false;
      return (
        fe.type === "income" &&
        fe.sourceType !== "SALE" &&
        matchesPeriod(fe.date || fe.createdAt, period, customFrom, customTo)
      );
    });
    const manualIncomeTotal = periodManualIncome.reduce((sum, fe) => sum + (Number(fe.amount) || 0), 0);

    // Total Income = Sales Revenue + Manual income
    const totalIncome = revenue + manualIncomeTotal;

    // Net Profit = Total Income - Total Expenses
    const netProfit = totalIncome - totalExpenses;

    // 6. Payment breakdown for period sales (zero double counting; UPI strictly under ONLINE)
    let cashTotal = 0;
    let onlineTotal = 0;
    let creditTotal = 0;

    periodSales.forEach((s) => {
      const b = parsePaymentAmounts(s.payment, s.grand);
      cashTotal += b.cash;
      onlineTotal += b.online;
      creditTotal += b.credit;
    });

    // 7. Outstanding customer credit loans
    const outstandingLoans = customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance) || 0), 0);

    // 8. Customers count & inventory stats (threshold strictly <= 15)
    const customersCount = new Set(periodSales.map((s) => s.phone || s.id)).size;
    const stockUnits = medicines.reduce((n, m) => n + (Number(m.stock) || 0), 0);
    const low = medicines.filter((m) => (Number(m.stock) || 0) <= 15);
    const expiring = medicines.filter((m) => daysToExpiry(m.expiry) <= 180);

    // 9. Recent transactions compilation for this period
    const recentTxList: {
      id: string;
      type: "sale" | "purchase" | "expense" | "income" | "salary" | "loan";
      ref: string;
      party: string;
      amount: number;
      paymentMode: string;
      rawDate: string;
      isOutflow: boolean;
      saleRef?: any;
    }[] = [];

    // Sales in period
    periodSales.forEach((s) => {
      recentTxList.push({
        id: `sale-${s.id}`,
        type: "sale",
        ref: s.id,
        party: s.customerName || "Walk-in customer",
        amount: s.grand,
        paymentMode: s.payment,
        rawDate: s.date || "",
        isOutflow: false,
        saleRef: s,
      });
    });

    // Purchases in period
    periodPurchases.forEach((p) => {
      recentTxList.push({
        id: `purchase-${p.id}`,
        type: "purchase",
        ref: p.invoiceNo ? `Inv: ${p.invoiceNo}` : p.id,
        party: p.supplier || "Supplier",
        amount: p.total,
        paymentMode: "Purchase",
        rawDate: p.date || "",
        isOutflow: true,
      });
    });

    // Manual finance entries in period
    periodManualExpenses.forEach((fe) => {
      recentTxList.push({
        id: `finance-${fe.id}`,
        type: "expense",
        ref: fe.reference || "Expense",
        party: fe.title,
        amount: fe.amount,
        paymentMode: `${fe.paymentMode || "Cash"} · ${fe.category}`,
        rawDate: fe.date || fe.createdAt || "",
        isOutflow: true,
      });
    });

    periodManualIncome.forEach((fe) => {
      recentTxList.push({
        id: `finance-${fe.id}`,
        type: "income",
        ref: fe.reference || "Income",
        party: fe.title,
        amount: fe.amount,
        paymentMode: `${fe.paymentMode || "Cash"} · ${fe.category}`,
        rawDate: fe.date || fe.createdAt || "",
        isOutflow: false,
      });
    });

    // Salary payments in period
    periodSalaries.forEach((sp) => {
      const emp = employees.find((e) => e.id === sp.employeeId);
      const name = sp.employeeName || emp?.name || sp.employeeId;
      const amt = Number(sp.amountPaid ?? sp.amount) || 0;
      recentTxList.push({
        id: `salary-${sp.id}`,
        type: "salary",
        ref: `Salary · ${sp.month}`,
        party: name,
        amount: amt,
        paymentMode: sp.paymentMode || "Cash",
        rawDate: sp.paymentDate || sp.paidAt || sp.createdAt || "",
        isOutflow: true,
      });
    });

    // Loans in period
    loans
      .filter((l) => matchesPeriod(l.date || l.createdAt, period, customFrom, customTo))
      .forEach((l) => {
        const isIssue = l.type === "issue";
        recentTxList.push({
          id: `loan-${l.id}`,
          type: "loan",
          ref: isIssue ? "Credit Given" : "Repayment Received",
          party: l.customerName || "Customer",
          amount: l.amount,
          paymentMode: isIssue ? "Credit / Loan" : "Repayment",
          rawDate: l.date || l.createdAt || "",
          isOutflow: isIssue,
        });
      });

    // Sort descending by rawDate
    const recent = recentTxList
      .sort((a, b) => (b.rawDate || "").localeCompare(a.rawDate || ""))
      .slice(0, 8);

    return {
      revenue,
      bills: periodSales.length,
      todayPurchase: purchaseTotal,
      totalExpenses,
      netProfit,
      outstandingLoans,
      paymentBreakdown: {
        cash: cashTotal,
        online: onlineTotal,
        credit: creditTotal,
        total: cashTotal + onlineTotal + creditTotal,
      },
      customersCount,
      stockUnits,
      low,
      expiring,
      recent,
    };
  }, [sales, purchases, medicines, customers, financeEntries, salaryPayments, employees, loans, period, customFrom, customTo, tenant.id]);

  const periodLabel =
    period === "today"
      ? "Today's"
      : period === "yesterday"
      ? "Yesterday's"
      : period === "week"
      ? "This Week's"
      : period === "month"
      ? "This Month's"
      : "Period";

  const stats = [
    { label: `${periodLabel} Sales`, value: money(data.revenue), icon: IndianRupee, tone: "primary" },
    { label: `${periodLabel} Expenses`, value: money(data.totalExpenses), icon: TrendingDown, tone: "warning" },
    { label: `${periodLabel} Net Profit`, value: money(data.netProfit), icon: TrendingUp, tone: "primary" },
    { label: "Customer Credit Due", value: money(data.outstandingLoans), icon: CreditCard, tone: "warning" },
    { label: `${periodLabel} Bills`, value: String(data.bills), icon: Receipt, tone: "info" },
    { label: `${periodLabel} Purchase`, value: money(data.todayPurchase), icon: ShoppingCart, tone: "info" },
    { label: `${copy.item} in stock`, value: data.stockUnits.toLocaleString("en-IN"), icon: Boxes, tone: "info" },
    ...(f.lowStockAlerts ? [{ label: "Low Stock (≤15)", value: String(data.low.length), icon: AlertTriangle, tone: "warning" }] : []),
    ...(f.expiryTracking ? [{ label: "Expiring / Expired", value: String(data.expiring.length), icon: CalendarClock, tone: "warning" }] : []),
    { label: `${periodLabel} Customers`, value: String(data.customersCount), icon: Users, tone: "primary" },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <Select value={period} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Date Range</SelectItem>
              </SelectContent>
            </Select>

            {period === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="h-8 text-xs w-36"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  className="h-8 text-xs w-36"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {printer.storeName || tenant.name} · {tenant.type} ·{" "}
            {period === "today"
              ? (hydrated ? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Today")
              : period === "yesterday"
              ? "Yesterday"
              : period === "week"
              ? "This Week"
              : period === "month"
              ? new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })
              : `${customFrom} to ${customTo}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link to="/"><Plus className="h-4 w-4 mr-1.5" /> New Bill</Link></Button>
          <Button asChild variant="outline"><Link to="/purchase"><Truck className="h-4 w-4 mr-1.5" /> Purchase</Link></Button>
          <Button asChild variant="outline"><Link to="/medicines"><Pill className="h-4 w-4 mr-1.5" /> Add {copy.item}</Link></Button>
          <Button asChild variant="outline"><Link to="/customers"><UserPlus className="h-4 w-4 mr-1.5" /> Customer</Link></Button>
          <Button asChild variant="outline"><Link to="/reports"><Printer className="h-4 w-4 mr-1.5" /> Reports</Link></Button>
          <Button asChild variant="outline"><Link to="/backup"><DatabaseBackup className="h-4 w-4 mr-1.5" /> Backup</Link></Button>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className={`h-9 w-9 grid place-items-center rounded-lg ${TONE[s.tone]}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Payment Breakdown Card: Exactly CASH, ONLINE, CREDIT / LOAN, TOTAL */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> {period === "today" ? "Today's Payment Breakdown" : `${periodLabel} Payment Breakdown`}
          </div>
          <div className="text-xs text-muted-foreground font-medium">
            Total Breakdown: <span className="text-foreground font-semibold">{money(data.paymentBreakdown.total)}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">CASH</span>
              <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400 font-medium">
                {data.paymentBreakdown.total > 0 ? Math.round((data.paymentBreakdown.cash / data.paymentBreakdown.total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 tabular-nums">
              {money(data.paymentBreakdown.cash)}
            </div>
          </div>
          <div className="rounded-lg border bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">ONLINE</span>
              <span className="text-[11px] text-blue-700/80 dark:text-blue-400 font-medium">
                {data.paymentBreakdown.total > 0 ? Math.round((data.paymentBreakdown.online / data.paymentBreakdown.total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 text-xl font-bold tracking-tight text-blue-700 dark:text-blue-300 tabular-nums">
              {money(data.paymentBreakdown.online)}
            </div>
          </div>
          <div className="rounded-lg border bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">CREDIT / LOAN</span>
              <span className="text-[11px] text-amber-700/80 dark:text-amber-400 font-medium">
                {data.paymentBreakdown.total > 0 ? Math.round((data.paymentBreakdown.credit / data.paymentBreakdown.total) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 text-xl font-bold tracking-tight text-amber-700 dark:text-amber-300 tabular-nums">
              {money(data.paymentBreakdown.credit)}
            </div>
          </div>
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary">TOTAL</span>
              <span className="text-[11px] text-muted-foreground font-medium">
                100%
              </span>
            </div>
            <div className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
              {money(data.paymentBreakdown.total)}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Recent Transactions</div>
            <Button asChild size="sm" variant="ghost"><Link to="/sales">View all sales</Link></Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref / ID</TableHead>
                  <TableHead>Party / Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment / Mode</TableHead>
                  <TableHead>Time / Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-medium text-xs font-mono">{tx.ref}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{tx.party}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">{tx.type}</div>
                    </TableCell>
                    <TableCell className={`tabular-nums font-semibold ${tx.isOutflow ? "text-red-600" : "text-emerald-600"}`}>
                      {tx.isOutflow ? "-" : "+"}{money(tx.amount)}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        if (tx.type === "sale" && tx.saleRef) {
                          const b = parsePaymentAmounts(tx.saleRef.payment, tx.saleRef.grand);
                          const isSplit = (b.cash > 0 && b.online > 0) || (b.cash > 0 && b.credit > 0) || (b.online > 0 && b.credit > 0);
                          if (isSplit) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {b.cash > 0 && <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">CASH ₹{b.cash}</Badge>}
                                {b.online > 0 && <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">ONLINE ₹{b.online}</Badge>}
                                {b.credit > 0 && <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">CREDIT ₹{b.credit}</Badge>}
                              </div>
                            );
                          }
                          const rawPay = (tx.saleRef.payment || "").toLowerCase();
                          const label = rawPay === "loan" ? "Credit / Loan" : rawPay.includes("upi") || rawPay.includes("online") ? "ONLINE" : rawPay.toUpperCase();
                          return <Badge variant="secondary">{label}</Badge>;
                        }
                        if (tx.type === "purchase") {
                          return <Badge variant="outline" className="bg-blue-50/50 text-blue-700 border-blue-200">Purchase</Badge>;
                        }
                        if (tx.type === "expense") {
                          return <Badge variant="outline" className="bg-red-50/50 text-red-700 border-red-200">{tx.paymentMode}</Badge>;
                        }
                        if (tx.type === "income") {
                          return <Badge variant="outline" className="bg-emerald-50/50 text-emerald-700 border-emerald-200">{tx.paymentMode}</Badge>;
                        }
                        if (tx.type === "salary") {
                          return <Badge variant="outline" className="bg-purple-50/50 text-purple-700 border-purple-200">{tx.ref} · {tx.paymentMode}</Badge>;
                        }
                        if (tx.type === "loan") {
                          return <Badge variant="outline" className="bg-amber-50/50 text-amber-700 border-amber-200">{tx.paymentMode}</Badge>;
                        }
                        return <Badge variant="secondary">{tx.paymentMode}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatTxDate(tx.rawDate)}
                    </TableCell>
                  </TableRow>
                ))}
                {data.recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No transactions recorded yet for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Low Stock Alerts (Stock <= 15 with pack/unit breakdown) */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[color:var(--warning)]" />
              <div className="font-semibold">{f.lowStockAlerts ? "Low Stock Alerts" : "Stock overview"}</div>
            </div>
            <Badge variant="outline" className="text-xs text-[color:var(--warning)] border-[color:var(--warning)]/30">
              Min: 15
            </Badge>
          </div>
          <ul className="space-y-2 text-sm max-h-[380px] overflow-y-auto pr-1">
            {data.low.map((m) => {
              const packInfo = parsePackInfo(m);
              const formattedStock = formatStockBreakdown(Number(m.stock) || 0, packInfo.packSize, packInfo.packLabel, packInfo.unitLabel);
              return (
                <li key={m.id} className="flex items-center justify-between rounded-md border p-2.5">
                  <div className="min-w-0 mr-2">
                    <div className="font-medium truncate">{m.name}</div>
                    <div className="text-xs text-muted-foreground truncate space-x-2">
                      {m.batch && <span>Batch: {m.batch}</span>}
                      {m.expiry && <span>Exp: {m.expiry}</span>}
                      {m.company && <span>· {m.company}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[color:var(--warning)] font-semibold block text-xs">
                      {formattedStock}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Min: 15 {packInfo.unitLabel}s
                    </span>
                  </div>
                </li>
              );
            })}
            {data.low.length === 0 && (
              <li className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                No low-stock medicines.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
