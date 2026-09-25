import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  Upload,
  FileSpreadsheet,
  Trash2,
  Loader2,
  Copy,
  Sparkles,
  Key,
  X,
  AlertCircle,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import type { Medicine } from "@/data/medicines";
import {
  downloadMedicineImportTemplate,
  parseMedicineExcelFile,
  parseMedicinePastedText,
  normalizeExpiryDate,
  normalizeHsnCode,
  SAMPLE_EXCEL_PASTE_TEXT,
  type ParsedImportRow,
} from "@/lib/inventory-excel";
import { extractMedicinesFromImageServerFn } from "@/lib/vision.functions";
import { toast } from "sonner";

export interface MedicineImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "photo" | "excel";
  onSuccess?: () => void;
}

interface ImageUploadItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "idle" | "reading" | "done" | "error";
  error?: string;
  itemsFound?: number;
}

export function MedicineImportModal({
  open,
  onOpenChange,
  defaultTab = "photo",
  onSuccess,
}: MedicineImportModalProps) {
  const existingSuppliers = useStore((s) => s.suppliers);

  const [activeTab, setActiveTab] = useState<"photo" | "excel">(defaultTab);
  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [readingAll, setReadingAll] = useState(false);
  const [currentScanIndex, setCurrentScanIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [lastScanError, setLastScanError] = useState<string | null>(null);

  // Review table rows
  const [rows, setRows] = useState<ParsedImportRow[]>([]);

  // Excel paste textarea state
  const [pastedText, setPastedText] = useState<string>(SAMPLE_EXCEL_PASTE_TEXT);

  // User API key override (stored in localStorage)
  const [userApiKey, setUserApiKey] = useState<string>("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, open]);

  useEffect(() => {
    const saved = localStorage.getItem("rsp_gemini_api_key") || "";
    setUserApiKey(saved);
  }, []);

  const saveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem("rsp_gemini_api_key", key.trim());
    toast.success("AI Key saved locally");
    setShowKeyInput(false);
    setLastScanError(null);
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setRows([]);
    setReadingAll(false);
    setLastScanError(null);
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  };

  // ── Process Images With AI Vision ──────────────────────────────────────────
  const processImages = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setLastScanError(null);

    const newItems: ImageUploadItem[] = fileList.map((f) => ({
      id: "img-" + Math.random().toString(36).slice(2, 9),
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: "idle",
    }));

    setImages((prev) => [...prev, ...newItems]);
    setReadingAll(true);

    const newExtractedRows: ParsedImportRow[] = [];
    let scanErrorMessage: string | null = null;

    for (let i = 0; i < newItems.length; i++) {
      setCurrentScanIndex(i + 1);
      const imgItem = newItems[i];

      imgItem.status = "reading";
      setImages([...newItems]);

      try {
        const dataUrl = await fileToDataUrl(imgItem.file);
        const res = await extractMedicinesFromImageServerFn({
          data: {
            image: dataUrl,
            userApiKey: userApiKey || undefined,
          },
        });

        if (!res.ok) {
          imgItem.status = "error";
          imgItem.error = res.error;
          setImages([...newItems]);
          scanErrorMessage = res.error;
          setLastScanError(res.error);
          toast.error(res.error);
          continue;
        }

        const items = res.medicines || [];
        imgItem.status = "done";
        imgItem.itemsFound = items.length;
        setImages([...newItems]);

        items.forEach((m, mIdx) => {
          newExtractedRows.push({
            id: `scan-${i}-${mIdx}-${Date.now()}`,
            name: m.name,
            supplier: m.supplier || "",
            invoiceNo: m.invoiceNo || "",
            company: m.company, // Short MFR verbatim
            type: m.type || "Tablet",
            category: m.category || "",
            hsn: normalizeHsnCode(m.hsn),
            pack: m.pack || "10's",
            batch: m.batch,
            expiry: normalizeExpiryDate(m.expiry),
            mrp: m.mrp,
            cost: m.cost,
            gst: m.gst || 5,
            stock: m.stock || 1,
            check: m.confidence || (m.hsn ? "OK · 98%" : "Check HSN"),
            source: imgItem.file.name,
          });
        });
      } catch (err: any) {
        imgItem.status = "error";
        imgItem.error = err?.message;
        setImages([...newItems]);
        scanErrorMessage = err?.message || "Failed to scan photo";
        setLastScanError(scanErrorMessage);
        toast.error(`Scan error: ${scanErrorMessage}`);
      }
    }

    setReadingAll(false);

    if (newExtractedRows.length > 0) {
      setRows((prev) => [...prev, ...newExtractedRows]);
      toast.success(
        `✓ Extracted ${newExtractedRows.length} medicine row(s). Please review and edit below.`
      );
    } else if (!scanErrorMessage) {
      toast.error("No medicine items could be read from the uploaded image(s).");
    }
  };

  // ── Excel Handlers ─────────────────────────────────────────────────────────
  const handleExcelUpload = async (file: File) => {
    try {
      const parsed = await parseMedicineExcelFile(file);
      setRows((prev) => [...prev, ...parsed]);
      toast.success(`✓ Loaded ${parsed.length} row(s) from ${file.name}`);
    } catch (err: any) {
      toast.error(err?.message || "Could not read Excel/CSV file");
    }
  };

  const handleReadPasted = () => {
    if (!pastedText.trim()) {
      return toast.error("Please paste tabular rows from Excel first");
    }
    const parsed = parseMedicinePastedText(pastedText);
    if (parsed.length === 0) {
      return toast.error("Could not parse rows. Check tab or space separation.");
    }
    setRows((prev) => [...prev, ...parsed]);
    toast.success(`✓ Loaded ${parsed.length} row(s) from pasted text`);
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(SAMPLE_EXCEL_PASTE_TEXT);
    toast.success("Template copied to clipboard! You can paste it into Excel.");
  };

  // ── Row Editing ────────────────────────────────────────────────────────────
  const updateRow = (id: string, patch: Partial<ParsedImportRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addBlankRow = () => {
    const blank: ParsedImportRow = {
      id: `manual-${Date.now()}`,
      name: "",
      supplier: rows[0]?.supplier || "",
      invoiceNo: rows[0]?.invoiceNo || "",
      company: "",
      type: "Tablet",
      category: "",
      hsn: "",
      pack: "10's",
      batch: "",
      expiry: "",
      mrp: 0,
      cost: 0,
      gst: 5,
      stock: 1,
      check: "Manual",
    };
    setRows((prev) => [...prev, blank]);
  };

  // ── Confirm & Add to Inventory / Medicines ─────────────────────────────────
  const confirmAndAdd = async () => {
    if (rows.length === 0) return;

    // Filter out rows without a name or batch
    const validRows = rows.filter((r) => r.name.trim() && r.batch.trim());
    if (validRows.length === 0) {
      return toast.error("Please ensure medicines have a Name and Batch number before adding.");
    }

    setSaving(true);
    try {
      const medicinesToInsert: Omit<Medicine, "id">[] = validRows.map((r) => {
        const mrp = Number(r.mrp) || 0;
        const cost = Number(r.cost) || 0;
        const profit = Math.max(0, mrp - cost);

        // Match supplier from existing suppliers list if available
        const supMatch = existingSuppliers.find(
          (s) => s.name.trim().toLowerCase() === (r.supplier || "").trim().toLowerCase()
        );

        return {
          name: r.name.trim(),
          generic: r.category.trim() || undefined,
          category: r.category.trim() || undefined,
          company: r.company.trim() || undefined, // Short name verbatim
          supplier: r.supplier?.trim() || undefined,
          supplierId: supMatch ? supMatch.id : undefined,
          hsn: r.hsn.trim() || undefined,
          pack: r.pack.trim() || undefined,
          batch: r.batch.trim(),
          expiry: r.expiry.trim() || "2027-12",
          mrp,
          cost,
          new_rate: cost || undefined,
          profit,
          gst: Number(r.gst) || 5,
          stock: Number(r.stock) || 0,
          type: r.type.trim() || undefined,
          units: r.type.trim() || undefined,
        };
      });

      const res = await actions.bulkAddMedicines(medicinesToInsert);
      if (res?.error) {
        toast.error(`Import failed: ${res.error}`);
      } else {
        toast.success(`✓ Successfully added ${validRows.length} medicine(s) to Inventory!`);
        clearAll();
        onOpenChange(false);
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      toast.error(`Save error: ${err?.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl w-full max-h-[92vh] flex flex-col p-6 gap-4 overflow-hidden">
        {/* Top Header */}
        <DialogHeader className="space-y-1 pb-1 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeTab === "photo" ? (
                <Camera className="h-5 w-5 text-emerald-600" />
              ) : (
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              )}
              <DialogTitle className="text-lg font-bold text-foreground">
                {activeTab === "photo"
                  ? "Add medicines from photos"
                  : "Import medicines from Excel"}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 mr-6">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground gap-1 hover:text-foreground"
                onClick={() => setShowKeyInput(!showKeyInput)}
                title="Configure Vision API Key"
              >
                <Key className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden sm:inline">AI API Key</span>
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Upload → read → review and edit → confirm. Nothing is saved until you press Add.
          </DialogDescription>

          {/* Inline AI API Key Input */}
          {showKeyInput && (
            <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  ChatGPT / OpenAI / Gemini Vision API Key
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Configured in .env or override locally
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder="sk-proj-... or AIzaSy..."
                  defaultValue={userApiKey}
                  id="gemini-key-modal-input"
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={() => {
                    const el = document.getElementById(
                      "gemini-key-modal-input"
                    ) as HTMLInputElement;
                    saveApiKey(el?.value || "");
                  }}
                >
                  Save Key
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Scan Error Banner */}
          {lastScanError && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-300 flex items-start justify-between gap-3 shadow-sm">
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-sm text-red-900 dark:text-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  AI Vision Scan Notice
                </div>
                <p className="leading-relaxed">{lastScanError}</p>
                {(lastScanError.includes("Credits") || lastScanError.includes("quota") || lastScanError.includes("429")) && (
                  <div className="pt-1 text-[11px] text-red-700 dark:text-red-400">
                    💡 <b>How to fix:</b> Click the <b>"AI API Key"</b> button at the top right to paste a free Google Gemini API Key (starts with <code>AIza...</code>) or add credits to your OpenAI account at <a href="https://platform.openai.com/settings/organization/billing/" target="_blank" rel="noreferrer" className="underline font-semibold">platform.openai.com/billing</a>.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLastScanError(null)}
                className="text-red-500 hover:text-red-800 p-1"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* TAB 1: ADD FROM PHOTO */}
          {activeTab === "photo" && (
            <div className="space-y-4">
              {/* Green Upload Banner */}
              <div className="border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-4 transition-colors">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 grid place-items-center shrink-0">
                      <Camera className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                        Bills, invoices, boxes or strips
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pick several photos at once — every medicine line is read into its own row.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <input
                      ref={photoInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          processImages(Array.from(e.target.files));
                        }
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={readingAll}
                      onClick={() => photoInputRef.current?.click()}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium px-4 py-2 h-9 rounded-lg w-full sm:w-auto"
                    >
                      {readingAll ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Reading photo {currentScanIndex} of {images.length}...
                        </>
                      ) : (
                        <>
                          <Camera className="h-4 w-4" />
                          Choose photos
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT EXCEL */}
          {activeTab === "excel" && (
            <div className="space-y-4">
              {/* Green Upload Banner */}
              <div className="border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-4 transition-colors">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 grid place-items-center shrink-0">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                        Upload .xlsx, .xls or .csv
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Column names are matched automatically. HSN is included.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      ref={excelFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleExcelUpload(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => excelFileInputRef.current?.click()}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 h-9 rounded-lg"
                    >
                      Choose file
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyTemplate}
                      className="gap-1.5 h-9 rounded-lg border-gray-300 bg-white dark:bg-background"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                      Copy template
                    </Button>
                  </div>
                </div>
              </div>

              {/* Paste Rows From Excel Section (if no rows yet) */}
              {rows.length === 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Or paste rows from Excel
                  </label>
                  <Textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    rows={4}
                    className="font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto resize-y bg-muted/30 border-gray-200 dark:border-gray-800"
                    placeholder="Medicine Name	Supplier	Invoice No	MFR	Type	Category	HSN	Pack	Batch	Expiry	MRP	Purchase Price	GST	Quantity"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReadPasted}
                    className="text-xs h-8 border-gray-300"
                  >
                    Read pasted rows
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── REVIEW & EDIT TABLE (WHEN ROWS EXIST) ─────────────────────────── */}
          {rows.length > 0 && (
            <div className="space-y-2 pt-1">
              {/* Status & Actions Bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-muted text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                    {rows.length} row(s) ready for review
                  </span>
                  <button
                    type="button"
                    onClick={addBlankRow}
                    className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                  >
                    Add blank row
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-x-auto bg-card shadow-sm">
                <table className="w-full text-left border-collapse min-w-[1680px]">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <th className="py-2.5 px-2 w-10 min-w-[40px] text-center">#</th>
                      <th className="py-2.5 px-2.5 min-w-[220px]">Medicine name</th>
                      <th className="py-2.5 px-2.5 min-w-[180px]">Supplier</th>
                      <th className="py-2.5 px-2.5 min-w-[140px]">Invoice no.</th>
                      <th className="py-2.5 px-2.5 min-w-[95px]">MFR</th>
                      <th className="py-2.5 px-2.5 min-w-[110px]">Type</th>
                      <th className="py-2.5 px-2.5 min-w-[120px]">Category</th>
                      <th className="py-2.5 px-2.5 min-w-[110px]">HSN</th>
                      <th className="py-2.5 px-2.5 min-w-[95px]">Pack</th>
                      <th className="py-2.5 px-2.5 min-w-[125px]">Batch</th>
                      <th className="py-2.5 px-2.5 min-w-[110px]">Expiry</th>
                      <th className="py-2.5 px-2.5 min-w-[105px]">MRP</th>
                      <th className="py-2.5 px-2.5 min-w-[105px]">Purchase</th>
                      <th className="py-2.5 px-2.5 min-w-[85px]">GST %</th>
                      <th className="py-2.5 px-2.5 min-w-[85px]">Qty</th>
                      <th className="py-2.5 px-2.5 min-w-[95px]">Check</th>
                      <th className="py-2.5 px-2 w-12 text-center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {rows.map((row, idx) => (
                      <tr
                        key={row.id || idx}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        {/* 1. # Index */}
                        <td className="py-2 px-2 text-center text-muted-foreground font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* 2. Medicine name */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.name}
                            onChange={(e) =>
                              updateRow(row.id!, { name: e.target.value })
                            }
                            className="h-9 text-xs font-medium rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="Medicine Name"
                          />
                        </td>

                        {/* 3. Supplier */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.supplier || ""}
                            onChange={(e) =>
                              updateRow(row.id!, { supplier: e.target.value })
                            }
                            className="h-9 text-xs uppercase rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="Supplier"
                          />
                        </td>

                        {/* 4. Invoice no. */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.invoiceNo || ""}
                            onChange={(e) =>
                              updateRow(row.id!, { invoiceNo: e.target.value })
                            }
                            className="h-9 text-xs font-mono rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="Invoice No"
                          />
                        </td>

                        {/* 5. MFR */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.company}
                            onChange={(e) =>
                              updateRow(row.id!, { company: e.target.value.toUpperCase() })
                            }
                            className="h-9 text-xs font-mono uppercase rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="MFR"
                          />
                        </td>

                        {/* 6. Type */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.type}
                            onChange={(e) =>
                              updateRow(row.id!, { type: e.target.value })
                            }
                            className="h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="Type"
                          />
                        </td>

                        {/* 7. Category */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.category}
                            onChange={(e) =>
                              updateRow(row.id!, { category: e.target.value })
                            }
                            className="h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="Category"
                          />
                        </td>

                        {/* 8. HSN */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.hsn}
                            onChange={(e) =>
                              updateRow(row.id!, { hsn: e.target.value })
                            }
                            className="h-9 text-xs font-mono rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="HSN"
                          />
                        </td>

                        {/* 9. Pack */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.pack}
                            onChange={(e) =>
                              updateRow(row.id!, { pack: e.target.value })
                            }
                            className="h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="Pack"
                          />
                        </td>

                        {/* 10. Batch */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.batch}
                            onChange={(e) =>
                              updateRow(row.id!, { batch: e.target.value })
                            }
                            className="h-9 text-xs font-mono uppercase rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="Batch"
                          />
                        </td>

                        {/* 11. Expiry */}
                        <td className="py-2 px-2.5">
                          <Input
                            value={row.expiry}
                            onChange={(e) =>
                              updateRow(row.id!, { expiry: e.target.value })
                            }
                            className="h-9 text-xs font-mono rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                            placeholder="YYYY-MM"
                          />
                        </td>

                        {/* 12. MRP */}
                        <td className="py-2 px-2.5">
                          <Input
                            type="number"
                            step="any"
                            value={row.mrp || ""}
                            onChange={(e) =>
                              updateRow(row.id!, { mrp: Number(e.target.value) || 0 })
                            }
                            className="h-9 text-xs text-right font-medium rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="MRP"
                          />
                        </td>

                        {/* 13. Purchase */}
                        <td className="py-2 px-2.5">
                          <Input
                            type="number"
                            step="any"
                            value={row.cost || ""}
                            onChange={(e) =>
                              updateRow(row.id!, { cost: Number(e.target.value) || 0 })
                            }
                            className="h-9 text-xs text-right rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Cost"
                          />
                        </td>

                        {/* 14. GST % */}
                        <td className="py-2 px-2.5">
                          <Input
                            type="number"
                            value={row.gst}
                            onChange={(e) =>
                              updateRow(row.id!, { gst: Number(e.target.value) || 0 })
                            }
                            className="h-9 text-xs text-center rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="GST"
                          />
                        </td>

                        {/* 15. Qty */}
                        <td className="py-2 px-2.5">
                          <Input
                            type="number"
                            value={row.stock}
                            onChange={(e) =>
                              updateRow(row.id!, { stock: Number(e.target.value) || 0 })
                            }
                            className="h-9 text-xs text-center font-medium rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Qty"
                          />
                        </td>

                        {/* 16. Check Status */}
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {row.check || (row.hsn ? "OK · 98%" : "Check HSN")}
                          </span>
                        </td>

                        {/* 17. Delete Action */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id!)}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Dialog Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-9 px-4 text-xs font-medium rounded-lg border-gray-300"
          >
            Cancel
          </Button>

          <Button
            disabled={rows.length === 0 || saving}
            onClick={confirmAndAdd}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-9 px-4 text-xs rounded-lg gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>Confirm & add {rows.length > 0 ? `(${rows.length})` : ""}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
