import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ScanBarcode, Printer, Search, Settings2, Sliders, CheckSquare,
  Square, Eye, RotateCcw, Sparkles, QrCode, Layers,
} from "lucide-react";
import { actions, useStore, type Medicine } from "@/lib/store";
import { code128b, code128Rects } from "@/lib/code128";
import {
  LABEL_PRESETS,
  DEFAULT_BARCODE_LABEL_SETTINGS,
  type BarcodeLabelSettings,
  type LabelPresetKey,
  printBarcodeLabels,
  buildSingleLabelHtml,
  saveBarcodeSettings,
} from "@/lib/barcode-settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/barcode")({
  head: () => ({
    meta: [
      { title: "Barcode & QR Labels · RSP Billing Software" },
      { name: "description", content: "Generate and print scannable Code 128 and QR code labels for medicines." },
    ],
  }),
  component: BarcodePage,
});

function BarcodeSVG({ code, height = 44 }: { code: string; height?: number }) {
  const mods = useMemo(() => code128b(code), [code]);
  const total = mods.reduce((n, m) => n + m.w, 0);
  const unit = 200 / total;
  let x = 0;
  return (
    <svg viewBox={`0 0 200 ${height}`} width="100%" height={height} xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      {mods.map((m, i) => {
        const w = m.w * unit;
        const rect = m.solid ? <rect key={i} x={x} y={0} width={w} height={height} fill="#000" /> : null;
        x += w;
        return rect;
      })}
    </svg>
  );
}

