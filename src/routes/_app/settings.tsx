import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Settings2, Printer, TestTube, Cloud, AlertTriangle, RotateCcw, Sparkles, Camera, Check, ScanBarcode, QrCode, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import {
  LABEL_PRESETS,
  DEFAULT_BARCODE_LABEL_SETTINGS,
  type BarcodeLabelSettings,
  type LabelPresetKey,
  saveBarcodeSettings,
} from "@/lib/barcode-settings";
import { actions, useStore } from "@/lib/store";
import { printReceipt } from "@/lib/print";
import { useTenant } from "@/lib/tenant";
import {
  getStoredGDriveUser, getLastBackupInfo, executeTenantDatabaseReset,
} from "@/lib/gdrive-backup";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · RSP Medical Billing" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const p = useStore((s) => s.printer);
  const tenant = useTenant();
  const currentTenantId = tenant.id || "T001";
  const gUser = getStoredGDriveUser();
  const lastBackup = getLastBackupInfo(currentTenantId);

  useEffect(() => {
    // Purge any legacy client-side AI keys
    if (typeof window !== "undefined") {
      localStorage.removeItem("rsp_gemini_api_key");
      sessionStorage.removeItem("rsp_gemini_api_key");
    }
  }, []);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  const update = (patch: any) => actions.updatePrinter(patch);

  const labelSettings = p.labelSettings || DEFAULT_BARCODE_LABEL_SETTINGS;

  const updateLabelSetting = <K extends keyof BarcodeLabelSettings>(
    key: K,
    val: BarcodeLabelSettings[K]
  ) => {
    const next = { ...labelSettings, [key]: val };
    saveBarcodeSettings(next);
    actions.updatePrinter({ labelSettings: next });
  };

  const applyLabelPreset = (presetKey: LabelPresetKey) => {
    const meta = LABEL_PRESETS.find((x) => x.key === presetKey);
    if (!meta) return;
    const next: BarcodeLabelSettings = {
      ...labelSettings,
      preset: presetKey,
      widthMm: meta.widthMm,
      heightMm: meta.heightMm,
      columns: meta.columns,
      gapMm: meta.gapMm,
      marginMm: meta.marginMm,
    };
    saveBarcodeSettings(next);
    actions.updatePrinter({ labelSettings: next });
    toast.success(`Applied ${meta.name}`);
  };

  const testPrint = () => {
    const testSale = {
      id: "INV-TEST", date: new Date().toISOString(),
      customerId: null, customerName: "Test Customer", phone: "9999999999",
      doctor: "DR. SAMPLE PHYSICIAN",
      items: [
        { id: "T1", name: "Paracetamol 500mg", batch: "B12A", qty: 2, mrp: 25, gst: 5, discount: 0, total: 50.00 },
        { id: "T2", name: "Cetirizine 10mg", batch: "CT09", qty: 1, mrp: 18, gst: 5, discount: 10, total: 16.20 },
      ],
      sub: 68, disc: 1.80, gst: 3.15, grand: 66, payment: "Cash", status: "paid",
    } as any;
    const testMedicines = [
      { id: "T1", name: "Paracetamol 500mg", batch: "B12A", mrp: 25, gst: 5, stock: 100, expiry: "2027-12", pack: "10's", hsn: "30049099", units: "TAB" },
      { id: "T2", name: "Cetirizine 10mg", batch: "CT09", mrp: 18, gst: 5, stock: 50, expiry: "2028-06", pack: "10's", hsn: "30049062", units: "TAB" },
    ] as any[];
    printReceipt(testSale, p, testMedicines);
    toast.success("Test receipt sent to printer");
  };

  const handleExecuteReset = async () => {
    if (resetConfirmText.trim() !== "DELETE") {
      toast.error("Please type DELETE in all caps to confirm");
      return;
    }
    setResetting(true);
    try {
      const { error } = await executeTenantDatabaseReset(currentTenantId);
      if (error) {
        toast.error(`Database reset failed: ${error}`);
        setResetting(false);
        return;
      }
      actions.resetTenantLocalState();
      toast.success(`All data for ${tenant.name} has been deleted.`);
      setResetDialogOpen(false);
      setResetConfirmText("");
    } catch (err: any) {
      toast.error(`Reset error: ${err?.message ?? String(err)}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground">Printer, store info, backups and preferences for {tenant.name}.</p>
      </div>

      {/* ── Google Drive & Cloud Backup Overview ── */}
      {/* <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                Google Drive Cloud Backup
                {gUser ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Not Connected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {gUser ? `Connected as ${gUser.email}. Last backup: ${lastBackup.time || "Never"}` : "Connect your Google account to enable automatic daily backups."}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/backup">
              <Cloud className="h-4 w-4 mr-1.5" /> Manage Backups
            </Link>
          </Button>
        </div>
      </Card> */}

      {/* ── Secure AI Medicine Image Extraction ── */}
      {/* <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 grid place-items-center">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                AI Vision & Medicine Invoice Extraction
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-xs gap-1">
                  <Check className="h-3 w-3" /> Secure Backend
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Powers the <b>Add from Photo</b> feature in Medicines to safely extract distributor invoices, strips, and line items.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t space-y-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-lg">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-medium text-foreground">Zero Frontend Exposure Architecture</span>
              <p>
                AI provider API keys are never stored in your browser, React state, or local storage. Extraction runs securely inside the Supabase Edge Function (<code>extract-medicine-data</code>) using server-side secrets.
              </p>
            </div>
          </div>
        </div>
      </Card> */}

      {/* ── Thermal Printer Settings ── */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2 font-semibold">
          <Printer className="h-5 w-5" /> Thermal Printer & Store Info
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Paper size</Label>
            <Select value={p.paperSize} onValueChange={(v) => update({ paperSize: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="50mm">50mm thermal</SelectItem>
                <SelectItem value="58mm">58mm thermal</SelectItem>
                <SelectItem value="80mm">80mm thermal</SelectItem>
                <SelectItem value="A4">A4 paper</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Copies</Label>
            <Input type="number" min={1} value={p.copies} onChange={(e) => update({ copies: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Store name</Label>
            <Input value={p.storeName} onChange={(e) => update({ storeName: e.target.value })} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Store address</Label>
            <Input value={p.storeAddress} onChange={(e) => update({ storeAddress: e.target.value })} />
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={p.storePhone} onChange={(e) => update({ storePhone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">GSTIN</Label><Input value={p.gstin} onChange={(e) => update({ gstin: e.target.value })} /></div>
          <div className="space-y-1.5 col-span-2"><Label className="text-xs">Drug License</Label><Input value={p.drugLicense} onChange={(e) => update({ drugLicense: e.target.value })} /></div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Footer message</Label>
            <Textarea rows={2} value={p.footer} onChange={(e) => update({ footer: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="font-medium text-sm">Auto-print after Save Bill</div>
            <div className="text-xs text-muted-foreground">Skip the extra print step at busy counters</div>
          </div>
          <Switch checked={p.autoPrint} onCheckedChange={(v) => update({ autoPrint: v })} />
        </div>

        <div className="flex gap-2">
          <Button onClick={testPrint}><TestTube className="h-4 w-4 mr-1.5" /> Print test receipt</Button>
          <Button variant="outline" onClick={() => toast.success("Settings saved")}>Save</Button>
        </div>
      </Card>

      {/* ── Barcode & QR Label Printing Settings ── */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <ScanBarcode className="h-5 w-5 text-primary" /> Barcode & QR Label Printing
          </div>
          <Link
            to="/barcode"
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
          >
            Open Label Printing →
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Default printer specifications, sticker sheet format, and fields displayed on generated product labels.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Standard Label Roll or Sticker Sheet Preset</Label>
            <Select
              value={labelSettings.preset}
              onValueChange={(v: LabelPresetKey) => applyLabelPreset(v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LABEL_PRESETS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.name} ({item.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Barcode Format</Label>
            <Select
              value={labelSettings.barcodeType}
              onValueChange={(v: any) => updateLabelSetting("barcodeType", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="code128">Code 128 (1D Linear Barcode)</SelectItem>
                <SelectItem value="qr">QR Code (2D Data Matrix)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Custom Pharmacy Name on Label</Label>
            <Input
              placeholder={p.storeName}
              value={labelSettings.customStoreName}
              onChange={(e) => updateLabelSetting("customStoreName", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Label Width (mm)</Label>
            <Input
              type="number"
              value={labelSettings.widthMm}
              onChange={(e) => updateLabelSetting("widthMm", Math.max(10, Number(e.target.value) || 10))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Label Height (mm)</Label>
            <Input
              type="number"
              value={labelSettings.heightMm}
              onChange={(e) => updateLabelSetting("heightMm", Math.max(10, Number(e.target.value) || 10))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Columns (across sheet/roll)</Label>
            <Input
              type="number"
              min={1}
              max={8}
              value={labelSettings.columns}
              onChange={(e) => updateLabelSetting("columns", Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Gap between labels (mm)</Label>
            <Input
              type="number"
              value={labelSettings.gapMm}
              onChange={(e) => updateLabelSetting("gapMm", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className="pt-2 border-t space-y-2">
          <Label className="text-xs font-semibold">Included Label Fields</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/40">
              <span>Store Name</span>
              <Switch
                checked={labelSettings.showStoreName}
                onCheckedChange={(v) => updateLabelSetting("showStoreName", v)}
              />
            </label>
            <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/40">
              <span>Medicine Name</span>
              <Switch
                checked={labelSettings.showMedicineName}
                onCheckedChange={(v) => updateLabelSetting("showMedicineName", v)}
              />
            </label>
            <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/40">
              <span>Batch Number</span>
              <Switch
                checked={labelSettings.showBatch}
                onCheckedChange={(v) => updateLabelSetting("showBatch", v)}
              />
            </label>
            <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/40">
              <span>Expiry Date</span>
              <Switch
                checked={labelSettings.showExpiry}
                onCheckedChange={(v) => updateLabelSetting("showExpiry", v)}
              />
            </label>
            <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/40">
              <span>MRP (₹)</span>
              <Switch
                checked={labelSettings.showMrp}
                onCheckedChange={(v) => updateLabelSetting("showMrp", v)}
              />
            </label>
            <label className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/40">
              <span>Packing Info</span>
              <Switch
                checked={labelSettings.showPacking}
                onCheckedChange={(v) => updateLabelSetting("showPacking", v)}
              />
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-5 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">Tip</div>
        For USB barcode scanners, no setup is needed — they type into the search box automatically.
        For built-in camera scanning, allow camera permission when prompted.
      </Card>

      {/* ── DANGER ZONE: Reset All Data ── */}
      <Card className="p-5 space-y-3 border-destructive/40 bg-destructive/5">
        <div className="font-semibold text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-5 w-5" /> DANGER ZONE: Reset All Data
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Permanently delete all data for <strong>{tenant.name}</strong>. This includes medicines, customers, suppliers, bills, purchases, loans, employees, attendance, salary payments, and income/expenses.
          <br />
          <span className="font-semibold text-foreground">
            This action cannot be undone. Your Google Drive backups will NOT be deleted.
          </span>
        </p>
        <Button
          variant="destructive"
          onClick={() => {
            setResetConfirmText("");
            setResetDialogOpen(true);
          }}
        >
          <RotateCcw className="h-4 w-4 mr-1.5" /> Reset All Data
        </Button>
      </Card>

      {/* ── Dangerous RESET ALL DATA Dialog ── */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md border-destructive/50">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> WARNING — DELETE ALL DATA
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete all data for this business ({tenant.name}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div className="bg-destructive/10 text-destructive p-3 rounded-lg space-y-1 font-medium">
              <div>This includes:</div>
              <div>• Medicines & Inventory batches</div>
              <div>• Customers, Suppliers & Credit Loans</div>
              <div>• Sales, Bills & Invoices</div>
              <div>• Purchases & Supplier Invoices</div>
              <div>• Employees, Attendance & Salary Payments</div>
              <div>• Finance Income & Operational Expenses</div>
              <div>• GST profile & business settings</div>
            </div>

            <div className="rounded-md border p-2.5 text-muted-foreground">
              This action <strong>cannot be undone</strong>. Your Google Drive backup files will remain available and untouched.
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold text-destructive">
                To continue, type DELETE in all caps:
              </Label>
              <Input
                placeholder="Type DELETE"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="font-mono text-sm tracking-wider"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3">
            <Button variant="outline" onClick={() => setResetDialogOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetConfirmText.trim() !== "DELETE" || resetting}
              onClick={handleExecuteReset}
            >
              {resetting ? "Deleting all data…" : "DELETE ALL DATA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

