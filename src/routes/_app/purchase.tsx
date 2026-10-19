import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Truck, Pencil, Loader2, AlertCircle, Search, CheckCircle2, Eye, Filter,
} from "lucide-react";
import { actions, useStore, type Medicine, type Purchase, type PurchaseItem } from "@/lib/store";
import { parsePackInfo } from "@/lib/medicine-units";
import { calculatePurchaseLine, calculatePurchaseInvoiceTotals, type PurchaseItemInput } from "@/lib/purchase-calc";
import { getUser } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/purchase")({
  head: () => ({ meta: [{ title: "Purchase · RSP Medical Billing" }] }),
  component: PurchasePage,
});

type Row = {
  name: string;
  batch: string;
  qty: number;         // Stock in base units
  extraQty?: number;   // Extra loose units
  packSize?: number;   // Units per pack
  pack?: string;       // Packaging label e.g. "1x15", "10x10"
  unit?: string;       // Base unit label e.g. "Tablet"
  rate: number;        // Purchase rate per pack
  gst: number;         // GST %
  mrp?: number;        // MRP per pack
  expiry?: string;
};

const EMPTY_ROW: Row = { name: "", batch: "", qty: 1, extraQty: 0, packSize: 1, pack: "1x10", unit: "Tablet", rate: 0, gst: 5, mrp: 0, expiry: "" };

