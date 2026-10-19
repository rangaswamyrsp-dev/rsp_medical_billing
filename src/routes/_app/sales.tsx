import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { Printer, RotateCcw, Search, ShoppingCart, XCircle, Calendar, Filter } from "lucide-react";
import { actions, useStore, type Sale } from "@/lib/store";
import { printReceipt } from "@/lib/print";
import { getUser, CAN } from "@/lib/auth";
import { toast } from "sonner";
import { parsePaymentAmounts } from "@/lib/payment-utils";

export const Route = createFileRoute("/_app/sales")({
  head: () => ({ meta: [{ title: "Sales · RSP Medical Billing" }] }),
  component: SalesPage,
});

type DatePeriod = "all" | "today" | "yesterday" | "week" | "month" | "custom";
type StatusFilter = "all" | "paid" | "pending" | "partially_paid" | "cancelled";

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

function getSaleStatus(s: Sale) {
  if (s.status === "cancelled") {
    return {
      key: "cancelled" as const,
      label: "Cancelled",
      badgeVariant: "destructive" as const,
      badgeClass: "",
      paidAmount: 0,
      dueAmount: 0,
    };
  }

  const b = parsePaymentAmounts(s.payment, s.grand);
  const paid = b.cash + b.online;
  const due = b.credit;

  if (due > 0 && paid > 0) {
    return {
      key: "partially_paid" as const,
      label: "Partially Paid",
      badgeVariant: "secondary" as const,
      badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
      paidAmount: paid,
      dueAmount: due,
    };
  }

  if (due > 0 || s.payment.toLowerCase() === "loan") {
    return {
      key: "pending" as const,
      label: "Credit / Loan",
      badgeVariant: "secondary" as const,
      badgeClass: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300",
      paidAmount: 0,
      dueAmount: due || s.grand,
    };
  }

  return {
    key: "paid" as const,
    label: "Paid",
    badgeVariant: "default" as const,
    badgeClass: "bg-emerald-600 text-white hover:bg-emerald-700",
    paidAmount: s.grand,
    dueAmount: 0,
  };
}

