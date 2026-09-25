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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Truck, Pencil } from "lucide-react";
import { actions, useStore, type Supplier } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers · RSP Medical Billing" }] }),
  component: SuppliersPage,
});

const EMPTY_FORM = { name: "", phone: "", email: "", address: "", gstin: "" };

function SuppliersPage() {
  const suppliers = useStore((s) => s.suppliers);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    actions.syncSuppliers();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      gstin: s.gstin || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Supplier name required");
    if (editing) {
      const res = await actions.updateSupplier(editing.id, form);
      if (res?.error) {
        toast.error(`Database update error: ${res.error}`);
      } else {
        toast.success("Supplier updated");
      }
    } else {
      const res = await actions.addSupplier(form);
      if (res?.error) {
        toast.error(`Database save error: ${res.error}`);
      } else {
        toast.success("Supplier added");
      }
    }
    setForm(EMPTY_FORM);
    setEditing(null);
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
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" /> Add Supplier</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead className="w-24 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.phone || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.email || "—"}</TableCell>
                <TableCell className="text-sm">{s.address || "—"}</TableCell>
                <TableCell className="text-xs font-mono">{s.gstin ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="icon" variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={async () => {
                        const res = await actions.deleteSupplier(s.id);
                        if (res?.error) {
                          toast.error(`Database delete error: ${res.error}`);
                        } else {
                          toast.success("Deleted");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {suppliers.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                No suppliers found.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Supplier Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Apollo Pharma Distributors" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit number" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="supplier@example.com" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="City, State, Pin" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">GSTIN</Label>
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="15-character GSTIN" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
