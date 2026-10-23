import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Search, ScanBarcode, Plus, Trash2, Save, Printer, PauseCircle, X,
  Percent, Keyboard, User, Phone, Stethoscope, UserCheck, PlayCircle, ReceiptText, Minus,
  Banknote, Smartphone, GitFork, History, Star, ShoppingBag, Gift, CreditCard, IndianRupee,
  MessageCircle, ChevronRight, MapPin, Pill, AlertCircle, FileText, Check, ChevronUp, ChevronDown
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
import { normalizeMedName } from "@/lib/medicines-supabase";
import { printReceipt } from "@/lib/print";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { getUser } from "@/lib/auth";
import { useTenant, useFeatures, TYPE_COPY } from "@/lib/tenant";
import {
  parsePackInfo,
  calculateUnitMrp,
  formatStockDisplay,
} from "@/lib/medicine-units";

export const Route = createFileRoute("/_app/")({
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

// ── Helper: Format Expiry Date ────────────────────────────────────────────────
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatExpiryDisplay(expiry: string | undefined): string {
  if (!expiry) return "—";
  const parts = expiry.trim().split("-");
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
      return `${MONTH_NAMES[month - 1]} ${year}`;
    }
  }
  return expiry;
}

function isMedicineExpired(expiry: string | undefined): boolean {
  if (!expiry) return false;
  const parts = expiry.trim().split("-");
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month)) {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;
      return year < curYear || (year === curYear && month < curMonth);
    }
  }
  return false;
}

function isMedicineExpiringSoon(expiry: string | undefined): boolean {
  if (!expiry || isMedicineExpired(expiry)) return false;
  const parts = expiry.trim().split("-");
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month)) {
      const now = new Date();
      const diffMonths = (year - now.getFullYear()) * 12 + (month - (now.getMonth() + 1));
      return diffMonths >= 0 && diffMonths <= 3;
    }
  }
  return false;
}

function formatLocationDisplay(m: Medicine): string {
  const rack = m.rack ? m.rack.trim() : "";
  const box = m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic" ? m.box_no.trim() : "";
  if (rack && box) return `${rack}-${box}`;
  if (rack) return rack;
  if (box) return box;
  return "Unassigned";
}

