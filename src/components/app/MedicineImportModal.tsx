import {
  useState, useRef, useEffect, useMemo } from "react";
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
  Boxes,
  Camera,
  FileSpreadsheet,
  Trash2,
  Loader2,
  Copy,
  Sparkles,
  X,
  AlertCircle,
  Lock,
  Unlock,
  Plus,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { resolveSmartStorageLocation, allocateStorageLocationsBatch } from "@/lib/storage-service";
import { useTenant } from "@/lib/tenant";
import { getUser } from "@/lib/auth";
import type { Medicine } from "@/data/medicines";
import {
  parseMedicineExcelFile,
  parseMedicinePastedText,
  normalizeExpiryDate,
  normalizeHsnCode,
  SAMPLE_EXCEL_PASTE_TEXT,
  type ParsedImportRow,
} from "@/lib/inventory-excel";
import { extractMedicinesFromImageEdgeFn } from "@/lib/vision.functions";
import { parsePackInfo, calculateStock, formatStockDisplay } from "@/lib/medicine-units";
import { calculatePurchaseInvoiceTotals } from "@/lib/purchase-calc";
import { supabase } from "@/lib/supabase";
import { detectDuplicates, normaliseMedName, normalizeMedName, findMatchingMedicine } from "@/lib/medicines-supabase";
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

export interface InvoiceGroup {
  id: string;
  supplier: string;
  invoiceNo: string;
  supplierDate: string;
  isLocked: boolean;
}

export interface ExtendedImportRow extends ParsedImportRow {
  invoiceGroupId: string;
}

