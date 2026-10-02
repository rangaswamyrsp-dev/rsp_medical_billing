import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { QrCode, Printer, Smartphone, Pill, Search, ShieldCheck } from "lucide-react";
import { useStore, type Medicine } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/qr")({
  head: () => ({ meta: [{ title: "QR Codes · RSP Medical Billing" }] }),
  component: QrPage,
});

function QrPage() {
  const printer = useStore((s) => s.printer);
  const meds = useStore((s) => s.medicines);

  // Counter UPI Tab State
  const [upi, setUpi] = useState("anam@upi");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("Medical bill payment");

  // Medicine QR Tab State
  const [medQuery, setMedQuery] = useState("");
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null);

  // UPI URL
  const upiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("pa", upi);
    params.set("pn", printer.storeName || "Medical Store");
    if (amount) params.set("am", amount);
    if (note) params.set("tn", note);
    params.set("cu", "INR");
    return `upi://pay?${params.toString()}`;
  }, [upi, amount, note, printer.storeName]);

  const upiQrImage = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUrl)}`;

  // Filtered medicines for QR selection
  const filteredMeds = useMemo(() => {
    const q = medQuery.toLowerCase().trim();
    if (!q) return meds.slice(0, 8);
    return meds
      .filter((m) =>
        [m.name, m.batch, m.company ?? "", m.code ?? "", m.id].some((v) =>
          v.toLowerCase().includes(q)
        )
      )
      .slice(0, 8);
  }, [meds, medQuery]);

  // Selected med QR content
  const activeMed = selectedMed || meds[0];
  const medQrData = activeMed
    ? `MEDICINE VERIFICATION\nName: ${activeMed.name}\nBatch: ${activeMed.batch || "N/A"}\nExpiry: ${activeMed.expiry || "N/A"}\nMRP: Rs. ${activeMed.mrp}\nPharmacy: ${printer.storeName || "RSP Medical"}`
    : "";

  const medQrImage = activeMed
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(medQrData)}`
    : "";

  // Print Counter Tent Card
  const printUpiStand = () => {
    const w = window.open("", "_blank", "width=800,height=850");
    if (!w) return toast.error("Popup blocked");
    w.document.write(`<!doctype html>
<html>
<head>
  <title>UPI Counter Stand · ${printer.storeName}</title>
  <style>
    @page { size: A5 portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { margin: 0; padding: 20px; text-align: center; background: #fff; }
    .card { border: 2px solid #0284c7; border-radius: 16px; padding: 30px; max-width: 400px; margin: 0 auto; }
    .title { font-size: 20pt; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
    .sub { font-size: 11pt; color: #64748b; margin-bottom: 20px; }
    .qr-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; display: inline-block; margin-bottom: 16px; }
    .qr-box img { width: 220px; height: 220px; display: block; }
    .upi-id { font-family: monospace; font-size: 13pt; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 6px 14px; border-radius: 6px; display: inline-block; margin-bottom: 12px; }
    .badge { font-size: 10pt; font-weight: 600; color: #475569; }
    .apps { font-size: 9pt; color: #94a3b8; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">${printer.storeName || "ANAM MEDICAL STORE"}</div>
    <div class="sub">Scan with any UPI App to Pay</div>
    <div class="qr-box">
      <img src="${upiQrImage}" alt="UPI QR" />
    </div>
    <br/>
    <div class="upi-id">${upi}</div>
    <div class="badge">Accepted: PhonePe · Google Pay · Paytm · BHIM</div>
    <div class="apps">${printer.storeAddress || ""}</div>
  </div>
  <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
</body>
</html>`);
    w.document.close();
  };

  // Print Medicine Verification QR Card
  const printMedQrCard = () => {
    if (!activeMed) return;
    const w = window.open("", "_blank", "width=800,height=750");
    if (!w) return toast.error("Popup blocked");
    w.document.write(`<!doctype html>
<html>
<head>
  <title>Medicine QR Verification · ${activeMed.name}</title>
  <style>
    @page { size: 100mm 100mm; margin: 5mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { margin: 0; padding: 15px; text-align: center; }
    .card { border: 1.5px solid #059669; border-radius: 12px; padding: 15px; }
    .store { font-size: 10pt; font-weight: 700; text-transform: uppercase; color: #047857; margin-bottom: 4px; }
    .name { font-size: 13pt; font-weight: 800; color: #0f172a; margin-bottom: 12px; }
    img { width: 160px; height: 160px; }
    .details { font-size: 10pt; color: #334155; margin-top: 10px; line-height: 1.5; }
    .mrp { font-size: 12pt; font-weight: 700; color: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <div class="store">${printer.storeName || "RSP Medical"}</div>
    <div class="name">${activeMed.name}</div>
    <img src="${medQrImage}" alt="Med QR" />
    <div class="details">
      <div>Batch: <strong>${activeMed.batch || "—"}</strong> · Exp: <strong>${activeMed.expiry || "—"}</strong></div>
      <div class="mrp">MRP ₹${Number(activeMed.mrp).toFixed(2)}</div>
    </div>
  </div>
  <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
</body>
</html>`);
    w.document.close();
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <QrCode className="h-6 w-6 text-primary" /> QR Code Generator & Printing
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate counter UPI payment QR codes or individual medicine authentication QR labels.
        </p>
      </div>

      <Tabs defaultValue="upi" className="space-y-4">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="upi" className="gap-1.5 text-xs font-semibold">
            <Smartphone className="h-4 w-4" /> Counter UPI Payment QR
          </TabsTrigger>
          <TabsTrigger value="medicine" className="gap-1.5 text-xs font-semibold">
            <Pill className="h-4 w-4" /> Medicine Authentication QR
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Counter UPI QR ────────────────────────────────────────── */}
        <TabsContent value="upi">
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5 space-y-4 shadow-sm border">
              <div className="font-semibold text-sm">UPI Payment Configuration</div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Store UPI ID (VPA)</Label>
                <Input
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="e.g. pharmacy@upi or mobile@ybl"
                />
                <p className="text-[11px] text-muted-foreground">
                  Payments will be received directly into the bank account linked with this UPI ID.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Fixed Amount (optional)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Leave empty for customer-entered amount"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Transaction Note</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Medical bill payment"
                />
              </div>

              <div className="text-[11px] text-muted-foreground font-mono bg-muted/50 rounded p-2.5 break-all border">
                {upiUrl}
              </div>
            </Card>

            <Card className="p-5 flex flex-col items-center gap-3 text-center shadow-sm border">
              <div className="font-bold text-base text-foreground">{printer.storeName || "RSP Medical Store"}</div>
              <div className="text-xs text-muted-foreground">Scan with PhonePe, GPay, Paytm, or BHIM</div>

              <div className="p-3 bg-white border rounded-xl shadow-sm">
                <img src={upiQrImage} alt="UPI QR" className="w-56 h-56 rounded-md" />
              </div>

              <div className="font-mono text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
                {upi}
              </div>

              <Button onClick={printUpiStand} className="gap-1.5 shadow-sm mt-1">
                <Printer className="h-4 w-4" /> Print Counter Stand Card
              </Button>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB 2: Medicine Authentication QR ────────────────────────────── */}
        <TabsContent value="medicine">
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5 space-y-4 shadow-sm border">
              <div className="font-semibold text-sm flex items-center justify-between">
                <span>Select Medicine</span>
                {selectedMed && (
                  <Badge variant="outline" className="text-[11px] text-primary">
                    Selected
                  </Badge>
                )}
              </div>

              {/* Medicine search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9 text-xs"
                  placeholder="Search medicine name, batch, company…"
                  value={medQuery}
                  onChange={(e) => setMedQuery(e.target.value)}
                />
              </div>

              {/* Medicine List */}
              <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                {filteredMeds.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMed(m)}
                    className={cn(
                      "w-full text-left p-2.5 transition-colors flex items-center justify-between text-xs",
                      activeMed?.id === m.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div>
                      <div className="font-semibold">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Batch: {m.batch || "—"} · Exp: {m.expiry || "—"} · MRP: ₹{m.mrp}
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {m.stock ?? 0} in stock
                    </Badge>
                  </button>
                ))}
              </div>

              <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Instant Camera Verification
                </div>
                <div>
                  Scanning this QR code with any mobile camera displays the verified medicine batch, expiration date, and genuine store identity.
                </div>
              </div>
            </Card>

            {/* Medicine QR Preview Card */}
            {activeMed ? (
              <Card className="p-5 flex flex-col items-center gap-3 text-center shadow-sm border">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {printer.storeName || "RSP Medical"}
                </div>
                <div className="font-bold text-base text-foreground leading-tight max-w-xs">
                  {activeMed.name}
                </div>

                <div className="p-3 bg-white border rounded-xl shadow-sm">
                  <img src={medQrImage} alt="Medicine QR" className="w-52 h-52 rounded-md" />
                </div>

                <div className="text-xs space-y-0.5">
                  <div className="text-muted-foreground">
                    Batch: <strong className="text-foreground">{activeMed.batch || "—"}</strong> · Expiry:{" "}
                    <strong className="text-foreground">{activeMed.expiry || "—"}</strong>
                  </div>
                  <div className="text-sm font-bold text-foreground">MRP ₹{Number(activeMed.mrp).toFixed(2)}</div>
                </div>

                <Button onClick={printMedQrCard} className="gap-1.5 shadow-sm mt-1">
                  <Printer className="h-4 w-4" /> Print Medicine QR Card
                </Button>
              </Card>
            ) : (
              <Card className="p-12 text-center text-sm text-muted-foreground border">
                Select a medicine to generate an authentication QR code.
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
