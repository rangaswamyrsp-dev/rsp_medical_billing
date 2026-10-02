import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Truck } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers · RSP Medical Billing" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const suppliers = useStore((s) => s.suppliers);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", gstin: "", city: "", balance: 0 });

  const save = () => {
    if (!form.name || !form.phone) return toast.error("Name & phone required");
    actions.addSupplier(form);
    toast.success("Supplier added");
    setForm({ name: "", phone: "", gstin: "", city: "", balance: 0 });
    setOpen(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Suppliers
          </h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} suppliers</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Supplier</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>City</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.phone}</TableCell>
                <TableCell className="text-xs">{s.gstin ?? "—"}</TableCell>
                <TableCell>{s.city ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.balance ? <span className="text-[color:var(--warning)]">₹{s.balance.toLocaleString("en-IN")}</span> : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add supplier</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["name", "Name *"], ["phone", "Phone *"], ["gstin", "GSTIN"], ["city", "City"],
            ].map(([k, l]) => (
              <div key={k} className="space-y-1.5">
                <Label className="text-xs">{l}</Label>
                <Input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
