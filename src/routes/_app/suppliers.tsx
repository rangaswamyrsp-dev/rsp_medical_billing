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
import {
  Plus, Trash2, Truck, Pencil, Search, Package, Receipt, Sparkles, Building2, Phone, Mail, MapPin,
} from "lucide-react";
import { actions, useStore, type Supplier, type Medicine, type Purchase } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers · RSP Medical Billing" }] }),
  component: SuppliersPage,
});

const EMPTY_FORM = { name: "", phone: "", email: "", address: "", gstin: "" };

function SuppliersPage() {
  const suppliers = useStore((s) => s.suppliers);
  const medicines = useStore((s) => s.medicines);
  const purchases = useStore((s) => s.purchases);

  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [autoSynced, setAutoSynced] = useState(false);

  // 1. Initial sync of all data
  useEffect(() => {
    actions.syncSuppliers();
    actions.syncMedicines();
    actions.syncPurchases();
  }, []);

  // 2. Auto-ready suppliers from Excel import (medicines.supplier) or Photo/IMG import (purchases.supplierName)
  useEffect(() => {
    if (autoSynced) return;
    if (medicines.length === 0 && purchases.length === 0) return;

    const existingNames = new Set(
      suppliers.map((s) => s.name.trim().toLowerCase()).filter(Boolean)
    );

    const pendingToAdd: Array<{
      name: string;
      phone?: string;
      gstin?: string;
      address?: string;
    }> = [];

    // Check distinct suppliers from medicines
    medicines.forEach((m) => {
      const sup = (m.supplier || "").trim();
      if (sup && !existingNames.has(sup.toLowerCase())) {
        existingNames.add(sup.toLowerCase());
        pendingToAdd.push({ name: sup });
      }
    });

    // Check distinct suppliers from purchases (which carry phone, GSTIN, address from OCR bill scan)
    purchases.forEach((p) => {
      const sup = (p.supplierName || "").trim();
      if (sup) {
        const lower = sup.toLowerCase();
        if (!existingNames.has(lower)) {
          existingNames.add(lower);
          pendingToAdd.push({
            name: sup,
            phone: p.supplierPhone || "",
            gstin: p.supplierGstin || "",
            address: p.supplierAddress || "",
          });
        }
      }
    });

    if (pendingToAdd.length > 0) {
      setAutoSynced(true);
      Promise.all(
        pendingToAdd.map((p) =>
          actions.addSupplier({
            name: p.name,
            phone: p.phone || "",
            email: "",
            address: p.address || "",
            gstin: p.gstin || "",
            balance: 0,
          })
        )
      ).then(() => {
        toast.info(
          `Auto-detected and registered ${pendingToAdd.length} supplier(s) from Excel / Photo imports.`
        );
      });
    } else {
      setAutoSynced(true);
    }
  }, [medicines, purchases, suppliers, autoSynced]);

  // Supplier statistics calculation map
  const supplierStats = useMemo(() => {
    const stats = new Map<
      string,
      { medsCount: number; purchaseCount: number; totalPurchaseVal: number }
    >();

    medicines.forEach((m) => {
      const sup = (m.supplier || "").trim().toLowerCase();
      if (!sup) return;
      if (!stats.has(sup)) {
        stats.set(sup, { medsCount: 0, purchaseCount: 0, totalPurchaseVal: 0 });
      }
      stats.get(sup)!.medsCount += 1;
    });

    purchases.forEach((p) => {
      const sup = (p.supplierName || "").trim().toLowerCase();
      if (!sup) return;
      if (!stats.has(sup)) {
        stats.set(sup, { medsCount: 0, purchaseCount: 0, totalPurchaseVal: 0 });
      }
      const st = stats.get(sup)!;
      st.purchaseCount += 1;
      st.totalPurchaseVal += Number(p.totalAmount || 0);
    });

    return stats;
  }, [medicines, purchases]);

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.name, s.phone, s.email, s.address, s.gstin].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [suppliers, searchQuery]);

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
    const trimmedName = form.name.trim();
    if (!trimmedName) return toast.error("Supplier name is required");

    if (editing) {
      const oldName = editing.name.trim();
      const res = await actions.updateSupplier(editing.id, {
        name: trimmedName,
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        gstin: form.gstin.trim(),
      });

      if (res?.error) {
        toast.error(`Database update error: ${res.error}`);
      } else {
        // If supplier name was renamed, propagate name change to matching medicines
        if (oldName.toLowerCase() !== trimmedName.toLowerCase()) {
          const matchingMeds = medicines.filter(
            (m) => (m.supplier || "").trim().toLowerCase() === oldName.toLowerCase()
          );
          matchingMeds.forEach((m) => {
            actions.updateMedicine(m.id, { supplier: trimmedName });
          });
        }
        toast.success("Supplier details updated successfully ✓");
      }
    } else {
      const res = await actions.addSupplier({
        name: trimmedName,
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        gstin: form.gstin.trim(),
        balance: 0,
      });

      if (res?.error) {
        toast.error(`Database save error: ${res.error}`);
      } else {
        toast.success("Supplier added successfully ✓");
      }
    }

    setForm(EMPTY_FORM);
    setEditing(null);
    setOpen(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Suppliers Directory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Auto-detected from Photo bill scans, Excel imports, and purchase entries. Edit supplier contact and GST details here.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      {/* ── Statistics Summary Cards ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-3.5 border shadow-sm">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" /> Total Suppliers
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">{suppliers.length}</div>
        </Card>

        <Card className="p-3.5 border shadow-sm">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-blue-600" /> Supplied Medicines
          </div>
          <div className="text-2xl font-bold mt-1 text-blue-600">
            {medicines.filter((m) => Boolean(m.supplier)).length}
          </div>
        </Card>

        <Card className="p-3.5 border shadow-sm">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-emerald-600" /> Purchase Bills
          </div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{purchases.length}</div>
        </Card>

        <Card className="p-3.5 border shadow-sm">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" /> Auto-Import Ready
          </div>
          <div className="text-2xl font-bold mt-1 text-purple-600">Active</div>
        </Card>
      </div>

      {/* ── Search & Filter Controls ── */}
      <Card className="p-3.5 border shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-xs"
              placeholder="Search by supplier name, phone, GSTIN, city…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Showing <strong className="text-foreground">{filteredSuppliers.length}</strong> of {suppliers.length} suppliers
          </div>
        </div>

        {/* ── Suppliers Table ── */}
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader className="bg-muted/40 text-xs">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Supplier Name</TableHead>
                <TableHead>Contact / Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead className="text-center">Products & Bills</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    {searchQuery ? "No suppliers match your search." : "No suppliers found. Add one or import medicines to automatically discover suppliers."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSuppliers.map((s, idx) => {
                  const stat = supplierStats.get(s.name.trim().toLowerCase());
                  const medsCount = stat?.medsCount || 0;
                  const purchaseCount = stat?.purchaseCount || 0;

                  return (
                    <TableRow key={s.id} className="hover:bg-muted/30 transition-colors text-xs">
                      <TableCell className="text-center text-muted-foreground font-mono">
                        {idx + 1}
                      </TableCell>

                      {/* Name */}
                      <TableCell>
                        <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                          {s.name}
                        </div>
                        {medsCount > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            Supplying {medsCount} medicine items
                          </div>
                        )}
                      </TableCell>

                      {/* Phone */}
                      <TableCell>
                        {s.phone ? (
                          <div className="flex items-center gap-1 text-slate-800 font-mono text-xs">
                            <Phone className="h-3 w-3 text-slate-400" /> {s.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-[11px]">Not provided</span>
                        )}
                      </TableCell>

                      {/* Email */}
                      <TableCell>
                        {s.email ? (
                          <div className="flex items-center gap-1 text-slate-700 text-xs truncate max-w-[180px]" title={s.email}>
                            <Mail className="h-3 w-3 text-slate-400" /> {s.email}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-[11px]">Not provided</span>
                        )}
                      </TableCell>

                      {/* Address */}
                      <TableCell>
                        {s.address ? (
                          <div className="flex items-center gap-1 text-slate-700 text-xs max-w-[200px] truncate" title={s.address}>
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" /> {s.address}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-[11px]">Not provided</span>
                        )}
                      </TableCell>

                      {/* GSTIN */}
                      <TableCell>
                        {s.gstin ? (
                          <Badge variant="outline" className="font-mono text-[10px] bg-muted/30 uppercase">
                            {s.gstin}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Linked Stats */}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {medsCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                              {medsCount} meds
                            </Badge>
                          )}
                          {purchaseCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              {purchaseCount} bills
                            </Badge>
                          )}
                          {medsCount === 0 && purchaseCount === 0 && (
                            <span className="text-muted-foreground text-[10px] italic">No active stock</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Action buttons */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                            title="Edit supplier details"
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete supplier"
                            onClick={async () => {
                              if (confirm(`Are you sure you want to delete supplier "${s.name}"?`)) {
                                const res = await actions.deleteSupplier(s.id);
                                if (res?.error) {
                                  toast.error(`Database delete error: ${res.error}`);
                                } else {
                                  toast.success("Supplier deleted ✓");
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Add / Edit Supplier Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {editing ? "Edit Supplier Details" : "Add New Supplier"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update contact info, GSTIN, and address for this distributor or supplier."
                : "Enter supplier details. These will be automatically suggested in purchase invoices."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">Supplier / Distributor Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Apex Pharma Distributors"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="10-digit mobile / phone"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="supplier@example.com"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Physical Address / City</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. 12/B Commercial Complex, Bengaluru, Karnataka"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">GSTIN (Tax ID)</Label>
              <Input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                placeholder="15-character GSTIN (e.g. 29ABCDE1234F1Z5)"
                className="h-9 text-xs font-mono uppercase"
              />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              {editing ? "Save Changes" : "Register Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
