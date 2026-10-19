import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, IndianRupee, Receipt, Plus, Trash2,
  Search, ArrowUpCircle, ArrowDownCircle, Wallet, Calendar, X,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import type { FinanceEntry } from "@/lib/store";
import { toast } from "sonner";
import { getUser } from "@/lib/auth";

export const Route = createFileRoute("/_app/accounts")({
  head: () => ({
    meta: [
      { title: "Income & Expenses · RSP Medical Billing" },
      { name: "description", content: "Track all income revenues, office expenses & net balance." },
    ],
  }),
  component: AccountsPage,
});

// ─── constants ──────────────────────────────────────────────────────────────
const INCOME_CATEGORIES = [
  "Sales Revenue", "Fee Collection", "Service Income", "Commission",
  "Donation / Grant", "Other Income",
];
const EXPENSE_CATEGORIES = [
  "Rent", "Salary", "Employee Salary", "Utilities / Bills", "Medical Supplies",
  "Equipment", "Marketing", "Transportation", "Miscellaneous",
];
const PAYMENT_MODES = ["Cash", "Online/UPI", "Bank Transfer", "Cheque"] as const;

const today = () => new Date().toISOString().slice(0, 10);
const nowYYYYMM = () => new Date().toISOString().slice(0, 7);

const BLANK_FORM = {
  title: "", category: "", amount: "", paymentMode: "Cash" as FinanceEntry["paymentMode"],
  date: today(), reference: "",
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  const clean = iso.includes("T") ? iso : `${iso}T00:00:00`;
  const d = new Date(clean);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtAmt(n: number) { return "₹" + n.toLocaleString("en-IN"); }

// ─── Category Select with "Add custom" support ───────────────────────────────
function CategorySelect({
  value, onChange, type, baseCategories, customCategories, onAddCustom,
}: {
  value: string;
  onChange: (v: string) => void;
  type: "income" | "expense";
  baseCategories: string[];
  customCategories: string[];
  onAddCustom: (cat: string) => void;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const [newCat, setNewCat] = useState("");

  const allCats = [...baseCategories, ...customCategories];

  if (addingNew) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="New category name…"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newCat.trim()) {
              onAddCustom(newCat.trim());
              onChange(newCat.trim());
              setNewCat("");
              setAddingNew(false);
            }
            if (e.key === "Escape") { setAddingNew(false); setNewCat(""); }
          }}
          className="flex-1"
        />
        <Button size="sm" onClick={() => {
          if (newCat.trim()) { onAddCustom(newCat.trim()); onChange(newCat.trim()); }
          setNewCat(""); setAddingNew(false);
        }}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => { setAddingNew(false); setNewCat(""); }}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => {
      if (v === "__add_new__") { setAddingNew(true); }
      else { onChange(v); }
    }}>
      <SelectTrigger>
        <SelectValue placeholder="Select category…" />
      </SelectTrigger>
      <SelectContent>
        {allCats.map((c) => (
          <SelectItem key={c} value={c}>{c}</SelectItem>
        ))}
        <SelectItem value="__add_new__" className="text-primary font-medium border-t mt-1 pt-1">
          <span className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add custom category…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Add Income / Expense Dialog ─────────────────────────────────────────────