function PurchasePage() {
  const purchases = useStore((s) => s.purchases);
  const suppliers = useStore((s) => s.suppliers);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  // New Purchase Dialog State
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [saving, setSaving] = useState(false);

  // Verify / Edit Purchase Dialog State
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyingPurchase, setVerifyingPurchase] = useState<Purchase | null>(null);
  const [verifySupplier, setVerifySupplier] = useState("");
  const [verifyInvoiceNo, setVerifyInvoiceNo] = useState("");
  const [verifyDate, setVerifyDate] = useState("");
  const [verifyRows, setVerifyRows] = useState<Row[]>([]);
  const [updating, setUpdating] = useState(false);

  // Read-only View Modal State
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);

  // Final Confirmation Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchaseToConfirm, setPurchaseToConfirm] = useState<Purchase | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // Delete Confirmation State
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    actions.syncPurchases();
    actions.syncSuppliers();
    actions.syncMedicines();
  }, []);

  const invoiceTotals = useMemo(() => calculatePurchaseInvoiceTotals(rows), [rows]);
  const verifyInvoiceTotals = useMemo(() => calculatePurchaseInvoiceTotals(verifyRows), [verifyRows]);
  const total = invoiceTotals.grandTotal;
  const verifyTotal = verifyInvoiceTotals.grandTotal;

  // Filtered & Searched Purchases
  const filteredPurchases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return purchases.filter((p) => {
      // Supplier filter
      if (supplierFilter !== "all") {
        const matchesSupplier =
          p.supplierId === supplierFilter ||
          p.supplier.toLowerCase().trim() === supplierFilter.toLowerCase().trim();
        if (!matchesSupplier) return false;
      }

      // Status filter
      const pStatus = p.status || "RECEIVED";
      if (statusFilter !== "all" && pStatus !== statusFilter) {
        return false;
      }

      // Date filter
      if (dateFilter && p.date !== dateFilter) {
        return false;
      }

      // Search Query: Invoice No, Supplier, Medicine Name, Batch Number
      if (!q) return true;

      const invoiceMatch = p.invoiceNo && p.invoiceNo.toLowerCase().includes(q);
      const supplierMatch = p.supplier && p.supplier.toLowerCase().includes(q);
      const itemsMatch = (p.items || []).some(
        (it) =>
          (it.name && it.name.toLowerCase().includes(q)) ||
          (it.batch && it.batch.toLowerCase().includes(q))
      );

      return invoiceMatch || supplierMatch || itemsMatch;
    });
  }, [purchases, searchQuery, supplierFilter, statusFilter, dateFilter]);

  // Open New Purchase
  const openNewPurchase = () => {
    setSupplier("");
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setRows([{ ...EMPTY_ROW }]);
    setOpen(true);
  };

  // Open Verify / Edit Purchase
  const openVerifyPurchase = (p: Purchase) => {
    setVerifyingPurchase(p);
    setVerifySupplier(p.supplier);
    setVerifyInvoiceNo(p.invoiceNo);
    setVerifyDate(p.date || new Date().toISOString().slice(0, 10));
    const meds = useStore.getState().medicines;
    setVerifyRows(
      p.items && p.items.length > 0
        ? p.items.map((it) => {
            const med =
              meds.find(
                (m) =>
                  m.name.toLowerCase().trim() === it.name.toLowerCase().trim() &&
                  (!it.batch || (m.batch || "").toLowerCase().trim() === it.batch.toLowerCase().trim())
              ) ||
              meds.find(
                (m) => m.name.toLowerCase().trim() === it.name.toLowerCase().trim()
              );
            const pInfo = parsePackInfo(med || it.name);
            const packSize = (it as any).packSize || pInfo.packSize || 1;
            return {
              name: it.name,
              batch: it.batch || "",
              qty: it.qty,
              extraQty: (it as any).extraQty || 0,
              packSize,
              pack: med?.pack || (it as any).pack || pInfo.rawPack || `${packSize}'s`,
              unit: med?.units || (it as any).unit || pInfo.unitLabel || "Unit",
              rate: it.rate,
              gst: it.gst ?? 5,
              mrp: it.mrp ?? (med?.mrp || 0),
              expiry: it.expiry ?? (med?.expiry || ""),
            };
          })
        : [{ ...EMPTY_ROW }]
    );
    setVerifyOpen(true);
  };

  // Open View Modal (Read-only)
  const openViewPurchase = (p: Purchase) => {
    setViewingPurchase(p);
    setViewOpen(true);
  };

  // Save new purchase
  const save = async () => {
    if (saving) return;

    if (!supplier.trim()) return toast.error("Supplier name is required");
    if (!invoiceNo.trim()) return toast.error("Invoice number is required");

    const valid = rows.filter((r) => r.name.trim() && r.batch.trim() && (Number(r.qty) || 0) > 0);
    if (valid.length === 0)
      return toast.error("Please add at least one valid item with name, batch and quantity");

    setSaving(true);
    try {
      const matched = suppliers.find(
        (s) => s.name.trim().toLowerCase() === supplier.trim().toLowerCase() || s.id === supplier
      );
      const supplierId = matched?.id;

      const res = await actions.addPurchase({
        date: purchaseDate || new Date().toISOString().slice(0, 10),
        supplier: matched ? matched.name : supplier.trim(),
        supplierId,
        invoiceNo: invoiceNo.trim(),
        items: valid,
        total: Math.round(total),
        status: "RECEIVED",
      });

      if (res?.error) {
        toast.error(`Database save error: ${res.error}`);
      } else {
        const meds = useStore.getState().medicines;
        valid.forEach((r) => {
          const existing = meds.find(
            (m: Medicine) =>
              m.name.toLowerCase().trim() === r.name.toLowerCase().trim() &&
              m.batch.toLowerCase().trim() === r.batch.toLowerCase().trim()
          );
          if (!existing) {
            const pInfo = parsePackInfo(r.name || "");
            actions.addMedicine({
              name: r.name.trim(),
              batch: r.batch.trim(),
              mrp: r.mrp || Math.round(r.rate * 1.4),
              cost: r.rate,
              new_rate: r.rate,
              gst: r.gst,
              stock: r.qty, // Stock is already counted
              expiry: r.expiry || "",
              company: supplier.trim(),
              pack: pInfo.packLabel,
              units: pInfo.unitLabel,
            });
          }
        });

        toast.success(`Purchase ${invoiceNo.trim()} recorded & stock updated ✓`);
        setOpen(false);
        setSupplier("");
        setInvoiceNo("");
        setRows([{ ...EMPTY_ROW }]);
        actions.syncPurchases();
      }
    } catch (err: any) {
      toast.error(`Error saving purchase: ${err?.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // Save changes made during Verification
  const handleSaveVerifiedChanges = async () => {
    if (!verifyingPurchase || updating) return;

    if (!verifySupplier.trim()) return toast.error("Supplier name is required");
    if (!verifyInvoiceNo.trim()) return toast.error("Invoice number is required");

    const valid = verifyRows.filter((r) => r.name.trim() && (Number(r.qty) || 0) > 0);
    if (valid.length === 0) return toast.error("Please add at least one valid item");

    setUpdating(true);
    try {
      const matched = suppliers.find(
        (s) =>
          s.name.trim().toLowerCase() === verifySupplier.trim().toLowerCase() ||
          s.id === verifySupplier
      );
      const supplierId = matched?.id;

      // If purchase was already finalized (RECEIVED), safely recalculate stock deltas
      if (verifyingPurchase.status === "RECEIVED") {
        const meds = useStore.getState().medicines;
        const oldItems = verifyingPurchase.items || [];

        for (const item of valid) {
          const old = oldItems.find(
            (o) =>
              o.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
              (o.batch || "").trim().toLowerCase() === (item.batch || "").trim().toLowerCase()
          );

          const matchedMed = meds.find(
            (m: Medicine) =>
              m.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
              m.batch.trim().toLowerCase() === (item.batch || "").trim().toLowerCase()
          );

          if (matchedMed) {
            const oldUnits = old ? (Number(old.qty) || 0) : 0;
            const newUnits = Number(item.qty) || 0;
            const qtyDelta = newUnits - oldUnits;

            const updates: Partial<Medicine> = {};
            if (qtyDelta !== 0) {
              updates.stock = Math.max(0, (Number(matchedMed.stock) || 0) + qtyDelta);
            }
            if (item.mrp && Number(item.mrp) !== Number(matchedMed.mrp)) {
              updates.mrp = Number(item.mrp);
            }
            if (item.rate && Number(item.rate) !== Number(matchedMed.new_rate ?? matchedMed.cost)) {
              updates.cost = Number(item.rate);
              updates.new_rate = Number(item.rate);
            }
            if (item.expiry && item.expiry !== matchedMed.expiry) {
              updates.expiry = item.expiry;
            }
            if (item.gst !== undefined && Number(item.gst) !== Number(matchedMed.gst)) {
              updates.gst = Number(item.gst);
            }

            if (Object.keys(updates).length > 0) {
              await actions.updateMedicine(matchedMed.id, updates);
            }
          }
        }
      }

      const res = await actions.updatePurchase(verifyingPurchase.id, {
        date: verifyDate || verifyingPurchase.date,
        supplier: matched ? matched.name : verifySupplier.trim(),
        supplierId,
        invoiceNo: verifyInvoiceNo.trim(),
        items: valid,
        total: Math.round(verifyInvoiceTotals.grandTotal),
        status: verifyingPurchase.status || "PENDING",
      });

      if (res?.error) {
        toast.error(`Update error: ${res.error}`);
      } else {
        const u = getUser();
        actions.audit({
          actor: u ? `${u.name} (${u.role})` : "system",
          action: verifyingPurchase.status === "RECEIVED" ? "purchase.correction" : "purchase.update",
          module: "Purchases",
          target: verifyInvoiceNo.trim(),
          detail: `Purchase ${verifyInvoiceNo.trim()} · Total: ₹${verifyInvoiceTotals.grandTotal.toFixed(2)} · Items: ${valid.length}`,
        });

        toast.success(
          verifyingPurchase.status === "RECEIVED"
            ? `Purchase ${verifyInvoiceNo.trim()} corrections saved! Stock adjusted by difference ✓`
            : `Draft purchase ${verifyInvoiceNo.trim()} updated successfully ✓`
        );
        setVerifyOpen(false);
        setVerifyingPurchase(null);
        actions.syncPurchases();
        actions.syncMedicines();
      }
    } catch (err: any) {
      toast.error(`Error updating purchase: ${err?.message || String(err)}`);
    } finally {
      setUpdating(false);
    }
  };

  // Final Confirm action with Idempotency protection
  const handleFinalConfirm = async () => {
    if (!purchaseToConfirm || finalizing) return;

    setFinalizing(true);
    try {
      const u = getUser();
      const res = await actions.confirmPurchase(
        purchaseToConfirm.id,
        u ? { id: u.id, name: u.name } : undefined
      );

      if (res?.error) {
        toast.error(`Unable to finalize purchase: ${res.error}`);
      } else if (res?.alreadyConfirmed) {
        toast.info("Invoice is already finalized.");
        setConfirmOpen(false);
        setPurchaseToConfirm(null);
      } else {
        toast.success(
          `Purchase ${purchaseToConfirm.invoiceNo} confirmed! Stock updated successfully ✓`
        );
        setConfirmOpen(false);
        setPurchaseToConfirm(null);
        if (verifyOpen) setVerifyOpen(false);
        actions.syncPurchases();
        actions.syncMedicines();
      }
    } catch (err: any) {
      toast.error(`Error confirming purchase: ${err?.message || String(err)}`);
    } finally {
      setFinalizing(false);
    }
  };

  // Confirm delete purchase
  const confirmDelete = async () => {
    if (!purchaseToDelete || deleting) return;
    setDeleting(true);
    try {
      const res = await actions.deletePurchase(purchaseToDelete.id);
      if (res?.error) {
        toast.error(`Delete error: ${res.error}`);
      } else {
        toast.success(`Purchase ${purchaseToDelete.invoiceNo} deleted successfully`);
        setDeleteOpen(false);
        setPurchaseToDelete(null);
      }
    } catch (err: any) {
      toast.error(`Delete failed: ${err?.message || String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> Purchase
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage incoming purchase drafts, verify supplier invoices, and finalize stock.
          </p>
        </div>
        <Button onClick={openNewPurchase} className="bg-primary text-primary-foreground font-medium">
          <Plus className="h-4 w-4 mr-1.5" /> New Purchase
        </Button>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="p-3.5 bg-card/60 border space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Search Query */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search Invoice, Supplier, Medicine, Batch…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Supplier Filter */}
          <div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id || s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending Verification</SelectItem>
                <SelectItem value="RECEIVED">Received / Final</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 text-xs"
              placeholder="Filter by Date"
            />
            {dateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDateFilter("")}
                className="h-9 px-2 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Purchases Data Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice No</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right w-44">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.map((p) => {
                const status = p.status || "RECEIVED";
                const itemCount = p.items ? p.items.length : 0;
                return (
                  <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs">{p.date || "—"}</TableCell>
                    <TableCell className="font-medium">{p.supplier || "—"}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{p.invoiceNo || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs font-mono">
                        {itemCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      ₹{p.total.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-center">
                      {status === "PENDING" && (
                        <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 border-amber-500/30 font-medium text-xs">
                          Pending
                        </Badge>
                      )}
                      {status === "RECEIVED" && (
                        <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30 font-medium text-xs">
                          Received
                        </Badge>
                      )}
                      {status === "RETURNED" && (
                        <Badge className="bg-purple-500/15 text-purple-600 hover:bg-purple-500/20 border-purple-500/30 font-medium text-xs">
                          Returned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {status === "PENDING" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs font-medium border-amber-500/40 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                              title="Verify Purchase Details"
                              onClick={() => openVerifyPurchase(p)}
                            >
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                              title="Final Confirm & Add to Stock"
                              onClick={() => {
                                setPurchaseToConfirm(p);
                                setConfirmOpen(true);
                              }}
                            >
                              Final Confirm
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Delete Draft"
                              onClick={() => {
                                setPurchaseToDelete(p);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs font-medium"
                              title="Edit Purchase Details"
                              onClick={() => openVerifyPurchase(p)}
                            >
                              <Pencil className="h-3 w-3 mr-1 text-muted-foreground" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              title="View Purchase Details"
                              onClick={() => openViewPurchase(p)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Delete record"
                              onClick={() => {
                                setPurchaseToDelete(p);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredPurchases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    {purchases.length === 0
                      ? 'No purchases recorded yet. Add medicines or click "New Purchase" above.'
                      : "No purchases match the selected search/filter criteria."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── VERIFY / EDIT PURCHASE MODAL ── */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              {verifyingPurchase?.status === "RECEIVED" ? (
                <>
                  <Pencil className="h-5 w-5 text-blue-600" /> Edit Purchase Invoice
                  <Badge variant="outline" className="ml-2 text-xs font-semibold text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/40">
                    Finalized Invoice — Safe Stock Correction
                  </Badge>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-amber-500" /> Verify Purchase Draft
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {verifyingPurchase?.status === "RECEIVED"
                ? "Update supplier, invoice details, medicine quantities, rates, batch or expiry. Stock differences are safely adjusted."
                : "Review and correct supplier, invoice details, medicine quantities, and rates before finalizing stock."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Supplier Name</Label>
              <Input
                value={verifySupplier}
                onChange={(e) => setVerifySupplier(e.target.value)}
                placeholder="Supplier Name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Invoice Number</Label>
              <Input
                value={verifyInvoiceNo}
                onChange={(e) => setVerifyInvoiceNo(e.target.value)}
                placeholder="e.g. INV-10025"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Invoice Date</Label>
              <Input
                type="date"
                value={verifyDate}
                onChange={(e) => setVerifyDate(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border overflow-hidden flex-1 overflow-y-auto min-h-[220px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>Medicine Name</TableHead>
                  <TableHead className="w-24">Batch</TableHead>
                  <TableHead className="w-24">Expiry</TableHead>
                  <TableHead className="w-20">MRP (₹)</TableHead>
                  <TableHead className="w-28 text-center">Stock (Units)</TableHead>
                  <TableHead className="w-24 text-right">P. Rate (₹)</TableHead>
                  <TableHead className="w-16 text-center">GST %</TableHead>
                  <TableHead className="w-24 text-right">Line Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {verifyRows.map((r, i) => {
                  const lineCalc = calculatePurchaseLine(r);
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={r.name}
                          onChange={(e) =>
                            setVerifyRows(
                              verifyRows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x))
                            )
                          }
                          placeholder="Medicine name"
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.batch}
                          onChange={(e) =>
                            setVerifyRows(
                              verifyRows.map((x, k) => (k === i ? { ...x, batch: e.target.value } : x))
                            )
                          }
                          placeholder="Batch"
                          className="h-8 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.expiry || ""}
                          onChange={(e) =>
                            setVerifyRows(
                              verifyRows.map((x, k) => (k === i ? { ...x, expiry: e.target.value } : x))
                            )
                          }
                          placeholder="YYYY-MM"
                          className="h-8 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={r.mrp || 0}
                          onChange={(e) =>
                            setVerifyRows(
                              verifyRows.map((x, k) =>
                                k === i ? { ...x, mrp: Number(e.target.value) } : x
                              )
                            )
                          }
                          className="h-8 text-xs text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={r.qty}
                          onChange={(e) =>
                            setVerifyRows(
                              verifyRows.map((x, k) =>
                                k === i ? { ...x, qty: Number(e.target.value) } : x
                              )
                            )
                          }
                          className="h-8 text-xs font-semibold text-center"
                        />
                        {lineCalc.packSize > 1 && (
                          <div className="text-[10px] text-muted-foreground text-center tabular-nums whitespace-nowrap mt-0.5">
                            {lineCalc.qtyPacks}p{lineCalc.extraQty > 0 ? ` + ${lineCalc.extraQty}u` : ""} (pack {lineCalc.packSize})
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.rate}
                          onChange={(e) =>
                            setVerifyRows(
                              verifyRows.map((x, k) =>
                                k === i ? { ...x, rate: Number(e.target.value) } : x
                              )
                            )
                          }
                          className="h-8 text-xs text-right tabular-nums"
                        />
                        {lineCalc.packSize > 1 && (
                          <div className="text-[10px] text-muted-foreground text-right tabular-nums whitespace-nowrap mt-0.5">
                            ₹{lineCalc.unitPurchaseRate.toFixed(2)}/u
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={28}
                          value={r.gst}
                          onChange={(e) =>
                            setVerifyRows(
                              verifyRows.map((x, k) =>
                                k === i ? { ...x, gst: Number(e.target.value) } : x
                              )
                            )
                          }
                          className="h-8 text-xs text-center"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-semibold">
                        ₹{lineCalc.lineTotal.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {verifyRows.length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setVerifyRows(verifyRows.filter((_, k) => k !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVerifyRows([...verifyRows, { ...EMPTY_ROW }])}
              disabled={updating}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Medicine Line
            </Button>
            <div className="text-sm font-medium">
              Invoice Total:{" "}
              <b className="text-lg tabular-nums text-primary font-bold">
                ₹{verifyInvoiceTotals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </b>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t mt-3 flex items-center justify-between">
            <Button variant="outline" onClick={() => setVerifyOpen(false)} disabled={updating}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant={verifyingPurchase?.status === "RECEIVED" ? "default" : "secondary"}
                className={verifyingPurchase?.status === "RECEIVED" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-medium" : ""}
                onClick={handleSaveVerifiedChanges}
                disabled={updating}
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : verifyingPurchase?.status === "RECEIVED" ? (
                  "Save Corrections & Adjust Stock"
                ) : (
                  "Save Draft"
                )}
              </Button>
              {verifyingPurchase?.status === "PENDING" && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  onClick={async () => {
                    if (verifyingPurchase) {
                      await handleSaveVerifiedChanges();
                      setPurchaseToConfirm(verifyingPurchase);
                      setConfirmOpen(true);
                    }
                  }}
                  disabled={updating}
                >
                  Proceed to Final Confirm
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── FINAL CONFIRMATION DIALOG (MODAL 2 WORKFLOW) ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Final Confirm Purchase
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to finalize this purchase? This will update the inventory stock
              accordingly.
            </DialogDescription>
          </DialogHeader>

          {purchaseToConfirm && (
            <div className="bg-muted/40 rounded-lg p-3.5 space-y-2 text-sm border my-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Supplier:</span>
                <span className="font-semibold text-foreground">{purchaseToConfirm.supplier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice No:</span>
                <span className="font-mono font-semibold text-foreground">
                  {purchaseToConfirm.invoiceNo}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items Count:</span>
                <span className="font-semibold text-foreground">
                  {purchaseToConfirm.items ? purchaseToConfirm.items.length : 0} lines
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground font-medium">Grand Total:</span>
                <span className="text-base font-bold text-primary tabular-nums">
                  ₹{purchaseToConfirm.total.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={finalizing}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              onClick={handleFinalConfirm}
              disabled={finalizing}
            >
              {finalizing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Finalizing…
                </>
              ) : (
                "Confirm Purchase"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── READ-ONLY VIEW PURCHASE MODAL ── */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Purchase Invoice Details
            </DialogTitle>
            <DialogDescription>
              Viewing finalized purchase record: {viewingPurchase?.invoiceNo}
            </DialogDescription>
          </DialogHeader>

          {viewingPurchase && (
            <div className="space-y-4 my-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3 rounded-lg border text-xs">
                <div>
                  <div className="text-muted-foreground">Supplier</div>
                  <div className="font-semibold text-sm">{viewingPurchase.supplier}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Invoice No</div>
                  <div className="font-mono font-semibold text-sm">{viewingPurchase.invoiceNo}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Date</div>
                  <div className="font-mono text-sm">{viewingPurchase.date}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div>
                    <Badge variant="outline" className="font-semibold text-emerald-600 border-emerald-500/30">
                      {viewingPurchase.status || "RECEIVED"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-md border overflow-hidden max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead>Medicine Name</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-center">Stock (Units)</TableHead>
                      <TableHead className="text-right">P. Rate</TableHead>
                      <TableHead className="text-center">GST %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewingPurchase.items || []).map((it, idx) => {
                      const lineCalc = calculatePurchaseLine(it);
                      return (
                        <TableRow key={idx} className="text-xs">
                          <TableCell className="font-medium">{it.name}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{it.batch || "—"}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{it.expiry || "—"}</TableCell>
                          <TableCell className="text-center font-semibold">
                            {lineCalc.totalStockUnits}
                            {lineCalc.packSize > 1 && (
                              <div className="text-[10px] text-muted-foreground font-normal">
                                {lineCalc.qtyPacks}p{lineCalc.extraQty > 0 ? ` + ${lineCalc.extraQty}u` : ""} (pack {lineCalc.packSize})
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₹{lineCalc.packPurchaseRate.toFixed(2)}
                            {lineCalc.packSize > 1 && (
                              <div className="text-[10px] text-muted-foreground">
                                (₹{lineCalc.unitPurchaseRate.toFixed(2)}/u)
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{lineCalc.gstPercent}%</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            ₹{lineCalc.lineTotal.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end text-sm font-semibold">
                Grand Total: <span className="text-primary font-bold ml-2">₹{viewingPurchase.total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NEW PURCHASE DIALOG ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>New Purchase Entry</DialogTitle>
            <DialogDescription>
              Record incoming supplier purchase invoice. Medicine stock is automatically synchronized.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Supplier <span className="text-destructive">*</span>
              </Label>
              <Input
                list="suppliers-list"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Select or enter supplier"
              />
              <datalist id="suppliers-list">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Invoice No <span className="text-destructive">*</span>
              </Label>
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-9042"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Purchase Date</Label>
              <Input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border overflow-hidden flex-1 overflow-y-auto min-h-[200px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Medicine Name</TableHead>
                  <TableHead className="w-28">Batch</TableHead>
                  <TableHead className="w-28 text-center">Stock (Units)</TableHead>
                  <TableHead className="w-24 text-right">P. Rate (₹)</TableHead>
                  <TableHead className="w-20 text-center">GST %</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        value={r.name}
                        onChange={(e) =>
                          setRows(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))
                        }
                        placeholder="e.g. Paracetamol 500mg"
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.batch}
                        onChange={(e) =>
                          setRows(rows.map((x, k) => (k === i ? { ...x, batch: e.target.value } : x)))
                        }
                        placeholder="e.g. B2401"
                        className="h-8 text-xs font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x))
                          )
                        }
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.rate}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, k) => (k === i ? { ...x, rate: Number(e.target.value) } : x))
                          )
                        }
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={28}
                        value={r.gst}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, k) => (k === i ? { ...x, gst: Number(e.target.value) } : x))
                          )
                        }
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      {rows.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setRows(rows.filter((_, k) => k !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRows([...rows, { ...EMPTY_ROW }])}
              disabled={saving}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Row
            </Button>
            <div className="text-sm font-medium">
              Grand Total:{" "}
              <b className="text-lg tabular-nums text-primary font-bold">₹{total.toFixed(2)}</b>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t mt-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-primary text-primary-foreground min-w-[130px]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                "Save Purchase"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRMATION DIALOG ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" /> Delete Purchase
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete purchase invoice{" "}
              <strong>{purchaseToDelete?.invoiceNo}</strong> from{" "}
              <strong>{purchaseToDelete?.supplier}</strong> (₹{purchaseToDelete?.total})? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              No, Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
