import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Trash2, Pencil, FileSpreadsheet, Pill, Camera, Download, Layers,
  Boxes, AlertTriangle, Clock, ArrowUpDown, MoreHorizontal, MapPin, RotateCcw,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useTenant } from "@/lib/tenant";
import type { Medicine } from "@/data/medicines";
import { normalizeMedName } from "@/lib/medicines-supabase";
import { resolveSmartStorageLocation } from "@/lib/storage-service";
import { MedicineImportModal } from "@/components/app/MedicineImportModal";
import { exportInventoryToExcel } from "@/lib/inventory-excel";
import {
  parsePackInfo,
  calculateStock,
  calculateUnitMrp,
  calculateUnitPurchaseRate,
} from "@/lib/medicine-units";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/medicines")({
  head: () => ({ meta: [{ title: "Medicine Master · RSP Medical Billing" }] }),
  component: MedicinesPage,
});

const EMPTY: Omit<Medicine, "id"> = {
  name: "",
  generic: "",
  company: "",
  supplier: "",
  supplierId: "",
  type: "Tablet",
  hsn: "",
  pack: "10's",
  batch: "",
  mrp: 0,
  gst: 5,
  stock: 0,
  units: "Tablet",
  old_rate: 0,
  new_rate: 0,
  expiry: "",
  box_no: "",
  rack: "",
  min_stock: 10,
};

