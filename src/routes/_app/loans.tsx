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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, Plus, Trash2, AlertTriangle, TrendingDown, TrendingUp,
  IndianRupee, Search, Users,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { toast } from "sonner";
import { getUser } from "@/lib/auth";

export const Route = createFileRoute("/_app/loans")({
  head: () => ({
    meta: [
      { title: "Customer Loans · RSP Medical Billing" },
      { name: "description", content: "Issue and track customer credit loans. Record repayments and view outstanding balances." },
    ],
  }),
  component: LoansPage,
});

// ─── helpers ─────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10);
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
const fmtAmt = (n: number) => "₹" + n.toLocaleString("en-IN");

// ─── Issue Loan Dialog ────────────────────────────────────────────────────────
function IssueLoanDialog({ open, onClose, type }: { open: boolean; onClose: () => void; type: "issue" | "payment" }) {
  const customers = useStore((s) => s.customers);
  const [custId, setCustId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const isIssue = type === "issue";
  const selectedCust = customers.find((c) => c.id === custId);

  const reset = () => { setCustId(""); setAmount(""); setDate(todayISO()); setNote(""); };

  const save = () => {
    if (!custId) return toast.error("Select a customer");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!isIssue && selectedCust && amt > (selectedCust.balance || 0)) {
      if (!confirm(`Payment ₹${amt} exceeds outstanding balance ₹${selectedCust.balance}. Continue?`)) return;
    }
    actions.addLoan({
      customerId: custId,
      customerName: selectedCust?.name ?? "",
      customerPhone: selectedCust?.phone ?? "",
      type,
      amount: amt,
      date,
      note: note.trim() || undefined,
    });
    toast.success(isIssue ? "Loan issued successfully" : "Payment recorded successfully");
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && (reset(), onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isIssue ? "text-amber-600" : "text-emerald-600"}`}>
            {isIssue
              ? <><CreditCard className="h-5 w-5" /> Issue Loan / Credit</>
              : <><IndianRupee className="h-5 w-5" /> Record Repayment</>
            }
          </DialogTitle>
          <DialogDescription>
            {isIssue
              ? "Give medicines on credit. The outstanding balance will be tracked."
              : "Record a repayment from a customer towards their outstanding loan."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Customer *</Label>
            <Select value={custId} onValueChange={setCustId}>
              <SelectTrigger id="loan-customer-select"><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      {c.name} — {c.phone}
                      {c.balance > 0 && (
                        <span className="text-xs text-amber-600 font-medium">(owes {fmtAmt(c.balance)})</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCust && selectedCust.balance > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-md px-2 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Current outstanding: <strong>{fmtAmt(selectedCust.balance)}</strong>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Amount (₹) *</Label>
              <Input type="number" min={1} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Note / Reason <span className="text-muted-foreground">(optional)</span></Label>
            <Input placeholder={isIssue ? "e.g. Trusted patient, medicines for chronic illness" : "e.g. Cash payment received"} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            onClick={save}
            className={isIssue ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
          >
            {isIssue ? "Issue Credit" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Loans Page ──────────────────────────────────────────────────────────
function LoansPage() {
  const customers = useStore((s) => s.customers);
  const loans = useStore((s) => s.loans);
  const me = getUser();
  const isAdmin = me?.role === "Admin";

  const [dialog, setDialog] = useState<"issue" | "payment" | null>(null);
  const [search, setSearch] = useState("");
  const [filterCustId, setFilterCustId] = useState("all");

  // Customers with outstanding balances
  const trustCustomers = useMemo(() =>
    customers.filter((c) => (c.balance || 0) > 0).sort((a, b) => b.balance - a.balance),
    [customers]);

  // Summary
  const totalIssued = useMemo(() => loans.filter((l) => l.type === "issue").reduce((n, l) => n + l.amount, 0), [loans]);
  const totalRepaid = useMemo(() => loans.filter((l) => l.type === "payment").reduce((n, l) => n + l.amount, 0), [loans]);
  const totalOutstanding = useMemo(() => customers.reduce((n, c) => n + (c.balance || 0), 0), [customers]);

  // Filtered loan history
  const filteredLoans = useMemo(() => {
    let list = [...loans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filterCustId !== "all") list = list.filter((l) => l.customerId === filterCustId);
    if (search) list = list.filter((l) => l.customerName.toLowerCase().includes(search.toLowerCase()) || (l.note ?? "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [loans, filterCustId, search]);

  const deleteLoan = (id: string) => {
    if (!isAdmin) return toast.error("Only Admin can delete loan records");
    if (!confirm("Delete this loan record? This will also reverse the customer balance.")) return;
    actions.deleteLoan(id);
    toast.success("Loan record deleted and balance reversed");
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Customer Loans & Credit
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track medicine credit given to trusted patients. Record repayments &amp; view outstanding.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button id="btn-issue-loan" onClick={() => setDialog("issue")} className="bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Issue Loan
          </Button>
          <Button id="btn-record-payment" onClick={() => setDialog("payment")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <IndianRupee className="h-4 w-4 mr-1.5" /> Record Payment
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Total Credit Issued</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600 tabular-nums mt-1">{fmtAmt(totalIssued)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Medicines given on credit</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2"><TrendingDown className="h-5 w-5 text-amber-500" /></div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Total Repaid</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 tabular-nums mt-1">{fmtAmt(totalRepaid)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Payments received</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
          </div>
        </Card>

        <Card className={`p-4 border-l-4 col-span-2 lg:col-span-1 ${totalOutstanding > 0 ? "border-l-red-500" : "border-l-primary"}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${totalOutstanding > 0 ? "text-red-500" : "text-primary"}`}>
                Outstanding Balance
              </p>
              <p className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${totalOutstanding > 0 ? "text-red-500" : "text-primary"}`}>
                {fmtAmt(totalOutstanding)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">From {trustCustomers.length} customer(s)</p>
            </div>
            <div className={`rounded-lg p-2 ${totalOutstanding > 0 ? "bg-red-50" : "bg-primary/10"}`}>
              <AlertTriangle className={`h-5 w-5 ${totalOutstanding > 0 ? "text-red-400" : "text-primary"}`} />
            </div>
          </div>
        </Card>
      </div>

      {/* Trust Customers with outstanding balances */}
      {trustCustomers.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-sm">Customers with Outstanding Balance</span>
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">{trustCustomers.length}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {trustCustomers.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
                <div>
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.phone}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-amber-600 tabular-nums">{fmtAmt(c.balance)}</div>
                  <button
                    className="text-[11px] text-emerald-600 hover:underline"
                    onClick={() => { setDialog("payment"); }}
                  >
                    Record payment →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Loan History */}
      <Card>
        <div className="p-4 border-b">
          <h2 className="font-semibold">Loan & Repayment History</h2>
          <p className="text-xs text-muted-foreground">All credit issued and payments received</p>
        </div>

        {/* Filters */}
        <div className="p-3 border-b flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Customer:</span>
            <Select value={filterCustId} onValueChange={setFilterCustId}>
              <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by name or note…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLoans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No loan records yet. Click "Issue Loan" to get started.
                  </TableCell>
                </TableRow>
              )}
              {filteredLoans.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm tabular-nums">{fmtDate(l.date)}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{l.customerName}</div>
                    <div className="text-xs text-muted-foreground">{l.customerPhone}</div>
                  </TableCell>
                  <TableCell>
                    {l.type === "issue"
                      ? <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><TrendingDown className="h-3 w-3" /> Credit Issued</Badge>
                      : <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><TrendingUp className="h-3 w-3" /> Repayment</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.note ?? "—"}</TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${l.type === "issue" ? "text-amber-600" : "text-emerald-600"}`}>
                    {l.type === "issue" ? "-" : "+"}{fmtAmt(l.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteLoan(l.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile list */}
        <div className="sm:hidden divide-y">
          {filteredLoans.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">No loan records yet.</div>
          )}
          {filteredLoans.map((l) => (
            <div key={l.id} className="p-4 flex items-start gap-3">
              <div className={`mt-0.5 rounded-full p-1.5 shrink-0 ${l.type === "issue" ? "bg-amber-100" : "bg-emerald-100"}`}>
                {l.type === "issue" ? <TrendingDown className="h-4 w-4 text-amber-600" /> : <TrendingUp className="h-4 w-4 text-emerald-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{l.customerName}</div>
                    <div className="text-xs text-muted-foreground">{l.customerPhone} · {fmtDate(l.date)}</div>
                    {l.note && <div className="text-xs text-muted-foreground/70 mt-0.5">{l.note}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold tabular-nums ${l.type === "issue" ? "text-amber-600" : "text-emerald-600"}`}>
                      {l.type === "issue" ? "-" : "+"}{fmtAmt(l.amount)}
                    </div>
                    {isAdmin && (
                      <button onClick={() => deleteLoan(l.id)} className="mt-1 text-destructive/70 hover:text-destructive">
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

      <IssueLoanDialog open={dialog === "issue"} type="issue" onClose={() => setDialog(null)} />
      <IssueLoanDialog open={dialog === "payment"} type="payment" onClose={() => setDialog(null)} />
    </div>
  );
}