function AddEntryDialog({
  open, type, onClose,
}: {
  open: boolean; type: "income" | "expense"; onClose: () => void;
}) {
  const customCategories = useStore((s) => s.customCategories);
  const [form, setForm] = useState(BLANK_FORM);
  const isIncome = type === "income";
  const baseCategories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const myCustom = isIncome ? customCategories.income : customCategories.expense;

  const reset = () => setForm({ ...BLANK_FORM, date: today() });

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title / description is required");
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    if (!form.category) return toast.error("Select a category");
    const { error } = await actions.addFinanceEntry({
      type,
      sourceType: isIncome ? "MANUAL_INCOME" : "MANUAL_EXPENSE",
      title: form.title.trim(),
      category: form.category,
      amount,
      paymentMode: form.paymentMode,
      date: form.date || today(),
      reference: form.reference.trim() || undefined,
    });
    if (error) {
      toast.error(`Save failed: ${error}`);
      return;
    }
    toast.success(`${isIncome ? "Income" : "Expense"} entry added`);
    reset();
    onClose();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isIncome ? "text-emerald-600" : "text-red-600"}`}>
            {isIncome ? <><ArrowUpCircle className="h-5 w-5" /> Add Income</> : <><ArrowDownCircle className="h-5 w-5" /> Add Expense</>}
          </DialogTitle>
          <DialogDescription>
            {isIncome ? "Record a revenue or income transaction." : "Record an operational expense or outflow."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Title / Description *</Label>
            <Input
              placeholder={isIncome ? "e.g. Medicine sales, fee collection…" : "e.g. Shop rent, staff salary…"}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Amount (₹) *</Label>
              <Input
                type="number" min={1} placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Category *</Label>
            <CategorySelect
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              type={type}
              baseCategories={baseCategories}
              customCategories={myCustom}
              onAddCustom={(cat) => actions.addCustomCategory(type, cat)}
            />
            {/* Show existing custom categories with remove option */}
            {myCustom.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {myCustom.map((c) => (
                  <span key={c} className="flex items-center gap-1 text-[11px] bg-muted rounded-full px-2 py-0.5">
                    {c}
                    <button onClick={() => actions.removeCustomCategory(type, c)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Payment Mode *</Label>
            <Select value={form.paymentMode} onValueChange={(v) => setForm({ ...form, paymentMode: v as FinanceEntry["paymentMode"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reference / Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="REF#, invoice no., remarks…"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={save}
            className={isIncome ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
          >
            {isIncome ? <ArrowUpCircle className="h-4 w-4 mr-1.5" /> : <ArrowDownCircle className="h-4 w-4 mr-1.5" />}
            Save {isIncome ? "Income" : "Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LedgerRow = {
  id: string;
  source: "SALE" | "PURCHASE" | "MANUAL_INCOME" | "MANUAL_EXPENSE" | "SALARY_PAYMENT";
  sourceLabel: string;
  type: "income" | "expense";
  date: string; // YYYY-MM-DD
  rawDate: string;
  title: string;
  category: string;
  amount: number;
  paymentMode: string;
  reference?: string;
  isDeletable: boolean;
};

// ─── Main Page ────────────────────────────────────────────────────────────────
function AccountsPage() {
  const sales = useStore((s) => s.sales);
  const salesReturns = useStore((s) => s.salesReturns);
  const purchases = useStore((s) => s.purchases);
  const purchaseReturns = useStore((s) => s.purchaseReturns);
  const financeEntries = useStore((s) => s.financeEntries);
  const salaryPayments = useStore((s) => s.salaryPayments);
  const employees = useStore((s) => s.employees);
  const me = getUser();
  const isAdmin = me?.role === "Admin";

  useEffect(() => {
    actions.syncSales().catch(() => {});
    actions.syncSalesReturns().catch(() => {});
    actions.syncPurchases().catch(() => {});
    actions.syncPurchaseReturns().catch(() => {});
    actions.syncFinanceEntries().catch(() => {});
    actions.syncSalaryPayments().catch(() => {});
  }, []);

  const [addType, setAddType] = useState<"income" | "expense" | null>(null);
  const [filterMonth, setFilterMonth] = useState(nowYYYYMM());
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  const allLedgerEntries = useMemo<LedgerRow[]>(() => {
    // 1. Project completed sales as Income (excluding cancelled bills)
    const salesRows: LedgerRow[] = sales
      .filter((s) => s.status !== "cancelled")
      .map((s) => {
        const dStr = s.date ? s.date.slice(0, 10) : today();
        const payLabel = s.payment
          ? s.payment === "loan"
            ? "Credit / Loan"
            : s.payment.charAt(0).toUpperCase() + s.payment.slice(1)
          : "Cash";

        return {
          id: s.id,
          source: "SALE",
          sourceLabel: "Sale / Bill",
          type: "income",
          date: dStr,
          rawDate: s.date || dStr,
          title: `Bill ${s.id} · ${s.customerName || "Walk-in customer"}`,
          category: "Sales Revenue",
          amount: Number(s.grand) || 0,
          paymentMode: payLabel,
          reference: `Invoice No: ${s.id}`,
          isDeletable: false,
        };
      });

    // 2. Project Sales Returns as negative income / revenue deduction (outflow / refund)
    const salesReturnRows: LedgerRow[] = salesReturns.map((r) => {
      const dStr = r.returnDate ? r.returnDate.slice(0, 10) : today();
      const refundMode = (r as any).paymentMode === "credit"
        ? "Credit Note"
        : (r as any).paymentMode === "online"
          ? "Online / UPI Refund"
          : "Cash Refund";

      return {
        id: r.id,
        source: "SALES_RETURN" as any,
        sourceLabel: "Sales Return",
        type: "expense",
        date: dStr,
        rawDate: r.returnDate || dStr,
        title: `Return ${r.returnNo} · Refund to ${r.customerName || "Customer"}`,
        category: "Sales Return / Refund",
        amount: Number(r.returnAmount) || 0,
        paymentMode: refundMode,
        reference: `Original Bill: ${r.originalSaleId}`,
        isDeletable: false,
      };
    });

    // 3. Project completed purchases as Expense
    const purchasesRows: LedgerRow[] = purchases.map((p) => {
      const dStr = p.date ? p.date.slice(0, 10) : today();
      return {
        id: p.id,
        source: "PURCHASE",
        sourceLabel: "Purchase",
        type: "expense",
        date: dStr,
        rawDate: p.date || dStr,
        title: `Purchase · ${p.supplier || "Supplier"}`,
        category: "Inventory Purchase",
        amount: Number(p.total) || 0,
        paymentMode: "Bank Transfer",
        reference: p.invoiceNo ? `Purchase Inv: ${p.invoiceNo}` : `PO: ${p.id}`,
        isDeletable: false,
      };
    });

    // 4. Project Purchase Returns as expense recovery / supplier credit
    const purchaseReturnRows: LedgerRow[] = purchaseReturns.map((pr) => {
      const dStr = pr.returnDate ? pr.returnDate.slice(0, 10) : today();
      return {
        id: pr.id,
        source: "PURCHASE_RETURN" as any,
        sourceLabel: "Purchase Return",
        type: "income",
        date: dStr,
        rawDate: pr.returnDate || dStr,
        title: `Purchase Return ${pr.returnNo} · Credit from ${pr.supplierName || "Supplier"}`,
        category: "Purchase Return / Credit",
        amount: Number(pr.returnAmount) || 0,
        paymentMode: "Supplier Credit",
        reference: `Original PO: ${pr.originalPurchaseId}`,
        isDeletable: false,
      };
    });

    // 5. Project confirmed salary payments as Expense
    const currentTid = me?.tenantId || "T001";
    const salaryRows: LedgerRow[] = salaryPayments
      .filter((p) => {
        if (p.tenantId && p.tenantId !== currentTid) return false;
        const amt = Number(p.amountPaid ?? p.amount) || 0;
        return amt > 0;
      })
      .map((p) => {
        const dStr = p.paymentDate || (p.paidAt ? p.paidAt.slice(0, 10) : today());
        const amt = Number(p.amountPaid ?? p.amount) || 0;
        const emp = employees.find((e) => e.id === p.employeeId);
        const empName = p.employeeName || emp?.name || p.employeeId;

        return {
          id: p.id,
          source: "SALARY_PAYMENT",
          sourceLabel: "Salary",
          type: "expense",
          date: dStr,
          rawDate: p.paidAt || dStr,
          title: `Salary · ${empName}`,
          category: "Salary",
          amount: amt,
          paymentMode: p.paymentMode || "Cash",
          reference: `${p.employeeId} · ${p.month}`,
          isDeletable: false,
        };
      });

    // 6. Project manual finance entries (prevent duplicate customer refunds if already in sales returns)
    const manualRows: LedgerRow[] = financeEntries.map((fe) => {
      const isInc = fe.type === "income";
      const dStr = fe.date ? fe.date.slice(0, 10) : today();
      return {
        id: fe.id,
        source: (fe.sourceType as any) || (isInc ? "MANUAL_INCOME" : "MANUAL_EXPENSE"),
        sourceLabel: isInc ? "Manual Income" : "Manual Expense",
        type: fe.type,
        date: dStr,
        rawDate: fe.createdAt || dStr,
        title: fe.title,
        category: fe.category,
        amount: Number(fe.amount) || 0,
        paymentMode: fe.paymentMode || "Cash",
        reference: fe.reference || undefined,
        isDeletable: true,
      };
    });

    // Combine and sort by date descending
    return [...salesRows, ...salesReturnRows, ...purchasesRows, ...purchaseReturnRows, ...salaryRows, ...manualRows].sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return (b.rawDate || "").localeCompare(a.rawDate || "");
    });
  }, [sales, salesReturns, purchases, purchaseReturns, salaryPayments, employees, financeEntries, me?.tenantId]);

  const filtered = useMemo(() => {
    return allLedgerEntries.filter((e) => {
      const inMonth = filterMonth ? e.date.startsWith(filterMonth) : true;
      const inType = filterType === "all" || e.type === filterType;
      const inCategory = filterCategory === "all" || e.category === filterCategory;
      const q = search.trim().toLowerCase();
      const inSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.reference && e.reference.toLowerCase().includes(q)) ||
        e.paymentMode.toLowerCase().includes(q);
      return inMonth && inType && inCategory && inSearch;
    });
  }, [allLedgerEntries, filterMonth, filterType, filterCategory, search]);

  const summary = useMemo(() => {
    const inPeriod = (dStr: string) => (!filterMonth ? true : dStr.startsWith(filterMonth));

    // Sales and Returns
    const validSales = sales.filter((s) => s.status !== "cancelled" && inPeriod(s.date ? s.date.slice(0, 10) : today()));
    const grossSales = validSales.reduce((acc, s) => acc + (Number(s.grand) || 0), 0);

    const validSalesReturns = salesReturns.filter((r) => inPeriod(r.returnDate ? r.returnDate.slice(0, 10) : today()));
    const totalSalesReturns = validSalesReturns.reduce((acc, r) => acc + (Number(r.returnAmount) || 0), 0);
    const netSales = Math.max(0, grossSales - totalSalesReturns);

    // Purchases and Returns
    const validPurchases = purchases.filter((p) => inPeriod(p.date ? p.date.slice(0, 10) : today()));
    const grossPurchases = validPurchases.reduce((acc, p) => acc + (Number(p.total) || 0), 0);

    const validPurchaseReturns = purchaseReturns.filter((r) => inPeriod(r.returnDate ? r.returnDate.slice(0, 10) : today()));
    const totalPurchaseReturns = validPurchaseReturns.reduce((acc, r) => acc + (Number(r.returnAmount) || 0), 0);
    const netPurchases = Math.max(0, grossPurchases - totalPurchaseReturns);

    // Operational expenses & Manual Income
    const currentTid = me?.tenantId || "T001";
    const validSalaries = salaryPayments.filter((p) => {
      if (p.tenantId && p.tenantId !== currentTid) return false;
      const dStr = p.paymentDate || (p.paidAt ? p.paidAt.slice(0, 10) : today());
      return inPeriod(dStr);
    });
    const totalSalaries = validSalaries.reduce((acc, p) => acc + (Number(p.amountPaid ?? p.amount) || 0), 0);

    const validManualEntries = financeEntries.filter((fe) => inPeriod(fe.date ? fe.date.slice(0, 10) : today()));
    const manualIncome = validManualEntries
      .filter((fe) => fe.type === "income")
      .reduce((acc, fe) => acc + (Number(fe.amount) || 0), 0);
    const manualExpense = validManualEntries
      .filter((fe) => fe.type === "expense")
      .reduce((acc, fe) => acc + (Number(fe.amount) || 0), 0);

    const operatingExpenses = totalSalaries + manualExpense;
    const totalIncome = netSales + manualIncome;
    const totalExpense = netPurchases + operatingExpenses;
    const netBalance = totalIncome - totalExpense;

    return {
      grossSales,
      totalSalesReturns,
      netSales,
      grossPurchases,
      totalPurchaseReturns,
      netPurchases,
      operatingExpenses,
      manualIncome,
      totalIncome,
      totalExpense,
      netBalance,
      count: filtered.length,
    };
  }, [sales, salesReturns, purchases, purchaseReturns, salaryPayments, financeEntries, filterMonth, me?.tenantId, filtered.length]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    if (filterType === "all" || filterType === "income") {
      cats.add("Sales Revenue");
      cats.add("Purchase Return / Credit");
    }
    if (filterType === "all" || filterType === "expense") {
      cats.add("Inventory Purchase");
      cats.add("Sales Return / Refund");
      cats.add("Salary");
    }
    allLedgerEntries
      .filter((e) => filterType === "all" || e.type === filterType)
      .forEach((e) => cats.add(e.category));
    return Array.from(cats).sort();
  }, [allLedgerEntries, filterType]);

  const deleteEntry = async (entry: LedgerRow) => {
    if (!isAdmin) return toast.error("Only Admin can delete entries");
    if (!entry.isDeletable) {
      return toast.error("Sales, Purchases, and Salary payments cannot be deleted from Accounts");
    }
    if (!confirm(`Delete manual entry "${entry.title}"?`)) return;
    const { error } = await actions.deleteFinanceEntry(entry.id);
    if (error) {
      toast.error(`Delete failed: ${error}`);
    } else {
      toast.success("Entry deleted");
    }
  };

  const monthLabel = filterMonth
    ? new Date(filterMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "All Time";

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Income & Expense Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track all revenues, office expenses &amp; net balance</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button id="btn-add-income" onClick={() => setAddType("income")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Add Income
          </Button>
          <Button id="btn-add-expense" onClick={() => setAddType("expense")} className="bg-red-600 hover:bg-red-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards - Row 1: Sales & Revenue Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Gross Sales</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 tabular-nums mt-1">{fmtAmt(summary.grossSales)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Total invoiced sales</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 shrink-0"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Sales Returns</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600 tabular-nums mt-1">-{fmtAmt(summary.totalSalesReturns)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Customer refunds deducted</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2 shrink-0"><TrendingDown className="h-5 w-5 text-amber-500" /></div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-teal-600">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Net Sales Revenue</p>
              <p className="text-xl sm:text-2xl font-bold text-teal-700 tabular-nums mt-1">{fmtAmt(summary.netSales)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Gross Sales − Returns</p>
            </div>
            <div className="bg-teal-50 rounded-lg p-2 shrink-0"><Receipt className="h-5 w-5 text-teal-600" /></div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Net Income</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 tabular-nums mt-1">{fmtAmt(summary.totalIncome)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Net Sales + other income</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 shrink-0"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
          </div>
        </Card>
      </div>

      {/* Summary KPI Cards - Row 2: Purchases, Operations & Net Balance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 border-l-4 border-l-purple-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Gross Purchases</p>
              <p className="text-xl sm:text-2xl font-bold text-purple-600 tabular-nums mt-1">{fmtAmt(summary.grossPurchases)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Supplier bills</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-2 shrink-0"><Receipt className="h-5 w-5 text-purple-500" /></div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-cyan-600">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-cyan-700 uppercase tracking-wide">Purchase Returns</p>
              <p className="text-xl sm:text-2xl font-bold text-cyan-700 tabular-nums mt-1">-{fmtAmt(summary.totalPurchaseReturns)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Supplier credits deducted</p>
            </div>
            <div className="bg-cyan-50 rounded-lg p-2 shrink-0"><TrendingDown className="h-5 w-5 text-cyan-600" /></div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-red-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">Total Expenses</p>
              <p className="text-xl sm:text-2xl font-bold text-red-500 tabular-nums mt-1">{fmtAmt(summary.totalExpense)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Net Purchases + Operations</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2 shrink-0"><TrendingDown className="h-5 w-5 text-red-400" /></div>
          </div>
        </Card>

        <Card className={`p-4 border-l-4 ${summary.netBalance >= 0 ? "border-l-primary" : "border-l-red-400"}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${summary.netBalance >= 0 ? "text-primary" : "text-red-500"}`}>
                Net Profit / Balance
              </p>
              <p className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${summary.netBalance >= 0 ? "text-primary" : "text-red-500"}`}>
                {summary.netBalance < 0 ? "-" : ""}{fmtAmt(Math.abs(summary.netBalance))}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{summary.netBalance >= 0 ? "Net Surplus" : "Net Deficit"}</p>
            </div>
            <div className={`rounded-lg p-2 shrink-0 ${summary.netBalance >= 0 ? "bg-primary/10" : "bg-red-50"}`}>
              <IndianRupee className={`h-5 w-5 ${summary.netBalance >= 0 ? "text-primary" : "text-red-400"}`} />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Month:</span>
            <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-40 h-8 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Type:</span>
            <Select value={filterType} onValueChange={(v) => { setFilterType(v as typeof filterType); setFilterCategory("all"); }}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Category:</span>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search invoice, customer, supplier, category…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Transaction History */}
      <Card>
        <div className="p-4 border-b">
          <h2 className="font-semibold">Finance &amp; Transaction History</h2>
          <p className="text-xs text-muted-foreground">Unified ledger of sales revenue, inventory purchases &amp; operational expenses</p>
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type &amp; Source</TableHead>
                <TableHead>Title &amp; Category</TableHead>
                <TableHead>Payment Mode</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="h-8 w-8 opacity-30" />
                      <span>No transactions found</span>
                      <span className="text-xs">Completed sales, purchases, and manual entries will appear here</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((e) => (
                <TableRow key={`${e.source}-${e.id}`}>
                  <TableCell className="text-sm tabular-nums whitespace-nowrap">{fmtDate(e.date)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      {e.type === "income" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 gap-1 text-[11px]">
                          <ArrowUpCircle className="h-3 w-3" /> Income
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 gap-1 text-[11px]">
                          <ArrowDownCircle className="h-3 w-3" /> Expense
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        {e.sourceLabel}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{e.title}</div>
                    <div className="text-xs text-muted-foreground">{e.category}</div>
                    {e.reference && <div className="text-[11px] text-muted-foreground/70">{e.reference}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{e.paymentMode}</TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${e.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                    {e.type === "income" ? "+" : "-"}{fmtAmt(e.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {e.isDeletable ? (
                      isAdmin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteEntry(e)}
                          title="Delete manual entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic select-none">Auto</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card List */}
        <div className="sm:hidden divide-y">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />No transactions found.
            </div>
          )}
          {filtered.map((e) => (
            <div key={`${e.source}-${e.id}`} className="p-4 flex items-start gap-3">
              <div className={`mt-0.5 rounded-full p-1.5 shrink-0 ${e.type === "income" ? "bg-emerald-100" : "bg-red-100"}`}>
                {e.type === "income" ? <ArrowUpCircle className="h-4 w-4 text-emerald-600" /> : <ArrowDownCircle className="h-4 w-4 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{e.sourceLabel}</span> · {e.category} · {e.paymentMode}
                    </div>
                    <div className="text-xs text-muted-foreground/60 mt-0.5">{fmtDate(e.date)}</div>
                    {e.reference && <div className="text-[11px] text-muted-foreground/60">{e.reference}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold tabular-nums ${e.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                      {e.type === "income" ? "+" : "-"}{fmtAmt(e.amount)}
                    </div>
                    {e.isDeletable && isAdmin && (
                      <button onClick={() => deleteEntry(e)} className="mt-1 text-destructive/70 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AddEntryDialog open={addType === "income"} type="income" onClose={() => setAddType(null)} />
      <AddEntryDialog open={addType === "expense"} type="expense" onClose={() => setAddType(null)} />
    </div>
  );
}
