import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Trash2, Truck } from "lucide-react";
import { actions, useStore, type Medicine } from "@/lib/store";
import { parsePackInfo } from "@/lib/medicine-units";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/purchase")({
  head: () => ({ meta: [{ title: "Purchase · RSP Medical Billing" }] }),
  component: PurchasePage,
});

type Row = { name: string; batch: string; qty: number; rate: number; gst: number };
const EMPTY_ROW: Row = { name: "", batch: "", qty: 1, rate: 0, gst: 5 };

function PurchasePage() {
  const purchases = useStore((s) => s.purchases);
  const suppliers = useStore((s) => s.suppliers);
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [rows, setRows] = useState<Row[]>([EMPTY_ROW]);

  useEffect(() => {
    actions.syncPurchases();
  }, []);

  const total = rows.reduce((n, r) => n + r.qty * r.rate * (1 + r.gst / 100), 0);

  const save = async () => {
    if (!supplier || !invoiceNo) return toast.error("Supplier & invoice no. required");
    const valid = rows.filter((r) => r.name && r.batch && r.qty > 0);
    if (valid.length === 0) return toast.error("Add at least one item");

    const matched = suppliers.find(
      (s) => s.name.trim().toLowerCase() === supplier.trim().toLowerCase() || s.id === supplier
    );
    const supplierId = matched?.id;

    const res = await actions.addPurchase({
      date: new Date().toISOString().slice(0, 10),
      supplier: matched ? matched.name : supplier,
      supplierId,
      invoiceNo,
      items: valid,
      total: Math.round(total),
    });
    if (res?.error) {
      toast.error(`Database save error: ${res.error}`);
    } else {
      // Also add/update medicines stock in base units
      const meds = useStore.getState().medicines;
      valid.forEach((r) => {
        const existing = meds.find(
          (m: Medicine) => m.name.toLowerCase() === r.name.toLowerCase()
        );
        const pInfo = parsePackInfo(existing || { pack: "" });
        const baseStock = pInfo.packSize > 1 ? r.qty * pInfo.packSize : r.qty;
        actions.addMedicine({
          name: r.name,
          batch: r.batch,
          mrp: existing?.mrp ?? Math.round(r.rate * 1.4),
          gst: r.gst,
          stock: baseStock,
          expiry: existing?.expiry ?? "",
          company: existing?.company || supplier,
          pack: existing?.pack,
          units: existing?.units,
        });
      });
      toast.success("Purchase recorded & stock updated");
      setOpen(false);
      setSupplier(""); setInvoiceNo(""); setRows([EMPTY_ROW]);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Purchase
          </h1>
          <p className="text-sm text-muted-foreground">Record supplier purchases and add stock in bulk.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Purchase</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.date}</TableCell>
                <TableCell className="font-medium">{p.supplier}</TableCell>
                <TableCell>{p.invoiceNo}</TableCell>
                <TableCell className="text-center">{p.items.length}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">₹{p.total.toLocaleString("en-IN")}</TableCell>
              </TableRow>
            ))}
            {purchases.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No purchases yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New purchase entry</DialogTitle>
            <DialogDescription>Adds items to stock and records the purchase.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <Input list="suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Type or pick" />
              <datalist id="suppliers">
                {suppliers.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Invoice no.</Label>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. MP-4421" />
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead className="w-24">Batch</TableHead>
                  <TableHead className="w-20">Qty</TableHead>
                  <TableHead className="w-24">Rate</TableHead>
                  <TableHead className="w-20">GST%</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={r.name} onChange={(e) => setRows(rows.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} className="h-8" /></TableCell>
                    <TableCell><Input value={r.batch} onChange={(e) => setRows(rows.map((x, k) => k === i ? { ...x, batch: e.target.value } : x))} className="h-8" /></TableCell>
                    <TableCell><Input type="number" value={r.qty} onChange={(e) => setRows(rows.map((x, k) => k === i ? { ...x, qty: Number(e.target.value) } : x))} className="h-8" /></TableCell>
                    <TableCell><Input type="number" value={r.rate} onChange={(e) => setRows(rows.map((x, k) => k === i ? { ...x, rate: Number(e.target.value) } : x))} className="h-8" /></TableCell>
                    <TableCell><Input type="number" value={r.gst} onChange={(e) => setRows(rows.map((x, k) => k === i ? { ...x, gst: Number(e.target.value) } : x))} className="h-8" /></TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                        onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={() => setRows([...rows, { ...EMPTY_ROW }])}>
              <Plus className="h-4 w-4 mr-1.5" /> Add row
            </Button>
            <div className="text-sm">
              Total: <b className="text-lg tabular-nums">₹{total.toFixed(2)}</b>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
