import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, Fragment } from "react";
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
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import type { Sale, SaleItem } from "@/lib/store";
import { cn } from "@/lib/utils";
import { getUser, CAN } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales-returns")({
  head: () => ({ meta: [{ title: "Sales Returns · RSP Medical Billing" }] }),
  component: SalesReturnsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ReturnLineState = {
  medicineId: string;
  medicineName: string;
  batch: string;
  expiry: string;
  unit: string;
  rate: number;          // unit MRP
  gst: number;
  originalQty: number;   // base units sold
  alreadyReturnedQty: number; // base units previously returned
  eligibleQty: number;   // originalQty - alreadyReturnedQty
  returnQty: number;     // base units to return (editable)
  isSaleable: boolean;   // restore stock if physically accepted
  selected: boolean;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function SalesReturnsPage() {
  const sales = useStore((s) => s.sales);
  const salesReturns = useStore((s) => s.salesReturns);
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);

  // Invoice search
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Return form state
  const [returnLines, setReturnLines] = useState<ReturnLineState[]>([]);
  const [refundMethod, setRefundMethod] = useState<"cash" | "online" | "credit">("cash");
  const [reason, setReason] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // History view
  const [historyQuery, setHistoryQuery] = useState("");
  const [expandedReturn, setExpandedReturn] = useState<string | null>(null);

  useEffect(() => {
    setMe(getUser());
    actions.syncSales();
    actions.syncSalesReturns();
  }, []);

  const canCreate = me ? (CAN[me.role]?.billing ?? true) : true;

  // ── Invoice search ──────────────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    const q = invoiceQuery.toLowerCase().trim();
    if (!q) return [];
    return sales
      .filter((s) => s.status !== "cancelled" && [s.id, s.customerName, s.phone].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [sales, invoiceQuery]);

  function selectSale(sale: Sale) {
    setSelectedSale(sale);
    setInvoiceQuery(sale.id);
    const prevReturns = salesReturns.filter((r) => r.originalSaleId === sale.id);

    // Build return lines from sale items with eligible quantity protection
    setReturnLines(
      (sale.items ?? []).map((it: SaleItem) => {
        const prevReturned = prevReturns.reduce((sum, r) => {
          const f = (r.items ?? []).find(
            (ri) =>
              (ri.medicineId && ri.medicineId === it.id) ||
              ((ri.medicineName || "").toLowerCase().trim() === (it.name || "").toLowerCase().trim() &&
                (ri.batch || "").toLowerCase().trim() === (it.batch || "").toLowerCase().trim())
          );
          return sum + (f ? Number(f.returnedQty) || 0 : 0);
        }, 0);
        const origQty = Number((it as any).totalUnits !== undefined ? (it as any).totalUnits : it.qty) || 0;
        const eligQty = Math.max(0, origQty - prevReturned);

        return {
          medicineId: it.id,
          medicineName: it.name,
          batch: it.batch,
          expiry: "",  // not stored on SaleItem — populated from medicines if available
          unit: (it as any).sellingUnit ?? "Units",
          rate: (it as any).unitMrp !== undefined ? Number((it as any).unitMrp) : Number(it.mrp),
          gst: Number(it.gst) || 0,
          originalQty: origQty,
          alreadyReturnedQty: prevReturned,
          eligibleQty: eligQty,
          returnQty: 0,
          isSaleable: true,
          selected: false,
        };
      }),
    );
    setReason("");
  }

  function toggleLine(idx: number) {
    setReturnLines((prev) =>
      prev.map((l, i) =>
        i === idx ? { ...l, selected: !l.selected, returnQty: l.selected ? 0 : Math.min(1, l.eligibleQty) } : l,
      ),
    );
  }

  function setReturnQty(idx: number, val: number) {
    setReturnLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const clamped = Math.max(0, Math.min(l.eligibleQty, val));
        return { ...l, returnQty: clamped, selected: clamped > 0 };
      }),
    );
  }

  function toggleSaleable(idx: number) {
    setReturnLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, isSaleable: !l.isSaleable } : l)),
    );
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const returnTotals = useMemo(() => {
    const lines = returnLines.filter((l) => l.selected && l.returnQty > 0);
    const sub = lines.reduce((s, l) => s + l.returnQty * l.rate, 0);
    const gst = lines.reduce((s, l) => {
      const taxable = (l.returnQty * l.rate) / (1 + l.gst / 100);
      return s + (l.returnQty * l.rate - taxable);
    }, 0);
    return { sub, gst, lines };
  }, [returnLines]);

  // ── Confirm & save ─────────────────────────────────────────────────────────
  async function handleConfirmReturn() {
    if (!selectedSale) return;
    if (returnTotals.lines.length === 0) {
      toast.error("Select at least one item and enter a return quantity.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please enter a return reason.");
      return;
    }
    setSaving(true);
    const { ret, error } = await actions.createSalesReturn(
      {
        originalSaleId: selectedSale.id,
        customerId: selectedSale.customerId,
        customerName: selectedSale.customerName,
        phone: selectedSale.phone ?? "",
        returnItems: returnTotals.lines.map((l) => ({
          medicineId: l.medicineId,
          medicineName: l.medicineName,
          batch: l.batch,
          expiry: l.expiry,
          returnedQty: l.returnQty,
          originalQty: l.originalQty,
          unit: l.unit,
          rate: l.rate,
          gst: l.gst,
          returnAmount: +(l.returnQty * l.rate).toFixed(2),
          isSaleable: l.isSaleable,
        })),
        reason: `${reason.trim()} · [Refund: ${refundMethod.toUpperCase()}]`,
      },
      me ? { id: me.id, name: me.name } : undefined,
    );
    setSaving(false);
    if (error) {
      toast.error(`Return failed: ${error}`);
    } else {
      toast.success(`Return ${ret.returnNo} recorded · ₹${ret.returnAmount.toFixed(2)} · Refund: ${refundMethod.toUpperCase()}`);
      setCreateOpen(false);
      setSelectedSale(null);
      setInvoiceQuery("");
      setReturnLines([]);
      setReason("");
    }
  }

  // ── History ─────────────────────────────────────────────────────────────────
  const filteredReturns = useMemo(() => {
    const q = historyQuery.toLowerCase().trim();
    if (!q) return salesReturns;
    return salesReturns.filter((r) =>
      [r.returnNo, r.originalSaleId, r.customerName, r.phone].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [salesReturns, historyQuery]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" /> Sales Returns
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Process customer returns from completed invoices. Stock is restored by exact base-unit count.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <RefreshCcw className="h-4 w-4" /> New Return
          </Button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Returns</div>
          <div className="text-2xl font-semibold">{salesReturns.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Returned Value</div>
          <div className="text-2xl font-semibold text-primary">
            ₹{salesReturns.reduce((s, r) => s + (Number(r.returnAmount) || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">GST Refund Amount</div>
          <div className="text-2xl font-semibold text-amber-600">
            ₹{salesReturns.reduce((s, r) => s + (Number(r.gstAmount) || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </Card>
      </div>

      {/* Return history */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-semibold">Return History</div>
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Search return no, invoice, customer…"
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Original Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Return Amt</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReturns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No returns recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {filteredReturns.map((r) => {
                const dateStr = (() => {
                  try {
                    return r.returnDate ? new Date(r.returnDate).toLocaleString("en-IN") : "—";
                  } catch {
                    return r.returnDate || "—";
                  }
                })();
                const retAmt = Number(r.returnAmount) || 0;
                const gstAmt = Number(r.gstAmount) || 0;
                const itemsCount = (r.items ?? []).length;

                return (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedReturn(expandedReturn === r.id ? null : r.id)}>
                      <TableCell className="font-medium">{r.returnNo}</TableCell>
                      <TableCell className="text-sm">{dateStr}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{r.originalSaleId}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.customerName || "Walk-in"}</div>
                        <div className="text-xs text-muted-foreground">{r.phone || "walk-in"}</div>
                      </TableCell>
                      <TableCell>{itemsCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{r.reason || "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-destructive">
                        ₹{retAmt.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600 text-sm">
                        ₹{gstAmt.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {expandedReturn === r.id
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                    </TableRow>
                    {expandedReturn === r.id && (
                      <TableRow key={`${r.id}_expanded`} className="bg-muted/30">
                        <TableCell colSpan={9} className="p-0">
                          <div className="px-6 py-3">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">
                              Processed by: {r.processedByName || r.processedBy || "—"}
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Medicine</TableHead>
                                  <TableHead>Batch</TableHead>
                                  <TableHead className="text-center">Original Qty</TableHead>
                                  <TableHead className="text-center">Returned Qty</TableHead>
                                  <TableHead>Unit</TableHead>
                                  <TableHead className="text-right">Rate</TableHead>
                                  <TableHead className="text-center">GST%</TableHead>
                                  <TableHead className="text-right">Return Amt</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(r.items ?? []).map((it, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-medium">{it.medicineName || "—"}</TableCell>
                                    <TableCell className="font-mono text-xs">{it.batch || "—"}</TableCell>
                                    <TableCell className="text-center">{it.originalQty ?? 0}</TableCell>
                                    <TableCell className="text-center font-semibold text-destructive">{it.returnedQty ?? 0}</TableCell>
                                    <TableCell className="text-xs">{it.unit || "Units"}</TableCell>
                                    <TableCell className="text-right tabular-nums">₹{Number(it.rate || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-center">{it.gst ?? 0}%</TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums">₹{Number(it.returnAmount || 0).toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Create Return Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(v) => {
        setCreateOpen(v);
        if (!v) { setSelectedSale(null); setInvoiceQuery(""); setReturnLines([]); setReason(""); }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" /> New Customer Sales Return
            </DialogTitle>
            <DialogDescription>
              Select the original invoice, choose items to return, enter quantities in base units, and confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Step 1: Invoice search */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Step 1 — Search Invoice</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Type invoice no, customer name or phone…"
                  value={invoiceQuery}
                  onChange={(e) => { setInvoiceQuery(e.target.value); setSelectedSale(null); setReturnLines([]); }}
                />
              </div>
              {!selectedSale && filteredSales.length > 0 && (
                <div className="rounded-lg border bg-card divide-y mt-1">
                  {filteredSales.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectSale(s)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted text-left text-sm"
                    >
                      <div>
                        <span className="font-semibold font-mono">{s.id}</span>
                        <span className="ml-2 text-muted-foreground">{s.customerName}</span>
                        {s.phone && <span className="ml-1.5 text-muted-foreground text-xs">· {s.phone}</span>}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">₹{Number(s.grand || 0).toLocaleString("en-IN")}</div>
                        <div className="text-xs text-muted-foreground">
                          {(() => {
                            try {
                              return s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—";
                            } catch {
                              return s.date || "—";
                            }
                          })()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedSale && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold font-mono text-primary">{selectedSale.id}</span>
                    <span className="ml-2 font-medium">{selectedSale.customerName || "Walk-in"}</span>
                    <span className="ml-1.5 text-muted-foreground text-xs">
                      · {(() => {
                        try {
                          return selectedSale.date ? new Date(selectedSale.date).toLocaleDateString("en-IN") : "—";
                        } catch {
                          return selectedSale.date || "—";
                        }
                      })()}
                    </span>
                  </div>
                  <div className="font-semibold">₹{Number(selectedSale.grand || 0).toLocaleString("en-IN")}</div>
                </div>
              )}
            </div>

            {/* Step 2: Select items & enter qty */}
            {selectedSale && returnLines.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Step 2 — Select Items & Enter Return Quantity (Base Units)</Label>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 text-xs">
                        <TableHead className="w-10" />
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-center">Sold</TableHead>
                        <TableHead className="text-center">Eligible</TableHead>
                        <TableHead className="text-center">Return Qty</TableHead>
                        <TableHead className="text-center">Restock?</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Return Amt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnLines.map((line, idx) => {
                        const amt = line.returnQty * line.rate;
                        return (
                          <TableRow
                            key={idx}
                            className={cn(line.selected && "bg-primary/5", "text-xs")}
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={line.selected}
                                onChange={() => toggleLine(idx)}
                                disabled={line.eligibleQty <= 0}
                                className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{line.medicineName}</div>
                              <div className="text-xs text-muted-foreground">GST {line.gst}%</div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{line.batch || "—"}</TableCell>
                            <TableCell className="text-center font-mono">
                              {line.originalQty} <span className="text-[10px] text-muted-foreground">{line.unit}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={line.eligibleQty > 0 ? "secondary" : "outline"} className="font-mono text-xs">
                                {line.eligibleQty}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min={0}
                                max={line.eligibleQty}
                                value={line.returnQty || ""}
                                placeholder="0"
                                disabled={line.eligibleQty <= 0}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setReturnQty(idx, parseInt(e.target.value, 10) || 0)}
                                className="h-8 w-16 mx-auto text-center text-xs font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                checked={line.isSaleable}
                                onChange={() => toggleSaleable(idx)}
                                title="Check to restock into inventory"
                                className="h-4 w-4 rounded border-gray-300 text-emerald-600 cursor-pointer"
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              ₹{line.rate.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-xs text-destructive">
                              {line.returnQty > 0 ? `₹${amt.toFixed(2)}` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals summary */}
                {returnTotals.lines.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Return Sub-Total</span>
                      <span className="font-medium tabular-nums">₹{returnTotals.sub.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST (Included)</span>
                      <span className="tabular-nums text-amber-600">₹{returnTotals.gst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Total Return Amount</span>
                      <span className="text-destructive tabular-nums">₹{returnTotals.sub.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Refund Method and Reason */}
            {selectedSale && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Refund Method *</Label>
                  <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as any)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select refund mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash Refund</SelectItem>
                      <SelectItem value="online">Online / UPI Refund</SelectItem>
                      <SelectItem value="credit">Credit Note / Ledger Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="return-reason" className="text-xs font-semibold">Return Reason *</Label>
                  <Input
                    id="return-reason"
                    placeholder="e.g. Damaged, Expired, Wrong medicine, Customer changed mind…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Warning */}
            {selectedSale && returnTotals.lines.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  Processing refund of <strong>₹{returnTotals.sub.toFixed(2)}</strong> via <strong>{refundMethod.toUpperCase()}</strong>.
                  {returnTotals.lines.some((l) => l.isSaleable) ? (
                    <> Stock will be restored for accepted saleable items.</>
                  ) : (
                    <> Stock will not be restored (marked damaged/unsaleable).</>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleConfirmReturn}
              disabled={saving || !selectedSale || returnTotals.lines.length === 0 || !reason.trim()}
              className="gap-1.5"
            >
              {saving ? "Saving…" : (
                <><RotateCcw className="h-4 w-4" /> Confirm Return · ₹{returnTotals.sub.toFixed(2)}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
