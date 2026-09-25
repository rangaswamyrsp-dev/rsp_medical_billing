import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { parsePackInfo, formatStockBreakdown } from "@/lib/medicine-units";
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
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low" | "out" | "expiring" | "expired">("all");

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

      // 4. Category Filter
      if (categoryFilter !== "all") {
        const cat = (m.category || m.generic || "").trim().toLowerCase();
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

      // 7. Stock / Expiry Filter
      if (stockFilter !== "all") {
        const d = daysToExpiry(m.expiry);
        if (stockFilter === "in_stock" && m.stock <= 0) return false;
        if (stockFilter === "low" && m.stock >= 20) return false;
        if (stockFilter === "out" && m.stock !== 0) return false;
        if (stockFilter === "expiring" && (d < 0 || d > 180)) return false;
        if (stockFilter === "expired" && d >= 0) return false;
      }

      return true;
    });
  }, [
    meds, query, dateFilter, dateFrom, dateTo, todayStr, yesterdayStr, last7Str,
    typeFilter, categoryFilter, mfrFilter, supplierFilter, stockFilter
  ]);

  // Statistics on filtered list
  const stats = useMemo(() => {
    const totalItems = filteredList.length;
    const totalUnits = filteredList.reduce((n, m) => n + (Number(m.stock) || 0), 0);
    const mrpValue = filteredList.reduce((n, m) => n + (Number(m.stock) || 0) * (Number(m.mrp) || 0), 0);
    const purchaseValue = filteredList.reduce((n, m) => {
      const rate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
      return n + (Number(m.stock) || 0) * rate;
    }, 0);
    const lowStock = filteredList.filter((m) => m.stock < 20).length;
    const expiredCount = filteredList.filter((m) => daysToExpiry(m.expiry) < 0).length;
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
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}

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
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Filter className="h-3.5 w-3.5" /> Filter Inventory Records
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Date Added Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Added Date
              </label>
              <Select value={dateFilter} onValueChange={(val: any) => setDateFilter(val)}>
                <SelectTrigger className="h-9">
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

            {/* 2. Type Wise Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Medicine Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9">
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

            {/* 3. Category Wise Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Category / Composition</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">All Categories</SelectItem>
                  {distinctCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 4. Manufacturer (MFR) Wise Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Manufacturer (MFR)</label>
              <Select value={mfrFilter} onValueChange={setMfrFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All MFRs" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">All Manufacturers</SelectItem>
                  {distinctMFRs.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 5. Supplier Wise Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Supplier</label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-9">
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

            {/* 6. Stock & Expiry Status Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Stock & Expiry Status</label>
              <Select value={stockFilter} onValueChange={(val: any) => setStockFilter(val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock Statuses</SelectItem>
                  <SelectItem value="in_stock">Available in Stock (&gt; 0)</SelectItem>
                  <SelectItem value="low">Low Stock (&lt; 20 units)</SelectItem>
                  <SelectItem value="out">Out of Stock (0 units)</SelectItem>
                  <SelectItem value="expiring">Expiring within 6 Months</SelectItem>
                  <SelectItem value="expired">Expired Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 7. Search Text Filter */}
            <div className="space-y-1.5 lg:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Search Keywords</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9"
                  placeholder="Search name, generic, batch, HSN, code, supplier..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Custom Date Range Row (if selected) */}
          {dateFilter === "custom" && (
            <div className="p-3 bg-muted/40 rounded-lg border flex items-center gap-3 flex-wrap text-xs">
              <span className="font-semibold text-primary">Custom Date Range:</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">From:</span>
                <Input
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
            <TableHead>Supplier</TableHead>
            <TableHead>MFR</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>HSN Code</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Pack</TableHead>
            <TableHead className="text-right">Pur. Rate</TableHead>
            <TableHead className="text-right">MRP</TableHead>
            <TableHead className="text-center">Stock</TableHead>
            <TableHead className="text-right">Valuation (₹)</TableHead>
            <TableHead className="text-center">Added Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((m) => {
            const d = daysToExpiry(m.expiry);
            const tone = expiryTone(m.expiry);
            const purchaseRate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
            const stockQty = Number(m.stock) || 0;
            const mrp = Number(m.mrp) || 0;
            const pInfo = parsePackInfo(m);
            const unitMrp = pInfo.packSize > 1 ? mrp / pInfo.packSize : mrp;
            const stockValue = Math.round(stockQty * unitMrp);
            const addedDate = m.created_at ? new Date(m.created_at).toLocaleDateString("en-IN") : "—";

            return (
              <TableRow key={m.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs text-muted-foreground">{m.code ?? m.id}</TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{m.name}</div>
                  {m.generic && <div className="text-xs text-muted-foreground line-clamp-1">{m.generic}</div>}
                </TableCell>
                <TableCell className="text-xs max-w-[140px] truncate" title={m.supplier || ""}>
                  {m.supplier || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs font-semibold uppercase">{m.company || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.type || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[130px] truncate" title={m.category || ""}>
                  {m.category || "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {m.hsn ? (
                    <span>{m.hsn}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded text-[10px]">
                      Missing
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold">{m.batch}</TableCell>
                <TableCell className="text-xs">
                  <span className={"rounded px-1.5 py-0.5 font-medium " + TONE_CLASS[tone]}>
                    {m.expiry || "—"}
                    {m.expiry && isFinite(d) && (
                      <span className="ml-1 text-[10px]">{d < 0 ? "expired" : `${d}d`}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.pack || "—"}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {purchaseRate > 0 ? `₹${purchaseRate.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium text-xs">₹{mrp.toFixed(2)}</TableCell>
                <TableCell className="text-center">
                  <div className="flex flex-col items-center">
                    <Badge variant={stockQty <= 0 ? "destructive" : stockQty < 20 ? "outline" : "secondary"} className="tabular-nums">
                      {stockQty} {pInfo.unitLabel}{stockQty !== 1 ? "s" : ""}
                    </Badge>
                    {pInfo.packSize > 1 && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                        {formatStockBreakdown(stockQty, pInfo.packSize, pInfo.packLabel, pInfo.unitLabel)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-xs">
                  ₹{stockValue.toLocaleString("en-IN")}
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
