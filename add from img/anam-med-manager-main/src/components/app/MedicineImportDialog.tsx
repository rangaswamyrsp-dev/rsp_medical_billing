import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Camera, FileSpreadsheet, Loader2, Trash2, AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { extractRowsFromImage, type ExtractedRow } from "@/lib/vision.functions";
import type { Medicine } from "@/data/medicines";

export type ImportMode = "photo" | "excel";

type Row = ExtractedRow & { _key: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: ImportMode;
  existing: Medicine[];
  onConfirm: (rows: Omit<Medicine, "id">[]) => void;
};

const FIELDS: { key: keyof ExtractedRow; label: string; type?: "number"; w: string }[] = [
  { key: "name", label: "Medicine name", w: "min-w-52" },
  { key: "company", label: "Supplier", w: "min-w-40" },
  { key: "invoice", label: "Invoice no.", w: "min-w-32" },
  { key: "mfr", label: "MFR", w: "min-w-20" },
  { key: "type", label: "Type", w: "min-w-24" },
  { key: "category", label: "Category", w: "min-w-28" },
  { key: "hsn", label: "HSN", w: "min-w-28" },
  { key: "pack", label: "Pack", w: "min-w-20" },
  { key: "batch", label: "Batch", w: "min-w-28" },
  { key: "expiry", label: "Expiry", w: "min-w-24" },
  { key: "mrp", label: "MRP", type: "number", w: "min-w-24" },
  { key: "purchase", label: "Purchase", type: "number", w: "min-w-24" },
  { key: "gst", label: "GST %", type: "number", w: "min-w-20" },
  { key: "stock", label: "Qty", type: "number", w: "min-w-20" },
];

const TEMPLATE = `Medicine Name\tSupplier\tInvoice No\tMFR\tType\tCategory\tHSN\tPack\tBatch\tExpiry\tMRP\tPurchase Price\tGST\tQuantity
CETABLOCK TRIO\tAMBIKAA MEDINEEDS\t2600073008278\tATO\tTablet\tAntibiotic\t30049099\t10x10\t25S3GTB062\t2027-08\t201.56\t170.00\t5\t10`;

const HEADER_ALIASES: Record<string, keyof ExtractedRow> = {
  medicinename: "name", name: "name", item: "name", itemdescription: "name", product: "product" as any,
  supplier: "company", supplyer: "company", stockist: "company", distributor: "company",
  suppliername: "company", company: "company", companyname: "company", marketedby: "company",
  invoice: "invoice", invoiceno: "invoice", invoicenumber: "invoice", billno: "invoice",
  taxinvoice: "invoice", taxinvoiceno: "invoice", billnumber: "invoice",
  mfr: "mfr", manufacturer: "mfr", mfg: "mfr", mfacmktby: "mfr",
  type: "type", dosageform: "type", form: "type",
  category: "category",
  hsn: "hsn", hsncode: "hsn", hsnsac: "hsn", hsnsaccode: "hsn",
  pack: "pack", packsize: "pack",
  batch: "batch", batchno: "batch", batchnumber: "batch",
  expiry: "expiry", exp: "expiry", expdate: "expiry", expirydate: "expiry",
  mrp: "mrp", price: "mrp",
  purchase: "purchase", purchaseprice: "purchase", rate: "purchase", tradeprice: "purchase", ptr: "purchase",
  gst: "gst", gstpercent: "gst", tax: "tax" as any,
  qty: "stock", quantity: "stock", stock: "stock", qtybilled: "stock",
};

const emptyRow = (): Row => ({
  _key: Math.random().toString(36).slice(2),
  name: "", company: "", invoice: "", mfr: "", type: "", category: "", hsn: "", batch: "", expiry: "",
  mrp: 0, purchase: 0, gst: 5, pack: "", stock: 0, confidence: 100, notes: "",
});

