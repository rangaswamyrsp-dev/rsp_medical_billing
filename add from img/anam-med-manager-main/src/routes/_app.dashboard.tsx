import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee, Receipt, ShoppingCart, TrendingUp, Boxes, AlertTriangle, CalendarClock,
  Users, Plus, Printer, DatabaseBackup, UserPlus, Pill, Truck,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useStore, useHydrated } from "@/lib/store";
import { useTenant, useFeatures, TYPE_COPY } from "@/lib/tenant";
import { daysToExpiry } from "@/lib/expiry";

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
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

function Dashboard() {
  const hydrated = useHydrated();
  const sales = useStore((s) => s.sales);
  const purchases = useStore((s) => s.purchases);
  const medicines = useStore((s) => s.medicines);
  const printer = useStore((s) => s.printer);
  const tenant = useTenant();
  const f = useFeatures();
  const copy = TYPE_COPY[tenant.type];

  const data = useMemo(() => {
    const paid = sales.filter((s) => s.status === "paid");
    const todays = paid.filter((s) => isToday(s.date));
    const todaySales = todays.reduce((n, s) => n + s.grand, 0);
    const todayProfit = todays.reduce((n, s) => n + (s.grand - s.gst) * 0.2, 0);
    const todayPurchase = purchases.filter((p) => isToday(p.date)).reduce((n, p) => n + p.total, 0);
    const customersToday = new Set(todays.map((s) => s.phone || s.id)).size;
    const stockUnits = medicines.reduce((n, m) => n + m.stock, 0);
    const low = medicines.filter((m) => m.stock < 20);
    const expiring = medicines.filter((m) => {
      const d = daysToExpiry(m.expiry);
      return d <= 180;
    });
    return {
      todaySales, todayProfit, todayPurchase, customersToday,
      bills: todays.length, stockUnits, low, expiring,
      recent: paid.slice(0, 6),
    };
  }, [sales, purchases, medicines]);

  const stats = [
    { label: "Today's Sales", value: money(data.todaySales), icon: IndianRupee, tone: "primary" },
    { label: "Today's Bills", value: String(data.bills), icon: Receipt, tone: "info" },
    { label: "Today's Purchase", value: money(data.todayPurchase), icon: ShoppingCart, tone: "info" },
    { label: "Est. Today's Profit", value: money(data.todayProfit), icon: TrendingUp, tone: "primary" },
    { label: `${copy.item} in stock`, value: data.stockUnits.toLocaleString("en-IN"), icon: Boxes, tone: "info" },
    ...(f.lowStockAlerts ? [{ label: "Low Stock", value: String(data.low.length), icon: AlertTriangle, tone: "warning" }] : []),
    ...(f.expiryTracking ? [{ label: "Expiring / Expired", value: String(data.expiring.length), icon: CalendarClock, tone: "warning" }] : []),
    { label: "Today's Customers", value: String(data.customersToday), icon: Users, tone: "primary" },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {printer.storeName || tenant.name} · {tenant.type} ·{" "}
            {hydrated ? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Today"}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Recent Bills</div>
            <Button asChild size="sm" variant="ghost"><Link to="/sales">View all</Link></Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.id}</TableCell>
                  <TableCell>{s.customerName || "Walk-in"}</TableCell>
                  <TableCell className="tabular-nums">{money(s.grand)}</TableCell>
                  <TableCell><Badge variant="secondary">{s.payment}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
              {data.recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    No bills yet — create your first bill from the billing counter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-[color:var(--warning)]" />
            <div className="font-semibold">{f.lowStockAlerts ? "Low Stock Alerts" : "Stock overview"}</div>
          </div>
          <ul className="space-y-2 text-sm">
            {data.low.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-md border p-2.5">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[m.batch && `Batch ${m.batch}`, m.company].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="text-[color:var(--warning)] font-semibold shrink-0">{m.stock} left</span>
              </li>
            ))}
            {data.low.length === 0 && (
              <li className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Everything is well stocked.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
