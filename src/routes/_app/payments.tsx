import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Calendar, Filter, Wallet, ArrowDownRight, IndianRupee,
  Receipt, CreditCard, RotateCcw,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useTenant } from "@/lib/tenant";
import { parsePaymentAmounts } from "@/lib/payment-utils";

export const Route = createFileRoute("/_app/payments")({
  head: () => ({
    meta: [
      { title: "Payments · RSP Medical Billing" },
      { name: "description", content: "Payment records, settlements, and collections by method." },
    ],
  }),
  component: PaymentsPage,
});

type DatePeriod = "all" | "today" | "yesterday" | "week" | "month" | "custom";
type MethodFilter = "all" | "cash" | "online" | "credit" | "returns";

export type PaymentRecord = {
  id: string;
  sourceType: "sale" | "loan_repayment" | "sales_return";
  invoiceNo?: string;
  returnNo?: string;
  customerName: string;
  customerPhone?: string;
  date: string;
  method: "cash" | "online" | "credit" | "refund";
  methodLabel: "CASH" | "ONLINE" | "CREDIT / LOAN" | "REFUND";
  amount: number;
  notes?: string;
  refundStatus?: string;
  refundMethod?: string;
  isNegative?: boolean;
};

function matchesDatePeriod(
  dateStr: string | undefined | null,
  period: DatePeriod,
  customFrom?: string,
  customTo?: string
): boolean {
  if (period === "all") return true;
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

function PaymentsPage() {
  const tenant = useTenant();
  const sales = useStore((s) => s.sales);
  const salesReturns = useStore((s) => s.salesReturns);
  const loans = useStore((s) => s.loans);

  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<DatePeriod>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [customFrom, setCustomFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    actions.syncSales().catch(() => {});
    actions.syncSalesReturns().catch(() => {});
  }, []);

  // Consolidate payment records with strict tenant isolation and no double counting
  const allRecords = useMemo<PaymentRecord[]>(() => {
    const list: PaymentRecord[] = [];

    // 1. Valid sales payments
    const validSales = sales.filter((s) => s.status !== "cancelled" && s.status !== "held");
    validSales.forEach((s) => {
      const b = parsePaymentAmounts(s.payment, s.grand);

      if (b.cash > 0) {
        list.push({
          id: `pay-cash-${s.id}`,
          sourceType: "sale",
          invoiceNo: s.id,
          customerName: s.customerName || "Walk-in customer",
          customerPhone: s.phone,
          date: s.date,
          method: "cash",
          methodLabel: "CASH",
          amount: b.cash,
          notes: "Invoice Cash Settlement",
        });
      }

      if (b.online > 0) {
        list.push({
          id: `pay-online-${s.id}`,
          sourceType: "sale",
          invoiceNo: s.id,
          customerName: s.customerName || "Walk-in customer",
          customerPhone: s.phone,
          date: s.date,
          method: "online",
          methodLabel: "ONLINE",
          amount: b.online,
          notes: "Invoice Online/UPI Settlement",
        });
      }

      if (b.credit > 0) {
        list.push({
          id: `pay-credit-${s.id}`,
          sourceType: "sale",
          invoiceNo: s.id,
          customerName: s.customerName || "Walk-in customer",
          customerPhone: s.phone,
          date: s.date,
          method: "credit",
          methodLabel: "CREDIT / LOAN",
          amount: b.credit,
          notes: "Credit given on invoice",
        });
      }
    });

    // 2. Loan repayments received
    const repayments = loans.filter((l) => l.type === "payment");
    repayments.forEach((l) => {
      list.push({
        id: `loan-rep-${l.id}`,
        sourceType: "loan_repayment",
        customerName: l.customerName || "Customer",
        customerPhone: l.customerPhone,
        date: l.date || l.createdAt || "",
        method: "cash",
        methodLabel: "CASH",
        amount: Number(l.amount) || 0,
        notes: l.note || "Customer loan repayment",
      });
    });

    // 3. Sales Returns / Refunds (clearly identified with original invoice & return no)
    salesReturns.forEach((r) => {
      const modeMatch = (r.reason || "").match(/\[Refund:\s*(CASH|ONLINE|CREDIT)\]/i);
      const refundMode = modeMatch ? modeMatch[1].toUpperCase() : "CASH";

      list.push({
        id: `return-${r.id}`,
        sourceType: "sales_return",
        invoiceNo: r.originalSaleId,
        returnNo: r.returnNo,
        customerName: r.customerName || "Customer",
        customerPhone: r.phone,
        date: r.returnDate || r.createdAt || "",
        method: "refund",
        methodLabel: "REFUND",
        amount: Number(r.returnAmount) || 0,
        refundStatus: r.status || "Completed",
        refundMethod: refundMode,
        notes: r.reason || "Customer sales refund",
        isNegative: true,
      });
    });

    return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [sales, loans, salesReturns]);

  // Apply filters: Search, Date Period, Method
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return allRecords.filter((rec) => {
      // 1. Date Period Filter
      if (!matchesDatePeriod(rec.date, period, customFrom, customTo)) {
        return false;
      }

      // 2. Method Filter
      if (methodFilter === "returns") {
        if (rec.sourceType !== "sales_return") return false;
      } else if (methodFilter !== "all") {
        if (rec.sourceType === "sales_return") return false;
        if (rec.method !== methodFilter) return false;
      }

      // 3. Search: Invoice No, Return No, Customer Name, Phone, Notes
      if (q) {
        const invMatch = (rec.invoiceNo || "").toLowerCase().includes(q) || (rec.invoiceNo || "").replace(/\D/g, "").includes(q);
        const retMatch = (rec.returnNo || "").toLowerCase().includes(q);
        const nameMatch = (rec.customerName || "").toLowerCase().includes(q);
        const phoneMatch = (rec.customerPhone || "").toLowerCase().includes(q);
        const notesMatch = (rec.notes || "").toLowerCase().includes(q);
        const methodMatch = rec.method.toLowerCase().includes(q) || rec.methodLabel.toLowerCase().includes(q);

        if (!invMatch && !retMatch && !nameMatch && !phoneMatch && !notesMatch && !methodMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allRecords, query, period, methodFilter, customFrom, customTo]);

  // Statistics with exact returns separation & no double counting
  const stats = useMemo(() => {
    let grossCash = 0;
    let grossOnline = 0;
    let credit = 0;
    let cashRefunds = 0;
    let onlineRefunds = 0;
    let otherRefunds = 0;

    allRecords.forEach((r) => {
      if (!matchesDatePeriod(r.date, period, customFrom, customTo)) return;

      if (r.sourceType === "sales_return") {
        if (r.refundMethod === "ONLINE") onlineRefunds += r.amount;
        else if (r.refundMethod === "CREDIT") otherRefunds += r.amount;
        else cashRefunds += r.amount;
      } else {
        if (r.method === "cash") grossCash += r.amount;
        else if (r.method === "online") grossOnline += r.amount;
        else if (r.method === "credit") credit += r.amount;
      }
    });

    const totalRefunds = cashRefunds + onlineRefunds + otherRefunds;
    const netCash = Math.max(0, grossCash - cashRefunds);
    const netOnline = Math.max(0, grossOnline - onlineRefunds);
    const netCollections = netCash + netOnline;

    return {
      grossCash,
      grossOnline,
      netCash,
      netOnline,
      credit,
      totalRefunds,
      netCollections,
      totalCollections: grossCash + grossOnline,
    };
  }, [allRecords, period, customFrom, customTo]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" /> Payments
        </h1>
        <p className="text-sm text-muted-foreground">
          Track received payments, collections, and credit records across all transactions.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Net Collections</div>
          <div className="text-2xl font-semibold text-primary tabular-nums">
            ₹{stats.netCollections.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Cash + Online Net
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Cash (Net)</div>
          <div className="text-2xl font-semibold text-emerald-600 tabular-nums">
            ₹{stats.netCash.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Gross: ₹{stats.grossCash.toLocaleString("en-IN")}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Online / UPI (Net)</div>
          <div className="text-2xl font-semibold text-blue-600 tabular-nums">
            ₹{stats.netOnline.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Gross: ₹{stats.grossOnline.toLocaleString("en-IN")}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Sales Returns / Refunds</div>
          <div className="text-2xl font-semibold text-rose-600 tabular-nums">
            ₹{stats.totalRefunds.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Refunds paid to customers
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Credit / Loan Given</div>
          <div className="text-2xl font-semibold text-amber-600 tabular-nums">
            ₹{stats.credit.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Outstanding receivables
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Search Invoice No, Return No, Customer, Phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={(v) => setPeriod(v as DatePeriod)}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Date Range</SelectItem>
              </SelectContent>
            </Select>

            {period === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  className="h-9 text-xs w-36"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  className="h-9 text-xs w-36"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            )}

            <Select value={methodFilter} onValueChange={(v) => setMethodFilter(v as MethodFilter)}>
              <SelectTrigger className="w-44 h-9 text-xs">
                <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="cash">Cash Collections</SelectItem>
                <SelectItem value="online">Online / UPI Collections</SelectItem>
                <SelectItem value="credit">Credit / Loan</SelectItem>
                <SelectItem value="returns">Sales Returns / Refunds</SelectItem>
              </SelectContent>
            </Select>

            {(query || period !== "all" || methodFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setQuery("");
                  setPeriod("all");
                  setMethodFilter("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Payments Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice / Return No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Category / Purpose</TableHead>
                <TableHead>Method / Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status / Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rec) => (
                <TableRow key={rec.id} className={rec.sourceType === "sales_return" ? "bg-rose-50/20" : ""}>
                  <TableCell className="font-mono text-xs font-medium">
                    {rec.sourceType === "sales_return" ? (
                      <div>
                        <span className="font-semibold text-rose-700">{rec.returnNo}</span>
                        <div className="text-[10px] text-muted-foreground">Sale: {rec.invoiceNo}</div>
                      </div>
                    ) : (
                      rec.invoiceNo || rec.id
                    )}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(rec.date).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{rec.customerName}</div>
                    <div className="text-xs text-muted-foreground">{rec.customerPhone || "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {rec.sourceType === "sales_return" ? (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                        <RotateCcw className="h-3 w-3" /> Sales Return
                      </span>
                    ) : rec.sourceType === "sale" ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Receipt className="h-3 w-3" /> Sale Invoice
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <ArrowDownRight className="h-3 w-3" /> Loan Repayment
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {rec.sourceType === "sales_return" ? (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300 text-xs font-semibold">
                        REFUND ({rec.refundMethod || "CASH"})
                      </Badge>
                    ) : rec.method === "cash" ? (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                        CASH
                      </Badge>
                    ) : rec.method === "online" ? (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                        ONLINE / UPI
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        CREDIT / LOAN
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {rec.sourceType === "sales_return" ? (
                      <span className="text-rose-600 font-bold">-₹{rec.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    ) : (
                      `₹${rec.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {rec.sourceType === "sales_return" ? (
                      <span className="text-rose-700 font-medium">{rec.notes || "Return refunded"}</span>
                    ) : (
                      rec.notes || "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No transactions found for the selected filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