function BarcodePage() {
  const meds = useStore((s) => s.medicines);
  const printer = useStore((s) => s.printer);

  // Settings state (initialized from store printer.labelSettings)
  const [settings, setSettings] = useState<BarcodeLabelSettings>(() => {
    return printer.labelSettings || DEFAULT_BARCODE_LABEL_SETTINGS;
  });

  // Settings modal open
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Search & Filters
  const [q, setQ] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low_stock">("all");

  // Selection & Per-item quantities
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [defaultCopies, setDefaultCopies] = useState<number>(1);

  // Keep settings synced with store if printer changes
  useEffect(() => {
    if (printer.labelSettings) {
      setSettings(printer.labelSettings);
    }
  }, [printer.labelSettings]);

  // Filtered list
  const filteredMeds = useMemo(() => {
    const t = q.toLowerCase().trim();
    return meds.filter((m) => {
      const matchesText =
        !t ||
        [m.name, m.company ?? "", m.batch, m.code ?? "", m.id].some((v) =>
          v.toLowerCase().includes(t)
        );
      if (!matchesText) return false;

      if (stockFilter === "in_stock") return (m.stock ?? 0) > 0;
      if (stockFilter === "low_stock") return (m.stock ?? 0) <= 10;
      return true;
    });
  }, [meds, q, stockFilter]);

  // Update a single setting
  function updateSetting<K extends keyof BarcodeLabelSettings>(
    key: K,
    val: BarcodeLabelSettings[K]
  ) {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      saveBarcodeSettings(next);
      actions.updatePrinter({ labelSettings: next });
      return next;
    });
  }

  // Handle preset change
  function applyPreset(presetKey: LabelPresetKey) {
    const meta = LABEL_PRESETS.find((p) => p.key === presetKey);
    if (!meta) return;

    setSettings((prev) => {
      const next: BarcodeLabelSettings = {
        ...prev,
        preset: presetKey,
        widthMm: meta.widthMm,
        heightMm: meta.heightMm,
        columns: meta.columns,
        gapMm: meta.gapMm,
        marginMm: meta.marginMm,
      };
      saveBarcodeSettings(next);
      actions.updatePrinter({ labelSettings: next });
      return next;
    });
  }

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedIds(filteredMeds.map((m) => m.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  // Set copies equal to each medicine's available stock
  const matchCurrentStock = () => {
    if (selectedIds.length === 0) {
      toast.info("Select medicines first to match stock count");
      return;
    }
    const newQtys: Record<string, number> = { ...itemQuantities };
    selectedIds.forEach((id) => {
      const m = meds.find((x) => x.id === id);
      newQtys[id] = Math.max(1, m?.stock ?? 1);
    });
    setItemQuantities(newQtys);
    toast.success(`Updated label copies to match current inventory stock`);
  };

  // Set uniform copies for all selected
  const applyDefaultCopies = (qty: number) => {
    setDefaultCopies(qty);
    const newQtys: Record<string, number> = { ...itemQuantities };
    selectedIds.forEach((id) => {
      newQtys[id] = qty;
    });
    setItemQuantities(newQtys);
  };

  // Execute print
  const handlePrint = () => {
    if (selectedIds.length === 0) {
      return toast.error("Please select at least one product to print labels");
    }

    const itemsToPrint = selectedIds
      .map((id) => {
        const medicine = meds.find((m) => m.id === id);
        if (!medicine) return null;
        const qty = itemQuantities[id] ?? defaultCopies;
        return { medicine, qty };
      })
      .filter(Boolean) as { medicine: Medicine; qty: number }[];

    const result = printBarcodeLabels(
      itemsToPrint,
      settings,
      printer.storeName || "RSP Medical"
    );

    if (result.error) {
      toast.error(result.error);
    } else {
      const totalLabels = itemsToPrint.reduce((s, it) => s + it.qty, 0);
      toast.success(`Preparing ${totalLabels} labels for printing…`);
    }
  };

  // Sample medicine for live preview
  const sampleMed: Medicine = meds[0] || {
    id: "M001",
    name: "PARACETAMOL 500MG TAB",
    batch: "PCM2409",
    expiry: "2027-12",
    mrp: 24.5,
    stock: 120,
    company: "Cipla",
    pack: "10 Tab",
    code: "890123456789",
  };

  const selectedPresetMeta = LABEL_PRESETS.find((p) => p.key === settings.preset);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScanBarcode className="h-6 w-6 text-primary" /> Barcode & QR Label Printing
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure label dimensions, customize printed fields, and print scannable Code 128 or QR labels on thermal rolls or A4 sticker sheets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="gap-1.5 shadow-sm"
          >
            <Sliders className="h-4 w-4 text-primary" />
            <span>Label Settings</span>
            <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">
              {settings.widthMm}×{settings.heightMm}mm
            </Badge>
          </Button>

          <Button
            size="sm"
            onClick={handlePrint}
            disabled={selectedIds.length === 0}
            className="gap-1.5 shadow-sm"
          >
            <Printer className="h-4 w-4" />
            <span>Print Labels</span>
            {selectedIds.length > 0 && (
              <Badge variant="outline" className="bg-primary-foreground/20 text-primary-foreground border-transparent text-[11px] ml-1">
                {selectedIds.reduce((sum, id) => sum + (itemQuantities[id] ?? defaultCopies), 0)}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* ── Active Preset Summary Strip ── */}
      <div className="bg-muted/40 border rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Current Format:</span>
          <Badge variant="outline" className="bg-background font-mono font-medium">
            {selectedPresetMeta?.name || `${settings.widthMm}×${settings.heightMm}mm`}
          </Badge>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">
            Type: <strong className="text-foreground uppercase">{settings.barcodeType}</strong>
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">
            Columns: <strong className="text-foreground">{settings.columns}</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-primary hover:underline font-medium flex items-center gap-1"
        >
          Change layout or fields →
        </button>
      </div>

      {/* ── Controls & Filter Bar ── */}
      <Card className="p-4 space-y-3 shadow-sm border">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Search by medicine name, batch, company, code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Stock Filter */}
          <Select
            value={stockFilter}
            onValueChange={(v: any) => setStockFilter(v)}
          >
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Medicines</SelectItem>
              <SelectItem value="in_stock">In Stock Only</SelectItem>
              <SelectItem value="low_stock">Low Stock (≤10)</SelectItem>
            </SelectContent>
          </Select>

          {/* Default copies */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Copies:</Label>
            <Input
              type="number"
              min={1}
              value={defaultCopies}
              onChange={(e) => applyDefaultCopies(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 h-9 text-center text-sm font-semibold"
            />
          </div>

          {/* Bulk actions */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="h-9 text-xs gap-1"
            >
              <CheckSquare className="h-3.5 w-3.5" /> Select All ({filteredMeds.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              disabled={selectedIds.length === 0}
              className="h-9 text-xs gap-1"
            >
              <Square className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={matchCurrentStock}
              disabled={selectedIds.length === 0}
              className="h-9 text-xs gap-1"
              title="Set print copies to match available inventory stock"
            >
              <Layers className="h-3.5 w-3.5" /> Match Stock
            </Button>
          </div>
        </div>

        {/* Selected counter banner */}
        <div className="text-xs text-muted-foreground flex items-center justify-between pt-1 border-t">
          <div>
            Selected: <strong className="text-primary">{selectedIds.length}</strong> of {filteredMeds.length} items
          </div>
          <div>
            Total labels to print:{" "}
            <strong className="text-foreground font-semibold">
              {selectedIds.reduce((sum, id) => sum + (itemQuantities[id] ?? defaultCopies), 0)}
            </strong>
          </div>
        </div>
      </Card>

      {/* ── Medicines Cards Grid ── */}
      {filteredMeds.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <ScanBarcode className="h-10 w-10 mx-auto mb-2 opacity-30" />
          No medicines match your search. Adjust filters or add stock in Inventory.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredMeds.map((m) => {
            const active = selectedIds.includes(m.id);
            const code = m.code || m.id;
            const currentQty = itemQuantities[m.id] ?? defaultCopies;

            return (
              <Card
                key={m.id}
                className={cn(
                  "p-3.5 flex flex-col justify-between transition-all border relative",
                  active
                    ? "ring-2 ring-primary border-primary bg-primary/5"
                    : "hover:bg-muted/30"
                )}
              >
                {/* Checkbox & Header */}
                <div
                  className="cursor-pointer"
                  onClick={() => toggleSelect(m.id)}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate max-w-[80%]">
                      {settings.customStoreName.trim() || printer.storeName || "RSP Medical"}
                    </div>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleSelect(m.id)}
                      className="h-4 w-4 rounded text-primary border-gray-300 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="font-semibold text-xs leading-snug line-clamp-2 text-foreground min-h-[2rem]">
                    {m.name}
                  </div>
                </div>

                {/* Graphic Code Preview */}
                <div
                  className="my-2 bg-white rounded p-1.5 border border-muted cursor-pointer flex items-center justify-center min-h-[46px]"
                  onClick={() => toggleSelect(m.id)}
                >
                  {settings.barcodeType === "qr" ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <QrCode className="h-9 w-9 text-slate-900" />
                      <div className="text-[10px] leading-tight">
                        <div className="font-bold text-slate-800">{code}</div>
                        <div>QR Matrix</div>
                      </div>
                    </div>
                  ) : (
                    <BarcodeSVG code={code} height={36} />
                  )}
                </div>

                {/* Info & Quantity */}
                <div className="space-y-1.5 pt-1 border-t text-[11px]">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="font-mono">{code}</span>
                    <span className="font-bold text-foreground">₹{Number(m.mrp).toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{m.batch ? `B:${m.batch}` : "—"}</span>
                    <span>Stock: <strong className="text-foreground">{m.stock ?? 0}</strong></span>
                  </div>

                  {/* Quantity Per Item */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-muted-foreground">Copies:</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        value={currentQty}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setItemQuantities((prev) => ({ ...prev, [m.id]: v }));
                          if (!active) {
                            setSelectedIds((prev) => [...prev, m.id]);
                          }
                        }}
                        className="h-7 w-16 text-center text-xs font-semibold px-1"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Label Settings & Live Preview Dialog ─────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sliders className="h-5 w-5 text-primary" /> Barcode & QR Label Printing Settings
            </DialogTitle>
            <DialogDescription>
              Select your label roll or A4 sticker sheet format and customize visible elements.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Left: Configuration Form */}
            <div className="space-y-4">
              {/* Preset Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">1. Standard Label Sheet / Roll Preset</Label>
                <Select
                  value={settings.preset}
                  onValueChange={(v: LabelPresetKey) => applyPreset(v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABEL_PRESETS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        <div className="text-left">
                          <div className="font-medium text-xs">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground">{p.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Barcode Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">2. Barcode Format</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting("barcodeType", "code128")}
                    className={cn(
                      "p-2.5 rounded-lg border text-left flex items-center gap-2 transition-colors",
                      settings.barcodeType === "code128"
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted"
                    )}
                  >
                    <ScanBarcode className="h-4 w-4" />
                    <div>
                      <div className="text-xs">Code 128 (1D)</div>
                      <div className="text-[10px] text-muted-foreground font-normal">Standard laser/camera scanner</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSetting("barcodeType", "qr")}
                    className={cn(
                      "p-2.5 rounded-lg border text-left flex items-center gap-2 transition-colors",
                      settings.barcodeType === "qr"
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted"
                    )}
                  >
                    <QrCode className="h-4 w-4" />
                    <div>
                      <div className="text-xs">QR Code (2D)</div>
                      <div className="text-[10px] text-muted-foreground font-normal">Scannable by phone & 2D scanner</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Dimensions Customization */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">3. Dimensions & Layout (mm)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Width (mm)</span>
                    <Input
                      type="number"
                      value={settings.widthMm}
                      onChange={(e) => updateSetting("widthMm", Math.max(20, Number(e.target.value) || 20))}
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Height (mm)</span>
                    <Input
                      type="number"
                      value={settings.heightMm}
                      onChange={(e) => updateSetting("heightMm", Math.max(15, Number(e.target.value) || 15))}
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Columns</span>
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={settings.columns}
                      onChange={(e) => updateSetting("columns", Math.max(1, Number(e.target.value) || 1))}
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Custom Store Header */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">4. Pharmacy Name on Label</Label>
                <Input
                  placeholder={printer.storeName || "RSP Medical Store"}
                  value={settings.customStoreName}
                  onChange={(e) => updateSetting("customStoreName", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              {/* Content Toggles */}
              <div className="space-y-2 pt-1 border-t">
                <Label className="text-xs font-semibold">5. Elements to Print</Label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                    <span>Store Name</span>
                    <Switch
                      checked={settings.showStoreName}
                      onCheckedChange={(v) => updateSetting("showStoreName", v)}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                    <span>Batch Number</span>
                    <Switch
                      checked={settings.showBatch}
                      onCheckedChange={(v) => updateSetting("showBatch", v)}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                    <span>Expiry Date</span>
                    <Switch
                      checked={settings.showExpiry}
                      onCheckedChange={(v) => updateSetting("showExpiry", v)}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                    <span>MRP (₹)</span>
                    <Switch
                      checked={settings.showMrp}
                      onCheckedChange={(v) => updateSetting("showMrp", v)}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                    <span>Packing Info</span>
                    <Switch
                      checked={settings.showPacking}
                      onCheckedChange={(v) => updateSetting("showPacking", v)}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                    <span>Barcode Digits</span>
                    <Switch
                      checked={settings.showCodeText}
                      onCheckedChange={(v) => updateSetting("showCodeText", v)}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Right: Live Label Preview */}
            <div className="flex flex-col items-center justify-center p-4 bg-muted/30 border rounded-xl">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-primary" /> Live 1:1 Label Preview
              </div>

              {/* Visual Label Box */}
              <div
                className="bg-white text-black shadow-lg rounded border border-gray-300 p-2 flex flex-col justify-between text-center overflow-hidden transition-all"
                style={{
                  width: `${Math.min(260, settings.widthMm * 5)}px`,
                  minHeight: `${Math.min(160, settings.heightMm * 5)}px`,
                }}
              >
                {settings.showStoreName && (
                  <div className="text-[10px] font-bold uppercase tracking-wider truncate text-gray-800">
                    {settings.customStoreName.trim() || printer.storeName || "RSP MEDICAL"}
                  </div>
                )}

                <div className="font-bold text-xs leading-tight truncate my-0.5 text-gray-950">
                  {sampleMed.name}
                </div>

                {/* Graphic Code */}
                <div className="my-1 flex flex-col items-center justify-center">
                  {settings.barcodeType === "qr" ? (
                    <div className="p-1 bg-white border border-gray-200 rounded">
                      <QrCode className="h-14 w-14 text-black" />
                    </div>
                  ) : (
                    <div className="w-full px-1">
                      <BarcodeSVG code={sampleMed.code || sampleMed.id} height={28} />
                    </div>
                  )}

                  {settings.showCodeText && (
                    <div className="font-mono text-[10px] font-bold tracking-wider mt-0.5">
                      {sampleMed.code || sampleMed.id}
                    </div>
                  )}
                </div>

                {/* Footer details */}
                <div className="text-[10px] leading-tight text-gray-700">
                  <div className="truncate">
                    {[
                      settings.showBatch && `B:${sampleMed.batch}`,
                      settings.showExpiry && `EXP:${sampleMed.expiry}`,
                      settings.showPacking && `PK:${sampleMed.pack}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {settings.showMrp && (
                    <div className="font-bold text-xs text-black mt-0.5">
                      MRP ₹{sampleMed.mrp.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground mt-4 text-center">
                Dimensions: <strong>{settings.widthMm}mm × {settings.heightMm}mm</strong> ({settings.columns} across)
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const def = DEFAULT_BARCODE_LABEL_SETTINGS;
                setSettings(def);
                saveBarcodeSettings(def);
                actions.updatePrinter({ labelSettings: def });
                toast.info("Reset to default 50×25mm retail roll");
              }}
            >
              Reset Defaults
            </Button>
            <Button size="sm" onClick={() => setSettingsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
