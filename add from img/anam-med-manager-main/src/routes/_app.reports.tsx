import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { useStore } from "@/lib/store";

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
  if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (p === "3m") { d.setMonth(d.getMonth() - 3); return d; }
  if (p === "6m") { d.setMonth(d.getMonth() - 6); return d; }
  if (p === "1y") { d.setFullYear(d.getFullYear() - 1); return d; }
  if (customFrom) return new Date(customFrom + "T00:00:00");
  return d;
}

function ReportsPage() {
  const sales = useStore((s) => s.sales);
  const purchases = useStore((s) => s.purchases);

  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState<string>(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const range = useMemo(() => {
    const start = startForPreset(preset, from);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    if (preset === "custom") {
      end.setTime(new Date(to + "T23:59:59").getTime());
    }
    return { start, end };
  }, [preset, from, to]);

  const inRange = useMemo(() => {
    return sales.filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= range.start.getTime() && t <= range.end.getTime() && s.status !== "cancelled";
    });
  }, [sales, range]);

  // Daily buckets
  const daily = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; bills: number }>();
    const cur = new Date(range.start);
    while (cur <= range.end) {
      map.set(cur.toISOString().slice(0, 10), { revenue: 0, cost: 0, bills: 0 });
      cur.setDate(cur.getDate() + 1);
    }
    inRange.forEach((s) => {
      const k = s.date.slice(0, 10);
      const v = map.get(k);
      if (v) {
        v.revenue += s.grand;
        v.bills += 1;
        // Approx cost = sub - disc - gst → gross profit surrogate = disc? use sub - (line-gst)*0.7 as est cost
        v.cost += Math.round((s.sub - s.disc) * 0.75); // 25% margin heuristic
      }
    });
    return Array.from(map, ([date, v]) => ({
      date: new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      key: date,
      revenue: Math.round(v.revenue),
      profit: Math.round(v.revenue - v.cost),
      bills: v.bills,
    }));
  }, [inRange, range]);

  // Payment breakdown
  const payments = useMemo(() => {
    const map: Record<string, number> = {};
    inRange.forEach((s) => { map[s.payment] = (map[s.payment] ?? 0) + s.grand; });
    return Object.entries(map)
      .map(([name, value]) => ({ name: name.toUpperCase(), value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [inRange]);

  const paymentTotal = payments.reduce((n, p) => n + p.value, 0);

  // Monthly (12m) view for context
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
      map.set(d.toISOString().slice(0, 7), 0);
    }
    sales.filter((s) => s.status !== "cancelled").forEach((s) => {
      const k = s.date.slice(0, 7);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + s.grand);
    });
    return Array.from(map, ([m, v]) => ({
      m: new Date(m + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      amount: Math.round(v),
    }));
  }, [sales]);

  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    inRange.forEach((s) => {
      s.items.forEach((it) => {
        const cur = map.get(it.name) ?? { qty: 0, revenue: 0 };
        cur.qty += it.qty; cur.revenue += it.total;
        map.set(it.name, cur);
      });
    });
    return Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [inRange]);

  const totalRev = inRange.reduce((n, s) => n + s.grand, 0);
  const totalBills = inRange.length;
  const totalPurchase = purchases.reduce((n, p) => n + p.total, 0);
  const estCost = Math.round(totalRev * 0.75);
  const estProfit = totalRev - estCost;

  const COLORS = ["#22C55E", "#2563EB", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#F97316"];

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
                    {payments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
                  <span className="h-2.5 w-2.5 rounded" style={{ background: COLORS[i % COLORS.length] }} />
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
        <div className="mt-3 text-xs text-muted-foreground">
          Total purchases (all time): ₹{totalPurchase.toLocaleString("en-IN")}
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
