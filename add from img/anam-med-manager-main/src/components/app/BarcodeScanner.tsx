import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, X, ScanLine } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
  mode?: "barcode" | "qr";
};

// BarcodeDetector types (not in TS libs by default)
declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

const FORMATS_BARCODE = ["code_128", "code_39", "code_93", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar"];
const FORMATS_QR = ["qr_code", "data_matrix", "aztec"];

export function BarcodeScanner({ open, onOpenChange, onDetected, mode = "barcode" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const start = async () => {
      setError(null);
      const Detector = window.BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setSupported(false);
        return;
      }
      try {
        const formats = mode === "qr" ? FORMATS_QR : [...FORMATS_BARCODE, ...FORMATS_QR];
        const detector = new Detector({ formats });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes[0]?.rawValue) {
              onDetected(String(codes[0].rawValue));
              cleanup();
              return;
            }
          } catch { /* ignore */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        setError(e?.message ?? "Cannot access camera");
      }
    };

    const cleanup = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onOpenChange(false);
    };

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const submitManual = () => {
    if (!manual.trim()) return toast.error("Enter a code");
    onDetected(manual.trim());
    setManual("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "qr" ? <ScanLine className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            Scan {mode === "qr" ? "QR Code" : "Barcode"}
          </DialogTitle>
          <DialogDescription>
            Point your device camera at the {mode === "qr" ? "QR code" : "barcode"} on the medicine strip.
          </DialogDescription>
        </DialogHeader>

        {supported && !error ? (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-6 border-2 border-primary/80 rounded-lg" />
              <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-primary animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-4 bg-muted/40 text-sm space-y-2">
            <div className="font-medium">
              {error ? "Camera unavailable" : "Camera scanning not supported on this browser"}
            </div>
            <p className="text-muted-foreground text-xs">
              {error ?? "Use Chrome/Edge on Android or a modern desktop browser, or a USB scanner (they type into the search box directly)."}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Enter code manually</Label>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitManual()}
              placeholder="e.g. 8901234567890"
            />
            <Button onClick={submitManual}>Add</Button>
          </div>
        </div>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          <X className="h-4 w-4 mr-1.5" /> Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
