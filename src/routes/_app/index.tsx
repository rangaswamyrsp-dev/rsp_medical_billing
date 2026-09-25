import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Search, ScanBarcode, Plus, Trash2, Save, Printer, PauseCircle, X,
  Percent, Keyboard, User, Phone, Stethoscope, UserCheck, PlayCircle, ReceiptText, Minus,
  Banknote, Smartphone, GitFork, History, Star, ShoppingBag, Gift, CreditCard, IndianRupee,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import type { Medicine } from "@/data/medicines";
import { cn } from "@/lib/utils";
import { actions, useStore, useHydrated, type Sale } from "@/lib/store";
import { printReceipt } from "@/lib/print";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { getUser } from "@/lib/auth";
import { useTenant, useFeatures, TYPE_COPY } from "@/lib/tenant";
import {
  parsePackInfo,
  calculateUnitMrp,
  calculateTotalUnits,
  formatStockBreakdown,
} from "@/lib/medicine-units";

export const Route = createFileRoute("/_app/")({
  // v2.1: Numeric inputs, total bill discount, held bill in search bar
  head: () => ({
    meta: [
      { title: "Billing · RSP Billing Software" },
      { name: "description", content: "Fast keyboard-driven billing counter for your business." },
      { property: "og:title", content: "Billing · RSP Billing Software" },
      { property: "og:description", content: "Fast keyboard-driven billing counter for your business." },
    ],
  }),
  component: BillingPage,
});

type LineItem = Medicine & {
  qty: number; // total units billed
  discount: number;
  packQty?: number;
  looseQty?: number;
  packSize?: number;
  isConvertible?: boolean;
  unitMrp?: number;
  packLabel?: string;
  unitLabel?: string;
};

// ── Payment types ────────────────────────────────────────────────────────────
type PayMode = "cash" | "online" | "split" | "loan";
type SplitAmounts = { cash: number; online: number };

function invoiceNo() {
  return "INV" + Math.floor(10000 + Math.random() * 89999);
}

