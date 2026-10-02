import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageSearch, Search, AlertTriangle, CalendarClock, Boxes, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { EXPIRY_WINDOWS, inWindow, daysToExpiry, expiryTone } from "@/lib/expiry";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory · RSP Billing Software" },
      { name: "description", content: "Live stock, batches, expiry windows and stock value for your store." },
      { property: "og:title", content: "Inventory · RSP Billing Software" },
      { property: "og:description", content: "Live stock, batches, expiry windows and stock value for your store." },
    ],
  }),
  component: InventoryPage,
});

const TONE_CLASS: Record<string, string> = {
  expired: "bg-destructive/15 text-destructive",
  critical: "bg-destructive/10 text-destructive",
  warn: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  ok: "text-muted-foreground",
};

function InventoryPage() {
  const meds = useStore((s) => s.medicines);
  const [query, setQuery] = useState("");
  const [win, setWin] = useState("all");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [mfr, setMfr] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [sort, setSort] = useState("recent");

  const opts = useMemo(() => {
    const uniq = (vals: (string | undefined)[]) =>
      Array.from(new Set(vals.map((v) => (v ?? "").trim()).filter(Boolean))).sort();
    return {
      types: uniq(meds.map((m) => m.type)),
      categories: uniq(meds.map((m) => m.category)),
      mfrs: uniq(meds.map((m) => m.mfr)),
      suppliers: uniq(meds.map((m) => m.company)),
    };
  }, [meds]);

  const stats = useMemo(() => {
    const total = meds.reduce((n, m) => n + m.stock, 0);
    const value = meds.reduce((n, m) => n + m.stock * m.mrp, 0);
    const low = meds.filter((m) => m.stock < 20).length;
    const soon = meds.filter((m) => {
      const d = daysToExpiry(m.expiry);
      return d >= 0 && d <= 180;
    }).length;
    const expired = meds.filter((m) => daysToExpiry(m.expiry) < 0).length;
    return { total, value, low, soon, expired };
  }, [meds]);

  const list = useMemo(() => {
    const q = query.toLowerCase().trim();
    const eq = (v: string | undefined, sel: string) => sel === "all" || (v ?? "").trim() === sel;
    const out = meds
      .filter((m) => (win === "all" ? true : inWindow(m.expiry, win)))
      .filter((m) => eq(m.type, type) && eq(m.category, category) && eq(m.mfr, mfr) && eq(m.company, supplier))
      .filter((m) => (!q ? true : [m.name, m.batch, m.company, m.code ?? ""].some((v) => v.toLowerCase().includes(q))));
    if (sort === "name") return [...out].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "expiry") return [...out].sort((a, b) => daysToExpiry(a.expiry) - daysToExpiry(b.expiry));
    return out; // newest added first (store unshifts)
  }, [meds, query, win, type, category, mfr, supplier, sort]);

  const lowList = list.filter((m) => m.stock < 20);

  const rowsForExport = () =>
    list.map((m) => ({
      Code: m.code ?? m.id,
      "Medicine Name": m.name,
      Supplier: m.company,
      "Invoice No": m.invoice ?? "",
      MFR: m.mfr ?? "",
      Type: m.type ?? "",
      Category: m.category ?? "",
      HSN: m.hsn ?? "",
      "GST %": m.gst,
      "Pack Size": m.pack ?? "",
      Batch: m.batch,
      Expiry: m.expiry,
      MRP: m.mrp,
      "Purchase Price": m.purchase ?? 0,
      Quantity: m.stock,
      Stock: m.stock,
      Value: +(m.mrp * m.stock).toFixed(2),
    }));

  const download = async () => {
    if (list.length === 0) return toast.error("Nothing to download");
    try {
      const XLSX = await import("xlsx");
      const rows = rowsForExport();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Inventory");
      XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Downloaded ${rows.length} item(s)`);
    } catch {
      toast.error("Could not create the file.");
    }
  };

  const printList = () => {
    if (list.length === 0) return toast.error("Nothing to print");
    const filters = [
      type !== "all" && `Type: ${type}`,
      category !== "all" && `Category: ${category}`,
      mfr !== "all" && `MFR: ${mfr}`,
      supplier !== "all" && `Supplier: ${supplier}`,
      win !== "all" && `Expiry: ${EXPIRY_WINDOWS.find((w) => w.key === win)?.label ?? win}`,
      query.trim() && `Search: ${query.trim()}`,
    ].filter(Boolean).join(" · ");
    const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
    const head = ["Code", "Medicine", "Supplier", "MFR", "Type", "Category", "HSN", "Batch", "Expiry", "Pack", "GST%", "MRP", "Qty", "Value"];
    const body = list.map((m) => `<tr>${[
      m.code ?? m.id, m.name, m.company, m.mfr ?? "", m.type ?? "", m.category ?? "", m.hsn ?? "",
      m.batch, m.expiry, m.pack ?? "", m.gst + "%", m.mrp, m.stock, (m.mrp * m.stock).toFixed(2),
    ].map((v, i) => `<td class="${i >= 10 ? "r" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("");
    const totalValue = list.reduce((n, m) => n + m.mrp * m.stock, 0).toFixed(2);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inventory</title>
<style>@page{size:A4 landscape;margin:10mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;margin:0}
h1{font-size:16px;margin:0 0 2px}
.meta{color:#444;margin-bottom:8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #999;padding:3px 4px;text-align:left}
th{background:#eee}
td.r{text-align:right}
tfoot td{font-weight:700}
</style></head><body>
<h1>Inventory report</h1>
<div class="meta">${esc(new Date().toLocaleString("en-IN"))} · ${list.length} item(s)${filters ? " · " + esc(filters) : ""}</div>
<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td colspan="13">Total stock value</td><td class="r">${totalValue}</td></tr></tfoot></table>
<script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) return toast.error("Allow pop-ups to print");
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <PackageSearch className="h-6 w-6 text-primary" /> Inventory
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printList}>
            <Printer className="h-4 w-4 mr-1.5" /> Print / PDF
          </Button>
          <Button variant="outline" onClick={download}>
            <Download className="h-4 w-4 mr-1.5" /> Download Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Boxes} label="Products" value={meds.length.toString()} tone="info" />
        <Stat icon={Boxes} label="Units in stock" value={stats.total.toLocaleString("en-IN")} tone="primary" />
        <Stat icon={AlertTriangle} label="Low stock" value={stats.low.toString()} tone="warning" />
        <Stat icon={CalendarClock} label="Expiring < 6 mo" value={stats.soon.toString()} tone="warning" />
        <Stat icon={CalendarClock} label="Expired" value={stats.expired.toString()} tone="warning" />
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="relative max-w-md flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search inventory…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={win} onValueChange={setWin}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Expiry filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All expiry dates</SelectItem>
                {EXPIRY_WINDOWS.map((w) => (
                  <SelectItem key={w.key} value={w.key}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Total value: <b className="text-foreground tabular-nums">₹{stats.value.toLocaleString("en-IN")}</b>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect label="Type" value={type} onChange={setType} options={opts.types} />
          <FilterSelect label="Category" value={category} onChange={setCategory} options={opts.categories} />
          <FilterSelect label="Manufacturer (MFR)" value={mfr} onChange={setMfr} options={opts.mfrs} />
          <FilterSelect label="Supplier" value={supplier} onChange={setSupplier} options={opts.suppliers} />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recently added first</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
              <SelectItem value="expiry">Expiry (soonest first)</SelectItem>
            </SelectContent>
          </Select>
          {(type !== "all" || category !== "all" || mfr !== "all" || supplier !== "all" || win !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setType("all"); setCategory("all"); setMfr("all"); setSupplier("all"); setWin("all"); }}>
              Clear filters
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Showing <b className="text-foreground">{list.length}</b> item(s)
          {lowList.length > 0 && <> · <span className="text-[color:var(--warning)]">{lowList.length} low on stock</span></>}
        </div>

        <StockTable list={list} />
      </Card>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function StockTable({ list }: { list: any[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-center">Stock</TableHead>
            <TableHead className="text-right">MRP</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((m) => {
            const d = daysToExpiry(m.expiry);
            const tone = expiryTone(m.expiry);
            return (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.code ?? m.id}</TableCell>
                <TableCell>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.company}</div>
                </TableCell>
                <TableCell className="text-sm">{m.batch}</TableCell>
                <TableCell className="text-sm">
                  <span className={"rounded px-1.5 py-0.5 " + TONE_CLASS[tone]}>
                    {m.expiry || "—"}
                    {m.expiry && isFinite(d) && (
                      <span className="ml-1 text-[11px]">{d < 0 ? "expired" : `${d}d`}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={m.stock < 20 ? "destructive" : "secondary"}>{m.stock}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">₹{m.mrp}</TableCell>
                <TableCell className="text-right tabular-nums">₹{(m.mrp * m.stock).toLocaleString("en-IN")}</TableCell>
              </TableRow>
            );
          })}
          {list.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No items.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: any) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    info: "bg-[color:var(--info)]/10 text-[color:var(--info)]",
    warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  };
  return (
    <Card className="p-4">
      <div className={"h-9 w-9 grid place-items-center rounded-lg " + tones[tone]}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
