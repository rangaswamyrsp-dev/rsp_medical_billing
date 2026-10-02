import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Copy, Check, Upload, Camera, Loader2, ImageIcon, X, AlertCircle } from "lucide-react";
import { extractRowsFromImage } from "@/lib/vision.functions";
import { toast } from "sonner";

export type ColumnSpec = {
  key: string;
  label: string;
  required?: boolean;
  type?: "string" | "number";
};

type Props<T> = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  columns: ColumnSpec[];
  example: string;
  onImport: (rows: T[]) => void;
};

function parse(text: string, cols: ColumnSpec[]): Record<string, any>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstCells = splitLine(lines[0]);
  const hasHeader = cols.every((c) =>
    firstCells.some((h) => h.toLowerCase().replace(/\s+/g, "") === c.label.toLowerCase().replace(/\s+/g, "") ||
                          h.toLowerCase() === c.key.toLowerCase()),
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const headerMap = hasHeader
    ? firstCells.map((h) => {
        const clean = h.toLowerCase().replace(/\s+/g, "");
        return cols.find((c) => c.label.toLowerCase().replace(/\s+/g, "") === clean || c.key.toLowerCase() === clean)?.key ?? null;
      })
    : cols.map((c) => c.key);

  return dataLines.map((ln) => {
    const cells = splitLine(ln);
    const row: Record<string, any> = {};
    headerMap.forEach((key, i) => {
      if (!key) return;
      const raw = (cells[i] ?? "").trim();
      const col = cols.find((c) => c.key === key)!;
      row[key] = col.type === "number" ? Number(raw) || 0 : raw;
    });
    return row;
  });
}

function splitLine(l: string): string[] {
  if (l.includes("\t")) return l.split("\t");
  return l.split(",");
}

