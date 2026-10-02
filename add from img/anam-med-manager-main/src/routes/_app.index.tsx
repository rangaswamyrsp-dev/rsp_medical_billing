import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search, ScanBarcode, QrCode, Plus, Trash2, Save, Printer, PauseCircle, X,
  Percent, Keyboard, User, Phone, Stethoscope, UserCheck, PlayCircle, ReceiptText, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import type { Medicine } from "@/data/medicines";
import { cn } from "@/lib/utils";
import { actions, useStore, useHydrated } from "@/lib/store";
import { printReceipt } from "@/lib/print";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { getUser } from "@/lib/auth";
import { useTenant, useFeatures, TYPE_COPY } from "@/lib/tenant";

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

type LineItem = Medicine & { qty: number; discount: number };

function invoiceNo() {
  return "INV" + Math.floor(10000 + Math.random() * 89999);
}

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
  const [payment, setPayment] = useState("cash");
  const [inv, setInv] = useState("INV—");
  const [scanOpen, setScanOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => { setInv(invoiceNo()); }, []);

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
    setItems((prev) => {
      const found = prev.find((i) => i.id === m.id);
      if (found) return prev.map((i) => (i.id === m.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { ...m, qty: 1, discount: 0 }];
    });
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
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

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

  const totals = useMemo(() => {
    let sub = 0, disc = 0, gst = 0;
    for (const it of items) {
      const line = it.mrp * it.qty;
      const d = (line * it.discount) / 100;
      const taxable = line - d;
      const g = f.gst ? (taxable * it.gst) / 100 : 0;
      sub += line;
      disc += d;
      gst += g;
    }
    const beforeRound = sub - disc + gst;
    const grand = Math.round(beforeRound);
    return { sub, disc, gst, round: grand - beforeRound, grand };
  }, [items, f.gst]);


  const clear = () => {
    setItems([]);
    setCustomer({ name: "", phone: "", doctor: "" });
    setMatched(null);
    setInv(invoiceNo());
    setPayment("cash");
  };

  const actor = me ? { id: me.id, name: me.name } : undefined;

  const buildSale = () => {
    const cust = actions.upsertCustomerByPhone({
      name: customer.name, phone: customer.phone, doctor: customer.doctor,
    });
    return actions.saveSale({
      customerId: cust.phone ? cust.id : null,
      customerName: cust.name,
      phone: cust.phone,
      doctor: customer.doctor || undefined,
      items: items.map((it) => {
        const line = it.mrp * it.qty;
        const d = (line * it.discount) / 100;
        const tax = ((line - d) * it.gst) / 100;
        return {
          id: it.id, name: it.name, batch: it.batch, qty: it.qty,
          mrp: it.mrp, gst: it.gst, discount: it.discount,
          total: +(line - d + tax).toFixed(2),
        };
      }),
      sub: +totals.sub.toFixed(2),
      disc: +totals.disc.toFixed(2),
      gst: +totals.gst.toFixed(2),
      grand: totals.grand,
      payment,
    }, actor);
  };

  const saveBill = () => {
    if (items.length === 0) return toast.error("Add at least one medicine");
    const sale = buildSale();
    toast.success(`Bill ${sale.id} saved · ₹${totals.grand.toLocaleString("en-IN")}`);
    if (printer.autoPrint) printReceipt(sale, printer);
    clear();
  };

  const printBill = () => {
    if (items.length === 0) return toast.error("Add at least one medicine");
    const sale = buildSale();
    printReceipt(sale, printer);
    toast.success(`Bill ${sale.id} · sent to printer`);
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
    setItems(found.items.map((it) => ({
      id: it.id, name: it.name, batch: it.batch, mrp: it.mrp, gst: it.gst,
      stock: 0, expiry: "", company: it.company ?? "",
      qty: it.qty, discount: it.discount,
    })));
    toast.success(`Resumed held bill ${id}`);
  };

  return (
    <div className="p-4 lg:p-6 grid gap-4 xl:grid-cols-[1fr_360px]">
      {/* MAIN COLUMN */}
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <PauseCircle className="h-3.5 w-3.5" /> Held ({held.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="px-3 py-2 border-b text-sm font-semibold">Held bills</div>
                <div className="max-h-72 overflow-y-auto divide-y">
                  {held.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">No bills on hold.</div>}
                  {held.map((h) => (
                    <button key={h.id} onClick={() => resumeHeld(h.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left">
                      <PlayCircle className="h-4 w-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{h.id} · {h.customerName || "Walk-in"}</div>
                        <div className="text-xs text-muted-foreground">{h.items.length} items · {new Date(h.at).toLocaleTimeString("en-IN")}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
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


        {/* Search */}
        <Card className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
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
            {f.qr && (
              <Button variant="outline" className="h-11" onClick={() => setQrOpen(true)}>
                <QrCode className="h-4 w-4 mr-1.5" /> QR
              </Button>
            )}

          </div>

          {suggestions.length > 0 && (
            <div className="mt-2 rounded-lg border bg-card divide-y">
              {suggestions.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addItem(m)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left"
                >
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[m.company, f.batchTracking && m.batch ? `Batch ${m.batch}` : null,
                        f.expiryTracking && m.expiry ? `Exp ${m.expiry}` : null]
                        .filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        m.stock < 20
                          ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      Stock {m.stock}
                    </span>
                    <span className="text-sm font-semibold">₹{m.mrp}</span>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
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
                {f.batchTracking && <TableHead className="w-24">Batch</TableHead>}
                <TableHead className="w-32 text-center">Qty</TableHead>
                <TableHead className="w-24 text-right">{tenant.type === "Medical" ? "MRP" : "Price"}</TableHead>
                <TableHead className="w-24 text-center">Disc %</TableHead>
                {f.gst && <TableHead className="w-20 text-center">GST</TableHead>}
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    Search{f.barcode ? " or scan" : ""} a {copy.item.toLowerCase()} to add to the bill.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => {
                  const line = it.mrp * it.qty;
                  const d = (line * it.discount) / 100;
                  const tax = f.gst ? ((line - d) * it.gst) / 100 : 0;
                  const total = line - d + tax;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">{it.company}</div>
                      </TableCell>
                      {f.batchTracking && <TableCell className="text-sm">{it.batch}</TableCell>}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"
                            onClick={() => updateItem(it.id, { qty: Math.max(1, it.qty - 1) })}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            value={it.qty}
                            onChange={(e) =>
                              updateItem(it.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="h-8 text-center px-1"
                          />
                          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"
                            onClick={() => updateItem(it.id, { qty: it.qty + 1 })}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">₹{it.mrp}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={it.discount}
                          onChange={(e) =>
                            updateItem(it.id, { discount: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
                          }
                          className="h-8 text-center"
                        />
                      </TableCell>
                      {f.gst && <TableCell className="text-center text-sm">{it.gst}%</TableCell>}
                      <TableCell className="text-right font-semibold tabular-nums">
                        ₹{total.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeItem(it.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </Card>

      </div>

      {/* SUMMARY / SIDEBAR */}
      <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
        {/* Live bill preview — fills the right column */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Bill preview</div>
            <Badge variant="secondary">{items.length} item{items.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y rounded-md border">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Items you add appear here in order.
              </div>
            ) : (
              items.map((it, i) => {
                const line = it.mrp * it.qty;
                const d = (line * it.discount) / 100;
                const tax = f.gst ? ((line - d) * it.gst) / 100 : 0;
                return (
                  <div key={it.id} className="flex items-start gap-2 px-2.5 py-2 text-sm">
                    <span className="text-[11px] text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{it.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {it.qty} × ₹{it.mrp}{it.discount ? ` · -${it.discount}%` : ""}
                      </div>
                    </div>
                    <span className="tabular-nums text-sm font-medium">₹{(line - d + tax).toFixed(2)}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-semibold mb-3">Bill Summary</div>
          <div className="space-y-2 text-sm">
            <Row label="Sub Total" value={totals.sub} />
            <Row label="Discount" value={-totals.disc} accent="warning" />
            {f.gst && <Row label="GST" value={totals.gst} />}
            <Row label="Round Off" value={totals.round} muted />
            <div className="border-t pt-3 mt-2 flex items-center justify-between">
              <span className="font-semibold">Grand Total</span>
              <span className="text-2xl font-bold tracking-tight text-primary tabular-nums">
                ₹{totals.grand.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </Card>


        <Card className="p-5">
          <div className="text-sm font-semibold mb-3">Payment Method</div>
          <RadioGroup value={payment} onValueChange={setPayment} className="grid grid-cols-2 gap-2">
            {[
              { v: "cash", l: "Cash" },
              { v: "upi", l: "UPI" },
              { v: "phonepe", l: "PhonePe" },
              { v: "gpay", l: "Google Pay" },
              { v: "paytm", l: "Paytm" },
              { v: "card", l: "Card" },
            ].map((p) => (
              <label
                key={p.v}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                  payment === p.v ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <RadioGroupItem value={p.v} />
                {p.l}
              </label>
            ))}
          </RadioGroup>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11" onClick={saveBill}>
            <Save className="h-4 w-4 mr-1.5" /> Save Bill
          </Button>
          <Button variant="outline" className="h-11" onClick={printBill}>
            <Printer className="h-4 w-4 mr-1.5" /> Save & Print
          </Button>
          <Button variant="outline" className="h-11" onClick={holdBill}>
            <PauseCircle className="h-4 w-4 mr-1.5" /> Hold
          </Button>
          <Button variant="ghost" className="h-11 text-destructive hover:text-destructive" onClick={clear}>
            <X className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
        </div>

        <Card className="p-4 bg-[color:var(--warning)]/10 border-[color:var(--warning)]/30">
          <div className="flex items-start gap-2 text-sm">
            <Percent className="h-4 w-4 mt-0.5 text-[color:var(--warning)]" />
            <div>
              <div className="font-medium">Printer: {printer.paperSize} thermal</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                Change paper size, header and footer in Settings → Printer.
              </div>
            </div>
          </div>
        </Card>
      </div>

      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScan} mode="barcode" />
      <BarcodeScanner open={qrOpen} onOpenChange={setQrOpen} onDetected={onScan} mode="qr" />
    </div>
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

