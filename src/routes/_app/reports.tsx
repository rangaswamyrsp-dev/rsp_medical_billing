import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BarChart3, IndianRupee, Receipt, TrendingUp, TrendingDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { actions, useStore } from "@/lib/store";
import { parsePaymentAmounts } from "@/lib/payment-utils";
import { useTenant } from "@/lib/tenant";
import { sb_fetchLoans, type DbLoan } from "@/lib/loans-supabase";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports · RSP Medical Billing" }] }),
  component: ReportsPage,
});

type Preset = "today" | "week" | "month" | "3m" | "6m" | "1y" | "custom";

function startForPreset(p: Preset, customFrom?: string): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "today") return d;
  if (p === "week") { d.setDate(d.getDate() - 6); return d; }
  if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  if (p === "3m") { d.setMonth(d.getMonth() - 3); return d; }
  if (p === "6m") { d.setMonth(d.getMonth() - 6); return d; }
  if (p === "1y") { d.setFullYear(d.getFullYear() - 1); return d; }
  if (customFrom) {
    const cd = new Date(customFrom + "T00:00:00");
    if (!isNaN(cd.getTime())) return cd;
  }
  return d;
}

function isDateInRange(dateStr: string | undefined | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const raw = dateStr.trim();
  const clean = raw.includes("T") ? raw : `${raw}T00:00:00`;
  const t = new Date(clean).getTime();
  if (isNaN(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

function ReportsPage() {
  const tenant = useTenant();
  const currentTid = tenant.id || "T001";

  const sales = useStore((s) => s.sales);
  const purchases = useStore((s) => s.purchases);
  const financeEntries = useStore((s) => s.financeEntries);
  const salaryPayments = useStore((s) => s.salaryPayments);
  const medicines = useStore((s) => s.medicines);
  const customers = useStore((s) => s.customers);

  const [dbLoans, setDbLoans] = useState<DbLoan[]>([]);

  useEffect(() => {
    actions.syncSales().catch(() => {});
    actions.syncPurchases().catch(() => {});
    actions.syncFinanceEntries().catch(() => {});
    actions.syncSalaryPayments().catch(() => {});
    actions.syncCustomers().catch(() => {});
    actions.syncMedicines().catch(() => {});
    sb_fetchLoans(currentTid).then(({ loans, error }) => {
      if (!error && Array.isArray(loans)) {
        setDbLoans(loans);
      }
    }).catch(() => {});
  }, [currentTid]);

  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const range = useMemo(() => {
    const start = startForPreset(preset, from);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    if (preset === "custom") {
      const ed = new Date(to + "T23:59:59.999");
      if (!isNaN(ed.getTime())) end.setTime(ed.getTime());
    }
    return { start, end };
  }, [preset, from, to]);

  // Valid sales in range (exclude cancelled and held)
  const inRange = useMemo(() => {
    return sales.filter((s) => {
      if (s.status === "cancelled" || s.status === "held") return false;
      return isDateInRange(s.date, range.start, range.end);
    });
  }, [sales, range]);

  // Purchases in range
  const inRangePurchases = useMemo(() => {
    return purchases.filter((p) => isDateInRange(p.date, range.start, range.end));
  }, [purchases, range]);

  // Manual finance expenses in range (matching Accounts)
  const inRangeFinanceExpenses = useMemo(() => {
    return financeEntries.filter((fe) => {
      if (fe.tenantId && fe.tenantId !== currentTid) return false;
      if (fe.type !== "expense") return false;
      if (fe.sourceType === "PURCHASE" || fe.sourceType === "SALARY_PAYMENT") return false;
      return isDateInRange(fe.date || fe.createdAt, range.start, range.end);
    });
  }, [financeEntries, currentTid, range]);

  // Manual finance income in range (matching Accounts)
  const inRangeFinanceIncome = useMemo(() => {
    return financeEntries.filter((fe) => {
      if (fe.tenantId && fe.tenantId !== currentTid) return false;
      if (fe.type !== "income" || fe.sourceType === "SALE") return false;
      return isDateInRange(fe.date || fe.createdAt, range.start, range.end);
    });
  }, [financeEntries, currentTid, range]);

  // Salary payments in range (matching Accounts)
  const inRangeSalaryPayments = useMemo(() => {
    return salaryPayments.filter((sp) => {
      if (sp.tenantId && sp.tenantId !== currentTid) return false;
      const amt = Number(sp.amountPaid ?? sp.amount) || 0;
      if (amt <= 0) return false;
      return isDateInRange(sp.paymentDate || sp.paidAt || sp.createdAt, range.start, range.end);
    });
  }, [salaryPayments, currentTid, range]);

  // Map medicines by name/code for cost lookup
  const medicineCostMap = useMemo(() => {
    const map = new Map<string, number>();
    medicines.forEach((m) => {
      const c = Number(m.cost ?? m.new_rate) || 0;
      if (c > 0) {
        map.set(m.name.trim().toLowerCase(), c);
        if (m.id) map.set(m.id, c);
      }
    });
    return map;
  }, [medicines]);

  // Daily buckets
  const daily = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; bills: number }>();
    const cur = new Date(range.start);
    let maxDays = 370;
    while (cur <= range.end && maxDays-- > 0) {
      map.set(cur.toISOString().slice(0, 10), { revenue: 0, cost: 0, bills: 0 });
      cur.setDate(cur.getDate() + 1);
    }
    inRange.forEach((s) => {
      const k = (s.date || "").slice(0, 10);
      const v = map.get(k);
      if (v) {
        v.revenue += Number(s.grand) || 0;
        v.bills += 1;
        let sCost = 0;
        if (s.items && s.items.length > 0) {
          s.items.forEach((it) => {
            const uCost = medicineCostMap.get(it.name.trim().toLowerCase()) ?? (it.mrp ? it.mrp * 0.75 : 0);
            sCost += Math.round(uCost * (Number(it.qty) || 1));
          });
        } else {
          sCost = Math.round(((Number(s.sub) || 0) - (Number(s.disc) || 0)) * 0.75);
        }
        v.cost += sCost;
      }
    });
    return Array.from(map, ([date, v]) => ({
      date: new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      key: date,
      revenue: Math.round(v.revenue),
      profit: Math.round(v.revenue - v.cost),
      bills: v.bills,
    }));
  }, [inRange, range, medicineCostMap]);

  // Payment breakdown separated into Cash, Online / UPI, and Credit / Loan (avoiding double counting)
  const payments = useMemo(() => {
    let cashTotal = 0;
    let onlineTotal = 0;
    let creditTotal = 0;
    let otherTotal = 0;

    inRange.forEach((s) => {
      const b = parsePaymentAmounts(s.payment, Number(s.grand) || 0);
      cashTotal += b.cash;
      onlineTotal += b.online;
      creditTotal += b.credit;
      const accounted = b.cash + b.online + b.credit;
      const g = Number(s.grand) || 0;
      if (g > accounted) {
        otherTotal += (g - accounted);
      }
    });

    const list: { name: string; value: number }[] = [];
    if (cashTotal > 0) list.push({ name: "CASH", value: Math.round(cashTotal) });
    if (onlineTotal > 0) list.push({ name: "ONLINE / UPI", value: Math.round(onlineTotal) });
    if (creditTotal > 0) list.push({ name: "CREDIT / LOAN", value: Math.round(creditTotal) });
    if (otherTotal > 0) list.push({ name: "OTHER", value: Math.round(otherTotal) });

    return list.sort((a, b) => b.value - a.value);
  }, [inRange]);

  const paymentTotal = payments.reduce((n, p) => n + p.value, 0);

  // Monthly (12m) view for context
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
      map.set(d.toISOString().slice(0, 7), 0);
    }
    sales.filter((s) => s.status !== "cancelled" && s.status !== "held").forEach((s) => {
      const k = (s.date || "").slice(0, 7);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + (Number(s.grand) || 0));
    });
    return Array.from(map, ([m, v]) => ({
      m: new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      amount: Math.round(v),
    }));
  }, [sales]);

  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    inRange.forEach((s) => {
      (s.items || []).forEach((it) => {
        const cur = map.get(it.name) ?? { qty: 0, revenue: 0 };
        cur.qty += Number(it.qty) || 0;
        cur.revenue += Number(it.total) || 0;
        map.set(it.name, cur);
      });
    });
    return Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [inRange]);

  const totalRev = inRange.reduce((n, s) => n + (Number(s.grand) || 0), 0);
  const totalBills = inRange.length;
  const manualIncome = inRangeFinanceIncome.reduce((n, fe) => n + (Number(fe.amount) || 0), 0);
  const totalIncome = totalRev + manualIncome;

  const purchaseExpense = inRangePurchases.reduce((n, p) => n + (Number(p.total) || 0), 0);
  const manualExpense = inRangeFinanceExpenses.reduce((n, fe) => n + (Number(fe.amount) || 0), 0);
  const salaryExpense = inRangeSalaryPayments.reduce((n, sp) => n + (Number(sp.amountPaid ?? sp.amount) || 0), 0);
  const totalExpenses = purchaseExpense + manualExpense + salaryExpense;
  const netProfit = totalIncome - totalExpenses;
  const totalPurchaseAllTime = purchases.reduce((n, p) => n + (Number(p.total) || 0), 0);

  // Customer outstanding loans
  const customerOutstanding = useMemo(() => {
    return customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance) || 0), 0);
  }, [customers]);

  const loanStats = useMemo(() => {
    if (dbLoans.length > 0) {
      const issued = dbLoans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
      const repaid = dbLoans.reduce((sum, l) => sum + (Number(l.paid_amount) || 0), 0);
      const outstanding = dbLoans.reduce((sum, l) => sum + (Number(l.outstanding_amount) || 0), 0);
      return {
        totalIssued: Math.round(issued),
        totalRepaid: Math.round(repaid),
        totalOutstanding: Math.round(outstanding > 0 ? outstanding : customerOutstanding),
      };
    }
    return {
      totalIssued: Math.round(customerOutstanding),
      totalRepaid: 0,
      totalOutstanding: Math.round(customerOutstanding),
    };
  }, [dbLoans, customerOutstanding]);

  // Gross profit & cost calculations
  const estCost = useMemo(() => {
    let cost = 0;
    inRange.forEach((s) => {
      if (s.items && s.items.length > 0) {
        s.items.forEach((it) => {
          const uCost = medicineCostMap.get(it.name.trim().toLowerCase()) ?? (it.mrp ? it.mrp * 0.75 : 0);
          cost += Math.round(uCost * (Number(it.qty) || 1));
        });
      } else {
        cost += Math.round(((Number(s.sub) || 0) - (Number(s.disc) || 0)) * 0.75);
      }
    });
    return cost;
  }, [inRange, medicineCostMap]);

  const estProfit = totalRev - estCost;

  const COLORS = ["#22C55E", "#2563EB", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#F97316"];
  const PAYMENT_COLORS: Record<string, string> = {
    "CASH": "#22C55E",
    "ONLINE / UPI": "#2563EB",
    "ONLINE": "#2563EB",
    "CREDIT / LOAN": "#F59E0B",
    "CREDIT": "#F59E0B",
    "OTHER": "#8B5CF6",
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Reports
        </h1>
        <p className="text-sm text-muted-foreground">Sales, payment mix, daily profit and top medicines.</p>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Range</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="1y">Last 1 year</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {range.start.toLocaleDateString("en-IN")} → {range.end.toLocaleDateString("en-IN")}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI icon={IndianRupee} label="Revenue" value={`₹${totalRev.toLocaleString("en-IN")}`} tone="primary" />
        <KPI icon={Receipt} label="Bills" value={String(totalBills)} tone="info" />
        <KPI icon={TrendingUp} label="Est. Gross Profit" value={`₹${estProfit.toLocaleString("en-IN")}`} tone={estProfit >= 0 ? "primary" : "warning"} />
        <KPI icon={TrendingDown} label="Est. Cost" value={`₹${estCost.toLocaleString("en-IN")}`} tone="info" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="font-semibold mb-3">Daily revenue &amp; profit</div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke="var(--warning)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="font-semibold mb-3">Payment mix</div>
          <div className="h-56">
            {payments.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={payments} dataKey="value" nameKey="name" innerRadius={38} outerRadius={78}>
                    {payments.map((p, i) => (
                      <Cell key={i} fill={PAYMENT_COLORS[p.name] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-sm text-muted-foreground grid place-items-center h-full">No bills in range.</div>}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {payments.map((p, i) => (
              <div key={p.name} className="flex justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded" style={{ background: PAYMENT_COLORS[p.name] || COLORS[i % COLORS.length] }} />
                  {p.name}
                </span>
                <span className="tabular-nums">
                  ₹{p.value.toLocaleString("en-IN")}{" "}
                  <span className="text-xs text-muted-foreground">({paymentTotal ? Math.round((p.value / paymentTotal) * 100) : 0}%)</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="font-semibold mb-3">Monthly revenue — last 12 months</div>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={monthly}>
              <XAxis dataKey="m" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
              <Bar dataKey="amount" fill="var(--info)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-3">Top selling medicines · in range</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead className="text-center">Units sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topItems.map((t) => (
              <TableRow key={t.name}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-center">{t.qty}</TableCell>
                <TableCell className="text-right tabular-nums">₹{t.revenue.toLocaleString("en-IN")}</TableCell>
              </TableRow>
            ))}
            {topItems.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No sales in this range.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>

        <div className="mt-4 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Period Purchases</div>
            <div className="font-semibold text-sm">₹{purchaseExpense.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-muted-foreground">All time: ₹{totalPurchaseAllTime.toLocaleString("en-IN")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Expenses</div>
            <div className="font-semibold text-sm">₹{totalExpenses.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-muted-foreground">Purchases + Salary + Operations</div>
          </div>
          <div>
            <div className="text-muted-foreground">Net Balance / Profit</div>
            <div className={`font-semibold text-sm ${netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              ₹{netProfit.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground">Matches Accounts ledger</div>
          </div>
          <div>
            <div className="text-muted-foreground">Customer Credit Due</div>
            <div className="font-semibold text-sm text-amber-600">₹{loanStats.totalOutstanding.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-muted-foreground">Issued: ₹{loanStats.totalIssued.toLocaleString("en-IN")} · Repaid: ₹{loanStats.totalRepaid.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function KPI({ icon: Icon, label, value, tone }: any) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    info: "bg-[color:var(--info)]/10 text-[color:var(--info)]",
    warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  };
  return (
    <Card className="p-4">
      <div className={"h-9 w-9 grid place-items-center rounded-lg " + tones[tone]}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
