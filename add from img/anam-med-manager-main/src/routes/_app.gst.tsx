import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Percent } from "lucide-react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/gst")({
  head: () => ({ meta: [{ title: "GST · RSP Medical Billing" }] }),
  component: GstPage,
});

function GstPage() {
  const sales = useStore((s) => s.sales);

  const bySlab = useMemo(() => {
    const map = new Map<number, { taxable: number; gst: number }>();
    sales.filter((s) => s.status !== "cancelled").forEach((s) => {
      s.items.forEach((it) => {
        const line = it.mrp * it.qty * (1 - it.discount / 100);
        const cur = map.get(it.gst) ?? { taxable: 0, gst: 0 };
        cur.taxable += line;
        cur.gst += (line * it.gst) / 100;
        map.set(it.gst, cur);
      });
    });
    return Array.from(map, ([slab, v]) => ({ slab, ...v })).sort((a, b) => a.slab - b.slab);
  }, [sales]);

  const totals = bySlab.reduce(
    (acc, r) => ({ taxable: acc.taxable + r.taxable, gst: acc.gst + r.gst }),
    { taxable: 0, gst: 0 },
  );

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Percent className="h-6 w-6 text-primary" /> GST Summary
        </h1>
        <p className="text-sm text-muted-foreground">Tax collected by slab across all paid bills.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Taxable amount</div>
          <div className="text-2xl font-semibold tabular-nums">₹{totals.taxable.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">GST collected</div>
          <div className="text-2xl font-semibold text-primary tabular-nums">₹{totals.gst.toFixed(2)}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GST Slab</TableHead>
              <TableHead className="text-right">Taxable amount</TableHead>
              <TableHead className="text-right">CGST</TableHead>
              <TableHead className="text-right">SGST</TableHead>
              <TableHead className="text-right">Total GST</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bySlab.map((r) => (
              <TableRow key={r.slab}>
                <TableCell className="font-medium">{r.slab}%</TableCell>
                <TableCell className="text-right tabular-nums">₹{r.taxable.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{(r.gst / 2).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{(r.gst / 2).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">₹{r.gst.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {bySlab.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No GST data yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
