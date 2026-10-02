import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { QrCode, Printer } from "lucide-react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app/qr")({
  head: () => ({ meta: [{ title: "QR Code · RSP Medical Billing" }] }),
  component: QrPage,
});

function QrPage() {
  const printer = useStore((s) => s.printer);
  const [upi, setUpi] = useState("anam@upi");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("Medical bill");

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("pa", upi);
    params.set("pn", printer.storeName);
    if (amount) params.set("am", amount);
    if (note) params.set("tn", note);
    params.set("cu", "INR");
    return `upi://pay?${params.toString()}`;
  }, [upi, amount, note, printer.storeName]);

  const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <QrCode className="h-6 w-6 text-primary" /> UPI QR Code
        </h1>
        <p className="text-sm text-muted-foreground">Generate and print a UPI payment QR code for the counter.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">UPI ID</Label>
            <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="anam@upi" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Amount (optional)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Any amount" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground break-all font-mono bg-muted/50 rounded p-2">{url}</div>
        </Card>

        <Card className="p-5 flex flex-col items-center gap-3 text-center">
          <div className="font-semibold">{printer.storeName}</div>
          <img src={qrImage} alt="UPI QR" className="w-64 h-64 rounded-md border" />
          <div className="text-xs text-muted-foreground">Scan with any UPI app — PhonePe, GPay, Paytm</div>
          <Button variant="outline" onClick={() => {
            const w = window.open("", "_blank");
            if (!w) return;
            w.document.write(`<html><body style="text-align:center;font-family:Arial;padding:20px">
              <h2>${printer.storeName}</h2>
              <img src="${qrImage}" style="width:400px;height:400px"/>
              <div>Scan to Pay via UPI</div>
              <div style="font-family:monospace">${upi}</div>
              <script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script>
            </body></html>`);
            w.document.close();
          }}>
            <Printer className="h-4 w-4 mr-1.5" /> Print QR
          </Button>
        </Card>
      </div>
    </div>
  );
}
