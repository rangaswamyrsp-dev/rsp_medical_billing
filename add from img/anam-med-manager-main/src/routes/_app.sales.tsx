import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Printer, Search, ShoppingCart, XCircle } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { printReceipt } from "@/lib/print";
import { getUser, CAN } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales")({
  head: () => ({ meta: [{ title: "Sales · RSP Medical Billing" }] }),
  component: SalesPage,
});

function SalesPage() {
  const sales = useStore((s) => s.sales);
  const printer = useStore((s) => s.printer);
  const [query, setQuery] = useState("");
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);
  useEffect(() => setMe(getUser()), []);
  const canCancel = me ? CAN[me.role].cancelBill : false;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return sales;
    return sales.filter((s) =>
      [s.id, s.customerName, s.phone, s.payment].some((v) => v.toLowerCase().includes(q)),
    );
  }, [sales, query]);

  const totals = useMemo(() => {
    const paid = filtered.filter((s) => s.status !== "cancelled");
    return {
      count: paid.length,
      grand: paid.reduce((n, s) => n + s.grand, 0),
      cancelled: filtered.filter((s) => s.status === "cancelled").length,
    };
  }, [filtered]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShoppingCart className="h-6 w-6 text-primary" /> Sales / Invoice History
        </h1>
        <p className="text-sm text-muted-foreground">All bills saved to this device — reprint or cancel.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Bills</div><div className="text-2xl font-semibold">{totals.count}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-2xl font-semibold text-primary">₹{totals.grand.toLocaleString("en-IN")}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Cancelled</div><div className="text-2xl font-semibold text-destructive">{totals.cancelled}</div></Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search bill, customer, phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Cashier</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.id}</TableCell>
                <TableCell className="text-sm">{new Date(s.date).toLocaleString("en-IN")}</TableCell>
                <TableCell>
                  <div className="font-medium">{s.customerName}</div>
                  <div className="text-xs text-muted-foreground">{s.phone || "walk-in"}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {s.cashierId ? (
                    <><div className="font-mono">{s.cashierId}</div><div className="text-muted-foreground">{s.cashierName}</div></>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm">{s.items.length}</TableCell>
                <TableCell><Badge variant="secondary">{s.payment.toUpperCase()}</Badge></TableCell>
                <TableCell className="text-right tabular-nums font-semibold">₹{s.grand.toLocaleString("en-IN")}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "cancelled" ? "destructive" : "default"}>{s.status}</Badge>
                </TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => printReceipt(s, printer)}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  {s.status !== "cancelled" && canCancel && (
                    <Button
                      size="icon" variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (!confirm(`Cancel bill ${s.id}? Stock will be restored.`)) return;
                        actions.cancelSale(s.id, me ? { id: me.id, name: me.name } : undefined);
                        toast.success(`Bill ${s.id} cancelled`);
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                No bills yet — save one from the billing screen.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}