function normExpiry(v: string): string {
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[-/](\d{2})$/);
  if (m) return `20${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  return s;
}

function issuesFor(r: Row, all: Row[], existing: Medicine[]): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push("Medicine name is missing");
  if (!r.hsn.trim()) out.push("HSN code missing");
  if (!r.batch.trim()) out.push("Batch missing");
  if (!r.expiry.trim()) out.push("Expiry missing");
  else if (!/^\d{4}-\d{2}$/.test(normExpiry(r.expiry))) out.push("Expiry must be YYYY-MM");
  if (!r.mrp) out.push("MRP missing");
  if (r.confidence < 60) out.push("Low confidence — please verify");
  if (r.notes) out.push(r.notes);
  const dupIn = all.filter((x) => x.name.trim().toLowerCase() === r.name.trim().toLowerCase() && x.batch.trim().toLowerCase() === r.batch.trim().toLowerCase());
  if (r.name && r.batch && dupIn.length > 1) out.push("Duplicate row in this import");
  if (r.name && r.batch && existing.some((m) => m.name.toLowerCase() === r.name.trim().toLowerCase() && m.batch.toLowerCase() === r.batch.trim().toLowerCase()))
    out.push("Already in inventory (same name + batch)");
  return out;
}

export function MedicineImportDialog({ open, onOpenChange, mode, existing, onConfirm }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setRows([]); setText(""); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const addRows = (incoming: Omit<Row, "_key">[]) =>
    setRows((prev) => [...prev, ...incoming.map((r) => ({ ...r, _key: Math.random().toString(36).slice(2) }))]);

  /** Photos → AI extraction (processed in batches so 10+ images work). */
  const readPhotos = async (files: File[]) => {
    setBusy(true);
    try {
      const dataUrls = await Promise.all(
        files.map(
          (file) =>
            new Promise<string>((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result));
              fr.onerror = () => rej(new Error("read"));
              fr.readAsDataURL(file);
            }),
        ),
      );
      let found = 0;
      let failed = 0;
      for (let i = 0; i < dataUrls.length; i += 4) {
        const chunk = dataUrls.slice(i, i + 4);
        const out = await extractRowsFromImage({ data: { images: chunk } });
        if (!out.ok) { failed++; toast.error(out.error); continue; }
        found += out.rows.length;
        addRows(out.rows.map((r) => ({ ...r, expiry: normExpiry(r.expiry) })));
      }
      if (found) toast.success(`Read ${found} medicine row(s) from ${files.length} image(s) — review before adding`);
      else if (!failed) toast.error("Nothing could be read from those images.");
    } catch {
      toast.error("Could not read those photos.");
    } finally {
      setBusy(false);
    }
  };

  const rowsFromMatrix = (matrix: string[][]) => {
    const grid = matrix.filter((r) => r.some((c) => String(c ?? "").trim()));
    if (!grid.length) return toast.error("That file looks empty.");
    const headerCells = grid[0].map((h) => String(h ?? "").toLowerCase().replace(/[^a-z]/g, ""));
    const map = headerCells.map((h) => HEADER_ALIASES[h] ?? null);
    const hasHeader = map.filter(Boolean).length >= 2;
    const keys = hasHeader
      ? map
      : (["name", "company", "invoice", "mfr", "type", "category", "hsn", "pack", "batch", "expiry", "mrp", "purchase", "gst", "stock"] as (keyof ExtractedRow)[]);
    const body = hasHeader ? grid.slice(1) : grid;
    const parsed = body.map((cells) => {
      const r = emptyRow();
      keys.forEach((k, i) => {
        if (!k) return;
        const raw = String(cells[i] ?? "").trim();
        if (k === "mrp" || k === "purchase" || k === "gst" || k === "stock") {
          (r as any)[k] = Number(raw.replace(/[^0-9.\-]/g, "")) || 0;
        } else if (k === "expiry") r.expiry = normExpiry(raw);
        else if (k === "hsn") r.hsn = raw.replace(/[^0-9]/g, "");
        else (r as any)[k] = raw;
      });
      r.confidence = 100;
      return r;
    }).filter((r) => r.name);
    if (!parsed.length) return toast.error("No medicine rows found.");
    setRows((prev) => [...prev, ...parsed]);
    toast.success(`Loaded ${parsed.length} row(s) — review before adding`);
  };

  const readFile = async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("empty");
      rowsFromMatrix(XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, raw: false }));
    } catch {
      toast.error("Could not read that file. Save it as .xlsx or .csv and try again.");
    } finally {
      setBusy(false);
    }
  };

  const readPaste = () => {
    if (!text.trim()) return toast.error("Paste some rows first");
    rowsFromMatrix(text.split(/\r?\n/).map((l) => (l.includes("\t") ? l.split("\t") : l.split(","))));
    setText("");
  };

  const update = (key: string, field: keyof ExtractedRow, value: string) =>
    setRows((prev) =>
      prev.map((r) =>
        r._key !== key
          ? r
          : {
              ...r,
              [field]: ["mrp", "purchase", "gst", "stock"].includes(field as string)
                ? Number(value.replace(/[^0-9.\-]/g, "")) || 0
                : value,
              ...(field === "name" || field === "batch" || field === "hsn" ? { confidence: 100, notes: "" } : {}),
            },
      ),
    );

  const blockers = rows.filter((r) => !r.name.trim() || !r.batch.trim() || !r.mrp);
  const warnings = rows.reduce((n, r) => n + (issuesFor(r, rows, existing).length ? 1 : 0), 0);

  const confirm = () => {
    if (!rows.length) return toast.error("Nothing to import yet");
    if (blockers.length) return toast.error(`${blockers.length} row(s) still need name, batch and MRP`);
    onConfirm(
      rows.map((r) => ({
        name: r.name.trim(),
        company: r.company.trim(),
        invoice: r.invoice.trim(),
        mfr: r.mfr.trim(),
        type: r.type.trim(),
        category: r.category.trim(),
        hsn: r.hsn.trim(),
        pack: r.pack.trim(),
        batch: r.batch.trim(),
        expiry: normExpiry(r.expiry),
        mrp: r.mrp,
        purchase: r.purchase,
        gst: r.gst,
        stock: r.stock,
      })),
    );
    toast.success(`Added ${rows.length} medicine(s) to inventory`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[min(96vw,1200px)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "photo" ? <Camera className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
            {mode === "photo" ? "Add medicines from photos" : "Import medicines from Excel"}
          </DialogTitle>
          <DialogDescription>
            Upload → read → review and edit → confirm. Nothing is saved until you press Add.
          </DialogDescription>
        </DialogHeader>

        {mode === "photo" ? (
          <div className="rounded-md border border-dashed p-3 flex items-center gap-3 flex-wrap">
            <Camera className="h-4 w-4 text-primary" />
            <div className="text-xs flex-1 min-w-48">
              <div className="font-medium">Bills, invoices, boxes or strips</div>
              <div className="text-muted-foreground">
                Pick several photos at once — every medicine line is read into its own row.
              </div>
            </div>
            <input
              ref={photoRef} type="file" accept="image/*" multiple capture={undefined} className="hidden"
              onChange={(e) => { const fl = Array.from(e.target.files ?? []); if (fl.length) readPhotos(fl); e.target.value = ""; }}
            />
            <Button size="sm" disabled={busy} onClick={() => photoRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
              {busy ? "Scanning…" : "Choose photos"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-dashed p-3 flex items-center gap-3 flex-wrap">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <div className="text-xs flex-1 min-w-48">
                <div className="font-medium">Upload .xlsx, .xls or .csv</div>
                <div className="text-muted-foreground">Column names are matched automatically. HSN is included.</div>
              </div>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }}
              />
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>Choose file</Button>
              <Button
                size="sm" variant="ghost"
                onClick={() => { navigator.clipboard.writeText(TEMPLATE); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />} Copy template
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Or paste rows from Excel</Label>
              <Textarea rows={4} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={TEMPLATE} />
              <Button size="sm" variant="outline" onClick={readPaste}>Read pasted rows</Button>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <Badge variant="secondary">{rows.length} row(s) ready for review</Badge>
              {warnings > 0 && (
                <span className="text-[color:var(--warning)] flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {warnings} row(s) need a check
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={() => setRows((p) => [...p, emptyRow()])}>Add blank row</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRows([])}>Clear all</Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">#</th>
                    {FIELDS.map((f) => (
                      <th key={f.key} className="px-2 py-2 text-left font-medium whitespace-nowrap">{f.label}</th>
                    ))}
                    <th className="px-2 py-2 text-left font-medium">Check</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const issues = issuesFor(r, rows, existing);
                    return (
                      <tr key={r._key} className="border-t align-top">
                        <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                        {FIELDS.map((f) => {
                          const missing =
                            (f.key === "hsn" && !r.hsn.trim()) ||
                            (f.key === "batch" && !r.batch.trim()) ||
                            (f.key === "expiry" && !r.expiry.trim()) ||
                            (f.key === "mrp" && !r.mrp) ||
                            (f.key === "name" && !r.name.trim());
                          return (
                            <td key={f.key} className="px-1 py-1">
                              <Input
                                value={String((r as any)[f.key] ?? "")}
                                onChange={(e) => update(r._key, f.key, e.target.value)}
                                className={"h-8 text-xs " + f.w + (missing ? " border-destructive bg-destructive/5" : "")}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 min-w-44">
                          {issues.length === 0 ? (
                            <span className="text-[color:var(--success,inherit)] text-muted-foreground">OK · {r.confidence}%</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {issues.map((t) => (
                                <li key={t} className="text-[color:var(--warning)]">• {t}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                            onClick={() => setRows((p) => p.filter((x) => x._key !== r._key))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={rows.length === 0 || busy}>
            Confirm &amp; add {rows.length > 0 && `(${rows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
