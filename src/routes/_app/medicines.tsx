import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, Trash2, Pencil, FileSpreadsheet, Pill, Camera, Download } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useTenant } from "@/lib/tenant";
import type { Medicine } from "@/data/medicines";
import { MedicineImportModal } from "@/components/app/MedicineImportModal";
import { exportInventoryToExcel } from "@/lib/inventory-excel";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/medicines")({
  head: () => ({ meta: [{ title: "Medicine Master · RSP Medical Billing" }] }),
  component: MedicinesPage,
});

const EMPTY: Omit<Medicine, "id"> = {
  name: "",
  generic: "",
  company: "",
  supplier: "",
  supplierId: "",
  hsn: "",
  pack: "",
  batch: "",
  mrp: 0,
  gst: 5,
  stock: 0,
  units: "",
  old_rate: 0,
  new_rate: 0,
  expiry: "",
  box_no: "",
  rack: "",
  min_stock: 10,
};

function MedicinesPage() {
  const meds = useStore((s) => s.medicines);
  const suppliers = useStore((s) => s.suppliers);
  const tenant = useTenant();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"photo" | "excel">("photo");
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<Omit<Medicine, "id">>(EMPTY);

  useEffect(() => {
    actions.syncMedicines();
    actions.syncSuppliers();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return meds;
    return meds.filter((m) =>
      [m.name, m.generic ?? "", m.batch, m.company ?? "", m.supplier ?? "", m.box_no ?? "", m.hsn ?? "", m.id, m.code ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [meds, query]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (m: Medicine) => { setEditing(m); setForm(m); setOpen(true); };

  const handleDownloadInventory = () => {
    if (meds.length === 0) return toast.error("No medicines to download");
    exportInventoryToExcel(meds, tenant.name || "Store");
    toast.success(`Inventory exported (${meds.length} items)`);
  };

  const save = async () => {
    if (!form.name || !form.batch) return toast.error("Name and batch required");
    const matchedSup = suppliers.find(
      (s) => s.name.trim().toLowerCase() === (form.supplier || "").trim().toLowerCase() || s.id === form.supplier,
    );
    const purchaseRate = form.new_rate !== undefined && form.new_rate !== 0 ? Number(form.new_rate) : (form.cost !== undefined ? Number(form.cost) : 0);
    const profit = Math.max(0, (Number(form.mrp) || 0) - purchaseRate);

    const payload: Omit<Medicine, "id"> = {
      ...form,
      supplier: matchedSup ? matchedSup.name : (form.supplier || undefined),
      supplierId: matchedSup ? matchedSup.id : (form.supplierId || undefined),
      cost: purchaseRate,
      new_rate: purchaseRate,
      profit,
    };

    if (editing) {
      if (purchaseRate > 0 && editing.new_rate && purchaseRate !== editing.new_rate && !form.old_rate) {
        payload.old_rate = editing.new_rate;
      }
      const res = await actions.updateMedicine(editing.id, payload);
      if (res?.error) {
        toast.error(`Database update error: ${res.error}`);
      } else {
        toast.success("Medicine updated");
      }
    } else {
      const res = await actions.addMedicine(payload);
      if (res?.error) {
        toast.error(`Database save error: ${res.error}`);
      } else {
        toast.success("Medicine added");
      }
    }
    setOpen(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 grid place-items-center">
              <Pill className="h-4 w-4" />
            </span>
            Medicine Master
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage medicines, batch, MRP, GST and stock — {meds.length} items
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => { setImportTab("photo"); setImportOpen(true); }}
            className="gap-1.5 h-9 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-background text-xs font-medium"
          >
            <Camera className="h-4 w-4 text-muted-foreground" /> Add from Photo
          </Button>
          <Button
            variant="outline"
            onClick={() => { setImportTab("excel"); setImportOpen(true); }}
            className="gap-1.5 h-9 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-background text-xs font-medium"
          >
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Import Excel
          </Button>
          <Button
            onClick={openAdd}
            className="gap-1.5 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
          >
            <Plus className="h-4 w-4" /> Add Medicine
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadInventory}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            title="Download Inventory Excel"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-4 border-gray-200 dark:border-gray-800">
        <div className="relative w-full max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 h-10 rounded-xl bg-background border-gray-200 dark:border-gray-800 text-xs"
            placeholder="Search by name, batch, supplier..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <tr className="border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <TableHead className="w-[85px] py-2.5 px-3">ID</TableHead>
              <TableHead className="min-w-[200px] py-2.5 px-3">Name</TableHead>
              <TableHead className="py-2.5 px-3 min-w-[150px]">Supplier</TableHead>
              <TableHead className="py-2.5 px-3 w-16">MFR</TableHead>
              <TableHead className="py-2.5 px-3 min-w-[90px]">HSN</TableHead>
              <TableHead className="py-2.5 px-3 min-w-[100px]">Batch</TableHead>
              <TableHead className="py-2.5 px-3 text-right w-20">MRP</TableHead>
              <TableHead className="py-2.5 px-3 text-center w-16">GST</TableHead>
              <TableHead className="py-2.5 px-3 text-center w-16">Stock</TableHead>
              <TableHead className="py-2.5 px-3 w-24">Expiry</TableHead>
              <TableHead className="py-2.5 px-3 w-16 text-center" />
            </tr>
          </TableHeader>
          <TableBody className="divide-y divide-border text-xs">
            {filtered.map((m) => {
              const currentPurchaseRate = m.new_rate ?? m.cost ?? 0;
              return (
              <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                {/* ID */}
                <TableCell className="font-mono text-[11px] text-muted-foreground py-2.5 px-3">
                  {m.code || `M${m.id.replace(/[^0-9]/g, "").slice(0, 6) || m.id.slice(0, 6)}`}
                </TableCell>

                {/* Name */}
                <TableCell className="py-2.5 px-3">
                  <div className="font-bold text-foreground tracking-tight">{m.name}</div>
                  {m.generic && <div className="text-[11px] text-muted-foreground line-clamp-1">{m.generic}</div>}
                </TableCell>

                {/* Supplier */}
                <TableCell className="py-2.5 px-3 text-xs uppercase font-medium text-muted-foreground">
                  {m.supplier || "—"}
                </TableCell>

                {/* MFR */}
                <TableCell className="py-2.5 px-3 font-mono text-xs uppercase font-medium">
                  {m.company || "—"}
                </TableCell>

                {/* HSN */}
                <TableCell className="py-2.5 px-3 font-mono text-xs">
                  {m.hsn ? (
                    <span>{m.hsn}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded text-[10px]">
                      Missing
                    </span>
                  )}
                </TableCell>

                {/* Batch */}
                <TableCell className="py-2.5 px-3 font-mono text-xs uppercase">
                  {m.batch}
                </TableCell>

                {/* MRP */}
                <TableCell className="py-2.5 px-3 text-right tabular-nums font-semibold">
                  ₹{Number(m.mrp).toFixed(2).replace(/\.00$/, "")}
                </TableCell>

                {/* GST */}
                <TableCell className="py-2.5 px-3 text-center text-xs text-muted-foreground">
                  {m.gst}%
                </TableCell>

                {/* Stock */}
                <TableCell className="py-2.5 px-3 text-center">
                  <span
                    className={`inline-grid place-items-center h-6 min-w-6 px-1.5 rounded-full text-xs font-bold text-white ${
                      m.stock < (m.min_stock ?? 10)
                        ? "bg-red-500"
                        : "bg-emerald-600"
                    }`}
                  >
                    {m.stock}
                  </span>
                </TableCell>

                {/* Expiry */}
                <TableCell className="py-2.5 px-3 font-mono text-xs text-muted-foreground">
                  {m.expiry}
                </TableCell>

                {/* Actions */}
                <TableCell className="py-2.5 px-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        const res = await actions.deleteMedicine(m.id);
                        if (res?.error) {
                          toast.error(`Database delete error: ${res.error}`);
                        } else {
                          toast.success("Deleted");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                  No medicines match the search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit medicine" : "Add medicine"}</DialogTitle>
            <DialogDescription>Update medicine specifications, rates, and batch details.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Medicine Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} full />
            <Field label="Generic / Composition" value={form.generic ?? ""} onChange={(v) => setForm({ ...form, generic: v })} full />

            <Field label="Company" value={form.company ?? ""} onChange={(v) => setForm({ ...form, company: v })} />
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <Input
                list="suppliers-datalist"
                value={form.supplier ?? ""}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                placeholder="Pick or type"
              />
              <datalist id="suppliers-datalist">
                {suppliers.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
            <Field label="HSN Code" value={form.hsn ?? ""} onChange={(v) => setForm({ ...form, hsn: v })} />

            <Field label="Pack" value={form.pack ?? ""} onChange={(v) => setForm({ ...form, pack: v })} placeholder="e.g. 10 / 1x10" />
            <Field label="Units" value={form.units ?? ""} onChange={(v) => setForm({ ...form, units: v })} placeholder="e.g. 100 / Strips" />
            <Field label="Box No." value={form.box_no ?? ""} onChange={(v) => setForm({ ...form, box_no: v })} placeholder="e.g. P001" />

            <Field label="Batch *" value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} />
            <Field label="Expiry (YYYY-MM) *" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} placeholder="e.g. 2027-06" />
            <Field label="Rack / Shelf" value={form.rack ?? ""} onChange={(v) => setForm({ ...form, rack: v })} placeholder="e.g. R-12" />

            <Field label="MRP (₹) *" type="number" value={form.mrp} onChange={(v) => setForm({ ...form, mrp: Number(v) })} />
            <Field label="Purchase Rate (₹) *" type="number" value={form.new_rate ?? form.cost ?? 0} onChange={(v) => setForm({ ...form, new_rate: Number(v) })} />
            <Field label="Old Purchase Rate (₹)" type="number" value={form.old_rate ?? 0} onChange={(v) => setForm({ ...form, old_rate: Number(v) })} />

            {/* Automatically calculated unit profit / value */}
            <div className="col-span-2 sm:col-span-3 p-2.5 rounded-md bg-muted/60 border flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Calculated Profit / Value per unit (MRP − Purchase Rate):</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                ₹{Math.max(0, (Number(form.mrp) || 0) - (Number(form.new_rate ?? form.cost) || 0))}
                {Number(form.mrp) > 0 && (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    ({Math.round((Math.max(0, (Number(form.mrp) || 0) - (Number(form.new_rate ?? form.cost) || 0)) / (Number(form.mrp) || 1)) * 100)}% margin)
                  </span>
                )}
              </span>
            </div>

            <Field label="GST %" type="number" value={form.gst} onChange={(v) => setForm({ ...form, gst: Number(v) })} />
            <Field label="Stock (Quantity) *" type="number" value={form.stock} onChange={(v) => setForm({ ...form, stock: Number(v) })} />
            <Field label="Min Stock Alert" type="number" value={form.min_stock ?? 10} onChange={(v) => setForm({ ...form, min_stock: Number(v) })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Update Medicine" : "Add Medicine"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MedicineImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultTab={importTab}
        onSuccess={() => actions.syncMedicines()}
      />
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", full, placeholder,
}: { label: string; value: string | number; onChange: (v: string) => void; type?: string; full?: boolean; placeholder?: string }) {
  return (
    <div className={"space-y-1.5 " + (full ? "col-span-2 sm:col-span-3" : "")}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value as any} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
