import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScanLine, Download, Trash2, Plus, Search, Loader2, ClipboardList } from "lucide-react";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { lookupBarcode } from "@/lib/barcode.functions";

export const Route = createFileRoute("/_app/dataentry")({
  head: () => ({
    meta: [
      { title: "Data Entry · RSP Billing Software" },
      { name: "description", content: "Scan a barcode to fill item name, brand, unit and MRP, then save and download entries." },
      { property: "og:title", content: "Data Entry · RSP Billing Software" },
      { property: "og:description", content: "Barcode-based product data entry with Excel download." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataEntryPage,
});

type Entry = {
  id: string; barcode: string; name: string; brand: string; mfr: string; batch: string; type: string;
  pack: string; qty: number; unit: string; mrp: number; expMonth: string; expYear: string; source: string; addedAt: string;
};
const KEY = "rsp_dataentry_v1";
const LIST_KEY = "rsp_dataentry_lists_v1";
const UNITS = ["30ml", "50ml", "80ml", "100ml", "500gm", "5g", "Tablets", "Capsules", "Bottles", "Strips", "1"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const YEARS = Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() - 1 + i));
const EMPTY = { barcode: "", name: "", brand: "", mfr: "", batch: "", type: "", pack: "", qty: "", unit: "", mrp: "", expMonth: "", expYear: "", source: "" };

function DataEntryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lists, setLists] = useState<{ mfr: string[]; type: string[] }>({ mfr: [], type: ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Powder"] });
  const [mode, setMode] = useState<"medicine" | "general">("medicine");
  const [f, setF] = useState(EMPTY);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dup, setDup] = useState<Entry | null>(null);
  const [addQty, setAddQty] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const lookup = useServerFn(lookupBarcode);

  useEffect(() => {
    try { setEntries(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
    try { const l = JSON.parse(localStorage.getItem(LIST_KEY) || "null"); if (l) setLists(l); } catch {}
  }, []);
  const persist = (e: Entry[]) => { setEntries(e); localStorage.setItem(KEY, JSON.stringify(e)); };
  const persistLists = (l: typeof lists) => { setLists(l); localStorage.setItem(LIST_KEY, JSON.stringify(l)); };
  const set = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }));

  const search = async (raw: string) => {
    const code = raw.replace(/\D/g, "");
    if (code.length < 6) return toast.error("Enter a valid barcode");
    setF((p) => ({ ...p, barcode: code }));
    const prev = entries.find((e) => e.barcode === code);
    if (prev) {
      setF((p) => ({ ...p, barcode: code, name: prev.name, brand: prev.brand, mfr: prev.mfr, type: prev.type, pack: prev.pack, unit: prev.unit, mrp: String(prev.mrp || ""), source: "Saved entries" }));
      setDup(prev); setAddQty("");
      setMsg(`Already entered — details filled below. Increase qty or save a new batch.`);
      return;
    }
    setDup(null);
    setBusy(true); setMsg(`Searching ${code}…`);
    const r = await lookup({ data: { code } }).catch(() => null);
    setBusy(false);
    if (!r?.found || !r.product) { setMsg(r?.error || "Not found online — please type the details."); return; }
    const p = r.product;
    setF((o) => ({ ...o, barcode: code, name: p.name, brand: p.brand, unit: p.unit || o.unit, mrp: p.mrp ? String(p.mrp) : o.mrp, source: p.source }));
    setMsg(`Found on ${p.source}. Check and fill the rest.`);
  };

  const addNew = (k: "mfr" | "type") => {
    const v = window.prompt(k === "mfr" ? "New manufacturer" : "New type")?.trim();
    if (!v) return;
    if (!lists[k].includes(v)) persistLists({ ...lists, [k]: [...lists[k], v] });
    set(k, v);
  };

  const save = () => {
    if (!f.name.trim()) return toast.error("Item name is required");
    const e: Entry = {
      id: crypto.randomUUID(), barcode: f.barcode, name: f.name.trim(), brand: f.brand.trim(), mfr: f.mfr, batch: f.batch.trim(),
      type: f.type, pack: f.pack.trim(), qty: Number(f.qty) || 0, unit: f.unit.trim(), mrp: Number(f.mrp) || 0,
      expMonth: f.expMonth, expYear: f.expYear, source: f.source || "Manual", addedAt: new Date().toISOString(),
    };
    persist([e, ...entries]);
    setF(EMPTY); setMsg(""); setDup(null); setAddQty(""); toast.success("Saved");
    codeRef.current?.focus();
  };

  const increaseQty = () => {
    if (!dup) return;
    const n = Number(addQty);
    if (!n || n <= 0) return toast.error("Enter qty to add");
    persist(entries.map((x) => (x.id === dup.id ? { ...x, qty: (x.qty || 0) + n } : x)));
    toast.success(`Qty updated: ${dup.name} → ${(dup.qty || 0) + n}`);
    setDup(null); setAddQty(""); setF(EMPTY); setMsg("");
    codeRef.current?.focus();
  };

  const pickEntry = (e: Entry) => {
    setF({ barcode: e.barcode, name: e.name, brand: e.brand, mfr: e.mfr, batch: e.batch, type: e.type, pack: e.pack, qty: "", unit: e.unit, mrp: String(e.mrp || ""), expMonth: e.expMonth, expYear: e.expYear, source: "Saved entries" });
    setDup(e); setAddQty("");
    setMsg("Selected from saved items — increase qty or save a new batch.");
  };

  const download = () => {
    if (!entries.length) return toast.error("No entries yet");
    const rows = entries.map((e) => ({
      Barcode: e.barcode, "Item Name": e.name, Brand: e.brand, Manufacturer: e.mfr, "Batch Code": e.batch, Type: e.type,
      "Pack Size": e.pack, Qty: e.qty, Unit: e.unit, MRP: e.mrp, Expiry: e.expMonth && e.expYear ? `${e.expMonth}/${e.expYear}` : "",
      Source: e.source, "Added On": new Date(e.addedAt).toLocaleString("en-IN"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Entry");
    XLSX.writeFile(wb, `data-entry-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Data Entry
          </h1>
          <p className="text-sm text-muted-foreground">Scan a barcode — name, brand, unit and MRP fill in when available.</p>
        </div>
        <Button variant="outline" onClick={download}><Download className="h-4 w-4 mr-1.5" /> Download Excel ({entries.length})</Button>
      </div>

      <div className="flex gap-2">
        {(["medicine", "general"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`px-4 h-9 rounded-full text-sm font-medium border ${mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted"}`}>
            {m === "medicine" ? "Medicine (full details)" : "General item (quick)"}
          </button>
        ))}
      </div>

      <Card className="p-4 lg:p-6 space-y-5">
        <div className="space-y-1.5">
          <Label>Scan / Enter Barcode</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={codeRef} autoFocus className="pl-9 h-11 text-base" placeholder="Scan with USB scanner or type barcode / item name, then Enter"
                value={f.barcode} onChange={(e) => { set("barcode", e.target.value); setDup(null); }}
                onKeyDown={(e) => e.key === "Enter" && search(f.barcode)} />
              <Sugs q={f.barcode} entries={entries} onPick={pickEntry} />
            </div>
            <Button className="h-11" variant="outline" onClick={() => search(f.barcode)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
            <Button className="h-11" onClick={() => setScan(true)}><ScanLine className="h-4 w-4 mr-1.5" /> Camera</Button>
          </div>
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          {dup && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
              <div className="text-sm font-medium">Already entered: {dup.name}</div>
              <div className="text-xs text-muted-foreground">
                Current qty <span className="font-semibold text-foreground">{dup.qty || 0}</span>
                {dup.mrp ? <> · MRP ₹{dup.mrp}</> : null}
                {dup.batch ? <> · Batch {dup.batch}</> : null}
                {dup.expMonth && dup.expYear ? <> · Exp {dup.expMonth}/{dup.expYear}</> : null}
              </div>
              <div className="flex gap-2 items-center">
                <Input type="number" className="w-28 h-9" placeholder="Add qty" value={addQty} onChange={(e) => setAddQty(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && increaseQty()} />
                <Button size="sm" onClick={increaseQty}><Plus className="h-4 w-4 mr-1" /> Increase Qty</Button>
                <Button size="sm" variant="ghost" onClick={() => { setDup(null); setAddQty(""); }}>New batch instead</Button>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <F label="Item Name" req value={f.name} onChange={(v) => set("name", v)} ph="e.g. Paracetamol 500mg" />
          <F label="Brand" value={f.brand} onChange={(v) => set("brand", v)} ph="e.g. Himalaya" />
          {mode === "medicine" && (
            <>
              <Pick label="Manufacturer" value={f.mfr} opts={lists.mfr} onChange={(v) => set("mfr", v)} onAdd={() => addNew("mfr")} />
              <F label="Batch Code" value={f.batch} onChange={(v) => set("batch", v)} />
            </>
          )}
          <Pick label="Type" value={f.type} opts={lists.type} onChange={(v) => set("type", v)} onAdd={() => addNew("type")} />
          {mode === "medicine" && <F label="Pack Size" value={f.pack} onChange={(v) => set("pack", v)} ph="e.g. 10x10" />}
          <F label="No. of Qty" type="number" value={f.qty} onChange={(v) => set("qty", v)} ph="e.g. 10" />
          {mode === "medicine" && (
            <div className="space-y-1.5">
              <div className="flex justify-between"><Label>Units</Label><span className="text-xs text-muted-foreground">Any format (30ml, 500gm, 5g, 1)</span></div>
              <Input value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. 30ml, 50ml, Tablets" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {UNITS.map((u) => (
                  <button key={u} type="button" onClick={() => set("unit", u)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${f.unit === u ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted"}`}>{u}</button>
                ))}
              </div>
            </div>
          )}
          <F label="MRP (₹)" type="number" value={f.mrp} onChange={(v) => set("mrp", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Sel label="Expiry Month" value={f.expMonth} onChange={(v) => set("expMonth", v)} ph="Month"
              opts={MONTHS.map((m, i) => [String(i + 1).padStart(2, "0"), `${String(i + 1).padStart(2, "0")} — ${m}`])} />
            <Sel label="Expiry Year" value={f.expYear} onChange={(v) => set("expYear", v)} ph="Year" opts={YEARS.map((y) => [y, y])} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Only Item Name is required — leave anything unknown blank and fill it later.</p>
        <Button className="w-full h-11 text-base" onClick={save}><Plus className="h-4 w-4 mr-1.5" /> Save Entry</Button>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Saved entries</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Barcode</TableHead><TableHead>Item Name</TableHead><TableHead>Brand</TableHead><TableHead>MFR</TableHead>
              <TableHead>Batch</TableHead><TableHead>Type</TableHead><TableHead>Pack</TableHead><TableHead>Qty</TableHead>
              <TableHead>Unit</TableHead><TableHead className="text-right">MRP</TableHead><TableHead>Expiry</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.barcode || "—"}</TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.brand || "—"}</TableCell><TableCell>{e.mfr || "—"}</TableCell>
                  <TableCell>{e.batch || "—"}</TableCell><TableCell>{e.type || "—"}</TableCell>
                  <TableCell>{e.pack || "—"}</TableCell><TableCell>{e.qty || "—"}</TableCell>
                  <TableCell>{e.unit || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.mrp ? `₹${e.mrp}` : "—"}</TableCell>
                  <TableCell>{e.expMonth && e.expYear ? `${e.expMonth}/${e.expYear}` : "—"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => persist(entries.filter((x) => x.id !== e.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!entries.length && <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No entries yet — scan a barcode to begin.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>

      <BarcodeScanner open={scan} onOpenChange={setScan} onDetected={search} />
    </div>
  );
}

function Sugs({ q, entries, onPick }: { q: string; entries: Entry[]; onPick: (e: Entry) => void }) {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return null;
  const m = entries.filter((e) => e.name.toLowerCase().includes(s) || e.brand.toLowerCase().includes(s) || e.barcode.includes(s)).slice(0, 6);
  if (!m.length) return null;
  return (
    <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-auto">
      {m.map((e) => (
        <button key={e.id} type="button" onClick={() => onPick(e)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between gap-2">
          <span className="truncate">{e.name}{e.brand ? ` · ${e.brand}` : ""}</span>
          <span className="text-xs text-muted-foreground shrink-0">qty {e.qty || 0}{e.mrp ? ` · ₹${e.mrp}` : ""}</span>
        </button>
      ))}
    </div>
  );
}

function F({ label, value, onChange, type = "text", ph, req }: { label: string; value: string; onChange: (v: string) => void; type?: string; ph?: string; req?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{req && <span className="text-destructive"> *</span>}</Label>
      <Input type={type} value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
const selCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
function Sel({ label, value, onChange, opts, ph }: { label: string; value: string; onChange: (v: string) => void; opts: string[][]; ph: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select className={selCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{ph}</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
function Pick({ label, value, opts, onChange, onAdd }: { label: string; value: string; opts: string[]; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <select className={selCls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select {label.toLowerCase()}</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <Button type="button" variant="secondary" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add New</Button>
      </div>
    </div>
  );
}