// ── Split Payment Dialog ─────────────────────────────────────────────────────
function SplitDialog({
  open, grand, onClose, onConfirm,
}: {
  open: boolean;
  grand: number;
  onClose: () => void;
  onConfirm: (s: SplitAmounts) => void;
}) {
  const [cashAmt, setCashAmt] = useState("");
  const cash = Number(cashAmt) || 0;
  const online = Math.max(0, grand - cash);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4 border">
        <div className="flex items-center gap-2">
          <GitFork className="h-5 w-5 text-primary" />
          <div className="font-semibold text-lg">Split Payment</div>
        </div>
        <div className="bg-muted/60 rounded-lg px-4 py-2 text-center">
          <span className="text-xs text-muted-foreground">Grand Total</span>
          <div className="text-2xl font-bold text-primary tabular-nums">
            ₹{grand.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> Cash Amount
            </Label>
            <Input
              autoFocus
              type="number"
              min={0}
              max={grand}
              placeholder="₹ 0"
              value={cashAmt}
              onChange={(e) => setCashAmt(e.target.value)}
              className="text-lg h-11 tabular-nums"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5">
            <span className="text-sm flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-primary" /> Online / UPI
            </span>
            <span className="font-semibold tabular-nums text-primary">
              ₹{online.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={() => { onConfirm({ cash, online }); onClose(); }}>
            Confirm Split
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Clear Loan / Repayment Dialog (used from Billing page) ────────────────
function ClearLoanDialog({
  open,
  onClose,
  customerId,
  customerName,
  customerPhone,
  outstanding,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerPhone: string;
  outstanding: number;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setAmount(""); setNote(""); };

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid repayment amount");
    if (amt > outstanding) {
      if (!confirm(`Payment ₹${amt} exceeds outstanding ₹${outstanding}. Continue?`)) return;
    }
    setSaving(true);
    try {
      const { error } = await actions.recordLoanRepayment(
        customerId, amt, note.trim() || "Repayment received from billing",
      );
      if (error) {
        toast.error(`Repayment error: ${error}`);
      } else {
        const newBalance = Math.max(0, outstanding - amt);
        toast.success(
          newBalance <= 0
            ? `₹${amt.toLocaleString("en-IN")} cleared — loan fully settled!`
            : `₹${amt.toLocaleString("en-IN")} recorded. Remaining: ₹${newBalance.toLocaleString("en-IN")}`,
        );
        reset();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && (reset(), onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <IndianRupee className="h-5 w-5" /> Record Loan Repayment
          </DialogTitle>
          <DialogDescription>
            Record payment from <strong>{customerName}</strong> ({customerPhone}) towards outstanding loan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <span className="text-amber-700 font-medium">Outstanding Balance: </span>
            <span className="font-bold text-amber-800">₹{outstanding.toLocaleString("en-IN")}</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Payment Amount (₹) *</Label>
              <Input
                type="number" min={1} max={outstanding}
                placeholder={`Max ₹${outstanding.toLocaleString("en-IN")}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Note <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="e.g. Cash payment received"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={save}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Recording…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Customer History Panel ────────────────────────────────────────────────────
function CustomerHistoryPanel({ customerId, onAddDiscount }: {
  customerId: string;
  onAddDiscount: (pct: number) => void;
}) {
  const sales = useStore((s) => s.sales);
  const custSales = useMemo(
    () => sales
      .filter((s) => s.customerId === customerId && s.status === "paid")
      .sort((a, b) => b.date.localeCompare(a.date)),
    [sales, customerId],
  );

  const totalSpend = custSales.reduce((s, sale) => s + sale.grand, 0);
  const totalVisits = custSales.length;

  const productCount: Record<string, { name: string; count: number; total: number }> = {};
  for (const sale of custSales) {
    for (const it of sale.items) {
      if (!productCount[it.id]) productCount[it.id] = { name: it.name, count: 0, total: 0 };
      productCount[it.id].count += it.qty;
      productCount[it.id].total += it.total;
    }
  }
  const topProducts = Object.values(productCount).sort((a, b) => b.count - a.count).slice(0, 4);

  const loyaltyTier =
    totalSpend >= 10000
      ? { label: "Gold", color: "text-yellow-600 bg-yellow-50 border-yellow-200", pct: 10 }
      : totalSpend >= 5000
        ? { label: "Silver", color: "text-slate-600 bg-slate-50 border-slate-200", pct: 7 }
        : totalSpend >= 2000
          ? { label: "Bronze", color: "text-orange-600 bg-orange-50 border-orange-200", pct: 5 }
          : null;

  if (custSales.length === 0) {
    return (
      <Card className="p-4 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" />
          Existing customer linked — no previous purchases yet.
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/20">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-r from-primary/8 to-transparent flex flex-wrap gap-3 items-start justify-between border-b">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <History className="h-4 w-4 text-primary" />
            Customer Purchase History
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {totalVisits} visit{totalVisits !== 1 ? "s" : ""} · Total spend ₹{totalSpend.toLocaleString("en-IN")}
          </div>
        </div>
        {loyaltyTier && (
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-semibold px-2 py-1 rounded-full border", loyaltyTier.color)}>
              <Star className="inline h-3 w-3 mr-1" />{loyaltyTier.label} Customer
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                onAddDiscount(loyaltyTier.pct);
                toast.success(`${loyaltyTier.pct}% loyalty discount applied to all items!`);
              }}
            >
              <Gift className="h-3 w-3" /> Apply {loyaltyTier.pct}% Loyalty
            </Button>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
        {/* Past bills */}
        <div>
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/30">
            Recent Bills
          </div>
          <div className="divide-y max-h-40 overflow-y-auto">
            {custSales.slice(0, 8).map((sale) => (
              <div key={sale.id} className="px-4 py-2 flex items-center justify-between text-sm hover:bg-muted/40 transition-colors">
                <div>
                  <div className="font-medium text-xs">{sale.id}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(sale.date).toLocaleDateString("en-IN", {
                      day: "2-digit", month: "short", year: "2-digit",
                    })}
                    {" · "}{sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">₹{sale.grand.toLocaleString("en-IN")}</div>
                  <div className={cn("text-[11px] capitalize",
                    sale.payment === "cash" ? "text-green-600" : "text-blue-600")}>
                    {sale.payment}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div>
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/30">
            <ShoppingBag className="inline h-3 w-3 mr-1" /> Frequently Bought
          </div>
          <div className="divide-y max-h-40 overflow-y-auto">
            {topProducts.length === 0 ? (
              <div className="px-4 py-4 text-xs text-muted-foreground">No products found.</div>
            ) : topProducts.map((p) => (
              <div key={p.name} className="px-4 py-2 flex items-center justify-between text-sm hover:bg-muted/40 transition-colors">
                <div className="truncate min-w-0 font-medium text-xs">{p.name}</div>
                <div className="text-right shrink-0 ml-2">
                  <div className="text-[11px] text-muted-foreground">{p.count} units</div>
                  <div className="text-xs font-semibold tabular-nums text-primary">₹{p.total.toFixed(0)}</div>
                </div>
              </div>
            ))}
          </div>
          {loyaltyTier && (
            <div className="px-4 py-2 bg-primary/5 border-t text-[11px] text-primary flex items-center gap-1.5">
              <Gift className="h-3 w-3" />
              Eligible for {loyaltyTier.pct}% loyalty discount — click Apply above!
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── WhatsApp Text Message Generator ──────────────────────────────────────────
function buildWhatsAppMessage(sale: Sale, isLoan: boolean, outstandingAmount?: number): string {
  const customerName = sale.customerName && sale.customerName !== "Walk-in" ? sale.customerName.trim() : "Customer";
  const d = new Date(sale.date);
  const dateFormatted = !isNaN(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
    : new Date().toLocaleDateString("en-IN");

  const itemsList = sale.items
    .map((it) => {
      const qtyStr = it.qty > 1 ? ` × ${it.qty}` : "";
      return `• ${it.name}${qtyStr} — ₹${Number(it.total).toFixed(2)}`;
    })
    .join("\n");

  const grandFormatted = Number(sale.grand).toLocaleString("en-IN");

  if (isLoan) {
    const outstandingFormatted = Number(outstandingAmount ?? sale.grand).toLocaleString("en-IN");
    return [
      `Hi ${customerName},`,
      ``,
      `Details of your Sale Invoice from RSP MEDICALS`,
      ``,
      `Invoice No: ${sale.id}`,
      `Date: ${dateFormatted}`,
      ``,
      `Items:`,
      itemsList,
      ``,
      `Invoice Amount: ₹${grandFormatted}`,
      `Payment: Credit / Loan`,
      `Outstanding Amount: ₹${outstandingFormatted}`,
      ``,
      `Please clear your outstanding amount at your earliest convenience.`,
      ``,
      `Thank you for doing business with us,`,
      `RSP MEDICALS`,
      `📞 7569790229`,
      ``,
      `Manage your Business on your phone.`,
      `For more information:`,
      `https://billing.rspsoftwares.com`,
    ].join("\n");
  }

  return [
    `Hi ${customerName},`,
    ``,
    `Details of your Sale Invoice from RSP MEDICALS`,
    ``,
    `Invoice No: ${sale.id}`,
    `Date: ${dateFormatted}`,
    ``,
    `Items:`,
    itemsList,
    ``,
    `Invoice Amount: ₹${grandFormatted}`,
    `Payment: Paid`,
    ``,
    `Thank you for doing business with us,`,
    `RSP MEDICALS`,
    `📞 7569790229`,
    ``,
    `Manage your Business on your phone.`,
    `For more information:`,
    `https://billing.rspsoftwares.com`,
  ].join("\n");
}

// ── Main Billing Page ─────────────────────────────────────────────────────────
function BillingPage() {
  const hydrated = useHydrated();
  const medicines = useStore((s) => s.medicines);
  const customers = useStore((s) => s.customers);
  const printer = useStore((s) => s.printer);
  const held = useStore((s) => s.held);
  const tenant = useTenant();
  const f = useFeatures();
  const copy = TYPE_COPY[tenant.type];

  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);
  useEffect(() => setMe(getUser()), []);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", doctor: "" });
  const [matched, setMatched] = useState<string | null>(null);
  const [payment, setPayment] = useState<PayMode>("cash");
  const [splitAmounts, setSplitAmounts] = useState<SplitAmounts>({ cash: 0, online: 0 });
  const [splitOpen, setSplitOpen] = useState(false);
  const [clearLoanOpen, setClearLoanOpen] = useState(false);
  const [inv, setInv] = useState("INV—");
  const [scanOpen, setScanOpen] = useState(false);
  const [totalDiscountPct, setTotalDiscountPct] = useState<number>(0);
  const [totalDiscountAmt, setTotalDiscountAmt] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"pct" | "amt">("pct");

  // Keyboard navigation refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  useEffect(() => {
    setInv(invoiceNo());
    actions.syncSales();
  }, []);

  // When a medicine is added, automatically focus its Pack Qty input
  useEffect(() => {
    if (lastAddedId) {
      setTimeout(() => {
        const qtyEl = (document.getElementById(`pack-qty-input-${lastAddedId}`) ||
          document.getElementById(`qty-input-${lastAddedId}`)) as HTMLInputElement;
        if (qtyEl) {
          qtyEl.focus();
          qtyEl.select();
        }
      }, 50);
    }
  }, [lastAddedId]);

  const today = hydrated
    ? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return medicines
      .filter((m) => m.name.toLowerCase().includes(q) || m.batch.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, medicines]);

  const addItem = (m: Medicine) => {
    const info = parsePackInfo(m);
    const unitMrp = calculateUnitMrp(m.mrp, info.packSize);
    setItems((prev) => {
      const found = prev.find((i) => i.id === m.id);
      if (found) {
        const pSize = found.packSize ?? info.packSize;
        const nextPackQty = (found.packQty ?? 1) + 1;
        const looseQty = found.looseQty ?? 0;
        const totalU = calculateTotalUnits(nextPackQty, looseQty, pSize);
        return prev.map((i) => (i.id === m.id ? { ...i, packQty: nextPackQty, qty: totalU } : i));
      }
      const initialPackQty = 1;
      const initialLooseQty = 0;
      const totalUnits = calculateTotalUnits(initialPackQty, initialLooseQty, info.packSize);
      return [
        ...prev,
        {
          ...m,
          packQty: initialPackQty,
          looseQty: initialLooseQty,
          packSize: info.packSize,
          isConvertible: info.isConvertible,
          unitMrp,
          packLabel: info.packLabel,
          unitLabel: info.unitLabel,
          qty: totalUnits,
          discount: 0,
        },
      ];
    });
    setLastAddedId(m.id);
    setQuery("");
  };

  const onScan = (code: string) => {
    const found = medicines.find(
      (m) => m.id.toLowerCase() === code.toLowerCase() || m.batch.toLowerCase() === code.toLowerCase(),
    );
    if (found) {
      addItem(found);
      toast.success(`Added ${found.name}`);
    } else {
      setQuery(code);
      toast(`Scanned: ${code} — search opened`);
    }
  };

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const merged = { ...i, ...patch };
        const pSize = merged.packSize || 1;
        const pQty = Math.max(0, merged.packQty ?? 0);
        const eUnits = Math.max(0, merged.looseQty ?? 0);
        let totalU = calculateTotalUnits(pQty, eUnits, pSize);
        if (totalU <= 0 && (patch.packQty !== undefined || patch.looseQty !== undefined)) {
          totalU = 1;
        }
        return {
          ...merged,
          packQty: pQty,
          looseQty: eUnits,
          qty: totalU > 0 ? totalU : (merged.qty || 1),
        };
      })
    );
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const applyLoyaltyDiscount = (pct: number) => {
    setDiscountType("pct");
    setTotalDiscountPct(pct);
  };

  const onPhoneChange = (phone: string) => {
    setCustomer((c) => ({ ...c, phone }));
    const found = customers.find((c) => c.phone === phone.trim());
    if (found) {
      setCustomer((c) => ({ ...c, name: found.name, doctor: found.doctor ?? c.doctor, phone }));
      setMatched(found.id);
    } else {
      setMatched(null);
    }
  };

  /**
   * Pharmacy Retail Billing: MRP is already INCLUSIVE of GST!
   * - Total Amount = Sub Total - Bill Total Discount
   * - GST % and GST amount are shown as breakdown, extracted from inclusive price.
   */
  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    for (const it of items) {
      const unitRate = it.unitMrp !== undefined ? it.unitMrp : it.mrp;
      sub += unitRate * it.qty;
    }
    const calculatedDisc =
      discountType === "pct"
        ? (sub * totalDiscountPct) / 100
        : Math.min(sub, totalDiscountAmt);

    // Distribute discount proportionally across items for accurate GST slab extraction
    for (const it of items) {
      const unitRate = it.unitMrp !== undefined ? it.unitMrp : it.mrp;
      const line = unitRate * it.qty;
      const itemDisc = sub > 0 ? (line / sub) * calculatedDisc : 0;
      const finalLine = line - itemDisc;
      const g = f.gst && it.gst ? finalLine - finalLine / (1 + it.gst / 100) : 0;
      gst += g;
    }
    const beforeRound = Math.max(0, sub - calculatedDisc);
    const grand = Math.round(beforeRound);
    return { sub, disc: calculatedDisc, gst, round: grand - beforeRound, grand };
  }, [items, f.gst, totalDiscountPct, totalDiscountAmt, discountType]);

  const clear = () => {
    setItems([]);
    setTotalDiscountPct(0);
    setTotalDiscountAmt(0);
    setDiscountType("pct");
    setCustomer({ name: "", phone: "", doctor: "" });
    setMatched(null);
    setInv(invoiceNo());
    setPayment("cash");
    setSplitAmounts({ cash: 0, online: 0 });
  };

  const actor = me ? { id: me.id, name: me.name } : undefined;

  const paymentLabel = () => {
    if (payment === "split") return `Cash ₹${splitAmounts.cash} + Online ₹${splitAmounts.online}`;
    if (payment === "loan") return "Credit / Loan";
    return payment;
  };

  // Helper: build the common sale payload
  const buildSalePayload = () => {
    const cust = actions.upsertCustomerByPhone({
      name: customer.name, phone: customer.phone, doctor: customer.doctor,
    });
    return {
      cust,
      payload: {
        customerId: cust.phone ? cust.id : null,
        customerName: cust.name,
        phone: cust.phone,
        doctor: customer.doctor || undefined,
        items: items.map((it) => {
          const unitRate = it.unitMrp !== undefined ? it.unitMrp : it.mrp;
          const line = unitRate * it.qty;
          const itemDisc = totals.sub > 0 ? (line / totals.sub) * totals.disc : 0;
          return {
            id: it.id,
            name: it.name,
            batch: it.batch,
            qty: it.qty, // total units sold
            mrp: it.unitMrp !== undefined ? it.unitMrp : it.mrp,
            gst: it.gst,
            discount: line > 0 ? +((itemDisc / line) * 100).toFixed(1) : 0,
            total: +(line - itemDisc).toFixed(2),
            pack: it.pack,
            packSize: it.packSize,
            packQty: it.packQty,
            looseQty: it.looseQty,
            totalUnits: it.qty,
            unitMrp: it.unitMrp,
            sellingUnit:
              it.looseQty && !it.packQty
                ? it.unitLabel
                : !it.looseQty && it.packQty
                ? it.packLabel
                : `${it.packLabel} + ${it.unitLabel}`,
          };
        }),
        sub: +totals.sub.toFixed(2),
        disc: +totals.disc.toFixed(2),
        gst: +totals.gst.toFixed(2),
        grand: totals.grand,
        payment: paymentLabel(),
      },
    };
  };

  // Helper: send text-only invoice message directly via WhatsApp Web / wa.me
  const sendInvoiceWhatsApp = (sale: Sale, phone: string, isLoan = false) => {
    let rawPhone = phone.replace(/\D/g, "");
    if (rawPhone.length === 11 && rawPhone.startsWith("0")) {
      rawPhone = rawPhone.slice(1);
    }
    if (!rawPhone) {
      toast.error("Enter customer phone number for WhatsApp");
      return;
    }
    const waPhone = rawPhone.startsWith("91") ? rawPhone : `91${rawPhone}`;

    // Get current customer's outstanding balance if loan
    let outstanding: number | undefined = undefined;
    if (isLoan) {
      const cust = customers.find(
        (c) => c.phone === phone.trim() || (sale.customerId && c.id === sale.customerId),
      );
      outstanding = cust?.balance !== undefined && cust.balance > 0 ? cust.balance : sale.grand;
    }

    const message = buildWhatsAppMessage(sale, isLoan, outstanding);
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const saveBill = async () => {
    if (items.length === 0) return toast.error("Add at least one medicine");
    if (payment === "split" && splitAmounts.cash + splitAmounts.online <= 0)
      return toast.error("Enter split amounts first");
    if (payment === "loan") {
      // Save as Loan: creates a loan record + sale, and sends invoice on WhatsApp
      if (!customer.phone.trim() && !customer.name.trim())
        return toast.error("Enter customer name or phone for a credit sale");
      if (!customer.phone.trim())
        return toast.error("Enter customer phone number to send WhatsApp invoice");

      const { payload } = buildSalePayload();
      const { sale, saleError, loanError } = await actions.saveSaleAsLoan(payload, actor);
      if (saleError) {
        toast.error(`Bill save error: ${saleError}`);
        return;
      }
      if (loanError) {
        toast.warning(`Bill saved but loan record failed: ${loanError}`);
      } else {
        toast.success(`Bill ${sale.id} saved as Credit · ₹${totals.grand.toLocaleString("en-IN")}`);
      }
      if (printer.autoPrint) printReceipt(sale, printer, medicines);

      // Automatically send text invoice on WhatsApp
      sendInvoiceWhatsApp(sale, customer.phone, true);

      clear();
      return;
    }
    const { payload } = buildSalePayload();
    const { sale, error } = await actions.saveSale(payload, actor);
    if (error) {
      toast.error(`Database save error: ${error}`);
      return;
    }
    toast.success(`Bill ${sale.id} saved · ₹${totals.grand.toLocaleString("en-IN")}`);
    if (printer.autoPrint) printReceipt(sale, printer, medicines);
    clear();
  };

  const printBill = async () => {
    if (items.length === 0) return toast.error("Add at least one medicine");
    if (payment === "split" && splitAmounts.cash + splitAmounts.online <= 0)
      return toast.error("Enter split amounts first");
    if (payment === "loan") {
      if (!customer.phone.trim() && !customer.name.trim())
        return toast.error("Enter customer name or phone for a credit sale");
      const { payload } = buildSalePayload();
      const { sale, saleError, loanError } = await actions.saveSaleAsLoan(payload, actor);
      if (saleError) {
        toast.error(`Bill save error: ${saleError}`);
        return;
      }
      if (loanError) toast.warning(`Loan record failed: ${loanError}`);
      printReceipt(sale, printer, medicines);
      toast.success(`Bill ${sale.id} (Credit) · sent to printer`);
      clear();
      return;
    }
    const { payload } = buildSalePayload();
    const { sale, error } = await actions.saveSale(payload, actor);
    if (error) {
      toast.error(`Database save error: ${error}`);
      return;
    }
    printReceipt(sale, printer, medicines);
    toast.success(`Bill ${sale.id} · sent to printer`);
    clear();
  };

  // WhatsApp: save bill and send text invoice via WhatsApp Web
  const whatsAppBill = async () => {
    if (items.length === 0) return toast.error("Add at least one medicine");
    if (!customer.phone.trim()) return toast.error("Enter customer phone number for WhatsApp");
    if (payment === "split" && splitAmounts.cash + splitAmounts.online <= 0)
      return toast.error("Enter split amounts first");

    // 1. Save the bill first
    let sale;
    const isLoan = payment === "loan";
    if (isLoan) {
      const { payload } = buildSalePayload();
      const result = await actions.saveSaleAsLoan(payload, actor);
      if (result.saleError) { toast.error(`Error: ${result.saleError}`); return; }
      if (result.loanError) toast.warning(`Loan record failed: ${result.loanError}`);
      sale = result.sale;
    } else {
      const { payload } = buildSalePayload();
      const result = await actions.saveSale(payload, actor);
      if (result.error) { toast.error(`Error: ${result.error}`); return; }
      sale = result.sale;
    }

    // 2. Send text invoice via WhatsApp
    sendInvoiceWhatsApp(sale, customer.phone, isLoan);

    clear();
  };


  const holdBill = () => {
    if (items.length === 0) return toast.error("Nothing to hold");
    const rec = actions.holdBill({
      customerName: customer.name || "Walk-in",
      phone: customer.phone,
      doctor: customer.doctor || undefined,
      items: items.map((it) => ({
        id: it.id, name: it.name, batch: it.batch, qty: it.qty,
        mrp: it.mrp, gst: it.gst, discount: it.discount, company: it.company,
      })),
    }, actor);
    toast.success(`Bill held · ${rec.id}`);
    clear();
  };

  const resumeHeld = (id: string) => {
    const found = actions.resumeHeld(id);
    if (!found) return;
    setCustomer({ name: found.customerName, phone: found.phone, doctor: found.doctor ?? "" });
    setItems(found.items.map((it) => {
      const info = parsePackInfo(it);
      const unitMrp = calculateUnitMrp(it.mrp, info.packSize);
      const anyIt = it as any;
      const packSize = anyIt.packSize ?? info.packSize;
      const isConvertible = anyIt.isConvertible ?? info.isConvertible;
      const packQty = anyIt.packQty ?? (packSize > 1 ? Math.floor(it.qty / packSize) : it.qty);
      const looseQty = anyIt.looseQty ?? (packSize > 1 ? it.qty % packSize : 0);
      return {
        id: it.id,
        name: it.name,
        batch: it.batch,
        mrp: it.mrp,
        gst: it.gst,
        stock: 0,
        expiry: "",
        company: (it as any).company ?? "",
        pack: it.pack,
        packSize,
        isConvertible,
        packQty,
        looseQty,
        unitMrp: anyIt.unitMrp ?? unitMrp,
        packLabel: info.packLabel,
        unitLabel: info.unitLabel,
        qty: it.qty,
        discount: it.discount,
      };
    }));
    toast.success(`Resumed held bill ${id}`);
  };

  // Payment mode button
  const PayBtn = ({
    mode, icon: Icon, label,
  }: { mode: PayMode; icon: React.ElementType; label: string }) => (
    <button
      type="button"
      onClick={() => {
        setPayment(mode);
        if (mode === "split") setSplitOpen(true);
      }}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-xs font-medium transition-all",
        payment === mode
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : "border-border hover:bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <>
      <SplitDialog
        open={splitOpen}
        grand={totals.grand}
        onClose={() => setSplitOpen(false)}
        onConfirm={(s) => setSplitAmounts(s)}
      />

      <div className="px-4 lg:px-6 pb-4 lg:pb-6 pt-3 xl:pr-[336px]">
        {/* ── MAIN COLUMN ── */}
        <div className="space-y-4 min-w-0">

          {/* Header meta */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4 justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 grid place-items-center rounded-lg bg-primary/10 text-primary">
                  <ReceiptText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Invoice No.</div>
                  <div className="font-semibold tracking-tight">{inv}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Date</div>
                <div className="font-medium">{today || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cashier</div>
                <div className="font-medium">{me ? `${me.id} · ${me.name}` : "—"}</div>
                <div className="text-[11px] text-muted-foreground">{me?.role}</div>
              </div>
              <Badge variant="secondary" className="gap-1.5">
                <Keyboard className="h-3.5 w-3.5" /> F2 New · F9 Save · F10 Print
              </Badge>
            </div>

            {f.customerCapture && (
              <div className={cn("grid gap-3 mt-4", f.doctorField ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone (auto-links customer)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="+91"
                      value={customer.phone}
                      onChange={(e) => onPhoneChange(e.target.value)}
                    />
                    {matched && (
                      <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                    )}
                  </div>
                  {matched ? (
                    <div className="text-[11px] text-primary flex items-center gap-1">
                      <UserCheck className="h-3 w-3" /> Existing customer linked
                    </div>
                  ) : customer.phone.trim() ? (
                    <div className="text-[11px] text-[color:var(--info)]">New customer — will be created</div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">Walk-in if empty</div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Customer name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Walk-in customer"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    />
                  </div>
                </div>
                {f.doctorField && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Doctor</Label>
                    <div className="relative">
                      <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="Dr. Referred by"
                        value={customer.doctor}
                        onChange={(e) => setCustomer({ ...customer, doctor: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ── Loan outstanding warning ── */}
          {matched && (() => {
            const cust = customers.find((c) => c.id === matched);
            if (!cust || !cust.balance || cust.balance <= 0) return null;
            return (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3">
                <span className="text-amber-500 text-xl shrink-0">⚠</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-amber-800 text-sm">Outstanding Loan — ₹{cust.balance.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-amber-700">{cust.name} has an unpaid loan balance. Collect payment or save this bill as loan.</div>
                </div>
                <button
                  onClick={() => setClearLoanOpen(true)}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md font-medium shrink-0 whitespace-nowrap transition-colors"
                >
                  Clear Loan →
                </button>
              </div>
            );
          })()}


          {/* Search */}
          <Card className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  autoFocus
                  className="pl-9 h-11 text-base"
                  placeholder={copy.searchHint}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && suggestions[0]) addItem(suggestions[0]);
                  }}
                />
              </div>
              {f.barcode && (
                <Button variant="outline" className="h-11" onClick={() => setScanOpen(true)}>
                  <ScanBarcode className="h-4 w-4 mr-1.5" /> Barcode
                </Button>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 gap-1.5 font-medium">
                    <PauseCircle className="h-4 w-4 text-amber-600" /> Held ({held.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="px-3 py-2 border-b text-sm font-semibold">Held bills</div>
                  <div className="max-h-72 overflow-y-auto divide-y">
                    {held.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground text-center">No bills on hold.</div>
                    )}
                    {held.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => resumeHeld(h.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
                      >
                        <PlayCircle className="h-4 w-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {h.id} · {h.customerName || "Walk-in"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {h.items.length} items · {new Date(h.at).toLocaleTimeString("en-IN")}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-2 rounded-lg border bg-card divide-y">
                {suggestions.map((m) => {
                  const pInfo = parsePackInfo(m);
                  const stockDisplay = pInfo.packSize > 1
                    ? `Stock: ${m.stock} (${formatStockBreakdown(m.stock, pInfo.packSize, pInfo.packLabel, pInfo.unitLabel)})`
                    : `Stock: ${m.stock}`;
                  return (
                    <button
                      key={m.id}
                      onClick={() => addItem(m)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left"
                    >
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[m.company, m.pack ? `Pack ${m.pack}` : null, f.batchTracking && m.batch ? `Batch ${m.batch}` : null,
                          f.expiryTracking && m.expiry ? `Exp ${m.expiry}` : null]
                            .filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded",
                          m.stock < 20
                            ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"
                            : "bg-primary/10 text-primary",
                        )}>
                          {stockDisplay}
                        </span>
                        <span className="text-sm font-semibold">₹{m.mrp}</span>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Line items */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto max-h-[48vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-muted/50">
                    <TableHead>{copy.item}</TableHead>
                    {f.batchTracking && <TableHead className="w-20">Batch</TableHead>}
                    {/* <TableHead className="w-24 text-center">Pack Qty</TableHead> */}
                    <TableHead className="w-24 text-center">Units</TableHead>
                    {/* <TableHead className="w-24 text-center">Total Units</TableHead> */}
                    <TableHead className="w-24 text-right">{tenant.type === "Medical" ? "Rate (MRP)" : "Price"}</TableHead>
                    {f.gst && <TableHead className="w-16 text-center">GST</TableHead>}
                    <TableHead className="w-24 text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={f.gst ? (f.batchTracking ? 9 : 8) : (f.batchTracking ? 8 : 7)} className="text-center py-16 text-muted-foreground">
                        <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Search{f.barcode ? " or scan" : ""} a {copy.item.toLowerCase()} to add to the bill.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((it) => {
                      const isConvert = Boolean(it.isConvertible && it.packSize && it.packSize > 1);
                      const unitRate = it.unitMrp !== undefined ? it.unitMrp : it.mrp;
                      const line = unitRate * it.qty;
                      const packSize = it.packSize || 1;
                      const pLabel = it.packLabel || "Strip";
                      const uLabel = it.unitLabel || "Tablet";

                      return (
                        <TableRow key={it.id}>
                          <TableCell>
                            <div className="font-medium">{it.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                              <span>{it.company}</span>
                              {it.pack && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-muted text-[11px] font-mono">
                                  Pack: {it.pack}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          {f.batchTracking && <TableCell className="text-sm font-mono">{it.batch}</TableCell>}

                          {/* 1. Pack Qty (Number input only, space-saving) */}
                          {/* <TableCell className="text-center">
                            <Input
                              id={`pack-qty-input-${it.id}`}
                              type="number"
                              min={0}
                              tabIndex={0}
                              value={it.packQty ?? 1}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                updateItem(it.id, { packQty: val });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (isConvert) {
                                    const extraEl = document.getElementById(`extra-units-input-${it.id}`) as HTMLInputElement;
                                    if (extraEl) {
                                      extraEl.focus();
                                      extraEl.select();
                                      return;
                                    }
                                  }
                                  searchInputRef.current?.focus();
                                  searchInputRef.current?.select();
                                }
                              }}
                              className="h-8 w-16 mx-auto text-center px-1 font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <div className="text-[10px] text-center text-muted-foreground mt-0.5">{pLabel}</div>
                          </TableCell> */}

                          {/* 2. Extra Units (Number input only, space-saving) */}
                          <TableCell className="text-center">
                            {isConvert ? (
                              <>
                                <Input
                                  id={`extra-units-input-${it.id}`}
                                  type="number"
                                  min={0}
                                  max={packSize - 1}
                                  tabIndex={0}
                                  value={it.looseQty ?? 0}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    updateItem(it.id, { looseQty: val });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      searchInputRef.current?.focus();
                                      searchInputRef.current?.select();
                                    }
                                  }}
                                  className="h-8 w-16 mx-auto text-center px-1 font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <div className="text-[10px] text-center text-muted-foreground mt-0.5">{uLabel}</div>
                              </>
                            ) : (
                              <div className="text-center text-xs text-muted-foreground">—</div>
                            )}
                          </TableCell>

                          {/* 3. Total Units */}
                          {/* <TableCell className="text-center">
                            <Badge variant="secondary" className="font-mono text-xs font-semibold px-2 py-0.5">
                              {it.qty} {uLabel}{it.qty === 1 ? "" : "s"}
                            </Badge>
                          </TableCell> */}

                          {/* 4. MRP / Rate */}
                          <TableCell className="text-right tabular-nums">
                            <div className="font-medium text-xs">₹{unitRate.toFixed(2)}</div>
                            {isConvert && (
                              <div className="text-[10px] text-muted-foreground">₹{Number(it.mrp).toFixed(2)}/{pLabel}</div>
                            )}
                          </TableCell>

                          {/* 5. GST */}
                          {f.gst && <TableCell className="text-center text-xs">{it.gst}%</TableCell>}

                          {/* 6. Line Total */}
                          <TableCell className="text-right font-semibold tabular-nums text-xs">
                            ₹{line.toFixed(2)}
                          </TableCell>

                          {/* 7. Remove */}
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              tabIndex={-1}
                              onClick={() => removeItem(it.id)}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ── Total Bill Discount Option Below Table ── */}
            {items.length > 0 && (
              <div className="p-3 bg-muted/30 border-t flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
                  <span>•</span>
                  <span>Total Units: {items.reduce((sum, it) => sum + it.qty, 0)}</span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="total-bill-discount-input" className="text-xs font-semibold text-foreground flex items-center gap-1 cursor-pointer">
                      <Percent className="h-3.5 w-3.5 text-primary" /> Bill Discount:
                    </Label>
                    <div className="flex items-center rounded-md border bg-card overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDiscountType("pct")}
                        className={cn(
                          "px-2 py-1 text-xs font-medium transition-colors",
                          discountType === "pct" ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("amt")}
                        className={cn(
                          "px-2 py-1 text-xs font-medium transition-colors",
                          discountType === "amt" ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        ₹
                      </button>
                    </div>
                    <Input
                      id="total-bill-discount-input"
                      type="number"
                      min={0}
                      max={discountType === "pct" ? 100 : undefined}
                      value={discountType === "pct" ? (totalDiscountPct || "") : (totalDiscountAmt || "")}
                      placeholder="0"
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        if (discountType === "pct") {
                          setTotalDiscountPct(Math.min(100, val));
                        } else {
                          setTotalDiscountAmt(val);
                        }
                      }}
                      className="h-8 w-20 text-center text-xs font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {totals.disc > 0 && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        (-₹{totals.disc.toFixed(2)})
                      </span>
                    )}
                  </div>

                  {/* Quick discount buttons */}
                  <div className="flex items-center gap-1">
                    {[5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setDiscountType("pct");
                          setTotalDiscountPct(pct === totalDiscountPct ? 0 : pct);
                        }}
                        className={cn(
                          "text-[11px] px-2 py-1 rounded border transition-colors",
                          discountType === "pct" && totalDiscountPct === pct
                            ? "bg-primary text-primary-foreground font-bold"
                            : "bg-card hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ── Customer History (only for existing/matched customers) ── */}
          {matched && (
            <CustomerHistoryPanel
              customerId={matched}
              onAddDiscount={applyLoyaltyDiscount}
            />
          )}
        </div>

        {/* ── RIGHT SIDEBAR — truly fixed, right-0 top-16 bottom-0, no scroll ── */}
        <div className="hidden xl:flex fixed right-0 top-16 bottom-0 w-[320px] bg-card border-l flex-col gap-3 p-4 overflow-hidden z-30">

          {/* Bill Summary */}
          <Card className="p-4 shrink-0">
            <div className="text-sm font-semibold mb-2">Bill Summary</div>
            <div className="space-y-1.5 text-sm">
              <Row label="Sub Total" value={totals.sub} />
              <Row label="Discount" value={-totals.disc} accent="warning" />
              {f.gst && <Row label="GST (Included)" value={totals.gst} />}
              <Row label="Round Off" value={totals.round} muted />
              <div className="border-t pt-2 mt-1 flex items-center justify-between">
                <span className="font-semibold">Grand Total</span>
                <span className="text-2xl font-bold tracking-tight text-primary tabular-nums">
                  ₹{totals.grand.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </Card>

          {/* Payment Method — Cash / Online / Split / Credit-Loan */}
          <Card className="p-4 shrink-0">
            <div className="text-sm font-semibold mb-2">Payment</div>
            <div className="flex flex-wrap gap-2">
              <PayBtn mode="cash" icon={Banknote} label="Cash" />
              <PayBtn mode="online" icon={Smartphone} label="Online" />
              <PayBtn mode="split" icon={GitFork} label="Split" />
              <PayBtn mode="loan" icon={CreditCard} label="Credit" />
            </div>

            {/* Split amounts display */}
            {payment === "split" && (
              <div className="mt-2 space-y-1">
                {splitAmounts.cash + splitAmounts.online > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="rounded bg-muted px-3 py-1.5 flex items-center justify-between">
                      <span className="text-muted-foreground">Cash</span>
                      <span className="font-semibold tabular-nums">₹{splitAmounts.cash}</span>
                    </div>
                    <div className="rounded bg-primary/10 px-3 py-1.5 flex items-center justify-between">
                      <span className="text-muted-foreground">Online</span>
                      <span className="font-semibold tabular-nums text-primary">₹{splitAmounts.online}</span>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="w-full text-center text-primary underline underline-offset-2 text-xs pt-0.5"
                  onClick={() => setSplitOpen(true)}
                >
                  {splitAmounts.cash + splitAmounts.online > 0 ? "Edit split amounts" : "Enter split amounts →"}
                </button>
              </div>
            )}

            {/* Loan info hint */}
            {payment === "loan" && (
              <div className="mt-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <CreditCard className="inline h-3 w-3 mr-1" />
                Bill will be saved as <strong>Credit</strong> & added to outstanding balance · WhatsApp invoice will be sent automatically.
              </div>
            )}
          </Card>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <Button className="h-11 text-sm" onClick={saveBill}>
              <Save className="h-4 w-4 mr-1.5" />
              {payment === "loan" ? "Save (Loan)" : "Save"}
            </Button>
            <Button
              variant="outline"
              className="h-11 text-sm border-primary text-primary hover:bg-primary/10"
              onClick={printBill}
            >
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>

            <Button
              variant="outline"
              className="col-span-2 h-10 text-sm gap-1.5 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10"
              onClick={whatsAppBill}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp Bill
            </Button>

            <Button variant="outline" className="h-11 text-sm" onClick={holdBill}>
              <PauseCircle className="h-4 w-4 mr-1.5" /> Hold
            </Button>
            <Button
              variant="ghost"
              className="h-11 text-sm text-destructive hover:text-destructive"
              onClick={clear}
            >
              <X className="h-4 w-4 mr-1.5" /> Cancel
            </Button>

          </div>
          {/* Printer info — compact */}
          <div className="rounded-lg border border-dashed px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <Percent className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>{printer.paperSize} thermal · Change in Settings → Printer</span>
          </div>
        </div>
      </div>

      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScan} mode="barcode" />

      {/* Clear Loan dialog — pre-filled for the matched customer */}
      {matched && (() => {
        const cust = customers.find((c) => c.id === matched);
        if (!cust) return null;
        return (
          <ClearLoanDialog
            open={clearLoanOpen}
            onClose={() => setClearLoanOpen(false)}
            customerId={cust.id}
            customerName={cust.name}
            customerPhone={cust.phone}
            outstanding={cust.balance || 0}
          />
        );
      })()}
    </>
  );
}

function Row({
  label, value, accent, muted,
}: { label: string; value: number; accent?: "warning"; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          accent === "warning" && "text-[color:var(--warning)]",
          muted && "text-muted-foreground",
        )}
      >
        ₹{value.toFixed(2)}
      </span>
    </div>
  );
}
