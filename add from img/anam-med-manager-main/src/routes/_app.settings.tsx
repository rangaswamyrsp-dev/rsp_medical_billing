import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings2, Printer, TestTube } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { printReceipt } from "@/lib/print";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · RSP Medical Billing" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const p = useStore((s) => s.printer);
  const update = (patch: any) => actions.updatePrinter(patch);

  const testPrint = () => {
    printReceipt(
      {
        id: "INV-TEST", date: new Date().toISOString(),
        customerId: null, customerName: "Test Customer", phone: "9999999999",
        items: [
          { id: "T1", name: "Paracetamol 500mg", batch: "B12A", qty: 2, mrp: 25, gst: 5, discount: 0, total: 52.5 },
          { id: "T2", name: "Cetirizine 10mg", batch: "CT09", qty: 1, mrp: 18, gst: 5, discount: 10, total: 17.01 },
        ],
        sub: 68, disc: 1.8, gst: 3.31, grand: 70, payment: "cash", status: "paid",
      } as any,
      p,
    );
    toast.success("Test receipt sent to printer");
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground">Printer, store info and preferences.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2 font-semibold">
          <Printer className="h-5 w-5" /> Thermal Printer
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Paper size</Label>
            <Select value={p.paperSize} onValueChange={(v) => update({ paperSize: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
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

      <Card className="p-5 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">Tip</div>
        For USB barcode scanners, no setup is needed — they type into the search box automatically.
        For built-in camera scanning, allow camera permission when prompted.
      </Card>
    </div>
  );
}
