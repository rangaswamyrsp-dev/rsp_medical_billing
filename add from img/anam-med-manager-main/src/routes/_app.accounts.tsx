import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Wallet } from "lucide-react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/accounts")({
  head: () => ({ meta: [{ title: "Accounts · RSP Medical Billing" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const sales = useStore((s) => s.sales);
  const purchases = useStore((s) => s.purchases);
  const customers = useStore((s) => s.customers);
  const suppliers = useStore((s) => s.suppliers);

  const summary = useMemo(() => {
    const revenue = sales.filter((s) => s.status !== "cancelled").reduce((n, s) => n + s.grand, 0);
    const cost = purchases.reduce((n, p) => n + p.total, 0);
    const receivables = customers.reduce((n, c) => n + c.balance, 0);
    const payables = suppliers.reduce((n, s) => n + s.balance, 0);
    return { revenue, cost, receivables, payables, net: revenue - cost };
  }, [sales, purchases, customers, suppliers]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" /> Accounts
        </h1>
        <p className="text-sm text-muted-foreground">Cash book, receivables and payables.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-xl font-semibold text-primary">₹{summary.revenue.toLocaleString("en-IN")}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Purchase cost</div><div className="text-xl font-semibold">₹{summary.cost.toLocaleString("en-IN")}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Receivable (customers)</div><div className="text-xl font-semibold text-[color:var(--warning)]">₹{summary.receivables.toLocaleString("en-IN")}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Payable (suppliers)</div><div className="text-xl font-semibold text-[color:var(--warning)]">₹{summary.payables.toLocaleString("en-IN")}</div></Card>
      </div>

      <Card className="p-5">
        <div className="font-semibold mb-3">Bill ledger</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Party</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...sales.filter((s) => s.status !== "cancelled").map((s) => ({
              date: s.date.slice(0, 10), ref: s.id, party: s.customerName, debit: 0, credit: s.grand,
            })), ...purchases.map((p) => ({
              date: p.date, ref: p.invoiceNo, party: p.supplier, debit: p.total, credit: 0,
            }))]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 20)
              .map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                  <TableCell>{r.party}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">{r.debit ? `₹${r.debit}` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{r.credit ? `₹${r.credit}` : "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