// ── Helper: Normalized Composition for Alternative Brands ───────────────────
function normalizeComposition(comp?: string | null): string {
  if (!comp || comp === "Branded" || comp === "Generic") return "";
  return comp
    .toUpperCase()
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/(\d+)\s*(MG|MCG|GM|G|ML|IU)\b/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function getDosageCategory(medicine: Medicine): string {
  const type = (medicine.type || medicine.units || "").toLowerCase();
  const name = (medicine.name || "").toLowerCase();
  const pack = (medicine.pack || "").toLowerCase();
  const combined = `${type} ${name} ${pack}`;

  if (combined.includes("syrup") || combined.includes("suspension") || combined.includes("liquid") || combined.includes("solution") || combined.includes("drops") || combined.includes("mouthwash")) {
    return "liquid";
  }
  if (combined.includes("inject") || combined.includes("vial") || combined.includes("ampoule")) {
    return "injection";
  }
  if (combined.includes("gel") || combined.includes("cream") || combined.includes("ointment") || combined.includes("lotion")) {
    return "topical";
  }
  if (combined.includes("inhaler") || combined.includes("respule") || combined.includes("spray")) {
    return "inhalation";
  }
  return "solid_oral";
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
          <GitFork className="h-5 w-5 text-emerald-600" />
          <div className="font-semibold text-lg">Split Payment</div>
        </div>
        <div className="bg-muted/60 rounded-lg px-4 py-2 text-center">
          <span className="text-xs text-muted-foreground">Grand Total</span>
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">
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
              className="text-lg h-11 tabular-nums focus-visible:ring-emerald-500"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5">
            <span className="text-sm flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-emerald-600" /> Online / UPI
            </span>
            <span className="font-semibold tabular-nums text-emerald-600">
              ₹{online.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { onConfirm({ cash, online }); onClose(); }}>
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

// ── Inline Clear Loan / Repayment Dialog ─────────────────────────────────────
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
                className="focus-visible:ring-emerald-500"
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
      <Card className="p-3 border-emerald-500/20 bg-emerald-50/10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5 text-emerald-600" />
          Existing customer linked — no previous purchases yet.
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-emerald-500/20 shadow-xs">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-500/10 to-transparent flex flex-wrap gap-2 items-center justify-between border-b">
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-800">
            <History className="h-3.5 w-3.5 text-emerald-600" />
            Customer Purchase History
          </div>
          <div className="text-[11px] text-muted-foreground">
            {totalVisits} visit{totalVisits !== 1 ? "s" : ""} · Total spend ₹{totalSpend.toLocaleString("en-IN")}
          </div>
        </div>
        {loyaltyTier && (
          <div className="flex items-center gap-2">
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", loyaltyTier.color)}>
              <Star className="inline h-3 w-3 mr-0.5" />{loyaltyTier.label} Customer
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6.5 text-[11px] gap-1 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50"
              onClick={() => {
                onAddDiscount(loyaltyTier.pct);
                toast.success(`${loyaltyTier.pct}% loyalty discount applied to bill!`);
              }}
            >
              <Gift className="h-3 w-3" /> Apply {loyaltyTier.pct}% Loyalty
            </Button>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x text-xs">
        <div>
          <div className="px-3 py-1.5 font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/20 text-[10px]">
            Recent Bills
          </div>
          <div className="divide-y max-h-36 overflow-y-auto">
            {custSales.slice(0, 5).map((sale) => (
              <div key={sale.id} className="px-3 py-1.5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div>
                  <div className="font-medium text-xs text-slate-800">{sale.id}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(sale.date).toLocaleDateString("en-IN", {
                      day: "2-digit", month: "short", year: "2-digit",
                    })} · {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums text-slate-800">₹{sale.grand.toLocaleString("en-IN")}</div>
                  <div className={cn("text-[10px] capitalize",
                    sale.payment === "cash" ? "text-emerald-600" : "text-blue-600")}>
                    {sale.payment}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="px-3 py-1.5 font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/20 text-[10px]">
            <ShoppingBag className="inline h-3 w-3 mr-1" /> Frequently Bought
          </div>
          <div className="divide-y max-h-36 overflow-y-auto">
            {topProducts.length === 0 ? (
              <div className="px-3 py-3 text-muted-foreground">No products found.</div>
            ) : topProducts.map((p) => (
              <div key={p.name} className="px-3 py-1.5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="truncate min-w-0 font-medium text-slate-800">{p.name}</div>
                <div className="text-right shrink-0 ml-2">
                  <div className="text-[10px] text-muted-foreground">{p.count} units</div>
                  <div className="font-semibold tabular-nums text-emerald-600">₹{p.total.toFixed(0)}</div>
                </div>
              </div>
            ))}
          </div>
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
  const [billNote, setBillNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  // Keyboard navigation & debouncing refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastAddTimestamp = useRef<number>(0);

  useEffect(() => {
    setInv(invoiceNo());
    actions.syncSales();
  }, []);

  // Debounce search query (180ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 180);
    return () => clearTimeout(handler);
  }, [query]);

  // Open dropdown when query is typed, reset selection index to 0
  useEffect(() => {
    if (query.trim().length > 0) {
      setIsSearchOpen(true);
      setSelectedIndex(0);
    } else {
      setIsSearchOpen(false);
    }
  }, [query]);

  // Autofocus search on initial mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const today = hydrated
    ? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  // ── Exact Matches & Alternative Brands Calculations ─────────────────────────
  const { exactMatches, alternativeBrands } = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (!q) {
      return { exactMatches: [], alternativeBrands: [] };
    }

    const normQ = normalizeMedName(debouncedQuery);

    // 1. Exact Matches: search across Name, Brand/Company, Generic/Composition, Batch, Barcode/ID, Code
    const matchingMedicines = medicines.filter((m) => {
      const name = (m.name || "").toLowerCase();
      const comp = (m.generic || "").toLowerCase();
      const brand = (m.company || "").toLowerCase();
      const batch = (m.batch || "").toLowerCase();
      const id = (m.id || "").toLowerCase();
      const code = (m.code || "").toLowerCase();

      return (
        name.includes(q) ||
        comp.includes(q) ||
        brand.includes(q) ||
        batch.includes(q) ||
        id === q ||
        code === q ||
        (normQ.length > 0 && (
          normalizeMedName(m.name).includes(normQ) ||
          normalizeMedName(m.generic || "").includes(normQ) ||
          normalizeMedName(m.code || "").includes(normQ)
        ))
      );
    });

    // Prioritize results: exact barcode/id/code match -> name starts with -> name contains -> generic/brand
    matchingMedicines.sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aId = (a.id || "").toLowerCase();
      const bId = (b.id || "").toLowerCase();
      const aCode = (a.code || "").toLowerCase();
      const bCode = (b.code || "").toLowerCase();

      if (aId === q || aCode === q) return -1;
      if (bId === q || bCode === q) return 1;

      const aStarts = aName.startsWith(q);
      const bStarts = bName.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      return aName.localeCompare(bName);
    });

    const exacts = matchingMedicines.slice(0, 12);

    // 2. Alternative Brands: Find eligible medicines with the exact same verified composition & strength
    const verifiedCompositions = new Set<string>();
    const matchedCategories = new Set<string>();

    for (const m of exacts) {
      const norm = normalizeComposition(m.generic);
      if (norm) {
        verifiedCompositions.add(norm);
        matchedCategories.add(getDosageCategory(m));
      }
    }

    let alternatives: Medicine[] = [];

    if (verifiedCompositions.size > 0) {
      const exactIds = new Set(exacts.map((m) => m.id));

      alternatives = medicines.filter((other) => {
        // Exclude exact matches already shown
        if (exactIds.has(other.id)) return false;

        const otherNorm = normalizeComposition(other.generic);
        if (!otherNorm) return false;

        // Must match one of the verified active ingredient(s) + strength signatures
        if (!verifiedCompositions.has(otherNorm)) return false;

        // Must have compatible dosage form
        const otherCategory = getDosageCategory(other);
        if (!matchedCategories.has(otherCategory)) return false;

        return true;
      });

      // Sort alternatives by stock availability, then name
      alternatives.sort((a, b) => {
        if (b.stock !== a.stock) return b.stock - a.stock;
        return (a.name || "").localeCompare(b.name || "");
      });

      alternatives = alternatives.slice(0, 10);
    }

    return { exactMatches: exacts, alternativeBrands: alternatives };
  }, [debouncedQuery, medicines]);

  // Combined list for seamless keyboard navigation across both sections
  const allNavigableItems = useMemo(
    () => [...exactMatches, ...alternativeBrands],
    [exactMatches, alternativeBrands]
  );

  // Auto-scroll the highlighted dropdown item into view
  useEffect(() => {
    if (isSearchOpen && allNavigableItems.length > 0) {
      const el = document.getElementById(`search-result-item-${selectedIndex}`);
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, isSearchOpen, allNavigableItems.length]);

  const addItem = (m: Medicine) => {
    // Expiry check
    if (isMedicineExpired(m.expiry)) {
      toast.error(`Cannot add ${m.name} (Batch: ${m.batch}) — expired in ${formatExpiryDisplay(m.expiry)}!`);
      return;
    }

    // Out of stock warning
    if (m.stock <= 0) {
      toast.warning(`${m.name} is currently out of stock (0 units).`);
    }

    const info = parsePackInfo(m);
    const unitMrp = calculateUnitMrp(m.mrp, info.packSize);

    setItems((prev) => {
      const found = prev.find((i) => i.id === m.id);
      if (found) {
        // Increment base units by 1
        const nextQty = (found.qty || 1) + 1;
        const pSize = found.packSize ?? info.packSize;
        const pQty = Math.floor(nextQty / pSize);
        const lQty = nextQty % pSize;
        return prev.map((i) =>
          i.id === m.id
            ? { ...i, qty: nextQty, packQty: pQty, looseQty: lQty }
            : i
        );
      }
      // Initial quantity: 1 base selling unit
      const initialQty = 1;
      const initialPackQty = Math.floor(initialQty / info.packSize);
      const initialLooseQty = initialQty % info.packSize;
      return [
        ...prev,
        {
          ...m,
          qty: initialQty,
          packQty: initialPackQty,
          looseQty: initialLooseQty,
          packSize: info.packSize,
          isConvertible: info.isConvertible,
          unitMrp,
          packLabel: info.packLabel,
          unitLabel: info.unitLabel,
          discount: 0,
        },
      ];
    });

    setQuery("");
    setIsSearchOpen(false);
    toast.success(`Added ${m.name}`);

    // Immediately focus the quantity input so cashier can check stock and set billing quantity
    setTimeout(() => {
      const qtyInput = document.getElementById(`qty-input-${m.id}`) as HTMLInputElement | null;
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }, 50);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchOpen || allNavigableItems.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        e.preventDefault();
        // If query is an exact barcode match
        const found = medicines.find(
          (m) => m.id.toLowerCase() === query.toLowerCase() || m.batch.toLowerCase() === query.toLowerCase()
        );
        if (found) addItem(found);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % allNavigableItems.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allNavigableItems.length) % allNavigableItems.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // Guard against double-Enter spam
      const now = Date.now();
      if (now - lastAddTimestamp.current < 250) return;
      lastAddTimestamp.current = now;

      const target = allNavigableItems[selectedIndex];
      if (target) {
        addItem(target);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsSearchOpen(false);
      return;
    }
  };

  const onScan = (scannedCode: string) => {
    const raw = scannedCode.trim();
    let batchParam: string | null = null;
    let medParam: string | null = null;
    let shopParam: string | null = null;

    // Check if scanned value is a secure QR payload URL (e.g. /medicine-lookup?shop=T001&med=PAR0001&batch=B123)
    try {
      if (raw.includes("medicine-lookup") || (raw.includes("batch=") && raw.includes("med="))) {
        const dummyBase = "http://localhost";
        const urlObj = raw.startsWith("http") ? new URL(raw) : new URL(dummyBase + (raw.startsWith("/") ? "" : "/") + raw);
        batchParam = urlObj.searchParams.get("batch");
        medParam = urlObj.searchParams.get("med");
        shopParam = urlObj.searchParams.get("shop");
      }
    } catch {}

    if (batchParam) {
      // Exact Batch Resolution
      const normBatch = batchParam.trim().toLowerCase();
      const normMed = medParam ? medParam.trim().toLowerCase() : null;

      const exactBatch = medicines.find((m) => {
        const bMatch = m.batch.trim().toLowerCase() === normBatch;
        if (!bMatch) return false;
        if (!normMed) return true;
        return (
          m.id.toLowerCase() === normMed ||
          (m.code && m.code.toLowerCase() === normMed) ||
          normalizeMedName(m.name) === normalizeMedName(normMed)
        );
      });

      if (exactBatch) {
        addItem(exactBatch);
        toast.success(`Scanned QR: Added ${exactBatch.name} (Batch: ${exactBatch.batch})`);
        return;
      } else {
        toast.error(`Batch not found: "${batchParam}". This exact batch does not exist in inventory.`);
        return;
      }
    }

    // Standard barcode (Code 128) or direct code/batch match
    const found = medicines.find(
      (m) =>
        m.id.toLowerCase() === raw.toLowerCase() ||
        (m.code && m.code.toLowerCase() === raw.toLowerCase()) ||
        m.batch.toLowerCase() === raw.toLowerCase(),
    );
    if (found) {
      addItem(found);
      toast.success(`Scanned: Added ${found.name}`);
    } else {
      setQuery(raw);
      toast(`Scanned: ${raw} — searching inventory`);
    }
  };

  const updateItemQty = (id: string, newQty: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const pSize = i.packSize || 1;
        const validQty = Math.max(1, newQty);
        return {
          ...i,
          qty: validQty,
          packQty: Math.floor(validQty / pSize),
          looseQty: validQty % pSize,
        };
      })
    );
  };

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
   * Pharmacy Retail Billing: MRP is already INCLUSIVE of GST
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
    setBillNote("");
    setQuery("");
    setIsSearchOpen(false);
  };

  const actor = me ? { id: me.id, name: me.name } : undefined;

  const paymentLabel = () => {
    if (payment === "split") return `Cash ₹${splitAmounts.cash} + Online ₹${splitAmounts.online}`;
    if (payment === "loan") return "Credit / Loan";
    return payment;
  };

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
        note: billNote.trim() || undefined,
        items: items.map((it) => {
          const unitRate = it.unitMrp !== undefined ? it.unitMrp : it.mrp;
          const line = unitRate * it.qty;
          const itemDisc = totals.sub > 0 ? (line / totals.sub) * totals.disc : 0;
          return {
            id: it.id,
            name: it.name,
            batch: it.batch,
            qty: it.qty,
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
    if (items.length === 0) return toast.error("Add at least one medicine to the bill");
    if (payment === "split" && splitAmounts.cash + splitAmounts.online <= 0)
      return toast.error("Enter split amounts first");
    if (payment === "loan") {
      if (!customer.phone.trim())
        return toast.error("Customer phone number is required for Credit / Loan sale");

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
    if (items.length === 0) return toast.error("Add at least one medicine to the bill");
    if (payment === "split" && splitAmounts.cash + splitAmounts.online <= 0)
      return toast.error("Enter split amounts first");
    if (payment === "loan") {
      if (!customer.phone.trim())
        return toast.error("Customer phone number is required for Credit / Loan sale");
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

  const whatsAppBill = async () => {
    if (items.length === 0) return toast.error("Add at least one medicine");
    if (!customer.name.trim()) return toast.error("Customer name is mandatory");
    if (!customer.phone.trim()) return toast.error("Customer phone number is mandatory for WhatsApp");
    if (payment === "split" && splitAmounts.cash + splitAmounts.online <= 0)
      return toast.error("Enter split amounts first");

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
    toast.success(`Bill put on hold · ${rec.id}`);
    clear();
  };

  const resumeHeld = (id: string) => {
    const found = actions.resumeHeld(id);
    if (!found) return;
    setCustomer({ name: found.customerName, phone: found.phone, doctor: found.doctor ?? "" });
    setItems(found.items.map((it) => {
      const anyIt = it as any;
      const info = parsePackInfo(anyIt);
      const unitMrp = calculateUnitMrp(it.mrp, info.packSize);
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
        company: anyIt.company ?? "",
        pack: anyIt.pack ?? "",
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
    toast.success(`Resumed hold bill ${id}`);
  };

  // Keyboard shortcuts handler for Billing page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        clear();
        searchInputRef.current?.focus();
        toast.info("Started new bill");
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        holdBill();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        saveBill();
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        printBill();
        return;
      }
    };

    const handleF2Event = () => {
      clear();
      searchInputRef.current?.focus();
      toast.info("Started new bill");
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("rsp:shortcut-f2", handleF2Event);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("rsp:shortcut-f2", handleF2Event);
    };
  }, [items, customer, payment, splitAmounts, totals, billNote]);

  // Click outside search dropdown to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Total quantity of units in bill
  const totalBillUnits = items.reduce((sum, it) => sum + it.qty, 0);

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
        "flex-1 flex flex-col items-center justify-center gap-1.5 rounded-lg border py-3 text-xs font-medium transition-all cursor-pointer",
        payment === mode
          ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs ring-1 ring-emerald-600/20"
          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900",
      )}
    >
      <Icon className={cn("h-4 w-4", payment === mode ? "text-emerald-600" : "text-slate-500")} />
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

      {/* Bill Note Dialog */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <FileText className="h-5 w-5 text-emerald-600" /> Bill Note / Instructions
            </DialogTitle>
            <DialogDescription>
              Add optional doctor advice, dosage directions, or bill remarks.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="e.g. Dosage: 1-0-1 after meals for 5 days"
              value={billNote}
              onChange={(e) => setBillNote(e.target.value)}
              className="text-sm h-11 focus-visible:ring-emerald-500"
            />
          </div>
          <DialogFooter>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setNoteOpen(false)}
            >
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="px-4 lg:px-2 pb-24 xl:pb-6 pt-1 xl:pr-[326px] min-h-[calc(100vh-4rem)] bg-slate-50/50">
        {/* ── MAIN BILLING COLUMN ── */}
        <div className="space-y-1.5 min-w-0">

          {/* 1. Header meta & Customer Info Card */}
          <Card className="p-3.5 bg-white shadow-xs border-slate-200">
            {/* <div className="flex flex-wrap items-center gap-3 justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">

                <div>
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Invoice No</div>
                  <div className="font-bold tracking-tight text-slate-900 text-sm">{inv}</div>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Date</div>
                <div className="font-semibold text-slate-800 text-xs">{today || "—"}</div>
              </div>
              <div className="hidden sm:block">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cashier</div>
                <div className="font-semibold text-slate-800 text-xs">{me ? `${me.name}` : "—"}</div>
              </div>
              <Badge variant="secondary" className="gap-1.5 font-normal text-[11px] bg-slate-100 text-slate-700 border-slate-200">
                <Keyboard className="h-3 w-3 text-slate-500" /> F2 New · F9 Save · F10 Print · F4 Hold
              </Badge>
            </div> */}

            {f.customerCapture && (
              <div className={cn("grid gap-2.5 mt-0", f.doctorField ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-9 text-xs focus-visible:ring-emerald-500"
                      placeholder="10-digit mobile number"
                      value={customer.phone}
                      onChange={(e) => onPhoneChange(e.target.value)}
                    />
                    {matched && (
                      <UserCheck className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-600" />
                    )}
                  </div>
                  {matched ? (
                    <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                      <Check className="h-3 w-3" /> Existing customer linked
                    </div>
                  ) : customer.phone.trim() ? (
                    <div className="text-[10px] text-blue-600">New customer will be created</div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Customer Name</Label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-9 text-xs focus-visible:ring-emerald-500"
                      placeholder="Customer name (defaults to Walk-in)"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    />
                  </div>
                </div>

                {f.doctorField && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Doctor</Label>
                    <div className="relative">
                      <Stethoscope className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="pl-8 h-9 text-xs focus-visible:ring-emerald-500"
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

          {/* Outstanding Loan Warning */}
          {matched && (() => {
            const cust = customers.find((c) => c.id === matched);
            if (!cust || !cust.balance || cust.balance <= 0) return null;
            return (
              <div className="rounded-lg border border-amber-300 bg-amber-50/90 px-3.5 py-2.5 flex items-center gap-3">
                <AlertCircle className="text-amber-600 h-5 w-5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-amber-900 text-xs">
                    Outstanding Loan — ₹{cust.balance.toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] text-amber-700">
                    {cust.name} has an unpaid balance. Settle here or bill as Credit.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClearLoanOpen(true)}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md font-medium shrink-0 shadow-xs transition-colors cursor-pointer"
                >
                  Clear Loan →
                </button>
              </div>
            );
          })()}

          {/* 2. Professional Medicine Search Bar with Barcode & Hold (Aligned Horizontally) */}
          <div className="relative z-30">
            <Card className="p-3 bg-white shadow-xs border-slate-200">
              <div className="flex items-center gap-2">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                  <Input
                    id="medicine-search-input"
                    ref={searchInputRef}
                    autoFocus
                    className={cn(
                      "pl-10 pr-9 h-11 text-sm bg-white border-slate-300 rounded-lg transition-all",
                      "focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-600",
                    )}
                    placeholder="Search medicine name, brand, composition or scan barcode..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setIsSearchOpen(false);
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Barcode Button */}
                {f.barcode && (
                  <Button
                    variant="outline"
                    className="h-11 px-3.5 gap-1.5 font-medium border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0"
                    onClick={() => setScanOpen(true)}
                  >
                    <ScanBarcode className="h-4 w-4 text-emerald-600" /> Barcode
                  </Button>
                )}

                {/* Hold Button */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-11 px-3.5 gap-1.5 font-medium border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0"
                    >
                      <PauseCircle className="h-4 w-4 text-amber-500" /> Hold ({held.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0 shadow-lg">
                    <div className="px-3.5 py-2.5 border-b text-xs font-semibold text-slate-800 bg-slate-50">
                      Bills On Hold ({held.length})
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {held.length === 0 && (
                        <div className="p-4 text-xs text-muted-foreground text-center">No bills on hold.</div>
                      )}
                      {held.map((h) => (
                        <button
                          key={h.id}
                          onClick={() => resumeHeld(h.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left transition-colors cursor-pointer"
                        >
                          <PlayCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-slate-800 truncate">
                              {h.id} · {h.customerName || "Walk-in"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {h.items.length} items · {new Date(h.at).toLocaleTimeString("en-IN")}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </Card>

            {/* 3. Structured Search Results Dropdown (Image 2 Direction) */}
            {isSearchOpen && query.trim().length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden z-50 flex flex-col max-h-[520px]"
              >
                <div className="overflow-y-auto flex-1 p-2 space-y-3 divide-y divide-slate-100">
                  {/* Section 1: Exact Matches */}
                  <div className="space-y-1">
                    <div className="px-2 pt-1 pb-1.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Exact Matches (Medicine Name)
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {exactMatches.length} matching item{exactMatches.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {exactMatches.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No direct matches found. Try another medicine name, brand or barcode.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {exactMatches.map((m, idx) => {
                          const pInfo = parsePackInfo(m);
                          const unitPrice = calculateUnitMrp(m.mrp, pInfo.packSize);
                          const isSelected = selectedIndex === idx;
                          const expired = isMedicineExpired(m.expiry);
                          const expSoon = isMedicineExpiringSoon(m.expiry);
                          const locationText = formatLocationDisplay(m);

                          return (
                            <div
                              key={m.id}
                              id={`search-result-item-${idx}`}
                              onClick={() => addItem(m)}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer text-left gap-2",
                                isSelected
                                  ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400 shadow-xs"
                                  : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200",
                              )}
                            >
                              {/* Left Thumbnail + Medicine Details (Auto-fit, truncate) */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                  <Pill className="h-4.5 w-4.5 text-emerald-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  {/* Main Brand / Medicine Name — Prominent and Bold */}
                                  <div className="font-bold text-sm text-slate-900 leading-tight truncate" title={m.name}>
                                    {m.name}
                                  </div>
                                  {/* Brand & Manufacturer • Composition */}
                                  <div className="text-xs text-slate-600 mt-0.5 truncate" title={[m.company, m.generic && m.generic !== "Branded" && m.generic !== "Generic" ? m.generic : null].filter(Boolean).join(" • ")}>
                                    {[m.company, m.generic && m.generic !== "Branded" && m.generic !== "Generic" ? m.generic : null]
                                      .filter(Boolean)
                                      .join(" • ")}
                                  </div>
                                  {/* Pack Size */}
                                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                                    Pack: {pInfo.packSize} {pInfo.unitLabel}{pInfo.packSize > 1 ? "s" : ""}
                                  </div>
                                </div>
                              </div>

                              {/* Batch & Expiry Column (Combined 2-line for compact fit) */}
                              <div className="text-left px-1 w-20 shrink-0">
                                <div className="text-[10px] text-slate-400 uppercase font-semibold">Batch / Exp</div>
                                <div className="font-semibold text-xs text-slate-800 font-mono truncate" title={m.batch}>{m.batch}</div>
                                <div className={cn(
                                  "text-[10px] whitespace-nowrap",
                                  expired ? "text-red-600 font-bold" : expSoon ? "text-amber-600" : "text-slate-500"
                                )}>
                                  {formatExpiryDisplay(m.expiry)}
                                </div>
                              </div>

                              {/* Qty Column */}
                              <div className="text-left px-1 w-16 shrink-0">
                                <div className="text-[10px] text-slate-400 uppercase font-semibold">Qty</div>
                                <div className={cn(
                                  "font-bold text-xs whitespace-nowrap",
                                  m.stock <= 0 ? "text-red-500" : m.stock < 20 ? "text-amber-600" : "text-emerald-600"
                                )}>
                                  {(() => {
                                    const packSize = Math.max(1, pInfo.packSize || 1);
                                    const stockUnits = Math.max(0, Number(m.stock) || 0);
                                    const packs = packSize > 1 ? Math.floor(stockUnits / packSize) : stockUnits;
                                    const extra = packSize > 1 ? stockUnits % packSize : 0;
                                    return extra > 0 ? (
                                      <span>
                                        {packs}
                                        <span className="text-[10px] font-bold ml-0.5">+{extra}</span>
                                      </span>
                                    ) : (
                                      <span>{packs}</span>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Location Badge Column */}
                              <div className="hidden sm:block text-left px-1 w-20 shrink-0">
                                <div className="text-[10px] text-slate-400 uppercase font-semibold">Location</div>
                                {locationText !== "Location not assigned" ? (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono bg-blue-50 text-blue-700 border border-blue-200 truncate max-w-full" title={locationText}>
                                    <MapPin className="h-2.5 w-2.5 text-blue-500 shrink-0" /> {locationText}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                                )}
                              </div>

                              {/* MRP Column (Pack-wise) */}
                              <div className="text-right pl-1 pr-1 w-20 shrink-0">
                                <div className="font-bold text-slate-900 text-sm tabular-nums whitespace-nowrap">
                                  ₹{Number(m.mrp).toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-500 whitespace-nowrap">
                                  / {pInfo.packLabel || "Pack"}
                                </div>
                              </div>

                              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Section 2: Alternative Brands (Same Composition) */}
                  <div className="pt-2 space-y-1">
                    <div className="px-2 pt-1 pb-1.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                        Alternative Brands (Same Composition)
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {alternativeBrands.length > 0 ? `${alternativeBrands.length} verified alternatives` : ""}
                      </span>
                    </div>

                    {alternativeBrands.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground italic">
                        No verified alternative brands found for this composition in stock.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {alternativeBrands.map((alt, aIdx) => {
                          const overallIndex = exactMatches.length + aIdx;
                          const pInfo = parsePackInfo(alt);
                          const unitPrice = calculateUnitMrp(alt.mrp, pInfo.packSize);
                          const isSelected = selectedIndex === overallIndex;
                          const expired = isMedicineExpired(alt.expiry);
                          const expSoon = isMedicineExpiringSoon(alt.expiry);
                          const locationText = formatLocationDisplay(alt);

                          return (
                            <div
                              key={alt.id}
                              id={`search-result-item-${overallIndex}`}
                              onClick={() => addItem(alt)}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer text-left gap-2",
                                isSelected
                                  ? "bg-blue-50/70 border-blue-300 ring-1 ring-blue-400 shadow-xs"
                                  : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200",
                              )}
                            >
                              {/* Left Thumbnail + Details (Auto-fit, truncate) */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                  <Pill className="h-4.5 w-4.5 text-blue-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  {/* Main Brand Name */}
                                  <div className="font-bold text-sm text-slate-900 leading-tight truncate" title={alt.name}>
                                    {alt.name}
                                  </div>
                                  {/* Brand & Manufacturer • Composition */}
                                  <div className="text-xs text-slate-600 mt-0.5 truncate" title={[alt.company, alt.generic].filter(Boolean).join(" • ")}>
                                    {[alt.company, alt.generic].filter(Boolean).join(" • ")}
                                  </div>
                                  {/* Pack Size */}
                                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                                    Pack: {pInfo.packSize} {pInfo.unitLabel}{pInfo.packSize > 1 ? "s" : ""}
                                  </div>
                                </div>
                              </div>

                              {/* Batch & Expiry Column */}
                              <div className="text-left px-1 w-20 shrink-0">
                                <div className="text-[10px] text-slate-400 uppercase font-semibold">Batch / Exp</div>
                                <div className="font-semibold text-xs text-slate-800 font-mono truncate" title={alt.batch}>{alt.batch}</div>
                                <div className={cn(
                                  "text-[10px] whitespace-nowrap",
                                  expired ? "text-red-600 font-bold" : expSoon ? "text-amber-600" : "text-slate-500"
                                )}>
                                  {formatExpiryDisplay(alt.expiry)}
                                </div>
                              </div>

                              {/* Qty Column */}
                              <div className="text-left px-1 w-16 shrink-0">
                                <div className="text-[10px] text-slate-400 uppercase font-semibold">Qty</div>
                                <div className={cn(
                                  "font-bold text-xs whitespace-nowrap",
                                  alt.stock <= 0 ? "text-red-500" : alt.stock < 20 ? "text-amber-600" : "text-emerald-600"
                                )}>
                                  {(() => {
                                    const packSize = Math.max(1, pInfo.packSize || 1);
                                    const stockUnits = Math.max(0, Number(alt.stock) || 0);
                                    const packs = packSize > 1 ? Math.floor(stockUnits / packSize) : stockUnits;
                                    const extra = packSize > 1 ? stockUnits % packSize : 0;
                                    return extra > 0 ? (
                                      <span>
                                        {packs}
                                        <span className="text-[10px] font-bold ml-0.5">+{extra}</span>
                                      </span>
                                    ) : (
                                      <span>{packs}</span>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Location */}
                              <div className="hidden sm:block text-left px-1 w-20 shrink-0">
                                <div className="text-[10px] text-slate-400 uppercase font-semibold">Location</div>
                                {locationText !== "Location not assigned" ? (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono bg-blue-50 text-blue-700 border border-blue-200 truncate max-w-full" title={locationText}>
                                    <MapPin className="h-2.5 w-2.5 text-blue-500 shrink-0" /> {locationText}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                                )}
                              </div>

                              {/* MRP Column (Pack-wise) */}
                              <div className="text-right pl-1 pr-1 w-20 shrink-0">
                                <div className="font-bold text-slate-900 text-sm tabular-nums whitespace-nowrap">
                                  ₹{Number(alt.mrp).toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-500 whitespace-nowrap">
                                  / {pInfo.packLabel || "Pack"}
                                </div>
                              </div>

                              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer bar with Keyboard navigation instructions */}
                <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <Keyboard className="h-3.5 w-3.5 text-slate-500" />
                    <span>Use <strong>↑ ↓</strong> to navigate &nbsp;|&nbsp; Press <strong>Enter</strong> to select &nbsp;|&nbsp; <strong>Esc</strong> to close</span>
                  </div>
                  <div className="text-slate-500 font-medium">
                    Showing {allNavigableItems.length} result{allNavigableItems.length !== 1 ? "s" : ""} for &quot;{query}&quot;
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Bill Items Table Card (Image 1 Direction) */}
          <Card className="overflow-hidden bg-white shadow-xs border-slate-200">
            {/* Table Header Controls */}
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-slate-500 text-sm">
                Bill Items ({items.length})
              </div>
              <div className="flex items-center gap-1.5 font-bold tracking-tight text-slate-500 text-sm">
                <ReceiptText className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Invoice No: {inv}</span>
              </div>
              <div className="flex items-center gap-2">
                {billNote && (
                  <Badge variant="outline" className="text-[11px] text-emerald-700 bg-emerald-50 border-emerald-200">
                    Note attached
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setNoteOpen(true)}
                  className="h-8 text-xs gap-1 font-medium border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-500" /> {billNote ? "Edit Note" : "Add Note"}
                </Button>
                {items.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clear}
                    className="h-8 text-xs gap-1 font-medium border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear All
                  </Button>
                )}
              </div>
            </div>

            {/* Table Content (No horizontal scroll, auto-fit table-fixed) */}
            <div className="max-h-[46vh] overflow-y-auto overflow-x-hidden">
              <table className="w-full caption-bottom text-sm table-fixed border-collapse">
                <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                  <TableRow className="border-b border-slate-200 text-slate-600 text-xs font-semibold">
                    <TableHead className="w-8 text-center p-2">#</TableHead>
                    <TableHead className="min-w-0 p-2 text-left">Medicine Details</TableHead>
                    <TableHead className="w-24 p-2 text-left">Batch / Exp</TableHead>
                    <TableHead className="w-14 text-center p-2">Stock</TableHead>
                    <TableHead className="w-14 text-center p-2">Qty</TableHead>
                    <TableHead className="w-16 text-right p-2">Price</TableHead>
                    {f.gst && <TableHead className="w-12 text-center p-2">GST</TableHead>}
                    <TableHead className="w-16 text-right p-2">Total</TableHead>
                    <TableHead className="w-10 text-center p-2">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={f.gst ? 9 : 8} className="text-center py-16 text-slate-400">
                        <Search className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        <div className="font-medium text-slate-600 text-sm">No items added to bill</div>
                        <div className="text-xs text-slate-400 mt-0.5">Search medicine name, composition or scan barcode above.</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((it, idx) => {
                      const unitRate = it.unitMrp !== undefined ? it.unitMrp : it.mrp;
                      const line = unitRate * it.qty;
                      const uLabel = it.unitLabel || "Unit";

                      return (
                        <TableRow key={it.id} className="hover:bg-slate-50/80 border-b border-slate-100 text-xs">
                          {/* 1. Row Index */}
                          <TableCell className="text-center font-medium text-slate-400 py-2 px-1 text-xs">{idx + 1}</TableCell>

                          {/* 2. Medicine Details (Auto width, truncated with hover tooltip) */}
                          <TableCell className="py-2 px-2 min-w-0">
                            <div
                              className="font-bold text-slate-900 text-xs truncate cursor-help"
                              title={it.name}
                            >
                              {it.name}
                            </div>
                            <div
                              className="text-[11px] text-slate-500 font-medium truncate cursor-help"
                              title={[it.company, it.generic].filter(Boolean).join(" • ")}
                            >
                              {it.company || "—"}
                            </div>
                            {it.generic && it.generic !== "Branded" && it.generic !== "Generic" && (
                              <div
                                className="text-[10px] text-slate-400 truncate cursor-help"
                                title={it.generic}
                              >
                                {it.generic}
                              </div>
                            )}
                          </TableCell>

                          {/* 3. Batch / Expiry */}
                          <TableCell className="py-2 px-2">
                            <div className="font-semibold text-slate-800 font-mono text-xs truncate" title={it.batch}>{it.batch}</div>
                            <div className="text-[11px] text-slate-500 whitespace-nowrap">{formatExpiryDisplay(it.expiry)}</div>
                          </TableCell>

                          {/* 4. Stock (Number only) */}
                          <TableCell className="text-center py-2 px-1">
                            <span className="inline-flex items-center justify-center min-w-[30px] px-1.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {it.stock}
                            </span>
                          </TableCell>

                          {/* 5. Qty (Units) Direct Clean Input */}
                          <TableCell className="text-center py-2 px-1">
                            <div className="flex items-center justify-center">
                              <Input
                                id={`qty-input-${it.id}`}
                                type="number"
                                min={1}
                                value={it.qty || ""}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val)) updateItemQty(it.id, Math.max(1, val));
                                }}
                                onBlur={() => {
                                  if (!it.qty || it.qty < 1) updateItemQty(it.id, 1);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (!it.qty || it.qty < 1) updateItemQty(it.id, 1);
                                    searchInputRef.current?.focus();
                                    searchInputRef.current?.select();
                                  }
                                }}
                                className="h-7 w-12 text-center font-bold text-xs border border-emerald-500 rounded-md focus-visible:ring-emerald-500 focus-visible:border-emerald-600 bg-white shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </TableCell>

                          {/* 6. Unit Price */}
                          <TableCell className="text-right tabular-nums py-2 px-1.5">
                            <div className="font-bold text-slate-900 text-xs whitespace-nowrap">₹{unitRate.toFixed(2)}</div>
                            <div className="text-[10px] text-slate-400 whitespace-nowrap">/ {uLabel}</div>
                          </TableCell>

                          {/* 7. GST */}
                          {f.gst && (
                            <TableCell className="text-center font-medium text-slate-600 py-2 px-1 text-xs">
                              {it.gst}%
                            </TableCell>
                          )}

                          {/* 8. Total */}
                          <TableCell className="text-right font-bold tabular-nums text-slate-900 text-xs py-2 px-1.5 whitespace-nowrap">
                            ₹{line.toFixed(2)}
                          </TableCell>

                          {/* 9. Action (Delete) */}
                          <TableCell className="text-center py-2 px-1">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => removeItem(it.id)}
                              className="h-6 w-6 text-red-500 border-red-200 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Remove item"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </table>
            </div>

            {/* Table Footer: Item counts and Discount Controls */}
            {items.length > 0 && (
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 w-full">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                  <span>Items: <strong>{items.length}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>Total Units: <strong>{totalBillUnits}</strong></span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="total-bill-discount-input" className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5 text-emerald-600" /> Bill Discount:
                    </Label>
                    <div className="flex items-center rounded-md border border-slate-300 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDiscountType("pct")}
                        className={cn(
                          "px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                          discountType === "pct" ? "bg-emerald-600 text-white font-bold" : "text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("amt")}
                        className={cn(
                          "px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                          discountType === "amt" ? "bg-emerald-600 text-white font-bold" : "text-slate-600 hover:bg-slate-100"
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
                      className="h-8 w-20 text-center text-xs font-bold focus-visible:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {totals.disc > 0 && (
                      <span className="text-xs font-semibold text-emerald-600">
                        (-₹{totals.disc.toFixed(2)})
                      </span>
                    )}
                  </div>

                  {/* Quick percentage pills */}
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
                          "text-xs px-2.5 py-1 rounded-md border transition-colors cursor-pointer",
                          discountType === "pct" && totalDiscountPct === pct
                            ? "bg-emerald-600 text-white font-bold border-emerald-600"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
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

          {/* 5. Customer History Panel (If Matched) */}
          {matched && (
            <CustomerHistoryPanel
              customerId={matched}
              onAddDiscount={applyLoyaltyDiscount}
            />
          )}

          {/* 6. Mobile & Tablet Only Summary Cards */}
          <div className="block xl:hidden space-y-3.5">
            {/* Bill Summary */}
            <Card className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="text-base font-bold text-foreground mb-3">Bill Summary</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="font-medium text-foreground tabular-nums">₹{totals.sub.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-amber-500 tabular-nums">₹{totals.disc.toFixed(2)}</span>
                </div>
                {f.gst && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">GST (Included)</span>
                    <span className="font-medium text-foreground tabular-nums">₹{totals.gst.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground/70">Round Off</span>
                  <span className="text-muted-foreground/70 tabular-nums">₹{totals.round.toFixed(2)}</span>
                </div>
                <hr className="border-border/60 my-2" />
                <div className="flex items-center justify-between pt-0.5">
                  <span className="font-bold text-foreground text-base">Grand Total</span>
                  <span className="text-3xl font-extrabold text-emerald-500 tracking-tight tabular-nums">
                    ₹{totals.grand.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </Card>

            {/* Payment Method */}
            <Card className="p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div className="text-base font-bold text-foreground mb-3">Payment</div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPayment("cash")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                    payment === "cash"
                      ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                      : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Banknote className={cn("h-4 w-4 mb-1", payment === "cash" ? "text-emerald-600" : "text-muted-foreground")} />
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPayment("online")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                    payment === "online"
                      ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                      : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Smartphone className={cn("h-4 w-4 mb-1", payment === "online" ? "text-emerald-600" : "text-muted-foreground")} />
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => { setPayment("split"); setSplitOpen(true); }}
                  className={cn(
                    "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                    payment === "split"
                      ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                      : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <GitFork className={cn("h-4 w-4 mb-1", payment === "split" ? "text-emerald-600" : "text-muted-foreground")} />
                  Split
                </button>
                <button
                  type="button"
                  onClick={() => setPayment("loan")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                    payment === "loan"
                      ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                      : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CreditCard className={cn("h-4 w-4 mb-1", payment === "loan" ? "text-emerald-600" : "text-muted-foreground")} />
                  Credit
                </button>
              </div>
            </Card>

            {/* Action buttons on tablet */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl cursor-pointer" onClick={saveBill}>
                  <Save className="h-4 w-4 mr-1.5" /> Save
                </Button>
                <Button variant="outline" className="h-11 border border-emerald-500 bg-white hover:bg-emerald-50 text-emerald-600 font-semibold text-sm rounded-xl cursor-pointer" onClick={printBill}>
                  <Printer className="h-4 w-4 mr-1.5" /> Print
                </Button>
              </div>
              <Button variant="outline" className="w-full h-11 border border-emerald-500 bg-white hover:bg-emerald-50 text-emerald-600 font-semibold text-sm rounded-xl cursor-pointer flex items-center justify-center gap-1.5" onClick={whatsAppBill}>
                <MessageCircle className="h-4 w-4" /> WhatsApp Bill
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm rounded-xl cursor-pointer" onClick={holdBill}>
                  <PauseCircle className="h-4 w-4 mr-1.5 text-slate-600" /> Hold
                </Button>
                <Button variant="outline" className="h-11 border border-slate-200 bg-white hover:bg-red-50 text-red-500 font-semibold text-sm rounded-xl cursor-pointer" onClick={clear}>
                  <X className="h-4 w-4 mr-1.5" /> Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR (Desktop Fixed, right-0 top-16 bottom-0, without move) ── */}
        <div className="hidden xl:flex fixed right-0 top-16 bottom-0 w-[320px] bg-card border-l border-border flex-col gap-3 p-4 pt-0 overflow-hidden z-30 shadow-xs">

          {/* Bill Summary */}
          <Card className="p-4 rounded-2xl bg-card border border-border shadow-xs shrink-0">
            <div className="text-base font-bold text-foreground mb-3">Bill Summary</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="font-medium text-foreground tabular-nums">₹{totals.sub.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium text-amber-500 tabular-nums">₹{totals.disc.toFixed(2)}</span>
              </div>
              {f.gst && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">GST (Included)</span>
                  <span className="font-medium text-foreground tabular-nums">₹{totals.gst.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground/70">Round Off</span>
                <span className="text-muted-foreground/70 tabular-nums">₹{totals.round.toFixed(2)}</span>
              </div>
              <hr className="border-border/60 my-2" />
              <div className="flex items-center justify-between pt-0.5">
                <span className="font-bold text-foreground text-base">Grand Total</span>
                <span className="text-3xl font-extrabold text-emerald-500 tracking-tight tabular-nums">
                  ₹{totals.grand.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </Card>

          {/* Payment */}
          <Card className="p-4 rounded-2xl bg-card border border-border shadow-xs shrink-0">
            <div className="text-base font-bold text-foreground mb-3">Payment</div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPayment("cash")}
                className={cn(
                  "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                  payment === "cash"
                    ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                    : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Banknote className={cn("h-4 w-4 mb-1", payment === "cash" ? "text-emerald-600" : "text-muted-foreground")} />
                Cash
              </button>

              <button
                type="button"
                onClick={() => setPayment("online")}
                className={cn(
                  "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                  payment === "online"
                    ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                    : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Smartphone className={cn("h-4 w-4 mb-1", payment === "online" ? "text-emerald-600" : "text-muted-foreground")} />
                Online
              </button>

              <button
                type="button"
                onClick={() => {
                  setPayment("split");
                  setSplitOpen(true);
                }}
                className={cn(
                  "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                  payment === "split"
                    ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                    : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <GitFork className={cn("h-4 w-4 mb-1", payment === "split" ? "text-emerald-600" : "text-muted-foreground")} />
                Split
              </button>

              <button
                type="button"
                onClick={() => setPayment("loan")}
                className={cn(
                  "flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                  payment === "loan"
                    ? "border-emerald-500 bg-emerald-50/80 text-emerald-700 shadow-xs ring-1 ring-emerald-500/20"
                    : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <CreditCard className={cn("h-4 w-4 mb-1", payment === "loan" ? "text-emerald-600" : "text-muted-foreground")} />
                Credit
              </button>
            </div>

            {/* Split amounts info */}
            {payment === "split" && (
              <div className="mt-2 space-y-1">
                {splitAmounts.cash + splitAmounts.online > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="rounded bg-muted px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-muted-foreground">Cash</span>
                      <span className="font-semibold tabular-nums">₹{splitAmounts.cash}</span>
                    </div>
                    <div className="rounded bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-emerald-700">Online</span>
                      <span className="font-semibold tabular-nums text-emerald-700">₹{splitAmounts.online}</span>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="w-full text-center text-primary underline underline-offset-2 text-xs pt-0.5 cursor-pointer"
                  onClick={() => setSplitOpen(true)}
                >
                  {splitAmounts.cash + splitAmounts.online > 0 ? "Edit split amounts" : "Enter split amounts →"}
                </button>
              </div>
            )}

            {/* Credit notice */}
            {payment === "loan" && (
              <div className="mt-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <CreditCard className="inline h-3 w-3 mr-1" />
                Bill saved as <strong>Credit</strong> & added to outstanding customer balance.
              </div>
            )}
          </Card>

          {/* Action Buttons */}
          <div className="space-y-2 shrink-0">
            {/* Row 1: Save & Print */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl cursor-pointer"
                onClick={saveBill}
              >
                <Save className="h-4 w-4 mr-1.5" /> Save
              </Button>

              <Button
                variant="outline"
                className="h-11 border border-emerald-500 bg-white hover:bg-emerald-50 text-emerald-600 font-semibold text-sm rounded-xl cursor-pointer"
                onClick={printBill}
              >
                <Printer className="h-4 w-4 mr-1.5" /> Print
              </Button>
            </div>

            {/* Row 2: WhatsApp Bill */}
            <Button
              variant="outline"
              className="w-full h-11 border border-emerald-500 bg-white hover:bg-emerald-50 text-emerald-600 font-semibold text-sm rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
              onClick={whatsAppBill}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp Bill
            </Button>

            {/* Row 3: Hold & Cancel */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-11 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm rounded-xl cursor-pointer"
                onClick={holdBill}
              >
                <PauseCircle className="h-4 w-4 mr-1.5 text-slate-600" /> Hold
              </Button>

              <Button
                variant="outline"
                className="h-11 border border-slate-200 bg-white hover:bg-red-50 text-red-500 font-semibold text-sm rounded-xl cursor-pointer"
                onClick={clear}
              >
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
            </div>
          </div>

          {/* Printer status pill */}
          <div className="mt-auto rounded-lg border border-dashed border-slate-200 px-3 py-2 flex items-center gap-2 text-[11px] text-slate-500 shrink-0">
            <Printer className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{printer.paperSize} thermal · Change in Settings</span>
          </div>
        </div>
      </div>

      {/* ── STICKY BOTTOM CHECKOUT BAR (Mobile & Tablet screens) ── */}
      <div className="xl:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 shadow-lg z-30 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Amount</div>
          <div className="text-xl font-bold text-emerald-600 tabular-nums">
            ₹{totals.grand.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 border-emerald-600 text-emerald-700"
            onClick={printBill}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
            onClick={saveBill}
          >
            <Save className="h-4 w-4 mr-1.5" /> Save Bill
          </Button>
        </div>
      </div>

      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScan} mode="barcode" />

      {/* Clear Loan dialog */}
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
