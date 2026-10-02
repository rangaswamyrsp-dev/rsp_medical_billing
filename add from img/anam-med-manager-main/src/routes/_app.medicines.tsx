import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Plus, Search, Trash2, Pencil, FileSpreadsheet, Pill, Camera, ScanLine } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import type { Medicine } from "@/data/medicines";
import { MedicineImportDialog, type ImportMode } from "@/components/app/MedicineImportDialog";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { lookupBarcode } from "@/lib/barcode.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/medicines")({
  head: () => ({ meta: [{ title: "Medicine Master · RSP Medical Billing" }] }),
  component: MedicinesPage,
});

const EMPTY: Omit<Medicine, "id"> = {
  name: "", batch: "", mrp: 0, gst: 5, stock: 0, expiry: "", company: "", invoice: "", hsn: "", mfr: "",
  type: "", category: "", pack: "", purchase: 0, barcode: "",
};

function MedicinesPage() {
  const meds = useStore((s) => s.medicines);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<Omit<Medicine, "id">>(EMPTY);
  const [scanOpen, setScanOpen] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");
  const lookup = useServerFn(lookupBarcode);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return meds;
    return meds.filter((m) =>
      [m.name, m.batch, m.company, m.id].some((v) => v.toLowerCase().includes(q)),
    );
  }, [meds, query]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setLookupMsg(""); setOpen(true); };
  const openEdit = (m: Medicine) => { setEditing(m); setForm(m); setLookupMsg(""); setOpen(true); };

  const handleBarcode = async (raw: string) => {
    const code = raw.replace(/\D/g, "");
    if (!code) return toast.error("Invalid barcode");
    setForm((f) => ({ ...f, barcode: code }));
    // Step 1: local database
    const local = meds.find((m) => m.barcode === code);
    if (local) {
      const { id: _id, batch: _b, expiry: _e, stock: _s, invoice: _i, ...rest } = local;
      setForm((f) => ({ ...f, ...rest, barcode: code, batch: "", expiry: "", stock: 0, invoice: "" }));
      setLookupMsg(`Found in your inventory: ${local.name}. Enter the new batch, expiry and stock.`);
      return;
    }
    // Step 2: external lookup
    setLookupMsg(`Searching ${code}…`);
    const r = await lookup({ data: { code } }).catch(() => null);
    if (!r || !r.ok) { setLookupMsg(r?.error || "Lookup failed. Please enter the product details manually."); return; }
    if (!r.found || !r.product) { setLookupMsg("Product not found. Please enter the product details manually."); return; }
    const p = r.product;
    setForm((f) => ({ ...f, barcode: code, name: p.name || f.name, category: p.category || f.category }));
    setLookupMsg(`Found on ${p.source}${p.brand ? ` (brand: ${p.brand})` : ""}. Check details and fill batch, MRP, HSN.`);
  };

  const save = () => {
    if (!form.name || !form.batch) return toast.error("Name and batch required");
    if (editing) {
      actions.updateMedicine(editing.id, form);
      toast.success("Medicine updated");
    } else {
      actions.addMedicine(form);
      toast.success("Medicine added");
    }
    setOpen(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Pill className="h-6 w-6 text-primary" /> Medicine Master
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage medicines, batch, MRP, GST and stock — {meds.length} items
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportMode("photo")}>
            <Camera className="h-4 w-4 mr-1.5" /> Add from Photo
          </Button>
          <Button variant="outline" onClick={() => setImportMode("excel")}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Import Excel
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Medicine
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, batch, supplier…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>MFR</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-center">GST</TableHead>
              <TableHead className="text-center">Stock</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.id}</TableCell>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-sm">{m.company}</TableCell>
                <TableCell className="text-sm">{m.mfr || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{m.hsn || "—"}</TableCell>
                <TableCell className="text-sm">{m.batch}</TableCell>
                <TableCell className="text-right tabular-nums">₹{m.mrp}</TableCell>
                <TableCell className="text-center">{m.gst}%</TableCell>
                <TableCell className="text-center">
                  <Badge variant={m.stock < 20 ? "destructive" : "secondary"}>{m.stock}</Badge>
                </TableCell>
                <TableCell className="text-sm">{m.expiry}</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(m)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => { actions.deleteMedicine(m.id); toast.success("Deleted"); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                No medicines match the search.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      {/* Add/Edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit medicine" : "Add medicine"}</DialogTitle>
            <DialogDescription>Fill in the details below.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={() => setScanOpen(true)}>
              <ScanLine className="h-4 w-4 mr-1.5" /> Scan / Enter Barcode
            </Button>
            {lookupMsg && <div className="text-xs text-muted-foreground self-center">{lookupMsg}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Barcode (EAN / UPC / GTIN)" value={form.barcode ?? ""} onChange={(v) => setForm({ ...form, barcode: v })} full />
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} full />
            <Field label="Supplier" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
            <Field label="Purchase invoice no." value={form.invoice ?? ""} onChange={(v) => setForm({ ...form, invoice: v })} />
            <Field label="Manufacturer (MFR)" value={form.mfr ?? ""} onChange={(v) => setForm({ ...form, mfr: v })} />
            <Field label="HSN / SAC code" value={form.hsn ?? ""} onChange={(v) => setForm({ ...form, hsn: v })} />
            <Field label="Batch" value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} />
            <Field label="Expiry (YYYY-MM)" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} />
            <Field label="MRP (₹)" type="number" value={form.mrp} onChange={(v) => setForm({ ...form, mrp: Number(v) })} />
            <Field label="GST %" type="number" value={form.gst} onChange={(v) => setForm({ ...form, gst: Number(v) })} />
            <Field label="Stock" type="number" value={form.stock} onChange={(v) => setForm({ ...form, stock: Number(v) })} />
            <Field label="Purchase price (₹)" type="number" value={form.purchase ?? 0} onChange={(v) => setForm({ ...form, purchase: Number(v) })} />
            <Field label="Type (Tablet, Syrup…)" value={form.type ?? ""} onChange={(v) => setForm({ ...form, type: v })} />
            <Field label="Category" value={form.category ?? ""} onChange={(v) => setForm({ ...form, category: v })} />
            <Field label="Pack size" value={form.pack ?? ""} onChange={(v) => setForm({ ...form, pack: v })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={handleBarcode} />

      <MedicineImportDialog
        open={importMode !== null}
        onOpenChange={(v) => !v && setImportMode(null)}
        mode={importMode ?? "photo"}
        existing={meds}
        onConfirm={(rows) => actions.bulkAddMedicines(rows)}
      />
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", full,
}: { label: string; value: string | number; onChange: (v: string) => void; type?: string; full?: boolean }) {
  return (
    <div className={"space-y-1.5 " + (full ? "col-span-2" : "")}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value as any} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