export function MedicineImportModal({
  open,
  onOpenChange,
  defaultTab = "photo",
  onSuccess,
}: MedicineImportModalProps) {
  const tenant = useTenant();
  const user = getUser();
  const activeTenantId = user?.tenantId || tenant?.id;

  const existingMedicines = useStore((s) => s.medicines);
  const existingSuppliers = useStore((s) => s.suppliers);
  const existingPurchases = useStore((s) => s.purchases);

  const [activeTab, setActiveTab] = useState<"photo" | "excel">(defaultTab);
  const [images, setImages] = useState<ImageUploadItem[]>([]);
  const [readingAll, setReadingAll] = useState(false);
  const [currentScanIndex, setCurrentScanIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [lastScanError, setLastScanError] = useState<string | null>(null);

  // Multiple Invoice Groups (each has locked/editable header)
  const [invoiceGroups, setInvoiceGroups] = useState<InvoiceGroup[]>([]);

  // Medicine items across invoices
  const [rows, setRows] = useState<ExtendedImportRow[]>([]);

  // Excel paste textarea state
  const [pastedText, setPastedText] = useState<string>(SAMPLE_EXCEL_PASTE_TEXT);

  // Backend AI status (never stores any key in frontend)
  const [aiBackendConfigured, setAiBackendConfigured] = useState<boolean>(true);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, open]);

  useEffect(() => {
    // Security guarantee: permanently clean any legacy client-side AI keys
    if (typeof window !== "undefined") {
      localStorage.removeItem("rsp_gemini_api_key");
      sessionStorage.removeItem("rsp_gemini_api_key");
    }
  }, []);

  // ── Temporary AI Model Diagnostic Execution ───────────────────────────────
  useEffect(() => {
    let executed = false;
    async function runAiModelDiagnostic() {
      if (executed) return;
      executed = true;

      try {
        // Attempt 1: { diagnostic: true }
        let res = await supabase.functions.invoke("extract-medicine-data", {
          body: { diagnostic: true },
        });

        // Attempt 2: If rejected because tenantId is required or returns an error, send tenantId
        if (res.error) {
          let errContext = "";
          try {
            const ctx = (res.error as any).context;
            if (ctx) {
              const errBody = await ctx.clone().json().catch(() => null);
              errContext = errBody?.error || (await ctx.clone().text().catch(() => ""));
            }
          } catch {}

          if (
            errContext.toLowerCase().includes("tenant") ||
            res.error.message.toLowerCase().includes("tenant") ||
            res.error.name === "FunctionsHttpError"
          ) {
            const fallbackRes = await supabase.functions.invoke("extract-medicine-data", {
              body: { diagnostic: true, tenantId: activeTenantId },
            });
            if (fallbackRes.data || !fallbackRes.error) {
              res = fallbackRes;
            }
          }
        }

        if (res.data?.diagnostics && Array.isArray(res.data.diagnostics)) {
          const lines = res.data.diagnostics.map(
            (d: any) => `${d.model} -> HTTP ${d.status}${d.providerMessage ? ` (${d.providerMessage})` : ""}`
          );
          console.log(`AI MODEL DIAGNOSTIC:\n${lines.join("\n")}`);
        } else if (res.data) {
          console.log("AI MODEL DIAGNOSTIC:", JSON.stringify(res.data, null, 2));
        } else if (res.error) {
          let errDetail = res.error.message;
          try {
            const ctx = (res.error as any).context;
            if (ctx) {
              const body = await ctx.clone().json().catch(() => null);
              if (body?.error) errDetail = body.error;
            }
          } catch {}
          console.log("AI MODEL DIAGNOSTIC (Error):", errDetail);
        }
      } catch (err: any) {
        console.error("AI MODEL DIAGNOSTIC (Failed):", err?.message || err);
      }
    }

    runAiModelDiagnostic();
    (window as any).__runAiDiagnostic = runAiModelDiagnostic;
  }, [activeTenantId]);

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setRows([]);
    setInvoiceGroups([]);
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

  // ── Multiple Invoice Grouping Logic ─────────────────────────────────────────
  // Groups incoming rows by Supplier + Invoice No + Supplier Date
  const groupRowsIntoInvoices = (newRows: ParsedImportRow[], replace = false) => {
    const baseGroups = replace ? [] : [...invoiceGroups];
    const updatedGroups = [...baseGroups];
    const currentMeds = useStore.getState().medicines;
    const existingModalMeds = replace ? [] : rows;
    const allExistingForAllocation = [
      ...currentMeds,
      ...existingModalMeds.map((m) => ({ rack: m.rack, box_no: m.box_no } as any)),
    ];
    // Allocate 6 items per box, 19 usable boxes per rack (boxes 20 & 21 empty)
    const allocatedLocations = allocateStorageLocationsBatch(newRows, allExistingForAllocation, 6, 19);
    const newlyAddedExtendedRows: ExtendedImportRow[] = [];

    newRows.forEach((r, idx) => {
      const supKey = (r.supplier || "").trim();
      const invKey = (r.invoiceNo || "").trim();
      const dtKey = (r.supplierDate || "").trim();

      // Match against existing group
      let matchedGroup = updatedGroups.find(
        (g) =>
          ((!g.supplier && !supKey) || g.supplier.toLowerCase() === supKey.toLowerCase()) &&
          ((!g.invoiceNo && !invKey) || g.invoiceNo.toLowerCase() === invKey.toLowerCase())
      );

      if (!matchedGroup) {
        const newGroupId = `inv-grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        matchedGroup = {
          id: newGroupId,
          supplier: supKey,
          invoiceNo: invKey,
          supplierDate: dtKey || new Date().toLocaleDateString("en-GB"),
          isLocked: Boolean(supKey || invKey),
        };
        updatedGroups.push(matchedGroup);
      }

      // Pre-fill rack & box if missing from Excel (allocated 6 per box)
      const allocated = allocatedLocations[idx] || { rack: "R01", box_no: "B001" };
      const rowRack = r.rack?.trim() || allocated.rack;
      const rowBox = r.box_no?.trim() || allocated.box_no;

      newlyAddedExtendedRows.push({
        ...r,
        rack: rowRack,
        box_no: rowBox,
        invoiceGroupId: matchedGroup.id,
        supplier: matchedGroup.supplier,
        invoiceNo: matchedGroup.invoiceNo,
        supplierDate: matchedGroup.supplierDate,
      });
    });

    setInvoiceGroups(updatedGroups);
    if (replace) {
      setRows(newlyAddedExtendedRows);
    } else {
      setRows((prevRows) => [...prevRows, ...newlyAddedExtendedRows]);
    }
  };

  // Auto-reassign all rows currently in the modal to 6 items per box
  const handleAutoAssignAllModalRows = () => {
    if (rows.length === 0) return;
    const currentMeds = useStore.getState().medicines;
    const allocated = allocateStorageLocationsBatch(
      rows.map((r) => ({ ...r, rack: undefined, box_no: undefined })),
      currentMeds,
      6,
      19
    );
    setRows((prev) =>
      prev.map((r, i) => ({
        ...r,
        rack: allocated[i]?.rack || "R01",
        box_no: allocated[i]?.box_no || "B001",
      }))
    );
    toast.success(`Assigned ${rows.length} medicines into boxes (6 items per box)`);
  };

  // Update Group Header fields
  const updateGroupHeader = (groupId: string, patch: Partial<InvoiceGroup>) => {
    setInvoiceGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g))
    );
    if (patch.supplier !== undefined || patch.invoiceNo !== undefined || patch.supplierDate !== undefined) {
      setRows((prev) =>
        prev.map((r) =>
          r.invoiceGroupId === groupId
            ? {
                ...r,
                supplier: patch.supplier !== undefined ? patch.supplier : r.supplier,
                invoiceNo: patch.invoiceNo !== undefined ? patch.invoiceNo : r.invoiceNo,
                supplierDate: patch.supplierDate !== undefined ? patch.supplierDate : r.supplierDate,
              }
            : r
        )
      );
    }
  };

  // ── Process Images With AI Vision ──────────────────────────────────────────
  const processImages = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setLastScanError(null);

    if (!activeTenantId) {
      const tenantErrMsg = "AI image processing failed: Active business tenant could not be determined.";
      setLastScanError(tenantErrMsg);
      toast.error(tenantErrMsg);
      return;
    }

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

        if (!activeTenantId) {
          const tenantErrMsg = "AI image processing failed: Active business tenant could not be determined.";
          imgItem.status = "error";
          imgItem.error = tenantErrMsg;
          setImages([...newItems]);
          setLastScanError(tenantErrMsg);
          toast.error(tenantErrMsg);
          return;
        }

        const res = await extractMedicinesFromImageEdgeFn(dataUrl, activeTenantId);

        if (!res.ok) {
          imgItem.status = "error";
          imgItem.error = res.error;
          setImages([...newItems]);
          scanErrorMessage = res.error || "AI image processing failed: Failed to scan photo";
          setLastScanError(scanErrorMessage);
          if (scanErrorMessage.includes("not configured")) {
            setAiBackendConfigured(false);
          }
          toast.error(scanErrorMessage);
          continue;
        }

        const invoices = res.invoices || [];
        let totalItemsInPhoto = 0;

        invoices.forEach((inv) => {
          (inv.items || []).forEach((m, mIdx) => {
            totalItemsInPhoto++;
            const packStr = (m.pack || "10's").trim();
            const packInfo = parsePackInfo(packStr, m.unit || m.type);
            const qtyPacks = Number(m.quantity) || 1;
            const extraQty = 0;
            const calculatedStock = calculateStock(qtyPacks, extraQty, packInfo.packSize);
            newExtractedRows.push({
              id: `scan-${i}-${mIdx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: m.medicine_name,
              supplier: inv.supplier || "",
              invoiceNo: inv.invoice_no || "",
              supplierDate: inv.supplier_date || "",
              company: m.manufacturer || "",
              drugName: m.drug_name || "", // Drug Name / Composition
              type: m.type || "Tablet",
              hsn: normalizeHsnCode(m.hsn || ""),
              pack: packStr,
              batch: m.batch || "",
              expiry: normalizeExpiryDate(m.expiry || ""),
              mrp: m.mrp || 0,
              cost: m.purchase_price || 0,
              gst: m.gst ?? 5,
              qtyPacks,
              extraQty,
              stock: calculatedStock,
              unit: m.unit || packInfo.baseUnit || "Tablet",
              packSize: packInfo.packSize,
              check: packInfo.isAmbiguous ? "Check Pack" : "AI",
              source: imgItem.file.name,
            });
          });
        });

        imgItem.status = "done";
        imgItem.itemsFound = totalItemsInPhoto;
        setImages([...newItems]);
      } catch (err: any) {
        imgItem.status = "error";
        imgItem.error = err?.message;
        setImages([...newItems]);
        const errMsg = err?.message || "Failed to scan photo";
        scanErrorMessage = errMsg.startsWith("AI image processing failed")
          ? errMsg
          : `AI image processing failed: ${errMsg}`;
        setLastScanError(scanErrorMessage);
        if (scanErrorMessage && scanErrorMessage.includes("not configured")) {
          setAiBackendConfigured(false);
        }
        toast.error(scanErrorMessage);
      }
    }

    setReadingAll(false);

    if (newExtractedRows.length > 0) {
      groupRowsIntoInvoices(newExtractedRows);
      toast.success(
        `✓ Extracted ${newExtractedRows.length} medicine row(s). Invoices detected and grouped below.`
      );
    } else if (!scanErrorMessage) {
      toast.error("No medicine items could be read from the uploaded image(s).");
    }
  };

  // ── Excel Handlers ─────────────────────────────────────────────────────────
  const handleExcelUpload = async (file: File) => {
    try {
      const parsed = await parseMedicineExcelFile(file);
      groupRowsIntoInvoices(parsed, true);
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
    groupRowsIntoInvoices(parsed, true);
    toast.success(`✓ Loaded ${parsed.length} row(s) from pasted text`);
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(SAMPLE_EXCEL_PASTE_TEXT);
    toast.success("Template copied to clipboard! You can paste it into Excel.");
  };

  // ── Row Editing ────────────────────────────────────────────────────────────
  const updateRow = (id: string, patch: Partial<ExtendedImportRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch };
        if (
          patch.pack !== undefined ||
          patch.unit !== undefined ||
          patch.type !== undefined ||
          patch.qtyPacks !== undefined ||
          patch.extraQty !== undefined
        ) {
          const info = parsePackInfo(merged.pack, merged.unit || merged.type);
          merged.packSize = info.packSize;
          if (!merged.unit || patch.unit === undefined) {
            merged.unit = info.baseUnit;
          }
          const qP = Math.max(0, Number(merged.qtyPacks ?? 1) || 0);
          const eQ = Math.max(0, Number(merged.extraQty ?? 0) || 0);
          merged.stock = calculateStock(qP, eQ, info.packSize);
        }
        return merged;
      })
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addBlankRowToGroup = (groupId: string) => {
    const group = invoiceGroups.find((g) => g.id === groupId);
    const info = parsePackInfo("10x10", "Tablet");
    const blank: ExtendedImportRow = {
      id: `manual-${Date.now()}`,
      invoiceGroupId: groupId,
      name: "",
      supplier: group?.supplier || "",
      invoiceNo: group?.invoiceNo || "",
      supplierDate: group?.supplierDate || "",
      company: "",
      drugName: "", // Drug Name / Composition
      type: "Tablet",
      hsn: "",
      pack: "10x10",
      batch: "",
      expiry: "",
      mrp: 0,
      cost: 0,
      gst: 5,
      qtyPacks: 1,
      extraQty: 0,
      packSize: info.packSize,
      stock: calculateStock(1, 0, info.packSize),
      unit: "Tablet",
      check: "OK",
    };
    setRows((prev) => [...prev, blank]);
  };

  const addNewInvoiceGroup = () => {
    const newGroupId = `inv-grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newGroup: InvoiceGroup = {
      id: newGroupId,
      supplier: "",
      invoiceNo: "",
      supplierDate: new Date().toLocaleDateString("en-GB"),
      isLocked: false,
    };
    setInvoiceGroups((prev) => [...prev, newGroup]);
    addBlankRowToGroup(newGroupId);
  };

  // ── Medicine Duplicate Detection ───────────────────────────────────────────
  // Runs detectDuplicates for all rows against the current medicine master.
  // Returns per-row status: "existing" | "review" | "new"
  const duplicateResults = useMemo(() => {
    return detectDuplicates(
      rows.map((r) => ({ name: r.name, company: r.company, generic: r.drugName })),
      existingMedicines,
    );
  }, [rows, existingMedicines]);

  // Helper: get duplicate result for a specific row (by position in rows array)
  const getDuplicateResult = (rowId: string) => {
    const idx = rows.findIndex((r) => r.id === rowId);
    return idx >= 0 ? duplicateResults[idx] : { status: "new" as const };
  };

  // Overall Totals
  const totalMedicineLines = rows.length;
  const totalUnits = rows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
  const totalPurchaseAmount = rows.reduce((sum, r) => {
    const pSize = r.packSize || 1;
    const cost = Number(r.cost) || 0;
    const qPacks = r.qtyPacks !== undefined ? Number(r.qtyPacks) || 0 : (pSize > 1 ? (Number(r.stock) || 0) / pSize : (Number(r.stock) || 0));
    const extra = Number(r.extraQty) || 0;
    return sum + (qPacks * cost) + (extra * (cost / pSize));
  }, 0);

  // ── Confirm & Add to Inventory / Medicines / Purchases ────────────────────
  const confirmAndAdd = async () => {
    if (rows.length === 0) return;

    // Filter out rows without a name or batch
    const invalidRows = rows.filter((r) => !r.name.trim() || !r.batch.trim());
    if (invalidRows.length > 0) {
      return toast.error("Please ensure all medicines have both a Medicine Name and Batch number.");
    }

    setSaving(true);
    try {
      let createdPurchasesCount = 0;

      // Process each invoice group separately
      for (const group of invoiceGroups) {
        const groupRows = rows.filter((r) => r.invoiceGroupId === group.id);
        if (groupRows.length === 0) continue;

        const finalSupplier = group.supplier.trim();
        const finalInvoiceNo = group.invoiceNo.trim();
        const finalDate = group.supplierDate.trim() || new Date().toISOString().slice(0, 10);

        // 1. Resolve or register Supplier in Suppliers table
        let resolvedSupplierId: string | undefined = undefined;
        if (finalSupplier) {
          const currentSuppliers = useStore.getState().suppliers;
          const matched = currentSuppliers.find(
            (s) => s.name.trim().toLowerCase() === finalSupplier.toLowerCase() || s.id === finalSupplier
          );
          if (matched) {
            resolvedSupplierId = matched.id;
          } else {
            const supRes = await actions.addSupplier({
              name: finalSupplier,
              phone: "",
              balance: 0,
            });
            if (supRes?.supplier?.id) {
              resolvedSupplierId = supRes.supplier.id;
            }
          }
        }

        // 2. Identify new vs existing medicines in Medicine Master using normalised name matching
        const latestMedicines = useStore.getState().medicines;
        const newItemsToCreate: Omit<Medicine, "id">[] = [];

        groupRows.forEach((r) => {
          const normRowName = normalizeMedName(r.name);
          // 1. Check if the product exists using normalized name, strength, and composition
          const existingProduct = findMatchingMedicine(
            { name: r.name, generic: r.drugName, company: r.company },
            latestMedicines,
          );

          const mrp = Number(r.mrp) || 0;
          const cost = Number(r.cost) || 0;
          const profit = Math.max(0, mrp - cost);

          if (!existingProduct) {
            // Completely new medicine: create new record with new Medicine ID
            const alreadyInQueue = newItemsToCreate.find(
              (m) => normalizeMedName(m.name) === normRowName
            );
            if (!alreadyInQueue) {
              newItemsToCreate.push({
                name: r.name.trim(),
                company: r.company.trim() || undefined,
                generic: r.drugName.trim() || undefined,
                type: r.type.trim() || undefined,
                units: r.unit?.trim() || r.type?.trim() || undefined,
                hsn: r.hsn.trim() || undefined,
                pack: r.pack.trim() || undefined,
                batch: r.batch.trim(),
                expiry: r.expiry.trim() || "2027-12",
                mrp,
                cost,
                new_rate: cost || undefined,
                profit,
                gst: Number(r.gst) || 5,
                stock: finalSupplier && finalInvoiceNo ? 0 : Number(r.stock) || 0,
                supplier: finalSupplier || undefined,
                supplierId: resolvedSupplierId,
              });
            }
          } else {
            // Existing product found!
            // Check if this exact batch already exists
            const exactBatch = latestMedicines.find(
              (m: Medicine) =>
                normalizeMedName(m.name) === normRowName &&
                m.batch.trim().toLowerCase() === r.batch.trim().toLowerCase()
            );

            if (exactBatch) {
              // Same batch exists: update metadata/rates
              actions.updateMedicine(exactBatch.id, {
                mrp: mrp || exactBatch.mrp,
                generic: r.drugName.trim() || exactBatch.generic,
                hsn: r.hsn.trim() || exactBatch.hsn,
                pack: r.pack.trim() || exactBatch.pack,
                units: r.unit?.trim() || exactBatch.units,
                type: r.type.trim() || exactBatch.type,
                company: r.company.trim() || exactBatch.company,
                supplier: finalSupplier || exactBatch.supplier,
                supplierId: resolvedSupplierId || exactBatch.supplierId,
              });
            } else {
              // New batch of existing product: retain Medicine ID (code) and create separate batch record!
              const alreadyInQueue = newItemsToCreate.find(
                (m) =>
                  normalizeMedName(m.name) === normRowName &&
                  m.batch.trim().toLowerCase() === r.batch.trim().toLowerCase()
              );
              if (!alreadyInQueue) {
                newItemsToCreate.push({
                  name: r.name.trim(),
                  code: existingProduct.code, // Reuse existing Medicine ID!
                  company: r.company.trim() || existingProduct.company || undefined,
                  generic: r.drugName.trim() || existingProduct.generic || undefined,
                  type: r.type.trim() || existingProduct.type || undefined,
                  units: r.unit?.trim() || existingProduct.units || undefined,
                  hsn: r.hsn.trim() || existingProduct.hsn || undefined,
                  pack: r.pack.trim() || existingProduct.pack || undefined,
                  batch: r.batch.trim(),
                  expiry: r.expiry.trim() || "2027-12",
                  mrp,
                  cost,
                  new_rate: cost || undefined,
                  profit,
                  gst: Number(r.gst) || 5,
                  stock: finalSupplier && finalInvoiceNo ? 0 : Number(r.stock) || 0,
                  supplier: finalSupplier || undefined,
                  supplierId: resolvedSupplierId,
                  rack: r.rack?.trim() || existingProduct?.rack || undefined,
                  box_no: r.box_no?.trim() || (existingProduct?.box_no && existingProduct.box_no !== "Branded" && existingProduct.box_no !== "Generic" ? existingProduct.box_no : undefined),
                });
                if (existingProduct && (r.rack?.trim() || r.box_no?.trim())) {
                  actions.updateMedicine(existingProduct.id, {
                    rack: r.rack?.trim() || existingProduct.rack,
                    box_no: r.box_no?.trim() || existingProduct.box_no,
                  });
                }
              }
            }
          }
        });

        // Insert new medicines
        if (newItemsToCreate.length > 0) {
          const res = await actions.bulkAddMedicines(newItemsToCreate);
          if (res?.error) {
            toast.error(`Error saving new medicines: ${res.error}`);
            setSaving(false);
            return;
          }
        }

        // 3. Purchase Integration: Create purchase record in public.purchases and public.purchase_items
        if (finalSupplier && finalInvoiceNo) {
          const purchaseItems = groupRows.map((r) => {
            const pSize = r.packSize || 1;
            const qPacks = r.qtyPacks !== undefined ? Number(r.qtyPacks) || 0 : (pSize > 1 ? Math.floor((Number(r.stock) || 0) / pSize) : (Number(r.stock) || 0));
            const extra = r.extraQty !== undefined ? Number(r.extraQty) || 0 : (pSize > 1 ? (Number(r.stock) || 0) % pSize : 0);
            return {
              name: r.name.trim(),
              batch: r.batch.trim(),
              qty: Number(r.stock) || 1,
              stockUnits: Number(r.stock) || 1,
              extraQty: extra,
              packSize: pSize,
              pack: r.pack,
              unit: r.unit,
              rate: Number(r.cost) || 0,
              gst: Number(r.gst) || 5,
              mrp: Number(r.mrp) || 0,
            };
          });

          const groupInvoiceTotals = calculatePurchaseInvoiceTotals(purchaseItems);

          // actions.addPurchase automatically increases medicine stock without double-counting!
          const purchaseRes = await actions.addPurchase({
            date: finalDate,
            supplier: finalSupplier,
            supplierId: resolvedSupplierId,
            invoiceNo: finalInvoiceNo,
            items: purchaseItems,
            total: Math.round(groupInvoiceTotals.grandTotal),
          });

          if (!purchaseRes?.error) {
            createdPurchasesCount++;
          } else {
            toast.error(`Purchase save warning (${finalInvoiceNo}): ${purchaseRes.error}`);
          }
        } else if (newItemsToCreate.length === 0) {
          // If imported without an invoice and medicines already existed, increment stock directly
          groupRows.forEach((r) => {
            const existing = latestMedicines.find(
              (m: Medicine) =>
                m.name.trim().toLowerCase() === r.name.trim().toLowerCase() &&
                m.batch.trim().toLowerCase() === r.batch.trim().toLowerCase()
            );
            if (existing) {
              actions.adjustStock(existing.id, Number(r.stock) || 0, "Direct Import");
            }
          });
        }
      }

      // Sync both purchases and medicines with Supabase
      actions.syncPurchases();
      actions.syncMedicines();

      toast.success(
        `✓ Successfully imported ${rows.length} medicine item(s) across ${invoiceGroups.length} invoice(s)! Stock and Purchase records are synchronized.`
      );
      clearAll();
      onOpenChange(false);
      if (onSuccess) onSuccess();
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
              {aiBackendConfigured ? (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-xs"
                  title="AI extraction runs through Supabase Edge Function with server-side AI_API_KEY secret"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>AI Extraction · Secure backend connected</span>
                </div>
              ) : (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-xs"
                  title="Backend secret AI_API_KEY is not configured in Supabase Edge Function Secrets"
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span>AI Extraction · Backend not configured</span>
                </div>
              )}
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Upload → extract → review locked invoice headers & medicines → confirm. Multi-invoice supported. Purchases & inventory update together.
          </DialogDescription>
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
                {lastScanError.includes("not configured") && (
                  <div className="pt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    🔒 <b>Configuration note:</b> AI extraction is not configured. Please configure the backend AI secret (<code>AI_API_KEY</code>) in Supabase Edge Function Secrets.
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
              <div className="border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-4 transition-colors">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 grid place-items-center shrink-0">
                      <Camera className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                        Upload invoice photos or bills
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Multiple photos supported. Invoices with same supplier and bill number are grouped automatically into one purchase.
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
                        Multiple invoices in the same sheet are detected and separated automatically. HSN is optional.
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
                    placeholder="Medicine Name	Supplier	Invoice No	Supplier Date	MFR	Drug Name / Composition	Type	HSN	Pack	Batch	Expiry	MRP	Purchase Price	GST	Quantity	Unit"
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

          {/* ── MULTI-INVOICE REVIEW & EDIT SECTIONS ─────────────────────────── */}
          {rows.length > 0 && (
            <div className="space-y-6 pt-1">
              {/* 13. IMPORT SUMMARY BAR */}
              <div className="flex items-center justify-between flex-wrap gap-2 px-3.5 py-2.5 bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl text-xs">
                <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
                  <span className="font-semibold text-sky-950 dark:text-sky-100 flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-sky-600" />
                    Invoices: <span className="text-emerald-700 dark:text-emerald-400 font-bold">{invoiceGroups.length}</span>
                  </span>
                  <span className="text-sky-300 dark:text-sky-700">|</span>
                  <span className="text-muted-foreground">
                    Medicine Lines: <b className="text-foreground">{totalMedicineLines}</b>
                  </span>
                  <span className="text-sky-300 dark:text-sky-700">|</span>
                  <span className="text-muted-foreground">
                    Total Units: <b className="text-foreground">{totalUnits}</b>
                  </span>
                  <span className="text-sky-300 dark:text-sky-700">|</span>
                  <span className="text-muted-foreground">
                    Total Purchase Amount:{" "}
                    <b className="text-emerald-700 dark:text-emerald-400 font-extrabold text-sm">
                      ₹{totalPurchaseAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </b>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addNewInvoiceGroup}
                    className="h-7 text-xs gap-1 border-sky-300 text-sky-800 dark:text-sky-200 hover:bg-sky-100"
                  >
                    <Plus className="h-3 w-3" /> New Invoice
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Clear all
                  </Button>
                </div>
              </div>

              {/* RENDER EACH INVOICE GROUP */}
              {invoiceGroups.map((group, groupIdx) => {
                const groupRows = rows.filter((r) => r.invoiceGroupId === group.id);
                const groupUnits = groupRows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
                const groupTotal = groupRows.reduce(
                  (sum, r) => sum + (Number(r.stock) || 0) * (Number(r.cost) || 0),
                  0
                );

                const matchedSupplier = group.supplier.trim()
                  ? existingSuppliers.find(
                      (s) =>
                        s.name.trim().toLowerCase() === group.supplier.trim().toLowerCase() ||
                        s.id.toLowerCase() === group.supplier.trim().toLowerCase()
                    )
                  : null;

                const duplicatePurchase = group.invoiceNo.trim()
                  ? existingPurchases.find(
                      (p) =>
                        p.invoiceNo.trim().toLowerCase() === group.invoiceNo.trim().toLowerCase() &&
                        (!group.supplier.trim() || p.supplier.trim().toLowerCase() === group.supplier.trim().toLowerCase())
                    )
                  : null;

                return (
                  <div
                    key={group.id}
                    className="rounded-xl border border-sky-200 dark:border-sky-800 bg-card p-4 space-y-3 shadow-sm transition-all"
                  >
                    {/* INVOICE HEADER (LIGHT-BLUE THEME) */}
                    <div className="rounded-lg border border-sky-200/80 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/30 p-3.5 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-sky-950 dark:text-sky-200 flex items-center gap-1.5">
                            <Receipt className="h-3.5 w-3.5 text-sky-600" />
                            INVOICE {groupIdx + 1}
                            {group.supplier ? ` · ${group.supplier}` : ""}
                          </span>
                          {group.isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700">
                              <Lock className="h-3 w-3" /> Locked Header
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                              <Unlock className="h-3 w-3" /> Editing Header
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateGroupHeader(group.id, { isLocked: !group.isLocked })
                          }
                          className="h-7 text-xs border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                        >
                          {group.isLocked ? "Edit Header" : "Lock Header"}
                        </Button>
                      </div>

                      {group.isLocked ? (
                        /* Read-Only Locked Header */
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-xs">
                          {/* Supplier */}
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                              Supplier
                            </span>
                            <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                              <span className="uppercase">{group.supplier || "—"}</span>
                              {group.supplier && (
                                matchedSupplier ? (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                                    Existing
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300">
                                    New Supplier
                                  </span>
                                )
                              )}
                            </div>
                          </div>

                          {/* Invoice No */}
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                              Invoice No
                            </span>
                            <div className="font-mono font-semibold text-foreground">
                              {group.invoiceNo || "—"}
                            </div>
                          </div>

                          {/* Supplier Date */}
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                              Supplier Date
                            </span>
                            <div className="font-medium text-foreground">
                              {group.supplierDate || "—"}
                            </div>
                          </div>

                          {/* No. of Items */}
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                              No. of Items
                            </span>
                            <div className="font-bold text-foreground">
                              {groupRows.length}{" "}
                              <span className="text-[11px] font-normal text-muted-foreground">
                                ({groupUnits} units)
                              </span>
                            </div>
                          </div>

                          {/* Total */}
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                              Total
                            </span>
                            <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                              ₹{groupTotal.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Editable Header */
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                              Supplier
                            </label>
                            <Input
                              list={`supplier-list-${group.id}`}
                              value={group.supplier}
                              onChange={(e) =>
                                updateGroupHeader(group.id, { supplier: e.target.value })
                              }
                              placeholder="e.g. AMBIKAA MEDINEEDS"
                              className="h-8 text-xs uppercase bg-white dark:bg-background border-sky-300 dark:border-sky-800"
                            />
                            <datalist id={`supplier-list-${group.id}`}>
                              {existingSuppliers.map((s) => (
                                <option key={s.id} value={s.name} />
                              ))}
                            </datalist>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                              Invoice No
                            </label>
                            <Input
                              value={group.invoiceNo}
                              onChange={(e) =>
                                updateGroupHeader(group.id, { invoiceNo: e.target.value })
                              }
                              placeholder="e.g. 2600073008278"
                              className="h-8 text-xs font-mono bg-white dark:bg-background border-sky-300 dark:border-sky-800"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                              Supplier Date
                            </label>
                            <Input
                              value={group.supplierDate}
                              onChange={(e) =>
                                updateGroupHeader(group.id, { supplierDate: e.target.value })
                              }
                              placeholder="DD/MM/YYYY or YYYY-MM-DD"
                              className="h-8 text-xs bg-white dark:bg-background border-sky-300 dark:border-sky-800"
                            />
                          </div>
                        </div>
                      )}

                      {/* Duplicate Invoice Warning */}
                      {duplicatePurchase && (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                          <span>
                            Purchase invoice already exists: Invoice <b>#{group.invoiceNo}</b> from supplier <b>{group.supplier}</b> ({duplicatePurchase.date || ""}).
                          </span>
                        </div>
                      )}
                    </div>

                    {/* MEDICINE ITEMS ACTIONS FOR THIS INVOICE */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Medicine Items ({groupRows.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => addBlankRowToGroup(group.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Plus className="h-3 w-3" /> Add medicine row to this invoice
                      </button>
                    </div>

                    {/* MEDICINE ITEMS TABLE (NO CATEGORY COLUMN - DRUG NAME / COMPOSITION INSTEAD) */}
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-x-auto bg-card shadow-sm">
                      <table className="w-full text-left border-collapse min-w-[1550px]">
                        <thead>
                          <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="py-2.5 px-2 w-10 min-w-[40px] text-center">#</th>
                            <th className="py-2.5 px-2 w-20 min-w-[80px] text-center">Status</th>
                            <th className="py-2.5 px-2.5 min-w-[200px]">Medicine name</th>
                            <th className="py-2.5 px-2.5 min-w-[95px]">MFR</th>
                            <th className="py-2.5 px-2.5 min-w-[200px]">Drug Name / Composition</th>
                            <th className="py-2.5 px-2.5 min-w-[105px]">Type</th>
                            <th className="py-2.5 px-2.5 min-w-[100px]">HSN</th>
                            <th className="py-2.5 px-2.5 min-w-[90px]">Pack</th>
                            <th className="py-2.5 px-2.5 min-w-[115px]">Batch</th>
                            <th className="py-2.5 px-2.5 min-w-[100px]">Expiry</th>
                            <th className="py-2.5 px-2.5 min-w-[95px]">MRP</th>
                            <th className="py-2.5 px-2.5 min-w-[95px]">P. Rate</th>
                            <th className="py-2.5 px-2.5 min-w-[75px]">GST %</th>
                            <th className="py-2.5 px-2.5 min-w-[85px]">Qty (Packs)</th>
                            <th className="py-2.5 px-2.5 min-w-[80px]">Extra Qty</th>
                            <th className="py-2.5 px-2.5 min-w-[90px]">Unit</th>
                            <th className="py-2.5 px-2.5 min-w-[130px] text-right">Stock (Base Units)</th>
                            <th className="py-2.5 px-2.5 min-w-[140px] text-center">Rack + Box No.</th>
                            <th className="py-2.5 px-2 w-12 text-center" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-xs">
                          {groupRows.map((row, idx) => {
                            return (
                              <tr
                                key={row.id || idx}
                                className="hover:bg-muted/30 transition-colors group"
                              >
                                {/* 1. # Index */}
                                <td className="py-2 px-2 text-center text-muted-foreground font-mono text-[11px]">
                                  {idx + 1}
                                </td>

                                {/* 2. Medicine Duplicate Status */}
                                <td className="py-2 px-2 text-center whitespace-nowrap">
                                  {(() => {
                                    const dr = getDuplicateResult(row.id!);
                                    if (dr.status === "existing") {
                                      return (
                                        <span
                                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-default"
                                          title={`Existing medicine: ${dr.match?.name} (${dr.match?.code ?? dr.match?.id})`}
                                        >
                                          Existing · {dr.match?.code ?? ""}
                                        </span>
                                      );
                                    }
                                    if (dr.status === "review") {
                                      return (
                                        <span
                                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 cursor-default"
                                          title={`Possible match: ${dr.match?.name} (${dr.match?.code ?? dr.match?.id}) — composition differs. Review before confirming.`}
                                        >
                                          Review
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                        New
                                      </span>
                                    );
                                  })()}
                                </td>

                                {/* 3. Medicine name */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    value={row.name}
                                    onChange={(e) =>
                                      updateRow(row.id!, { name: e.target.value })
                                    }
                                    className={`h-9 text-xs font-medium rounded-lg bg-white dark:bg-background ${
                                      !row.name.trim()
                                        ? "border-red-400 focus-visible:ring-red-400"
                                        : "border-gray-200 dark:border-gray-800"
                                    }`}
                                    placeholder="Medicine Name"
                                  />
                                </td>

                                {/* 4. MFR */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    value={row.company}
                                    onChange={(e) =>
                                      updateRow(row.id!, {
                                        company: e.target.value.toUpperCase(),
                                      })
                                    }
                                    className="h-9 text-xs font-mono uppercase rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                                    placeholder="MFR"
                                  />
                                </td>

                                {/* 5. Drug Name / Composition (Category removed) */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    value={row.drugName}
                                    onChange={(e) =>
                                      updateRow(row.id!, { drugName: e.target.value })
                                    }
                                    className="h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                                    placeholder="Active Composition / Salt"
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
                                    placeholder="Tablet / Syrup"
                                  />
                                </td>

                                {/* 7. HSN (Strictly Optional: neutral placeholder, no red outline) */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    value={row.hsn}
                                    onChange={(e) =>
                                      updateRow(row.id!, { hsn: e.target.value })
                                    }
                                    className="h-9 text-xs font-mono rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background placeholder:text-muted-foreground/60"
                                    placeholder="Optional"
                                  />
                                </td>

                                {/* 8. Pack */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    value={row.pack}
                                    onChange={(e) =>
                                      updateRow(row.id!, { pack: e.target.value })
                                    }
                                    className="h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                                    placeholder="10x10"
                                  />
                                </td>

                                {/* 9. Batch */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    value={row.batch}
                                    onChange={(e) =>
                                      updateRow(row.id!, { batch: e.target.value })
                                    }
                                    className={`h-9 text-xs font-mono uppercase rounded-lg bg-white dark:bg-background ${
                                      !row.batch.trim()
                                        ? "border-red-400 focus-visible:ring-red-400"
                                        : "border-gray-200 dark:border-gray-800"
                                    }`}
                                    placeholder="Batch"
                                  />
                                </td>

                                {/* 10. Expiry */}
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

                                {/* 11. MRP */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    type="number"
                                    step="any"
                                    value={row.mrp || ""}
                                    onChange={(e) =>
                                      updateRow(row.id!, {
                                        mrp: Number(e.target.value) || 0,
                                      })
                                    }
                                    className="h-9 text-xs text-right font-medium rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0.00"
                                  />
                                </td>

                                {/* 12. Purchase */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    type="number"
                                    step="any"
                                    value={row.cost || ""}
                                    onChange={(e) =>
                                      updateRow(row.id!, {
                                        cost: Number(e.target.value) || 0,
                                      })
                                    }
                                    className="h-9 text-xs text-right rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0.00"
                                  />
                                </td>

                                {/* 13. GST % */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    type="number"
                                    value={row.gst}
                                    onChange={(e) =>
                                      updateRow(row.id!, {
                                        gst: Number(e.target.value) || 0,
                                      })
                                    }
                                    className="h-9 text-xs text-center rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="5"
                                  />
                                </td>

                                {/* 14. Qty (Packs) */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={row.qtyPacks ?? (row.packSize && row.packSize > 1 ? Math.floor((row.stock || 0) / row.packSize) : (row.stock ?? 1))}
                                    onChange={(e) =>
                                      updateRow(row.id!, {
                                        qtyPacks: Math.max(0, parseInt(e.target.value, 10) || 0),
                                      })
                                    }
                                    className="h-9 text-xs text-center font-medium rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="1"
                                  />
                                </td>

                                {/* 15. Extra Qty */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={row.extraQty ?? 0}
                                    onChange={(e) =>
                                      updateRow(row.id!, {
                                        extraQty: Math.max(0, parseInt(e.target.value, 10) || 0),
                                      })
                                    }
                                    className="h-9 text-xs text-center font-medium rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                  />
                                </td>

                                {/* 16. Unit */}
                                <td className="py-2 px-2.5">
                                  <Input
                                    value={row.unit || row.type || "Tablet"}
                                    onChange={(e) =>
                                      updateRow(row.id!, { unit: e.target.value })
                                    }
                                    className="h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                                    placeholder="Tablet"
                                  />
                                </td>

                                {/* 17. Stock (Base Units) */}
                                <td className="py-2 px-2.5 text-right whitespace-nowrap">
                                  <div className="font-semibold text-xs text-foreground tabular-nums">
                                    {row.stock ?? 0} {row.unit || "Units"}
                                  </div>
                                  {(row.packSize || 1) > 1 && (
                                    <div className="text-[10px] text-muted-foreground tabular-nums">
                                      {formatStockDisplay(row.stock || 0, row.packSize || 1, row.unit, row.pack).breakdown}
                                    </div>
                                  )}
                                </td>

                                {/* 18. Rack + Box No. */}
                                <td className="py-2 px-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Input
                                      value={row.rack || ""}
                                      onChange={(e) => updateRow(row.id!, { rack: e.target.value })}
                                      className="h-8 text-xs font-mono text-center rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background w-16 px-1"
                                      placeholder="Rack"
                                      title="Rack / Shelf No."
                                    />
                                    <span className="text-muted-foreground text-xs font-bold">+</span>
                                    <Input
                                      value={row.box_no || ""}
                                      onChange={(e) => updateRow(row.id!, { box_no: e.target.value })}
                                      className="h-8 text-xs font-mono text-center rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-background w-16 px-1"
                                      placeholder="Box"
                                      title="Box No."
                                    />
                                  </div>
                                </td>

                                {/* 16. Delete Action */}
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dialog Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            {rows.length > 0 && (
              <span>
                {invoiceGroups.length} invoice(s) · {totalMedicineLines} medicine line(s) · {totalUnits} total units
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleAutoAssignAllModalRows}
              disabled={rows.length === 0 || saving}
              className="h-9 px-3 text-xs font-medium rounded-lg border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 gap-1.5"
              title="Auto-assign 6 medicines per box across racks"
            >
              <Boxes className="h-3.5 w-3.5" />
              Reassign Boxes (6/box)
            </Button>

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