function MedicinesPage() {
  const meds = useStore((s) => s.medicines);
  const suppliers = useStore((s) => s.suppliers);
  const tenant = useTenant();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"photo" | "excel">("photo");
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [assigningStorage, setAssigningStorage] = useState(false);

  const unassignedCount = useMemo(() => {
    return meds.filter((m) => !m.rack && (!m.box_no || m.box_no === "Branded" || m.box_no === "Generic")).length;
  }, [meds]);

  const handleAutoAssignAll = async () => {
    // direct execution without blocking native alert dialog
    setAssigningStorage(true);
    try {
      const { count, error } = await actions.autoAssignAllUnassignedMedicines();
      if (error) {
        toast.error(`Auto-assignment error: ${error}`);
      } else {
        toast.success(`Successfully assigned Rack & Box locations to ${count} medicines!`);
      }
    } finally {
      setAssigningStorage(false);
    }
  };

  const handleAssignSingleMed = async (med: Medicine) => {
    const rules = useStore.getState().storageRules || [];
    const settings = useStore.getState().storageSettings;
    const resolved = resolveSmartStorageLocation(med, rules, meds, settings);
    if (!resolved || !resolved.rack) {
      return toast.error("No free box or rack available. Check your Rack Management rules.");
    }
    const { error } = await actions.updateMedicine(med.id, {
      rack: resolved.rack,
      box_no: resolved.box_no || "",
    });
    if (error) {
      toast.error(`Failed to assign: ${error}`);
    } else {
      toast.success(`Assigned ${med.name} to Rack ${resolved.rack}${resolved.box_no ? `, Box ${resolved.box_no}` : ""}`);
    }
  };
  const [form, setForm] = useState<Omit<Medicine, "id">>(EMPTY);

  // Filters state
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mfrFilter, setMfrFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [expiryStatusFilter, setExpiryStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");

  // Sorting state
  const [sortField, setSortField] = useState<"name" | "stock" | "mrp">("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Row selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pack and Loose Quantity entry states
  const [qtyPacks, setQtyPacks] = useState<number>(1);
  const [extraQty, setExtraQty] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    actions.syncMedicines();
    actions.syncSuppliers();
    actions.syncPurchases();

    const handleOpenImport = (e: any) => {
      const tab = e?.detail?.tab === "excel" ? "excel" : "photo";
      setImportTab(tab);
      setImportOpen(true);
    };
    window.addEventListener("rsp:open-import", handleOpenImport as EventListener);
    return () => window.removeEventListener("rsp:open-import", handleOpenImport as EventListener);
  }, []);

  // Distinct filter values
  const distinctSuppliers = useMemo(() => {
    return Array.from(new Set(meds.map((m) => m.supplier).filter(Boolean) as string[])).sort();
  }, [meds]);

  const distinctTypes = useMemo(() => {
    return Array.from(new Set(meds.map((m) => m.type || "Tablet").filter(Boolean) as string[])).sort();
  }, [meds]);

  const distinctCategories = useMemo(() => {
    return Array.from(new Set(meds.map((m) => m.category || m.generic).filter(Boolean) as string[])).sort();
  }, [meds]);

  const distinctMFRs = useMemo(() => {
    return Array.from(new Set(meds.map((m) => m.company).filter(Boolean) as string[])).sort();
  }, [meds]);

  const distinctUnits = useMemo(() => {
    const set = new Set<string>();
    meds.forEach((m) => {
      const info = parsePackInfo(m);
      if (info.unitLabel) set.add(info.unitLabel);
    });
    return Array.from(set).sort();
  }, [meds]);

  // Real-time Pack & Stock calculation for Add/Edit form
  const packInfo = useMemo(() => {
    return parsePackInfo({
      pack: form.pack,
      units: form.units,
      type: form.type,
    });
  }, [form.pack, form.units, form.type]);

  const calculatedStock = useMemo(() => {
    return calculateStock(qtyPacks, extraQty, packInfo.packSize);
  }, [qtyPacks, extraQty, packInfo.packSize]);

  const unitMrp = useMemo(() => {
    return calculateUnitMrp(Number(form.mrp) || 0, packInfo.packSize);
  }, [form.mrp, packInfo.packSize]);

  const unitPurchaseRate = useMemo(() => {
    const rate = Number(form.new_rate ?? form.cost) || 0;
    return calculateUnitPurchaseRate(rate, packInfo.packSize);
  }, [form.new_rate, form.cost, packInfo.packSize]);

  // Filtered & Sorted medicines
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
    const last7Date = new Date(Date.now() - 7 * 86400000);
    const last7Str = last7Date.toISOString().slice(0, 10);

    return meds
      .filter((m) => {
        // Search query
        if (q) {
          const normQ = normalizeMedName(q);
          const match = [
            m.name,
            m.generic ?? "",
            m.batch,
            m.company ?? "",
            m.supplier ?? "",
            m.box_no ?? "",
            m.hsn ?? "",
            m.id,
            m.code ?? "",
            m.type ?? "",
          ].some((v) => {
            const vLower = v.toLowerCase();
            if (vLower.includes(q)) return true;
            if (normQ && normalizeMedName(v).includes(normQ)) return true;
            return false;
          });
          if (!match) return false;
        }

        // Supplier filter
        if (supplierFilter !== "all" && (m.supplier || "").toLowerCase() !== supplierFilter.toLowerCase()) {
          return false;
        }

        // Type filter
        if (typeFilter !== "all" && (m.type || "Tablet").toLowerCase() !== typeFilter.toLowerCase()) {
          return false;
        }

        // Category filter (Strictly Branded or Generic)
        if (categoryFilter !== "all") {
          const cat = (m.category || "Branded").trim().toLowerCase();
          if (cat !== categoryFilter.trim().toLowerCase()) return false;
        }

        // MFR filter
        if (mfrFilter !== "all" && (m.company || "").toLowerCase() !== mfrFilter.toLowerCase()) {
          return false;
        }

        // Unit filter
        if (unitFilter !== "all") {
          const pInfo = parsePackInfo(m);
          if (pInfo.unitLabel.toLowerCase() !== unitFilter.toLowerCase()) return false;
        }

        // Stock Status
        const st = Number(m.stock) || 0;
        if (stockStatusFilter === "in_stock" && st <= 0) return false;
        if (stockStatusFilter === "low" && (st <= 0 || st > 15)) return false;
        if (stockStatusFilter === "out" && st > 0) return false;

        // Expiry Status
        if (expiryStatusFilter !== "all" && m.expiry) {
          const [y, mo] = m.expiry.split("-").map(Number);
          if (y) {
            const exp = new Date(y, (mo || 1) - 1, 1);
            const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
            if (expiryStatusFilter === "expired" && days >= 0) return false;
            if (expiryStatusFilter === "expiring_soon" && (days < 0 || days > 90)) return false;
          }
        }

        // Date Added
        if (dateFilter !== "all" && m.created_at) {
          const itemDate = m.created_at.slice(0, 10);
          if (dateFilter === "today" && itemDate !== todayStr) return false;
          if (dateFilter === "yesterday" && itemDate !== yesterdayStr) return false;
          if (dateFilter === "last7" && (itemDate < last7Str || itemDate > todayStr)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === "stock") {
          const sA = Number(a.stock) || 0;
          const sB = Number(b.stock) || 0;
          return sortAsc ? sA - sB : sB - sA;
        }
        if (sortField === "mrp") {
          const mA = Number(a.mrp) || 0;
          const mB = Number(b.mrp) || 0;
          return sortAsc ? mA - mB : mB - mA;
        }
        // default name
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      });
  }, [
    meds, query, supplierFilter, typeFilter, categoryFilter, mfrFilter,
    stockStatusFilter, expiryStatusFilter, dateFilter, unitFilter, sortField, sortAsc,
  ]);

  // 4 Top Stats
  const stats = useMemo(() => {
    let totalStock = 0;
    let lowStock = 0;
    let expiringSoon = 0;
    const now = new Date();

    filtered.forEach((m) => {
      const s = Number(m.stock) || 0;
      totalStock += s;
      if (s <= 15) lowStock++;

      if (m.expiry) {
        const [y, mo] = m.expiry.split("-").map(Number);
        if (y) {
          const exp = new Date(y, (mo || 1) - 1, 1);
          const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
          if (days >= 0 && days <= 90) expiringSoon++;
        }
      }
    });

    return {
      totalMeds: filtered.length,
      totalStock,
      lowStock,
      expiringSoon,
    };
  }, [filtered]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setQtyPacks(1);
    setExtraQty(0);
    setInvoiceNo("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setOpen(true);
  };

  const openEdit = (m: Medicine) => {
    setEditing(m);
    setForm(m);
    const info = parsePackInfo(m);
    if (info.packSize > 1) {
      setQtyPacks(Math.floor(m.stock / info.packSize));
      setExtraQty(m.stock % info.packSize);
    } else {
      setQtyPacks(m.stock);
      setExtraQty(0);
    }
    setOpen(true);
  };

  const handleDownloadInventory = () => {
    if (meds.length === 0) return toast.error("No medicines to download");
    exportInventoryToExcel(meds, tenant.name || "Store");
    toast.success(`Inventory exported (${meds.length} items)`);
  };

  const handleSort = (field: "name" | "stock" | "mrp") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setDateFilter("all");
  };

  const hasActiveFilters =
    query !== "" ||
    typeFilter !== "all" ||
    dateFilter !== "all";

  const save = async () => {
    const trimmedName = form.name?.trim();
    if (!trimmedName) {
      toast.error("Medicine Name is mandatory. Please enter a valid name.");
      return;
    }

    const trimmedBatch = form.batch?.trim();
    if (!trimmedBatch) {
      toast.error("Batch Number is mandatory. Please enter the batch number.");
      return;
    }

    const trimmedExpiry = form.expiry?.trim();
    if (!trimmedExpiry) {
      toast.error("Expiry Date is mandatory (e.g., 2027-06).");
      return;
    }

    const numMrp = Number(form.mrp);
    if (isNaN(numMrp) || numMrp <= 0) {
      toast.error("Pack MRP is mandatory and must be greater than ₹0.");
      return;
    }

    const purchaseRate =
      form.new_rate !== undefined && form.new_rate !== 0
        ? Number(form.new_rate)
        : form.cost !== undefined
          ? Number(form.cost)
          : 0;
    if (isNaN(purchaseRate) || purchaseRate < 0) {
      toast.error("Purchase Rate is mandatory and cannot be negative.");
      return;
    }

    if (qtyPacks < 0) {
      toast.error("Qty (Packs) cannot be negative.");
      return;
    }

    if (extraQty < 0) {
      toast.error("Extra Qty cannot be negative.");
      return;
    }

    if (calculatedStock < 0) {
      toast.error("Stock Quantity cannot be negative.");
      return;
    }

    if (saving) return;
    setSaving(true);

    try {
      const matchedSup = suppliers.find(
        (s) =>
          s.name.trim().toLowerCase() === (form.supplier || "").trim().toLowerCase() ||
          s.id === form.supplier
      );
      const profit = Math.max(0, numMrp - purchaseRate);

      const payload: Omit<Medicine, "id"> = {
        ...form,
        name: trimmedName,
        batch: trimmedBatch,
        expiry: trimmedExpiry,
        mrp: numMrp,
        stock: calculatedStock, // Authoritative Base Units Stock!
        units: packInfo.unitLabel,
        pack: form.pack || packInfo.rawPack,
        supplier: matchedSup ? matchedSup.name : form.supplier?.trim() || undefined,
        supplierId: matchedSup ? matchedSup.id : form.supplierId || undefined,
        cost: purchaseRate,
        new_rate: purchaseRate,
        profit,
      };

      if (editing) {
        if (
          purchaseRate > 0 &&
          editing.new_rate &&
          purchaseRate !== editing.new_rate &&
          !form.old_rate
        ) {
          payload.old_rate = editing.new_rate;
        }
        const res = await actions.updateMedicine(editing.id, payload);
        if (res?.error) {
          toast.error(`Database update error: ${res.error}`);
        } else {
          toast.success(`Medicine "${trimmedName}" updated successfully`);
          setOpen(false);
        }
      } else {
        const res = await actions.addMedicine(payload);
        if (res?.error) {
          toast.error(`Database error: ${res.error}`);
        } else {
          toast.success(
            `Medicine "${trimmedName}" added (${calculatedStock} ${packInfo.unitLabel}s stock)`
          );
          setOpen(false);
        }
      }
    } catch (err: any) {
      toast.error(`Operation failed: ${err?.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteMedicine = async () => {
    if (!medicineToDelete) return;
    try {
      await actions.deleteMedicine(medicineToDelete.id);
      toast.success(`Deleted "${medicineToDelete.name}" successfully`);
      setMedicineToDelete(null);
    } catch (err: any) {
      toast.error(`Delete failed: ${err?.message || String(err)}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 select-none">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
            <Pill className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Medicine Master</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage medicines, batch, MRP, GST and stock
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setImportTab("photo");
              setImportOpen(true);
            }}
            className="gap-1.5 h-9 rounded-lg text-xs font-medium border-border"
          >
            <Camera className="h-4 w-4 text-muted-foreground" /> Add from Photo
          </Button>
          {unassignedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoAssignAll}
              disabled={assigningStorage}
              className="gap-1.5 h-9 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200 shadow-2xs"
            >
              <Boxes className={`h-4 w-4 text-amber-600 ${assigningStorage ? "animate-spin" : ""}`} />
              {assigningStorage ? "Assigning Boxes..." : `Auto-Assign Boxes (${unassignedCount})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setImportTab("excel");
              setImportOpen(true);
            }}
            className="gap-1.5 h-9 rounded-lg text-xs font-medium border-border"
          >
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Import Excel
          </Button>
          <Button
            size="sm"
            onClick={openAdd}
            className="gap-1.5 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" /> Add Medicine
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadInventory}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            title="Download Inventory Excel"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Compact Filter Toolbar (Search + Medicine Type + Added Date) ── */}
      <Card className="p-3 border shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-9 h-8.5 text-xs rounded-lg bg-background"
              placeholder="Search by name, composition, batch, supplier, MFR..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Medicine Type */}
          <div className="w-full sm:w-44">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8.5 text-xs">
                <SelectValue placeholder="All Medicine Types" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">All Medicine Types</SelectItem>
                {distinctTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Added Date */}
          <div className="w-full sm:w-40">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="h-8.5 text-xs">
                <SelectValue placeholder="All Added Dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Added Dates</SelectItem>
                <SelectItem value="today">Today Added</SelectItem>
                <SelectItem value="yesterday">Yesterday Added</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8.5 px-2.5 text-xs gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
            >
              <RotateCcw className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </Card>

      {/* ── 4 Key Metric Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Medicines */}
        <Card className="p-4 flex items-center gap-3.5 bg-blue-50/40 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40">
          <div className="h-11 w-11 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.totalMeds.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Total Medicines</div>
          </div>
        </Card>

        {/* Total Stock (Units) */}
        <Card className="p-4 flex items-center gap-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40">
          <div className="h-11 w-11 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stats.totalStock.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Total Stock (Units)</div>
          </div>
        </Card>

        {/* Low Stock (<= 15) */}
        <Card className="p-4 flex items-center gap-3.5 bg-rose-50/40 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40">
          <div className="h-11 w-11 rounded-xl bg-rose-600/10 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-rose-600 tabular-nums">
              {stats.lowStock}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Low Stock (≤ 15)</div>
          </div>
        </Card>

        {/* Expiring Soon (<= 3 months) */}
        <Card className="p-4 flex items-center gap-3.5 bg-amber-50/40 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40">
          <div className="h-11 w-11 rounded-xl bg-amber-600/10 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-amber-600 tabular-nums">
              {stats.expiringSoon}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Expiring Soon (≤ 3 months)</div>
          </div>
        </Card>
      </div>

      {/* ── Medicine Master Table (Separate Stock & Unit Columns) ── */}
      <Card className="border shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[1250px]">
            <TableHeader className="bg-muted/40">
              <TableRow className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <TableHead className="w-10 text-center px-2">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                </TableHead>
                <TableHead className="w-20 px-3">ID</TableHead>
                <TableHead
                  className="min-w-[220px] px-3 cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>Medicine Name</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
                <TableHead className="min-w-[140px] px-3">Supplier</TableHead>
                <TableHead className="w-24 px-3">MFR</TableHead>
                <TableHead className="w-20 px-3">Type</TableHead>
                <TableHead className="w-20 px-3">HSN</TableHead>
                <TableHead className="w-24 px-3">Pack</TableHead>
                <TableHead className="min-w-[110px] px-3">Batch</TableHead>
                <TableHead className="w-24 px-3">Expiry</TableHead>
                <TableHead
                  className="w-24 px-3 text-right cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("mrp")}
                >
                  MRP
                </TableHead>
                <TableHead className="w-24 px-3 text-right">P. Rate</TableHead>
                <TableHead className="w-16 px-3 text-center">GST </TableHead>

                {/* ── QTY COLUMN (PACKS + EXTRA UNITS) ── */}
                <TableHead className="w-20 px-3 text-center font-bold">Qty</TableHead>

                {/* ── SEPARATE STOCK COLUMN (NUMERIC ONLY) ── */}
                <TableHead
                  className="w-24 px-3 text-center cursor-pointer hover:text-foreground font-bold"
                  onClick={() => handleSort("stock")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Stock</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>

                {/* ── SEPARATE UNIT COLUMN (UNIT LABEL ONLY) ── */}
                <TableHead className="w-20 px-3">Unit</TableHead>
                <TableHead className="w-28 px-3 text-center">Rack + Box No.</TableHead>

                <TableHead className="w-14 px-3 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border text-xs">
              {filtered.map((m) => {
                const info = parsePackInfo(m);
                const isSelected = selectedIds.has(m.id);
                const stockNum = Number(m.stock) || 0;
                const isLow = stockNum <= 15;

                return (
                  <TableRow
                    key={m.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      isSelected && "bg-blue-50/40 dark:bg-blue-950/20"
                    )}
                  >
                    {/* Checkbox */}
                    <TableCell className="text-center px-2 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(m.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                    </TableCell>

                    {/* ID */}
                    <TableCell className="font-mono text-[11px] text-muted-foreground px-3 py-2.5">
                      {m.code || `M${m.id.replace(/[^0-9]/g, "").slice(0, 4) || m.id.slice(0, 5)}`}
                    </TableCell>

                    {/* Medicine Name */}
                    <TableCell className="px-3 py-2.5">
                      <div className="font-bold text-foreground tracking-tight">{m.name}</div>
                      {m.generic && (
                        <div className="text-[11px] text-muted-foreground line-clamp-1">
                          {m.generic}
                        </div>
                      )}
                    </TableCell>

                    {/* Supplier */}
                    <TableCell className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[140px]" title={m.supplier || ""}>
                      {m.supplier || "—"}
                    </TableCell>

                    {/* MFR */}
                    <TableCell className="px-3 py-2.5 text-xs uppercase font-medium text-muted-foreground">
                      {m.company || "—"}
                    </TableCell>

                    {/* Type */}
                    <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                      {m.type || "Tablet"}
                    </TableCell>

                    {/* HSN */}
                    <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {m.hsn || "—"}
                    </TableCell>

                    {/* Pack */}
                    <TableCell className="px-3 py-2.5 font-mono text-xs">
                      {m.pack || "—"}
                    </TableCell>

                    {/* Batch */}
                    <TableCell className="px-3 py-2.5 font-mono text-xs font-semibold">
                      {m.batch || "—"}
                    </TableCell>

                    {/* Expiry */}
                    <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {m.expiry || "—"}
                    </TableCell>

                    {/* MRP (₹) */}
                    <TableCell className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {Number(m.mrp).toFixed(2)}
                    </TableCell>

                    {/* P. Rate (₹) */}
                    <TableCell className="px-3 py-2.5 text-right font-medium tabular-nums text-muted-foreground">
                      {m.new_rate || m.cost ? Number(m.new_rate ?? m.cost).toFixed(2) : "—"}
                    </TableCell>

                    {/* GST % */}
                    <TableCell className="px-3 py-2.5 text-center text-muted-foreground">
                      {m.gst}%
                    </TableCell>

                    {/* ── QTY (PACKS + EXTRA UNITS) ── */}
                    <TableCell className="px-3 py-2.5 text-center font-semibold text-xs tabular-nums text-slate-800">
                      {(() => {
                        const packs = info.packSize > 1 ? Math.floor(stockNum / info.packSize) : stockNum;
                        const extra = info.packSize > 1 ? stockNum % info.packSize : 0;
                        return extra > 0 ? (
                          <span>
                            {packs}<span className="text-[10px] text-emerald-600 font-bold ml-0.5">+{extra}</span>
                          </span>
                        ) : (
                          <span>{packs}</span>
                        );
                      })()}
                    </TableCell>

                    {/* ── STOCK (NUMERIC QUANTITY ONLY) ── */}
                    <TableCell className="px-3 py-2.5 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full font-bold text-xs tabular-nums text-white shadow-2xs",
                          isLow ? "bg-rose-600" : "bg-emerald-600"
                        )}
                      >
                        {stockNum}
                      </span>
                    </TableCell>

                    {/* ── UNIT (UNIT LABEL ONLY) ── */}
                    <TableCell className="px-3 py-2.5 text-xs text-foreground font-medium">
                      {info.unitLabel}
                    </TableCell>

                    {/* Rack + Box No. */}
                    <TableCell className="px-3 py-2.5 text-center">
                      {(m.rack || (m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic")) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                          {(m.rack && m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic") ? `${m.rack}-${m.box_no}` : (m.rack || m.box_no || "-")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAssignSingleMed(m)}
                          className="text-muted-foreground/60 hover:text-primary text-[11px] font-medium hover:underline inline-flex items-center gap-1"
                          title="Click to auto-assign a Box No."
                        >
                          <Plus className="h-3 w-3" /> Assign Box
                        </button>
                      )}
                    </TableCell>

                    {/* Actions Dropdown */}
                    <TableCell className="px-3 py-2.5 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32 text-xs">
                          <DropdownMenuItem onClick={() => openEdit(m)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/30"
                            onClick={() => setMedicineToDelete(m)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={16} className="text-center py-12 text-muted-foreground">
                    No medicines match the selected filters or search query.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Add / Edit Medicine Dialog (Standardized 18 Fields) ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Pill className="h-5 w-5 text-emerald-600" />
              {editing ? "Edit Medicine" : "Add Medicine"}
            </DialogTitle>
            <DialogDescription>
              Configure package configuration, pack MRP, quantity in packs, loose extra units, and base selling units.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Row 1: Identification */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field
                label="Medicine Name *"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. CETABLOCK TRIO"
              />
              <Field
                label="Drug Name / Composition"
                value={form.generic ?? ""}
                onChange={(v) => setForm({ ...form, generic: v })}
                placeholder="e.g. ACECLOFENAC + PARACETAMOL"
              />
              <Field
                label="MFR (Manufacturer)"
                value={form.company ?? ""}
                onChange={(v) => setForm({ ...form, company: v })}
                placeholder="e.g. ATO / ALKEM"
              />
            </div>

            {/* Row 2: Supplier & Purchase Invoice */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Supplier</Label>
                <Input
                  list="suppliers-datalist"
                  value={form.supplier ?? ""}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  placeholder="e.g. AMBIKAA MEDINEEDS"
                  className="h-8 text-xs"
                />
                <datalist id="suppliers-datalist">
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>

              {!editing && (
                <>
                  <Field
                    label="Purchase Invoice No"
                    value={invoiceNo}
                    onChange={setInvoiceNo}
                    placeholder="e.g. INV-2600073008278"
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Supplier Date</Label>
                    <Input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Row 3: Packaging & Classification */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category *</Label>
                <Select
                  value={form.category || "Branded"}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger className="h-8 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Branded">Branded</SelectItem>
                    <SelectItem value="Generic">Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Type</Label>
                <Input
                  value={form.type ?? "Tablet"}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  placeholder="Tablet / Syrup / Capsule"
                  className="h-8 text-xs"
                />
              </div>

              <Field
                label="Pack Configuration *"
                value={form.pack ?? "10's"}
                onChange={(v) => setForm({ ...form, pack: v })}
                placeholder="e.g. 10x10, 10's, 100ml"
              />

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Base Selling Unit</Label>
                <Input
                  value={form.units ?? packInfo.unitLabel}
                  onChange={(e) => setForm({ ...form, units: e.target.value })}
                  placeholder="Tablet / ml / Capsule"
                  className="h-8 text-xs font-medium"
                />
              </div>

              <Field
                label="HSN Code"
                value={form.hsn ?? ""}
                onChange={(v) => setForm({ ...form, hsn: v })}
                placeholder="3004"
              />
            </div>

            {/* Row 4: Batch & Expiry */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Batch Number *"
                value={form.batch}
                onChange={(v) => setForm({ ...form, batch: v })}
                placeholder="e.g. B-90210"
              />
              <Field
                label="Expiry Date (YYYY-MM) *"
                value={form.expiry}
                onChange={(v) => setForm({ ...form, expiry: v })}
                placeholder="2027-06"
              />
            </div>

            {/* Location: Rack + Box No. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Rack / Shelf"
                value={form.rack ?? ""}
                onChange={(v) => setForm({ ...form, rack: v })}
                placeholder="e.g. Rack A, R1"
              />
              <Field
                label="Box No."
                value={form.box_no && form.box_no !== "Branded" && form.box_no !== "Generic" ? form.box_no : ""}
                onChange={(v) => setForm({ ...form, box_no: v })}
                placeholder="e.g. Box 12, B04"
              />
            </div>

            {/* Row 5: Pricing & Taxation */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field
                label="Pack MRP (₹) *"
                type="number"
                value={form.mrp}
                onChange={(v) => setForm({ ...form, mrp: parseFloat(v) || 0 })}
                placeholder="100.00"
              />
              <Field
                label="Pack Purchase Rate (₹) *"
                type="number"
                value={form.new_rate ?? form.cost ?? 0}
                onChange={(v) => {
                  const val = parseFloat(v) || 0;
                  setForm({ ...form, new_rate: val, cost: val });
                }}
                placeholder="70.00"
              />
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">GST (%)</Label>
                <Select
                  value={String(form.gst)}
                  onValueChange={(v) => setForm({ ...form, gst: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18%</SelectItem>
                    <SelectItem value="28">28%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field
                label="Min Alert Stock (Units)"
                type="number"
                value={form.min_stock ?? 10}
                onChange={(v) => setForm({ ...form, min_stock: parseInt(v, 10) || 10 })}
              />
            </div>

            {/* Row 6: Storage Location */}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Rack No"
                value={form.rack ?? ""}
                onChange={(v) => setForm({ ...form, rack: v })}
                placeholder="R-04"
              />
              <Field
                label="Box No"
                value={form.box_no ?? ""}
                onChange={(v) => setForm({ ...form, box_no: v })}
                placeholder="B-12"
              />
            </div>

            {/* ── Real-time Quantity & Stock Calculation Panel ── */}
            <div className="p-3.5 rounded-lg border bg-muted/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-emerald-600" /> Quantity & Authoritative Stock Calculation
                </span>
                <span className="text-[11px] text-muted-foreground">
                  1 Pack = <strong>{packInfo.packSize} {packInfo.unitLabel}s</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Qty (Packs) *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={qtyPacks}
                    onChange={(e) => setQtyPacks(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="h-8 text-xs font-semibold bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground">Complete purchased packs</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Extra Qty (Loose Units)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={extraQty}
                    onChange={(e) => setExtraQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="h-8 text-xs font-semibold bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Loose {packInfo.unitLabel}s ({packInfo.packSize > 1 ? `0 to ${packInfo.packSize - 1}` : "0"})
                  </span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Stock (Base Units)
                  </Label>
                  <div className="h-8 px-3 rounded-md border border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center font-bold text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {calculatedStock.toLocaleString("en-IN")} {packInfo.unitLabel}s
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    = ({qtyPacks} × {packInfo.packSize}) + {extraQty}
                  </span>
                </div>
              </div>

              {/* Real-time Proportional Pricing Breakdown Banner */}
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Proportional Price: </span>
                  <span className="font-bold text-foreground">
                    ₹{unitMrp.toFixed(4)} / {packInfo.unitLabel}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Purchase Cost: </span>
                  <span className="font-semibold text-muted-foreground">
                    ₹{unitPurchaseRate.toFixed(4)} / {packInfo.unitLabel}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Margin per Pack: </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{Math.max(0, Number(form.mrp) - (Number(form.new_rate ?? form.cost) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium min-w-[130px]"
            >
              {saving ? "Saving..." : editing ? "Update Medicine" : "Add Medicine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!medicineToDelete}
        onOpenChange={(o) => {
          if (!o) setMedicineToDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Medicine</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{medicineToDelete?.name}</span> (Batch:{" "}
              {medicineToDelete?.batch})? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMedicineToDelete(null)}>
              No, Keep
            </Button>
            <Button variant="destructive" onClick={confirmDeleteMedicine}>
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MedicineImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultTab={importTab}
        onSuccess={() => actions.syncMedicines()}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type={type}
        value={value as any}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
    </div>
  );
}
