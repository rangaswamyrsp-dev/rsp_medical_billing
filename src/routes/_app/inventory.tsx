import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  PackageSearch, Search, AlertTriangle, Boxes, Download,
  Printer, RotateCcw, Calendar, Filter, IndianRupee, Layers
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useTenant } from "@/lib/tenant";
import { daysToExpiry, expiryTone } from "@/lib/expiry";
import { exportInventoryToExcel } from "@/lib/inventory-excel";
import { printInventoryReport } from "@/lib/inventory-print";
import type { Medicine } from "@/data/medicines";
import {
  parsePackInfo,
  formatStockBreakdown,
  calculateUnitMrp,
  calculateUnitPurchaseRate,
  calculateMedicineValuation,
  formatStockDisplay,
} from "@/lib/medicine-units";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory Valuation & Reports · RSP Medical Billing" },
      { name: "description", content: "Filtered inventory valuation, supplier & MFR breakdown, Excel & PDF reports." },
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

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getItemDateStr(created_at?: string): string {
  if (!created_at) return "";
  try {
    const d = new Date(created_at);
    if (isNaN(d.getTime())) return "";
    return toLocalDateStr(d);
  } catch {
    return "";
  }
}

function InventoryPage() {
  const meds = useStore((s) => s.medicines);
  const suppliers = useStore((s) => s.suppliers);
  const tenant = useTenant();

  // Filters state
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "last7" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mfrFilter, setMfrFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<string>("all");

  useEffect(() => {
    actions.syncMedicines();
    actions.syncSuppliers();
  }, []);

  // Distinct options extracted dynamically from inventory
  const distinctTypes = useMemo(() => {
    const set = new Set<string>();
    meds.forEach((m) => {
      if (m.type && m.type.trim()) set.add(m.type.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meds]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    meds.forEach((m) => {
      const cat = (m.category || m.generic || "").trim();
      if (cat) set.add(cat);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meds]);

  const distinctMFRs = useMemo(() => {
    const set = new Set<string>();
    meds.forEach((m) => {
      if (m.company && m.company.trim()) set.add(m.company.trim().toUpperCase());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meds]);

  const distinctSuppliers = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => {
      if (s.name && s.name.trim()) set.add(s.name.trim());
    });
    meds.forEach((m) => {
      if (m.supplier && m.supplier.trim()) set.add(m.supplier.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [suppliers, meds]);

  // Today & Yesterday strings for matching
  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateStr(d);
  }, []);
  const last7Str = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateStr(d);
  }, []);

  // Filtered List
  const filteredList = useMemo(() => {
    const q = query.toLowerCase().trim();

    return meds.filter((m) => {
      // 1. Text Search Filter
      if (q) {
        const match = [
          m.name,
          m.generic ?? "",
          m.batch,
          m.company ?? "",
          m.supplier ?? "",
          m.code ?? "",
          m.hsn ?? "",
          m.type ?? "",
          m.category ?? "",
          m.rack ?? "",
          m.box_no ?? "",
        ].some((v) => v.toLowerCase().includes(q));
        if (!match) return false;
      }

      // 2. Date Added Filter
      if (dateFilter !== "all") {
        const itemDate = getItemDateStr(m.created_at);
        if (!itemDate) {
          // Legacy item without timestamp: only match if "all"
          return false;
        }
        if (dateFilter === "today" && itemDate !== todayStr) return false;
        if (dateFilter === "yesterday" && itemDate !== yesterdayStr) return false;
        if (dateFilter === "last7" && (itemDate < last7Str || itemDate > todayStr)) return false;
        if (dateFilter === "custom") {
          if (dateFrom && itemDate < dateFrom) return false;
          if (dateTo && itemDate > dateTo) return false;
        }
      }

      // 3. Type Filter
      if (typeFilter !== "all") {
        if ((m.type || "").trim().toLowerCase() !== typeFilter.trim().toLowerCase()) return false;
      }

      // 4. Category Filter (Strictly Branded or Generic)
      if (categoryFilter !== "all") {
        const cat = (m.category || "Branded").trim().toLowerCase();
        if (cat !== categoryFilter.trim().toLowerCase()) return false;
      }

      // 5. Manufacturer (MFR) Filter
      if (mfrFilter !== "all") {
        if ((m.company || "").trim().toUpperCase() !== mfrFilter.trim().toUpperCase()) return false;
      }

      // 6. Supplier Filter
      if (supplierFilter !== "all") {
        if ((m.supplier || "").trim().toLowerCase() !== supplierFilter.trim().toLowerCase()) return false;
      }

      // 7. Stock & Expiry Status Filter
      if (stockFilter !== "all") {
        const stockNum = Number(m.stock) || 0;
        const d = daysToExpiry(m.expiry);

        if (stockFilter === "in_stock" && stockNum <= 0) return false;
        if (stockFilter === "out" && stockNum !== 0) return false;
        if (stockFilter === "expired" && d >= 0) return false;

        // Low stock thresholds
        if (stockFilter === "low_5" && (stockNum <= 0 || stockNum > 5)) return false;
        if (stockFilter === "low_10" && (stockNum <= 0 || stockNum > 10)) return false;
        if (stockFilter === "low_20" && (stockNum <= 0 || stockNum > 20)) return false;
        if (stockFilter === "low_25" && (stockNum <= 0 || stockNum > 25)) return false;
        if (stockFilter === "low_30" && (stockNum <= 0 || stockNum > 30)) return false;
        if (stockFilter === "low" && (stockNum <= 0 || stockNum >= 20)) return false;

        // Expiry windows (d >= 0 ensures already-expired are handled separately)
        if (stockFilter === "exp_20d" && (d < 0 || d > 20)) return false;
        if (stockFilter === "exp_30d" && (d < 0 || d > 30)) return false;
        if (stockFilter === "exp_2m" && (d < 0 || d > 60)) return false;
        if (stockFilter === "exp_3m" && (d < 0 || d > 90)) return false;
        if (stockFilter === "exp_4m" && (d < 0 || d > 120)) return false;
        if (stockFilter === "exp_6m" && (d < 0 || d > 180)) return false;
        if (stockFilter === "exp_1y" && (d < 0 || d > 365)) return false;
        if (stockFilter === "exp_2y" && (d < 0 || d > 730)) return false;
        if (stockFilter === "exp_3y" && (d < 0 || d > 1095)) return false;
        if (stockFilter === "expiring" && (d < 0 || d > 180)) return false;
      }

      return true;
    });
  }, [
    meds, query, dateFilter, dateFrom, dateTo, todayStr, yesterdayStr, last7Str,
    typeFilter, categoryFilter, mfrFilter, supplierFilter, stockFilter
  ]);

  // Statistics on filtered list (guaranteed 100% agreement with row-level valuations)
  const stats = useMemo(() => {
    const totalItems = filteredList.length;
    let totalUnits = 0;
    let mrpValue = 0;
    let purchaseValue = 0;
    let lowStock = 0;
    let expiredCount = 0;

    for (const m of filteredList) {
      const stockNum = Number(m.stock) || 0;
      totalUnits += stockNum;
      if (stockNum < 20) lowStock++;
      if (daysToExpiry(m.expiry) < 0) expiredCount++;

      const val = calculateMedicineValuation(m);
      mrpValue += val.retailValuation;
      purchaseValue += val.purchaseValuation;
    }

    return { totalItems, totalUnits, mrpValue, purchaseValue, lowStock, expiredCount };
  }, [filteredList]);

  // Generate active filter badges list for reports and UI
  const activeFilterBadges = useMemo(() => {
    const list: string[] = [];
    if (dateFilter === "today") list.push("Date: Today Added");
    else if (dateFilter === "yesterday") list.push("Date: Yesterday Added");
    else if (dateFilter === "last7") list.push("Date: Last 7 Days");
    else if (dateFilter === "custom") {
      list.push(`Date: ${dateFrom || "Start"} to ${dateTo || "Now"}`);
    }

    if (typeFilter !== "all") list.push(`Type: ${typeFilter}`);
    if (categoryFilter !== "all") list.push(`Category: ${categoryFilter}`);
    if (mfrFilter !== "all") list.push(`MFR: ${mfrFilter}`);
    if (supplierFilter !== "all") list.push(`Supplier: ${supplierFilter}`);

    if (stockFilter === "in_stock") list.push("Stock: Available (>0)");
    else if (stockFilter === "low") list.push("Stock: Low (<20)");
    else if (stockFilter === "out") list.push("Stock: Out of Stock");
    else if (stockFilter === "expiring") list.push("Expiry: Next 6 Mo");
    else if (stockFilter === "expired") list.push("Expiry: Expired");

    if (query) list.push(`Search: "${query}"`);

    return list;
  }, [dateFilter, dateFrom, dateTo, typeFilter, categoryFilter, mfrFilter, supplierFilter, stockFilter, query]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  const handleResetFilters = () => {
    setQuery("");
    setDateFilter("all");
    setDateFrom("");
    setDateTo("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setMfrFilter("all");
    setSupplierFilter("all");
    setStockFilter("all");
  };

  // Download Excel with active filter tags
  const handleDownloadExcel = () => {
    if (filteredList.length === 0) {
      return toast.error("No inventory matches the selected filters to download.");
    }

    const tagParts: string[] = [];
    if (dateFilter !== "all") tagParts.push(dateFilter);
    if (mfrFilter !== "all") tagParts.push(`MFR_${mfrFilter}`);
    if (supplierFilter !== "all") tagParts.push(`Sup_${supplierFilter}`);
    if (typeFilter !== "all") tagParts.push(typeFilter);
    if (categoryFilter !== "all") tagParts.push(categoryFilter);
    if (stockFilter !== "all") tagParts.push(stockFilter);

    const tag = tagParts.join("_") || "Filtered";
    exportInventoryToExcel(filteredList, tenant.name || "Store", tag);
    toast.success(`Downloaded Excel report (${filteredList.length} products)`);
  };

  const printer = useStore((s) => s.printer);

  // Print / Save as PDF
  const handlePrintPDF = () => {
    if (filteredList.length === 0) {
      return toast.error("No inventory matches the selected filters to print.");
    }

    printInventoryReport(filteredList, {
      storeName: printer.storeName || tenant.name || "RSP Medical Billing",
      storeAddress: printer.storeAddress,
      storePhone: printer.storePhone,
      gstin: printer.gstin,
      drugLicense: printer.drugLicense,
      filtersSummary: activeFilterBadges,
      reportTitle: "Inventory Valuation & Stock Report",
    });
    toast.success("Print & PDF preview opened");
  };

  const dateFromInputRef = useRef<HTMLInputElement>(null);

  // Auto show date picker when selecting custom date range
  const handleDateFilterChange = (val: "all" | "today" | "yesterday" | "last7" | "custom") => {
    setDateFilter(val);
    if (val === "custom") {
      if (!dateFrom) setDateFrom(toLocalDateStr(new Date()));
      if (!dateTo) setDateTo(toLocalDateStr(new Date()));
      setTimeout(() => {
        try {
          dateFromInputRef.current?.focus();
          dateFromInputRef.current?.showPicker?.();
        } catch {
          // Ignore if browser doesn't support showPicker
        }
      }, 100);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Action Bar Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <PackageSearch className="h-6 w-6 text-primary" /> Inventory
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleDownloadExcel}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <Download className="h-4 w-4" /> Download Excel
          </Button>

          <Button
            variant="outline"
            onClick={handlePrintPDF}
            className="gap-2 border-primary/40 hover:bg-primary/5 font-medium"
          >
            <Printer className="h-4 w-4 text-primary" /> Print / Download PDF
          </Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          icon={Boxes}
          label="Filtered Products"
          value={stats.totalItems.toLocaleString("en-IN")}
          tone="info"
        />
        <Stat
          icon={Layers}
          label="Total Units in Stock"
          value={stats.totalUnits.toLocaleString("en-IN")}
          tone="primary"
        />
        <Stat
          icon={IndianRupee}
          label="Purchase Value (Cost)"
          value={`₹${Math.round(stats.purchaseValue).toLocaleString("en-IN")}`}
          tone="primary"
        />
        <Stat
          icon={IndianRupee}
          label="Retail Value (MRP)"
          value={`₹${Math.round(stats.mrpValue).toLocaleString("en-IN")}`}
          tone="info"
        />
        <Stat
          icon={AlertTriangle}
          label="Low Stock (<20)"
          value={stats.lowStock.toString()}
          tone="warning"
        />
      </div>

      {/* Main Filters & Data Card */}
      <Card className="p-4 space-y-4">
        {/* Filter Controls Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-b pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Filter className="h-3.5 w-3.5 text-primary" /> Filter Inventory Records
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="h-7 px-2.5 text-xs gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
              </Button>
            )}
          </div>

          {/* ── Row 1 Filters: Search, Added Date, Type, Category, MFR ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* 1. Search Keywords */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Search className="h-3.5 w-3.5 text-primary" /> Search Keywords
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 text-xs"
                  placeholder="Search name, batch, HSN..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {/* 2. Added Date Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Added Date
              </label>
              <Select value={dateFilter} onValueChange={handleDateFilterChange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Date added" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today Added Items</SelectItem>
                  <SelectItem value="yesterday">Yesterday Added Items</SelectItem>
                  <SelectItem value="last7">Last 7 Days</SelectItem>
                  <SelectItem value="custom">Custom Date Range...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 3. Medicine Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Medicine Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">All Types</SelectItem>
                  {distinctTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 4. Category (STRICTLY BRANDED & GENERIC) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Branded">Branded</SelectItem>
                  <SelectItem value="Generic">Generic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 5. Manufacturer (MFR) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Manufacturer (MFR)</label>
              <Select value={mfrFilter} onValueChange={setMfrFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Manufacturers" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">All Manufacturers</SelectItem>
                  {distinctMFRs.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Row 2 Filters: Supplier, Stock & Expiry Status ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* 1. Supplier */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Supplier</label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {distinctSuppliers.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Stock & Expiry Status (Comprehensive Options) */}
            <div className="space-y-1.5 lg:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Stock &amp; Expiry Status</label>
              <Select value={stockFilter} onValueChange={(val: any) => setStockFilter(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="in_stock">In Stock (&gt; 0)</SelectItem>
                  <SelectItem value="out">Out of Stock (0)</SelectItem>
                  <SelectItem value="expired">Already Expired</SelectItem>

                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/40">
                    Low Stock Thresholds
                  </div>
                  <SelectItem value="low_5">Low Stock ≤ 5</SelectItem>
                  <SelectItem value="low_10">Low Stock ≤ 10</SelectItem>
                  <SelectItem value="low_20">Low Stock ≤ 20</SelectItem>
                  <SelectItem value="low_25">Low Stock ≤ 25</SelectItem>
                  <SelectItem value="low_30">Low Stock ≤ 30</SelectItem>

                  <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/40">
                    Expiry Windows
                  </div>
                  <SelectItem value="exp_20d">Expiring within 20 days</SelectItem>
                  <SelectItem value="exp_30d">Expiring within 30 days</SelectItem>
                  <SelectItem value="exp_2m">Expiring within 2 months</SelectItem>
                  <SelectItem value="exp_3m">Expiring within 3 months</SelectItem>
                  <SelectItem value="exp_4m">Expiring within 4 months</SelectItem>
                  <SelectItem value="exp_6m">Expiring within 6 months</SelectItem>
                  <SelectItem value="exp_1y">Expiring within 1 year</SelectItem>
                  <SelectItem value="exp_2y">Expiring within 2 years</SelectItem>
                  <SelectItem value="exp_3y">Expiring within 3 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Date Range Row (if selected) */}
          {dateFilter === "custom" && (
            <div className="p-3 bg-muted/40 rounded-lg border flex items-center gap-3 flex-wrap text-xs">
              <span className="font-semibold text-primary">Custom Date Range:</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">From:</span>
                <Input
                  ref={dateFromInputRef}
                  type="date"
                  className="h-8 text-xs w-36 font-mono"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">To:</span>
                <Input
                  type="date"
                  className="h-8 text-xs w-36 font-mono"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="h-7 text-xs px-2"
                >
                  Clear dates
                </Button>
              )}
            </div>
          )}

          {/* Active Filter Badges Bar */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
              <span className="text-muted-foreground text-[11px] font-medium mr-1">Active Filters:</span>
              {activeFilterBadges.map((b, i) => (
                <Badge key={i} variant="secondary" className="px-2 py-0.5 text-[11px] gap-1 bg-primary/10 text-primary border-primary/20">
                  {b}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Results Count & Quick Valuation Subtotal */}
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground pt-1 border-t flex-wrap">
          <div>
            Showing <b className="text-foreground">{filteredList.length}</b> medicine line(s) ·{" "}
            <b className="text-foreground">{stats.totalUnits.toLocaleString("en-IN")}</b> units in stock
          </div>
          <div className="flex items-center gap-4">
            <span>
              Cost: <b className="text-foreground tabular-nums">₹{Math.round(stats.purchaseValue).toLocaleString("en-IN")}</b>
            </span>
            <span>
              MRP Value: <b className="text-foreground tabular-nums font-semibold text-primary">₹{Math.round(stats.mrpValue).toLocaleString("en-IN")}</b>
            </span>
          </div>
        </div>

        {/* Stock Detail Table */}
        <StockTable list={filteredList} />
      </Card>
    </div>
  );
}

function StockTable({ list }: { list: Medicine[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-[1250px]">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16">Code</TableHead>
            <TableHead className="min-w-[200px]">Medicine Name</TableHead>
            <TableHead className="text-center w-28 whitespace-nowrap">Rack + Box No.</TableHead>
            
            <TableHead>MFR</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>HSN</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Pack</TableHead>
            <TableHead className="text-right">P. Rate</TableHead>
            <TableHead className="text-right">MRP</TableHead>
            <TableHead className="text-center font-bold">Qty</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Valuation</TableHead>
            <TableHead className="text-center">Added Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((m) => {
            const d = daysToExpiry(m.expiry);
            const tone = expiryTone(m.expiry);
            const val = calculateMedicineValuation(m);
            const pInfo = parsePackInfo(m);
            const addedDate = m.created_at ? new Date(m.created_at).toLocaleDateString("en-IN") : "—";

            return (
              <TableRow key={m.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs text-muted-foreground">{m.code ?? m.id}</TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{m.name}</div>
                  {m.generic && <div className="text-xs text-muted-foreground line-clamp-1">{m.generic}</div>}
                </TableCell>
                <TableCell className="text-center whitespace-nowrap">
                  {(m.rack || (m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic")) ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded border bg-muted/30">
                      {(m.rack && m.box_no && m.box_no !== "Branded" && m.box_no !== "Generic") ? `${m.rack}-${m.box_no}` : (m.rack || m.box_no || "-")}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">Unassigned</span>
                  )}
                </TableCell>
                {/* <TableCell className="text-xs max-w-[140px] truncate" title={m.supplier || ""}>
                  {m.supplier || <span className="text-muted-foreground">—</span>}
                </TableCell> */}
                <TableCell className="text-xs font-semibold uppercase">{m.company || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.type || "—"}</TableCell>
                <TableCell className="text-xs font-medium text-foreground">
                  {m.category || "Branded"}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {m.hsn?.trim() || "—"}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold">{m.batch}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  <span
                    className={cn(
                      "font-mono text-xs px-1.5 py-0.5 rounded",
                      d < 0
                        ? "text-rose-700 bg-rose-50 dark:bg-rose-950/40 font-semibold"
                        : d <= 90
                          ? "text-amber-700 bg-amber-50 dark:bg-amber-950/40 font-medium"
                          : "text-muted-foreground"
                    )}
                  >
                    {m.expiry || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.pack || "—"}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {val.packPurchaseRate > 0 ? `₹${val.packPurchaseRate.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium text-xs">
                  ₹{val.packMrp.toFixed(2)}
                </TableCell>

                {/* Qty Column (Packs + Extra units) */}
                <TableCell className="text-center font-semibold text-xs tabular-nums text-slate-800">
                  {(() => {
                    const packs = val.packSize > 1 ? Math.floor(val.stockUnits / val.packSize) : val.stockUnits;
                    const extra = val.packSize > 1 ? val.stockUnits % val.packSize : 0;
                    return extra > 0 ? (
                      <span>
                        {packs}<span className="text-[10px] text-emerald-600 font-bold ml-0.5">+{extra}</span>
                      </span>
                    ) : (
                      <span>{packs}</span>
                    );
                  })()}
                </TableCell>

                {/* Separate Stock Column (Numeric Only) */}
                <TableCell className="text-right">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full font-bold text-xs tabular-nums text-white shadow-2xs",
                      val.stockUnits <= 0 ? "bg-rose-600" : val.stockUnits < 20 ? "bg-amber-600" : "bg-emerald-600"
                    )}
                  >
                    {val.stockUnits}
                  </span>
                </TableCell>

                {/* Separate Unit Column (Unit Label Only) */}
                <TableCell className="text-xs text-foreground font-medium">
                  {pInfo.unitLabel}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-xs">
                  <div>₹{val.retailValuation.toLocaleString("en-IN")}</div>
                  {val.purchaseValuation > 0 && (
                    <div className="text-[10px] text-muted-foreground font-normal">
                      Cost: ₹{val.purchaseValuation.toLocaleString("en-IN")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground font-mono">
                  {addedDate}
                </TableCell>
              </TableRow>
            );
          })}
          {list.length === 0 && (
            <TableRow>
              <TableCell colSpan={15} className="text-center py-10 text-muted-foreground">
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <PackageSearch className="h-8 w-8 text-muted-foreground/50" />
                  <p className="font-medium text-sm">No inventory records match your selected filters</p>
                  <p className="text-xs">Try resetting or broadening your date, supplier, MFR, or keyword filters.</p>
                </div>
              </TableCell>
            </TableRow>
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
      <div className={"h-9 w-9 grid place-items-center rounded-lg " + (tones[tone] || tones.primary)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
