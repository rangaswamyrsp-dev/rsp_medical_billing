import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardCheck, Search, Download, Printer, Boxes, AlertTriangle,
} from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useTenant } from "@/lib/tenant";
import { daysToExpiry } from "@/lib/expiry";
import {
  parsePackInfo,
  calculateUnitMrp,
  calculateMedicineValuation,
  formatStockDisplay,
} from "@/lib/medicine-units";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/audit-inventory")({
  head: () => ({
    meta: [
      { title: "Audit Inventory · RSP Medical Billing" },
      { name: "description", content: "Physical stock audit worksheet, system quantities, retail valuation, Excel & PDF download." },
    ],
  }),
  component: AuditInventoryPage,
});

function AuditInventoryPage() {
  const meds = useStore((s) => s.medicines);
  const tenant = useTenant();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low" | "out">("all");
  const [expiryFilter, setExpiryFilter] = useState<"all" | "expired" | "expiring_30" | "expiring_90">("all");
  const [rackFilter, setRackFilter] = useState("all");

  useEffect(() => {
    actions.syncMedicines();
  }, []);

  // Distinct Filter Options
  const distinctManufacturers = useMemo(() => {
    const set = new Set<string>();
    meds.forEach((m) => {
      const comp = (m.company || "").trim();
      if (comp) set.add(comp);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meds]);

  const distinctTypes = useMemo(() => {
    const set = new Set<string>();
    meds.forEach((m) => {
      const typ = (m.type || "").trim();
      if (typ) set.add(typ);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meds]);

  const distinctRacks = useMemo(() => {
    const set = new Set<string>();
    meds.forEach((m) => {
      const r = (m.rack || "").trim();
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meds]);

  // Filtered Medicines
  const filteredMeds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return meds.filter((m) => {
      // 1. Medicine Name / Batch / Manufacturer Search
      if (q) {
        const nameMatch = m.name.toLowerCase().includes(q);
        const batchMatch = m.batch ? m.batch.toLowerCase().includes(q) : false;
        const compMatch = m.company ? m.company.toLowerCase().includes(q) : false;
        if (!nameMatch && !batchMatch && !compMatch) return false;
      }

      // 2. Manufacturer Filter
      if (manufacturerFilter !== "all") {
        if ((m.company || "").trim().toLowerCase() !== manufacturerFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Type Filter (Works even though Type is not visible in main table)
      if (typeFilter !== "all") {
        if ((m.type || "").trim().toLowerCase() !== typeFilter.toLowerCase()) {
          return false;
        }
      }

      // 4. Rack Filter
      if (rackFilter !== "all") {
        if ((m.rack || "").trim().toLowerCase() !== rackFilter.toLowerCase()) {
          return false;
        }
      }

      // 5. Stock Filter
      const qty = Number(m.stock) || 0;
      if (stockFilter === "in_stock" && qty <= 0) return false;
      if (stockFilter === "low" && (qty <= 0 || qty > 10)) return false;
      if (stockFilter === "out" && qty > 0) return false;

      // 6. Expiry Filter
      if (expiryFilter !== "all" && m.expiry) {
        const days = daysToExpiry(m.expiry);
        if (expiryFilter === "expired" && (days === null || days > 0)) return false;
        if (expiryFilter === "expiring_30" && (days === null || days < 0 || days > 30)) return false;
        if (expiryFilter === "expiring_90" && (days === null || days < 0 || days > 90)) return false;
      }

      return true;
    });
  }, [meds, searchQuery, manufacturerFilter, typeFilter, rackFilter, stockFilter, expiryFilter]);

  // Metrics (uses exact same central valuation calculation as inventory)
  const auditMetrics = useMemo(() => {
    let totalSystemUnits = 0;
    let totalMrpValue = 0;
    let lowStockCount = 0;

    for (const m of filteredMeds) {
      const stockNum = Number(m.stock) || 0;
      totalSystemUnits += stockNum;
      if (stockNum <= 10) lowStockCount++;

      const val = calculateMedicineValuation(m);
      totalMrpValue += val.retailValuation;
    }

    return { totalSystemUnits, totalMrpValue, lowStockCount, totalItems: filteredMeds.length };
  }, [filteredMeds]);

  // ── Download Excel (Includes Physical Qty column for manual verification) ────
  const handleDownloadExcel = () => {
    if (filteredMeds.length === 0) {
      toast.error("No medicine records to export with current filters.");
      return;
    }

    try {
      const rows = filteredMeds.map((m) => {
        const val = calculateMedicineValuation(m);
        const pInfo = parsePackInfo(m);
        const extraQty = val.packSize > 1 ? val.stockUnits % val.packSize : 0;

        return {
          "Medicine Name": m.name,
          "Pack": m.pack || "—",
          "Batch": m.batch || "—",
          "Expiry": m.expiry || "—",
          "MRP (Pack) (₹)": val.packMrp,
          "P. Rate (Pack) (₹)": val.packPurchaseRate,
          "System Stock": val.stockUnits, // Numeric only
          "Physical Verified Qty": "", // Empty column for manual physical verification
          "Difference": "", // Discrepancy column
          "Extra Qty": extraQty, // Numeric loose units outside packs
          "Unit": pInfo.unitLabel, // Separate Unit column
          "Valuation (MRP) (₹)": val.retailValuation,
          "Purchase Valuation (₹)": val.purchaseValuation,
          "Manufacturer": m.company || "—",
          "Type": m.type || "—",
          "Rack": m.rack || "—",
          "Remarks": "",
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      // Set column widths
      ws["!cols"] = [
        { wch: 30 }, // Medicine Name
        { wch: 14 }, // Pack
        { wch: 14 }, // Batch
        { wch: 12 }, // Expiry
        { wch: 14 }, // MRP (Pack)
        { wch: 14 }, // System Stock
        { wch: 20 }, // Physical Verified Qty
        { wch: 14 }, // Difference
        { wch: 12 }, // Extra Qty
        { wch: 12 }, // Unit
        { wch: 14 }, // Valuation
        { wch: 22 }, // Manufacturer
        { wch: 14 }, // Type
        { wch: 10 }, // Rack
        { wch: 25 }, // Remarks
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Audit Inventory");

      const todayStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `RSP_Audit_Inventory_${todayStr}.xlsx`);
      toast.success("Excel audit worksheet downloaded successfully ✓");
    } catch (err: any) {
      toast.error(`Excel download failed: ${err?.message || String(err)}`);
    }
  };

  // ── Download / Print PDF (Includes Physical Qty column for manual verification) ─
  const handleDownloadPDF = () => {
    if (filteredMeds.length === 0) {
      toast.error("No medicine records to print with current filters.");
      return;
    }

    try {
      const activeFiltersSummary: string[] = [];
      if (searchQuery) activeFiltersSummary.push(`Search: "${searchQuery}"`);
      if (manufacturerFilter !== "all") activeFiltersSummary.push(`MFR: ${manufacturerFilter}`);
      if (typeFilter !== "all") activeFiltersSummary.push(`Type: ${typeFilter}`);
      if (rackFilter !== "all") activeFiltersSummary.push(`Rack: ${rackFilter}`);
      if (stockFilter !== "all") activeFiltersSummary.push(`Stock: ${stockFilter}`);
      if (expiryFilter !== "all") activeFiltersSummary.push(`Expiry: ${expiryFilter}`);

      const rowsHtml = filteredMeds
        .map((m, idx) => {
          const sysQty = Number(m.stock) || 0;
          const mrp = Number(m.mrp) || 0;
          const pInfo = parsePackInfo(m);
          const unitMrp = calculateUnitMrp(mrp, pInfo.packSize);
          const amount = Math.round(sysQty * unitMrp);
          const extraQty = pInfo.packSize > 1 ? sysQty % pInfo.packSize : 0;

          return `
            <tr>
              <td style="text-align: center; color: #666;">${idx + 1}</td>
              <td style="font-weight: 600;">${m.name}</td>
              <td style="font-family: monospace;">${m.pack || "—"}</td>
              <td style="font-family: monospace;">${m.batch || "—"}</td>
              <td style="font-family: monospace;">${m.expiry || "—"}</td>
              <td style="text-align: right;">₹${mrp.toFixed(2)}</td>
              <td style="text-align: right; font-weight: bold; font-family: monospace;">${sysQty}</td>
              <td style="text-align: right; font-family: monospace;">${extraQty > 0 ? extraQty : "—"}</td>
              <td>${pInfo.unitLabel}</td>
              <td style="text-align: center; width: 65px; border: 1px solid #94a3b8; height: 18px;"></td>
              <td style="text-align: center; width: 55px; border: 1px solid #cbd5e1;"></td>
              <td style="width: 80px; border-bottom: 1px dashed #cbd5e1;"></td>
            </tr>
          `;
        })
        .join("");

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>RSP Medical Billing - Audit Inventory</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.3; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 18px; font-weight: bold; color: #0f172a; }
            .meta { font-size: 10px; color: #64748b; }
            .badge { display: inline-block; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 9px; margin-right: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 5px 6px; font-size: 10px; text-align: left; }
            td { border: 1px solid #e2e8f0; padding: 4px 6px; }
            .footer { margin-top: 25px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">RSP Medical Billing — Audit Inventory</div>
              <div class="meta">Physical Stock Verification Worksheet · ${tenant.name || "Medical Store"}</div>
            </div>
            <div style="text-align: right;" class="meta">
              <div>Date: ${new Date().toLocaleDateString("en-IN")}</div>
              <div>Total Items: ${filteredMeds.length}</div>
            </div>
          </div>

          <div>
            ${activeFiltersSummary.length > 0
          ? activeFiltersSummary.map((f) => `<span class="badge">${f}</span>`).join(" ")
          : '<span class="badge">All Inventory</span>'
        }
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th>Medicine Name</th>
                <th style="width: 55px;">Pack</th>
                <th style="width: 65px;">Batch</th>
                <th style="width: 55px;">Expiry</th>
                <th style="width: 55px; text-align: right;">MRP (₹)</th>
                <th style="width: 60px; text-align: right;">System Stock</th>
                <th style="width: 50px; text-align: right;">Extra Qty</th>
                <th style="width: 45px;">Unit</th>
                <th style="width: 65px; text-align: center; background-color: #f1f5f9;">Physical Verified Qty</th>
                <th style="width: 55px; text-align: center;">Diff</th>
                <th style="width: 80px;">Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            <div>Verified By (Signature): _______________________</div>
            <div>Store Manager / Pharmacist: _______________________</div>
            <div>Date: _________________</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
        </html>
      `;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        toast.error("Pop-up blocked. Please allow pop-ups to print or download PDF.");
      }
    } catch (err: any) {
      toast.error(`PDF generation failed: ${err?.message || String(err)}`);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" /> Audit Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            System stock quantities, retail valuation, and exportable physical audit verification sheets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            className="text-xs gap-1.5"
            title="Download Excel worksheet with blank physical verification columns"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" /> Excel Sheet
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadPDF}
            className="text-xs gap-1.5 bg-primary text-primary-foreground"
            title="Print or save PDF audit document"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* ── Summary KPI Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="p-3.5 bg-card/60 backdrop-blur border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            System Stock Units
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-foreground">
            {auditMetrics.totalSystemUnits.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Across {filteredMeds.length} medicines</div>
        </Card>

        <Card className="p-3.5 bg-card/60 backdrop-blur border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Total MRP Valuation
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-primary">
            ₹{auditMetrics.totalMrpValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">System retail stock worth</div>
        </Card>

        <Card className="p-3.5 bg-card/60 backdrop-blur border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Total Medicines
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-foreground flex items-center gap-2">
            <Boxes className="h-5 w-5 text-muted-foreground" />
            {auditMetrics.totalItems.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Filtered catalogue entries</div>
        </Card>

        <Card className="p-3.5 bg-card/60 backdrop-blur border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Low / Out of Stock
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-amber-600 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {auditMetrics.lowStockCount}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Items with stock ≤ 10</div>
        </Card>
      </div>

      {/* ── Search & Filters Toolbar ────────────────────────────────────────── */}
      <Card className="p-3.5 bg-card/60 border space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {/* 1. Medicine Name / Batch Search */}
          <div className="relative lg:col-span-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search Medicine Name, Batch, Manufacturer…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* 2. Manufacturer Filter */}
          <div>
            <Select value={manufacturerFilter} onValueChange={setManufacturerFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All MFRs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Manufacturers</SelectItem>
                {distinctManufacturers.map((mfr) => (
                  <SelectItem key={mfr} value={mfr}>
                    {mfr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Type Filter (CRITICAL Section 27: filters by Type even though Type column is hidden) */}
          <div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {distinctTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 4. Stock Level Filter */}
          <div>
            <Select value={stockFilter} onValueChange={(val: any) => setStockFilter(val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Stock Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in_stock">In Stock (&gt; 0)</SelectItem>
                <SelectItem value="low">Low Stock (1 - 10)</SelectItem>
                <SelectItem value="out">Out of Stock (0)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5. Expiry Filter */}
          <div>
            <Select value={expiryFilter} onValueChange={(val: any) => setExpiryFilter(val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Expiry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Expiry</SelectItem>
                <SelectItem value="expiring_30">Expiring in 30 Days</SelectItem>
                <SelectItem value="expiring_90">Expiring in 90 Days</SelectItem>
                <SelectItem value="expired">Already Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filter Indicators */}
        {(typeFilter !== "all" || manufacturerFilter !== "all" || rackFilter !== "all" || stockFilter !== "all" || expiryFilter !== "all") && (
          <div className="flex items-center gap-2 pt-1 border-t text-xs text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground">Active Filters:</span>
            {typeFilter !== "all" && (
              <Badge variant="secondary" className="text-[11px]">
                Type: {typeFilter}
              </Badge>
            )}
            {manufacturerFilter !== "all" && (
              <Badge variant="secondary" className="text-[11px]">
                MFR: {manufacturerFilter}
              </Badge>
            )}
            {stockFilter !== "all" && (
              <Badge variant="secondary" className="text-[11px]">
                Stock: {stockFilter}
              </Badge>
            )}
            {expiryFilter !== "all" && (
              <Badge variant="secondary" className="text-[11px]">
                Expiry: {expiryFilter}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setManufacturerFilter("all");
                setTypeFilter("all");
                setStockFilter("all");
                setExpiryFilter("all");
                setRackFilter("all");
              }}
              className="h-6 text-[11px] px-2 text-destructive hover:bg-destructive/10"
            >
              Clear All Filters
            </Button>
          </div>
        )}
      </Card>

      {/* ── Main Audit Table (Clean & Focused on System Stock) ─────────────── */}
      <Card className="overflow-hidden border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="text-xs">
                <TableHead className="w-12 text-center">#</TableHead>
                {/* 1. Medicine Name */}
                <TableHead>Medicine Name</TableHead>
                {/* 2. Pack */}
                <TableHead>Pack</TableHead>
                {/* 3. Batch */}
                <TableHead className="w-28">Batch</TableHead>
                {/* 4. Expiry */}
                <TableHead className="w-24">Expiry</TableHead>
                {/* 5. MRP per pack */}
                <TableHead className="text-right">MRP (Pack)</TableHead>
                {/* Qty (Packs + Extra) */}
                <TableHead className="text-center font-bold">Qty</TableHead>
                {/* 6. System Stock (Numeric Only) */}
                <TableHead className="text-center font-semibold">System Stock</TableHead>
                {/* 7. Extra Qty (Loose Units) */}
                <TableHead className="text-center">Extra Qty</TableHead>
                {/* 8. Unit */}
                <TableHead>Unit</TableHead>
                {/* 9. Valuation Amount */}
                <TableHead className="text-right">Valuation (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMeds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    No medicine records match your search or filter options.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMeds.map((m, idx) => {
                  const val = calculateMedicineValuation(m);
                  const pInfo = parsePackInfo(m);
                  const extraQty = val.packSize > 1 ? val.stockUnits % val.packSize : 0;
                  const packs = val.packSize > 1 ? Math.floor(val.stockUnits / val.packSize) : val.stockUnits;

                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30 transition-colors text-xs">
                      <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                      {/* 1. Medicine Name */}
                      <TableCell>
                        <div className="font-semibold text-foreground text-sm">{m.name}</div>
                        {m.company && (
                          <div className="text-[11px] text-muted-foreground">{m.company}</div>
                        )}
                      </TableCell>
                      {/* 2. Pack */}
                      <TableCell className="font-mono text-xs">{m.pack || "—"}</TableCell>
                      {/* 3. Batch */}
                      <TableCell className="font-mono text-muted-foreground">
                        {m.batch || "—"}
                      </TableCell>
                      {/* 4. Expiry */}
                      <TableCell className="font-mono text-muted-foreground">
                        {m.expiry || "—"}
                      </TableCell>
                      {/* 5. MRP */}
                      <TableCell className="text-right font-medium tabular-nums">
                        ₹{val.packMrp.toFixed(2)}
                      </TableCell>
                      {/* Qty (Packs + Extra units) */}
                      <TableCell className="text-center font-semibold text-xs tabular-nums text-slate-800">
                        {extraQty > 0 ? (
                          <span>
                            {packs}<span className="text-[10px] text-emerald-600 font-bold ml-0.5">+{extraQty}</span>
                          </span>
                        ) : (
                          <span>{packs}</span>
                        )}
                      </TableCell>
                      {/* 6. System Stock (NUMERIC ONLY) */}
                      <TableCell className="text-center">
                        <Badge
                          variant={val.stockUnits > 0 ? "outline" : "destructive"}
                          className="font-mono text-xs px-2.5 py-0.5 font-bold"
                        >
                          {val.stockUnits}
                        </Badge>
                      </TableCell>
                      {/* 7. Extra Qty (Loose Units outside packs) */}
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {extraQty > 0 ? extraQty : "—"}
                      </TableCell>
                      {/* 8. Unit */}
                      <TableCell className="text-xs font-medium">{pInfo.unitLabel}</TableCell>
                      {/* 9. Amount (System Stock * Unit MRP) */}
                      <TableCell className="text-right font-semibold tabular-nums text-foreground">
                        ₹{val.retailValuation.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
  );
}
