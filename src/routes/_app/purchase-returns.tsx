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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, RefreshCcw, RotateCcw, ChevronDown, ChevronUp, Trash2, AlertCircle,
  Truck, ArrowDownLeft, CheckCircle2,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import type { Purchase, PurchaseReturn } from "@/lib/store";
import { cn } from "@/lib/utils";
import { getUser, CAN } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/purchase-returns")({
  head: () => ({ meta: [{ title: "Purchase Returns · RSP Medical Billing" }] }),
  component: PurchaseReturnsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ReturnItemState = {
  medicineId: string;
  medicineName: string;
  batch: string;
  expiry: string;
  originalQty: number; // qty from purchase
  alreadyReturnedQty: number; // qty already returned previously
  returnableQty: number; // originalQty - alreadyReturnedQty
  currentStock: number; // stock currently on hand
  returnQty: number;
  purchaseRate: number;
  gst: number;
  selected: boolean;
};

const COMMON_REASONS = [
  "Near Expiry / Expired",
  "Damaged Goods",
  "Batch Recall / Defect",
  "Wrong Medicine Supplied",
  "Excess Stock / Overstocked",
  "Price Discrepancy",
];

// ─── Component ────────────────────────────────────────────────────────────────

function PurchaseReturnsPage() {
  const purchases = useStore((s) => s.purchases);
  const purchaseReturns = useStore((s) => s.purchaseReturns);
  const medicines = useStore((s) => s.medicines);
  const suppliers = useStore((s) => s.suppliers);
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);

  // Search & Filter State for Return History
  const [historySearch, setHistorySearch] = useState("");
  const [historySupplierFilter, setHistorySupplierFilter] = useState("all");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [expandedReturn, setExpandedReturn] = useState<string | null>(null);

  // Create Return Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMe(getUser());
    actions.syncPurchases();
    actions.syncPurchaseReturns();
    actions.syncMedicines();
    actions.syncSuppliers();
  }, []);

  const canCreate = me ? (CAN[me.role]?.purchase ?? true) : true;

  // Selected supplier object
  const activeSupplier = useMemo(() => {
    if (!selectedSupplierId) return null;
    return (
      suppliers.find((s) => s.id === selectedSupplierId || s.name === selectedSupplierId) || null
    );
  }, [suppliers, selectedSupplierId]);

  // Invoices filtered STRICTLY by selected supplier
  const supplierInvoices = useMemo(() => {
    if (!selectedSupplierId) return [];
    const supName = activeSupplier ? activeSupplier.name.toLowerCase().trim() : selectedSupplierId.toLowerCase().trim();

    return purchases.filter((p) => {
      const matchSup =
        (p.supplierId && p.supplierId === selectedSupplierId) ||
        (p.supplier && p.supplier.toLowerCase().trim() === supName);
      if (!matchSup) return false;

      // Also filter by invoice search query if provided
      const q = invoiceSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        (p.invoiceNo && p.invoiceNo.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q))
      );
    });
  }, [purchases, selectedSupplierId, activeSupplier, invoiceSearchQuery]);

  // Select an invoice from the supplier's list
  function handleSelectPurchase(p: Purchase) {
    setSelectedPurchase(p);

    // Calculate lines with already returned qty tracked from existing purchaseReturns
    const lines: ReturnItemState[] = (p.items || []).map((it) => {
      const med =
        medicines.find(
          (m) =>
            m.name.toLowerCase() === it.name.toLowerCase() &&
            (!it.batch || m.batch.toLowerCase() === it.batch.toLowerCase())
        ) || medicines.find((m) => m.name.toLowerCase() === it.name.toLowerCase());

      const origQty = Number(it.qty) || 0;

      // Sum units of this medicine already returned from this invoice
      const alreadyReturned = purchaseReturns
        .filter(
          (pr) =>
            pr.originalPurchaseId === p.invoiceNo ||
            pr.originalPurchaseId === p.id
        )
        .flatMap((pr) => pr.items || [])
        .filter(
          (retIt) =>
            (med && retIt.medicineId === med.id) ||
            (retIt.medicineName.toLowerCase() === it.name.toLowerCase() &&
              (!it.batch || retIt.batch === it.batch))
        )
        .reduce((sum, retIt) => sum + (Number(retIt.returnedQty) || 0), 0);

      const returnable = Math.max(0, origQty - alreadyReturned);

      return {
        medicineId: med?.id || "",
        medicineName: it.name,
        batch: it.batch || med?.batch || "",
        expiry: it.expiry || med?.expiry || "",
        originalQty: origQty,
        alreadyReturnedQty: alreadyReturned,
        returnableQty: returnable,
        currentStock: Number(med?.stock) || 0,
        returnQty: 0,
        purchaseRate: Number(it.rate) || 0,
        gst: Number(it.gst) || 0,
        selected: false,
      };
    });

    setReturnItems(lines);
    setReason("");
  }

  function toggleItem(index: number) {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const nextSel = !item.selected;
        const maxCanReturn = Math.min(item.returnableQty, item.currentStock);
        return {
          ...item,
          selected: nextSel,
          returnQty: nextSel && item.returnQty === 0 ? Math.min(1, maxCanReturn) : item.returnQty,
        };
      })
    );
  }

  function setQty(index: number, val: number) {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const maxCanReturn = Math.min(item.returnableQty, item.currentStock);
        const clamped = Math.max(0, Math.min(val, maxCanReturn));
        return {
          ...item,
          returnQty: clamped,
          selected: clamped > 0,
        };
      })
    );
  }

  // ── Return totals calculation ──────────────────────────────────────────────
  const activeReturns = useMemo(() => {
    const selected = returnItems.filter((it) => it.selected && it.returnQty > 0);
    const subTotal = selected.reduce((sum, it) => sum + it.returnQty * it.purchaseRate, 0);
    const gstTotal = selected.reduce(
      (sum, it) => sum + it.returnQty * it.purchaseRate * (it.gst / 100),
      0
    );
    const grandTotal = subTotal + gstTotal;
    return { items: selected, subTotal, gstTotal, grandTotal };
  }, [returnItems]);

  // ── Confirm Return Action ──────────────────────────────────────────────────
  async function handleConfirmReturn() {
    if (!selectedPurchase) return toast.error("Please select an original invoice");
    if (activeReturns.items.length === 0) return toast.error("Select at least one item to return");
    if (!reason.trim()) return toast.error("Please provide a return reason");

    // Validation: return quantity must never exceed eligible purchased / returnable quantity
    for (const it of activeReturns.items) {
      if (it.returnQty > it.returnableQty) {
        return toast.error(
          `Return quantity for ${it.medicineName} (${it.returnQty}) cannot exceed remaining returnable quantity (${it.returnableQty})!`
        );
      }
      if (it.returnQty > it.currentStock) {
        return toast.error(
          `Cannot return ${it.returnQty} units of ${it.medicineName}. Only ${it.currentStock} in stock!`
        );
      }
    }

    setSaving(true);
    try {
      const res = await actions.createPurchaseReturn(
        {
          originalPurchaseId: selectedPurchase.invoiceNo || selectedPurchase.id,
          supplierId: selectedPurchase.supplierId ?? null,
          supplierName: selectedPurchase.supplier,
          returnItems: activeReturns.items.map((it) => ({
            medicineId: it.medicineId,
            medicineName: it.medicineName,
            batch: it.batch,
            expiry: it.expiry,
            returnedQty: it.returnQty,
            originalQty: it.originalQty,
            purchaseRate: it.purchaseRate,
            gst: it.gst,
            returnAmount: +(it.returnQty * it.purchaseRate * (1 + it.gst / 100)).toFixed(2),
          })),
          reason: reason.trim(),
        },
        me ? { id: me.id, name: me.name } : undefined
      );

      if (res.error && !res.permissionDenied) {
        toast.error(`Purchase return could not be saved: ${res.error}`);
        return;
      }

      if (res.permissionDenied) {
        toast.warning(
          `Purchase Return ${res.ret.returnNo} recorded & stock deducted! (Notice: Run Supabase SQL grant for table purchase_returns)`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Purchase Return ${res.ret.returnNo} processed! Stock updated ✓`);
      }

      setCreateOpen(false);
      setSelectedSupplierId("");
      setSelectedPurchase(null);
      setInvoiceSearchQuery("");
      setReturnItems([]);
      setReason("");
      actions.syncMedicines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to process return");
    } finally {
      setSaving(false);
    }
  }

  // ── History Filter ─────────────────────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    return purchaseReturns.filter((r) => {
      // Supplier filter
      if (historySupplierFilter !== "all") {
        const matchesSupplier =
          r.supplierId === historySupplierFilter ||
          (r.supplierName &&
            r.supplierName.toLowerCase().trim() === historySupplierFilter.toLowerCase().trim());
        if (!matchesSupplier) return false;
      }

      // Date filter
      if (historyDateFilter && r.returnDate) {
        if (!r.returnDate.startsWith(historyDateFilter)) return false;
      }

      // Search: Invoice, Supplier, Medicine Name, Batch, Return #, Reason
      if (!q) return true;

      const basicMatch =
        (r.returnNo && r.returnNo.toLowerCase().includes(q)) ||
        (r.supplierName && r.supplierName.toLowerCase().includes(q)) ||
        (r.originalPurchaseId && r.originalPurchaseId.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q));

      const itemMatch = (r.items || []).some(
        (it) =>
          (it.medicineName && it.medicineName.toLowerCase().includes(q)) ||
          (it.batch && it.batch.toLowerCase().includes(q))
      );

      return basicMatch || itemMatch;
    });
  }, [purchaseReturns, historySearch, historySupplierFilter, historyDateFilter]);

  // KPIs
  const totalReturnValue = purchaseReturns.reduce((s, r) => s + (Number(r.returnAmount) || 0), 0);
  const totalReturnGst = purchaseReturns.reduce((s, r) => s + (Number(r.gstAmount) || 0), 0);
  const totalReturnCount = purchaseReturns.length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" /> Supplier Purchase Returns
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Return stock to suppliers, generate debit notes, and automatically update inventory.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.syncPurchaseReturns()}
            className="gap-1.5"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
          {canCreate && (
            <Button
              size="sm"
              onClick={() => {
                setCreateOpen(true);
                setSelectedSupplierId("");
                setSelectedPurchase(null);
                setInvoiceSearchQuery("");
                setReturnItems([]);
                setReason("");
              }}
              className="gap-1.5 shadow-sm bg-primary text-primary-foreground"
            >
              <RotateCcw className="h-4 w-4" /> New Purchase Return
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI Summary Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-card/60 backdrop-blur border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Returns
            </span>
            <RotateCcw className="h-4 w-4 text-primary opacity-80" />
          </div>
          <div className="mt-2 text-2xl font-bold">{totalReturnCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Processed supplier return vouchers</div>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Return Value (Debit Total)
            </span>
            <ArrowDownLeft className="h-4 w-4 text-emerald-600 opacity-80" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">
            ₹{totalReturnValue.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Total credit receivable from suppliers</div>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Reversed GST
            </span>
            <AlertCircle className="h-4 w-4 text-amber-500 opacity-80" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 tabular-nums">
            ₹{totalReturnGst.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Input tax credit adjustments</div>
        </Card>
      </div>

      {/* ── Search Bar & History Table ───────────────────────────────────────── */}
      <Card className="overflow-hidden border shadow-sm">
        <div className="p-3.5 bg-muted/40 border-b flex items-center justify-between flex-wrap gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-2xl">
            {/* Search Query */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search Return #, Supplier, Invoice, Medicine, Batch…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            {/* Supplier Filter */}
            <div>
              <Select value={historySupplierFilter} onValueChange={setHistorySupplierFilter}>
                <SelectTrigger className="h-9 text-xs bg-background">
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

            {/* Date Filter */}
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={historyDateFilter}
                onChange={(e) => setHistoryDateFilter(e.target.value)}
                className="h-9 text-xs bg-background"
              />
              {historyDateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoryDateFilter("")}
                  className="h-9 px-2 text-xs text-muted-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Showing {filteredHistory.length} of {purchaseReturns.length} return records
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-28">Return #</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Original Invoice</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead className="text-right">Return Amt</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No supplier purchase returns found matching filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredHistory.map((ret) => {
                  const isExpanded = expandedReturn === ret.id;
                  const totalUnits = (ret.items || []).reduce((s, it) => s + (it.returnedQty || 0), 0);
                  return (
                    <>
                      <TableRow key={ret.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          {ret.returnNo}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {ret.returnDate ? ret.returnDate.slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          <div className="flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{ret.supplierName || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {ret.originalPurchaseId || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[11px] font-medium">
                            {ret.items?.length || 0} meds · {totalUnits} units
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm tabular-nums text-foreground">
                          ₹{Number(ret.returnAmount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          ₹{Number(ret.gstAmount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={ret.reason}>
                          {ret.reason || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground"
                              title="Toggle Items"
                              onClick={() => setExpandedReturn(isExpanded ? null : ret.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              title="Delete Record"
                              onClick={async () => {
                                if (confirm(`Delete Purchase Return ${ret.returnNo}? (Note: Stock is not re-added)`)) {
                                  const res = await actions.deletePurchaseReturn(
                                    ret.id,
                                    me ? { id: me.id, name: me.name } : undefined
                                  );
                                  if (res?.error) toast.error(res.error);
                                  else toast.success("Return record removed");
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded row with returned item details */}
                      {isExpanded && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={9} className="p-3">
                            <div className="rounded border bg-background/80 p-3 space-y-2">
                              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground border-b pb-1.5">
                                <span>Returned Items Breakdown</span>
                                <span>Processed by: {ret.processedByName || "Admin"}</span>
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow className="text-[11px] text-muted-foreground">
                                    <TableHead>Medicine Name</TableHead>
                                    <TableHead>Batch</TableHead>
                                    <TableHead className="text-center">Returned Qty (Units)</TableHead>
                                    <TableHead className="text-right">P. Rate</TableHead>
                                    <TableHead className="text-center">GST %</TableHead>
                                    <TableHead className="text-right">Total Debit</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(ret.items || []).map((it, idx) => (
                                    <TableRow key={idx} className="text-xs">
                                      <TableCell className="font-medium">{it.medicineName}</TableCell>
                                      <TableCell className="font-mono text-muted-foreground">{it.batch || "—"}</TableCell>
                                      <TableCell className="text-center font-semibold">{it.returnedQty}</TableCell>
                                      <TableCell className="text-right tabular-nums">₹{it.purchaseRate?.toFixed(2)}</TableCell>
                                      <TableCell className="text-center">{it.gst}%</TableCell>
                                      <TableCell className="text-right font-semibold tabular-nums text-foreground">
                                        ₹{it.returnAmount?.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Create Purchase Return Dialog ───────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <RotateCcw className="h-5 w-5 text-primary" /> Create Supplier Purchase Return
            </DialogTitle>
            <DialogDescription>
              Select supplier first, pick their original invoice, enter return quantities (up to available
              limit), and finalize debit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Step 1: Select Supplier First (Section 18 requirement) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Step 1 — Select Supplier <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedSupplierId}
                onValueChange={(val) => {
                  setSelectedSupplierId(val);
                  setSelectedPurchase(null);
                  setInvoiceSearchQuery("");
                  setReturnItems([]);
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Choose Supplier to begin return..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id || s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Search and Select Invoice belonging STRICTLY to Selected Supplier */}
            {selectedSupplierId && (
              <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    Step 2 — Select Supplier Invoice <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Invoices found: <strong>{supplierInvoices.length}</strong>
                  </span>
                </div>

                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search invoice number from this supplier..."
                    value={invoiceSearchQuery}
                    onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                    className="pl-9 h-8 text-xs bg-background"
                  />
                </div>

                {/* Invoices List for Selected Supplier */}
                <div className="border rounded-md mt-1 divide-y max-h-40 overflow-y-auto bg-background">
                  {supplierInvoices.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No invoices found for this supplier.
                    </div>
                  ) : (
                    supplierInvoices.map((p) => {
                      const isSelected = selectedPurchase?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectPurchase(p)}
                          className={cn(
                            "w-full text-left p-2.5 transition-colors flex items-center justify-between text-xs",
                            isSelected
                              ? "bg-primary/10 border-l-4 border-primary"
                              : "hover:bg-muted/60"
                          )}
                        >
                          <div>
                            <div className="font-semibold text-foreground">
                              Invoice: {p.invoiceNo || p.id}
                            </div>
                            <div className="text-muted-foreground text-[11px]">
                              Date: {p.date} · Items: {p.items?.length || 0}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-foreground">₹{p.total.toLocaleString("en-IN")}</div>
                            {isSelected && (
                              <Badge className="bg-primary/20 text-primary text-[10px] h-4">Selected</Badge>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Select Medicines & Enter Return Quantities */}
            {selectedPurchase && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    Step 3 — Select Medicines & Enter Return Quantities
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Invoice: <strong className="text-foreground">{selectedPurchase.invoiceNo}</strong>
                  </span>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="text-xs">
                        <TableHead className="w-10" />
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-center">Purchased</TableHead>
                        <TableHead className="text-center">Already Ret.</TableHead>
                        <TableHead className="text-center">Returnable</TableHead>
                        <TableHead className="text-center">In Stock</TableHead>
                        <TableHead className="text-center w-28">Return Qty (Units)</TableHead>
                        <TableHead className="text-right">P. Rate</TableHead>
                        <TableHead className="text-right">Total Debit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnItems.map((item, idx) => {
                        const lineDebit = item.returnQty * item.purchaseRate * (1 + item.gst / 100);
                        const maxAllowed = Math.min(item.returnableQty, item.currentStock);
                        const isExhausted = item.returnableQty <= 0;

                        return (
                          <TableRow
                            key={idx}
                            className={cn(item.selected && "bg-primary/5", isExhausted && "opacity-50")}
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={item.selected}
                                disabled={maxAllowed <= 0}
                                onChange={() => toggleItem(idx)}
                                className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer disabled:opacity-40"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-xs">{item.medicineName}</div>
                              <div className="text-[10px] text-muted-foreground">GST {item.gst}%</div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.batch || "—"}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{item.originalQty}</TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">
                              {item.alreadyReturnedQty}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs font-semibold text-emerald-600">
                              {item.returnableQty}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              <Badge
                                variant={item.currentStock > 0 ? "outline" : "destructive"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {item.currentStock}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min={0}
                                max={maxAllowed}
                                disabled={maxAllowed <= 0}
                                value={item.returnQty || ""}
                                placeholder="0"
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setQty(idx, parseInt(e.target.value, 10) || 0)}
                                className="h-8 w-16 mx-auto text-center text-xs font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              ₹{item.purchaseRate.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-xs tabular-nums text-foreground">
                              {item.returnQty > 0 ? `₹${lineDebit.toFixed(2)}` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Return Totals Summary */}
                {activeReturns.items.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Items to Return</span>
                      <span className="font-medium text-foreground">
                        {activeReturns.items.length} item(s) · {activeReturns.items.reduce((s, it) => s + it.returnQty, 0)} units
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Sub-Total (Taxable)</span>
                      <span className="font-medium tabular-nums">₹{activeReturns.subTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>GST Reversal</span>
                      <span className="tabular-nums text-amber-600 font-medium">₹{activeReturns.gstTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-sm border-t pt-1.5 text-foreground">
                      <span>Total Debit Amount</span>
                      <span className="tabular-nums text-primary">₹{activeReturns.grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Return Reason */}
            {selectedPurchase && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Step 4 — Return Reason</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                        reason === r
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 hover:bg-muted text-muted-foreground"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="Specify or customize reason (e.g. Broken ampoules, near expiry return)..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* Inventory impact notice */}
            {selectedPurchase && activeReturns.items.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  Stock will be <strong>reduced by {activeReturns.items.reduce((s, it) => s + it.returnQty, 0)} base units</strong> across {activeReturns.items.length} medicine(s).
                  The original purchase invoice will remain intact for audit records.
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmReturn}
              disabled={saving || !selectedPurchase || activeReturns.items.length === 0 || !reason.trim()}
              className="gap-1.5 bg-primary text-primary-foreground"
            >
              {saving ? "Processing…" : (
                <>
                  <RotateCcw className="h-4 w-4" /> Confirm Return · ₹{activeReturns.grandTotal.toFixed(2)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