function getSaleReturnInfo(s: Sale, returns: any[]) {
  const saleReturns = returns.filter((r) => r.originalSaleId === s.id);
  const totalReturned = saleReturns.reduce((sum, r) => sum + (Number(r.returnAmount) || 0), 0);
  const netAmount = Math.max(0, s.grand - totalReturned);

  if (s.status === "cancelled") {
    return {
      statusKey: "cancelled" as const,
      statusLabel: "Cancelled",
      totalReturned: 0,
      netAmount: 0,
      badgeVariant: "destructive" as const,
      badgeClass: "",
    };
  }

  if (totalReturned >= s.grand && s.grand > 0) {
    return {
      statusKey: "returned" as const,
      statusLabel: "Returned",
      totalReturned,
      netAmount: 0,
      badgeVariant: "destructive" as const,
      badgeClass: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300",
    };
  }

  if (totalReturned > 0) {
    return {
      statusKey: "partially_returned" as const,
      statusLabel: "Partially Returned",
      totalReturned,
      netAmount,
      badgeVariant: "secondary" as const,
      badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
    };
  }

  return {
    statusKey: "completed" as const,
    statusLabel: "Completed",
    totalReturned: 0,
    netAmount: s.grand,
    badgeVariant: "default" as const,
    badgeClass: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
}

export type ReturnStatusFilter = "all" | "completed" | "partially_returned" | "returned";

function SalesPage() {
  const sales = useStore((s) => s.sales);
  const salesReturns = useStore((s) => s.salesReturns);
  const medicines = useStore((s) => s.medicines);
  const printer = useStore((s) => s.printer);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<DatePeriod>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [returnFilter, setReturnFilter] = useState<ReturnStatusFilter>("all");
  const [customFrom, setCustomFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setMe(getUser());
    actions.syncSales();
    actions.syncSalesReturns();
  }, []);

  const canCancel = me ? (CAN[me.role]?.cancelBill ?? true) : false;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    return sales.filter((s) => {
      // 1. Date Filter
      if (!matchesDatePeriod(s.date, period, customFrom, customTo)) {
        return false;
      }

      // 2. Payment Status Filter
      const st = getSaleStatus(s);
      if (statusFilter !== "all" && st.key !== statusFilter) {
        return false;
      }

      // 3. Return Status Filter
      const ret = getSaleReturnInfo(s, salesReturns);
      if (returnFilter !== "all" && ret.statusKey !== returnFilter) {
        return false;
      }

      // 4. Search Query: Invoice (e.g. 10025 matches REC-10025), Customer Name, Phone, Items
      if (q) {
        const idMatch = s.id.toLowerCase().includes(q) || s.id.replace(/\D/g, "").includes(q);
        const nameMatch = (s.customerName || "").toLowerCase().includes(q);
        const phoneMatch = (s.phone || "").toLowerCase().includes(q);
        const doctorMatch = (s.doctor || "").toLowerCase().includes(q);
        const cashierMatch = (s.cashierName || "").toLowerCase().includes(q);
        const paymentMatch = (s.payment || "").toLowerCase().includes(q);
        const itemsMatch = s.items?.some((it) =>
          (it.name || "").toLowerCase().includes(q) || (it.batch || "").toLowerCase().includes(q)
        );

        if (!idMatch && !nameMatch && !phoneMatch && !doctorMatch && !cashierMatch && !paymentMatch && !itemsMatch) {
          return false;
        }
      }

      return true;
    });
  }, [sales, salesReturns, query, period, statusFilter, returnFilter, customFrom, customTo]);

  const totals = useMemo(() => {
    let count = 0;
    let grand = 0;
    let totalReturns = 0;
    let totalDue = 0;
    let cancelledCount = 0;

    filtered.forEach((s) => {
      if (s.status === "cancelled") {
        cancelledCount++;
      } else {
        count++;
        grand += Number(s.grand) || 0;
        const ret = getSaleReturnInfo(s, salesReturns);
        totalReturns += ret.totalReturned;
        const st = getSaleStatus(s);
        totalDue += st.dueAmount;
      }
    });

    const netSales = Math.max(0, grand - totalReturns);

    return {
      count,
      grand,
      totalReturns,
      netSales,
      totalDue,
      cancelled: cancelledCount,
    };
  }, [filtered, salesReturns]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShoppingCart className="h-6 w-6 text-primary" /> Sales / Invoice History
        </h1>
        <p className="text-sm text-muted-foreground">All bills saved to this account — search invoices, view return status, reprint or process returns.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Invoices</div>
          <div className="text-2xl font-semibold">{totals.count}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Gross Sales</div>
          <div className="text-2xl font-semibold text-foreground">₹{totals.grand.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Sales Returns</div>
          <div className="text-2xl font-semibold text-rose-600">₹{totals.totalReturns.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Net Sales Revenue</div>
          <div className="text-2xl font-semibold text-primary">₹{totals.netSales.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pending Credit / Loan</div>
          <div className="text-2xl font-semibold text-amber-600">₹{totals.totalDue.toLocaleString("en-IN")}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Search Invoice (e.g. 10025), Customer, Phone, Items…"
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

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Credit / Loan</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={returnFilter} onValueChange={(v) => setReturnFilter(v as ReturnStatusFilter)}>
              <SelectTrigger className="w-40 h-9 text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Return Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Return Statuses</SelectItem>
                <SelectItem value="completed">Completed (No Return)</SelectItem>
                <SelectItem value="partially_returned">Partially Returned</SelectItem>
                <SelectItem value="returned">Fully Returned</SelectItem>
              </SelectContent>
            </Select>

            {(query || period !== "all" || statusFilter !== "all" || returnFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setQuery("");
                  setPeriod("all");
                  setStatusFilter("all");
                  setReturnFilter("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Total / Net</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Return Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const st = getSaleStatus(s);
                const ret = getSaleReturnInfo(s, salesReturns);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium font-mono text-xs">{s.id}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(s.date).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{s.customerName || "Walk-in"}</div>
                      <div className="text-xs text-muted-foreground">{s.phone || "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-semibold">{s.items?.length || 0}</span> items
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const b = parsePaymentAmounts(s.payment, s.grand);
                        const isSplit = (b.cash > 0 && b.online > 0) || (b.cash > 0 && b.credit > 0) || (b.online > 0 && b.credit > 0);
                        if (isSplit) {
                          return (
                            <div className="flex flex-wrap gap-1">
                              {b.cash > 0 && <Badge variant="secondary" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">CASH ₹{b.cash}</Badge>}
                              {b.online > 0 && <Badge variant="secondary" className="text-[11px] bg-blue-50 text-blue-700 border-blue-200">ONLINE ₹{b.online}</Badge>}
                              {b.credit > 0 && <Badge variant="secondary" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">CREDIT ₹{b.credit}</Badge>}
                            </div>
                          );
                        }
                        const raw = (s.payment || "").toLowerCase();
                        const label = raw === "loan" ? "CREDIT / LOAN" : raw.includes("upi") || raw.includes("online") ? "ONLINE" : raw.toUpperCase();
                        return <Badge variant="secondary" className="text-xs">{label}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-semibold">₹{s.grand.toLocaleString("en-IN")}</div>
                      {ret.totalReturned > 0 && (
                        <div className="text-[11px] text-destructive font-medium">
                          -₹{ret.totalReturned.toLocaleString("en-IN")}
                        </div>
                      )}
                      {ret.totalReturned > 0 && (
                        <div className="text-[11px] font-bold text-foreground">
                          Net: ₹{ret.netAmount.toLocaleString("en-IN")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-semibold">
                      {st.dueAmount > 0 ? (
                        <span className="text-amber-600 font-bold">₹{st.dueAmount.toLocaleString("en-IN")}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.badgeVariant} className={st.badgeClass}>
                        {st.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ret.badgeVariant} className={ret.badgeClass}>
                        {ret.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Print bill"
                          onClick={() => printReceipt(s, printer, medicines)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        {s.status !== "cancelled" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary"
                            title="Process return for this bill"
                            onClick={() => navigate({ to: "/sales-returns" })}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        {s.status !== "cancelled" && canCancel && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            title="Cancel bill"
                            onClick={async () => {
                              if (!confirm(`Cancel bill ${s.id}? Stock will be restored.`)) return;
                              const res = await actions.cancelSale(s.id, me ? { id: me.id, name: me.name } : undefined);
                              if (res?.error) {
                                toast.error(`Database cancel error: ${res.error}`);
                              } else {
                                toast.success(`Bill ${s.id} cancelled`);
                              }
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No sales found for the selected period.
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