export function BulkImportDialog<T>({ open, onOpenChange, title, columns, example, onImport }: Props<T>) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [reading, setReading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const reset = () => { setText(""); setPhotoPreview(null); setPhotoError(null); };

  /** Read .xlsx / .xls / .csv */
  const readFile = async (file: File) => {
    setReading(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("empty");
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, raw: false });
      const tsv = rows
        .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim()))
        .map((r) => r.map((c) => String(c ?? "").trim()).join("\t"))
        .join("\n");
      if (!tsv) throw new Error("empty");
      setText(tsv);
      toast.success(`Loaded ${file.name}`);
    } catch {
      toast.error("Could not read that file. Try saving it as .xlsx or .csv.");
    } finally {
      setReading(false);
    }
  };

  /** Read a photo with AI */
  const readPhoto = async (file: File) => {
    setPhotoError(null);
    setReading(true);

    // Show preview first
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);

    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(new Error("read"));
        fr.readAsDataURL(file);
      });

      const out = await extractRowsFromImage({
        data: { image: dataUrl, columns: columns.map((c) => ({ key: c.key, label: c.label, type: c.type })) },
      });

      if (!out.ok) {
        setPhotoError(out.error || "Could not read the photo.");
        toast.error(out.error || "Could not read the photo.");
        return;
      }

      setText(out.tsv);
      toast.success("✓ Details extracted from photo — review and edit before importing");
    } catch (e: any) {
      const msg = e?.message?.includes("not configured")
        ? "AI extraction is not configured. Please configure the backend AI secret (AI_API_KEY)."
        : "Could not read that photo. Make sure the image is clear and well-lit.";
      setPhotoError(msg);
      toast.error(msg);
    } finally {
      setReading(false);
    }
  };

  const rows = text.trim() ? parse(text, columns) : [];
  const invalid = rows.filter((r) => columns.some((c) => c.required && !r[c.key]));

  const copyTemplate = () => {
    navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const doImport = () => {
    if (rows.length === 0) return toast.error("Paste some rows first");
    if (invalid.length) return toast.error(`${invalid.length} row(s) missing required fields`);
    onImport(rows as T[]);
    toast.success(`Imported ${rows.length} row(s)`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription>
            Paste rows from Excel/Google Sheets, upload a spreadsheet file, or snap a photo of a stockist bill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Column template */}
          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm">Expected columns</div>
              <Button size="sm" variant="ghost" onClick={copyTemplate} className="h-7">
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                Copy template
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((c) => (
                <Badge key={c.key} variant={c.required ? "default" : "secondary"} className="text-[10px]">
                  {c.label}{c.required && " *"}
                </Badge>
              ))}
            </div>
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono">{example}</pre>
          </div>

          {/* Upload Excel file */}
          <div className="rounded-lg border-2 border-dashed p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors">
            <div className="bg-primary/10 rounded-lg p-2.5 shrink-0">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Upload an Excel / CSV file</div>
              <div className="text-xs text-muted-foreground">.xlsx, .xls or .csv — first sheet is read automatically</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const fl = e.target.files?.[0]; if (fl) readFile(fl); e.target.value = ""; }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={reading}
              onClick={() => fileRef.current?.click()}
              className="shrink-0"
            >
              {reading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Choose file
            </Button>
          </div>

          {/* Add from photo — redesigned, more prominent */}
          <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-4">
            <div className="flex items-start gap-3">
              <div className="bg-emerald-100 rounded-lg p-2.5 shrink-0">
                <Camera className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-emerald-800">Add from a photo (AI)</div>
                <div className="text-xs text-emerald-700/80 mt-0.5">
                  Select a photo of a stockist bill or product list — AI reads the details and fills the table for you.
                  <br />
                  <span className="text-[11px] text-muted-foreground">Secure Supabase Edge Function AI extraction · Works best with clear, well-lit photos</span>
                </div>
              </div>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const fl = e.target.files?.[0]; if (fl) readPhoto(fl); e.target.value = ""; }}
              />
              <Button
                id="btn-use-photo"
                size="sm"
                variant="outline"
                disabled={reading}
                onClick={() => photoRef.current?.click()}
                className="shrink-0 border-emerald-400 text-emerald-700 hover:bg-emerald-100"
              >
                {reading
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Reading…</>
                  : <><Camera className="h-3.5 w-3.5 mr-1" /> Use photo</>
                }
              </Button>
            </div>

            {/* Photo preview */}
            {photoPreview && (
              <div className="mt-3 flex items-start gap-3">
                <div className="relative shrink-0">
                  <img
                    src={photoPreview}
                    alt="Selected bill"
                    className="w-24 h-24 object-cover rounded-lg border border-emerald-300"
                  />
                  <button
                    onClick={() => { setPhotoPreview(null); setPhotoError(null); URL.revokeObjectURL(photoPreview); }}
                    className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 border shadow-sm hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  {reading ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AI is reading the photo…</span>
                    </div>
                  ) : photoError ? (
                    <div className="flex items-start gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{photoError}</span>
                    </div>
                  ) : text ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <Check className="h-4 w-4" />
                      <span>Photo read successfully! Review the data below before importing.</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* No photo selected state */}
            {!photoPreview && !reading && (
              <div
                className="mt-3 border border-dashed border-emerald-300 rounded-lg p-4 text-center cursor-pointer hover:bg-emerald-50 transition-colors"
                onClick={() => photoRef.current?.click()}
              >
                <ImageIcon className="h-8 w-8 text-emerald-300 mx-auto mb-1" />
                <p className="text-xs text-emerald-600">Click or tap to select a photo from your device</p>
              </div>
            )}
          </div>

          {/* Paste textarea */}
          <div className="space-y-1.5">
            <Label className="font-medium">Or paste data manually</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder="Paste from Excel or type rows here…"
            />
          </div>

          {rows.length > 0 && (
            <div className="flex items-center gap-3 text-xs bg-muted/60 rounded-md px-3 py-2">
              <span><b className="text-foreground">{rows.length}</b> row(s) detected</span>
              {invalid.length > 0 && (
                <span className="text-destructive"><b>{invalid.length}</b> invalid (missing required fields)</span>
              )}
              {invalid.length === 0 && <span className="text-primary font-medium">✓ All rows valid</span>}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={doImport} disabled={rows.length === 0 || invalid.length > 0}>
            Import {rows.length > 0 && `(${rows.length} rows)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
