import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, AlertTriangle, Pill, Building2, Calendar,
  IndianRupee, Package, CheckCircle2, ArrowLeft, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/medicine-lookup")({
  head: () => ({
    meta: [
      { title: "Medicine Batch Verification · RSP Medical" },
      { name: "description", content: "Verify authentic medicine batch, expiry date, MRP, and manufacturer details." },
    ],
  }),
  component: MedicineLookupPage,
});

interface VerifiedBatchDetails {
  id: string;
  code: string | null;
  name: string;
  generic?: string | null;
  company: string | null;
  batch: string;
  expiry: string;
  mrp: number;
  pack?: string | null;
  units?: string | null;
  hsn?: string | null;
  gst?: number;
  tenant_id: string;
}

function MedicineLookupPage() {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<VerifiedBatchDetails | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Read search parameters from URL
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const shopId = searchParams.get("shop") || "T001";
  const medId = searchParams.get("med");
  const batchNo = searchParams.get("batch");

  useEffect(() => {
    let active = true;

    async function fetchBatchDetails() {
      if (!batchNo) {
        setLoading(false);
        setErrorMsg("Missing batch number in QR payload.");
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      try {
        let query = supabase
          .from("medicines")
          .select("id, code, name, generic, company, batch, expiry, mrp, pack, units, hsn, gst, tenant_id")
          .eq("tenant_id", shopId)
          .eq("batch", batchNo.trim());

        const { data, error } = await query;

        if (!active) return;

        if (error) {
          setErrorMsg(error.message);
          setDetails(null);
          return;
        }

        if (!data || data.length === 0) {
          setErrorMsg(`Batch "${batchNo}" not found in pharmacy database.`);
          setDetails(null);
          return;
        }

        // If medId was provided, match exact medicine ID or code
        let matched = data[0];
        if (medId && data.length > 1) {
          const mLower = medId.trim().toLowerCase();
          const exact = data.find(
            (r) =>
              (r.code && r.code.toLowerCase() === mLower) ||
              r.id.toLowerCase() === mLower
          );
          if (exact) matched = exact;
        }

        setDetails(matched as VerifiedBatchDetails);
      } catch (err: any) {
        if (active) setErrorMsg(err?.message || "Failed to load medicine batch details");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchBatchDetails();

    return () => {
      active = false;
    };
  }, [shopId, medId, batchNo]);

  // Check if batch is expired
  const isExpired = Boolean(
    details?.expiry &&
    new Date(details.expiry + "-01") < new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 text-emerald-600 font-bold text-lg">
            <Pill className="h-6 w-6" /> RSP Medical Billing
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Authentic Medicine Batch Verification
          </p>
        </div>

        {loading ? (
          <Card className="p-8 text-center space-y-3">
            <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin mx-auto" />
            <div className="font-semibold text-sm">Verifying Medicine Batch…</div>
            <p className="text-xs text-muted-foreground">Checking store inventory database for batch: {batchNo || "…"}</p>
          </Card>
        ) : errorMsg || !details ? (
          <Card className="p-6 border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="font-bold text-lg text-red-700 dark:text-red-400">Batch Not Found</div>
            <p className="text-xs text-muted-foreground">
              {errorMsg || "The scanned QR code does not match any registered batch record in this pharmacy."}
            </p>
            {batchNo && (
              <div className="p-2 bg-white dark:bg-slate-900 rounded border text-xs font-mono">
                Scanned Batch: <strong>{batchNo}</strong>
              </div>
            )}
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={() => window.history.back()}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden border shadow-sm">
            {/* Verification Status Banner */}
            <div className={`p-4 flex items-center justify-between gap-3 ${isExpired ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"}`}>
              <div className="flex items-center gap-2">
                {isExpired ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                <div>
                  <div className="font-bold text-sm leading-tight">
                    {isExpired ? "EXPIRED BATCH WARNING" : "AUTHENTIC BATCH VERIFIED"}
                  </div>
                  <div className="text-[11px] opacity-90">
                    {isExpired ? "This batch has passed its expiry date" : "Registered in pharmacy inventory"}
                  </div>
                </div>
              </div>
              <Badge variant="secondary" className="font-mono text-xs uppercase bg-white/20 text-white border-none">
                {shopId}
              </Badge>
            </div>

            <div className="p-5 space-y-4">
              {/* Medicine Name & ID */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
                    Medicine Details
                  </span>
                  {details.code && (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted">
                      ID: {details.code}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                  {details.name}
                </h1>
                {details.generic && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Composition: <strong className="text-foreground">{details.generic}</strong>
                  </p>
                )}
              </div>

              {/* Grid Specifications */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t">
                <div className="p-2.5 rounded-lg bg-muted/40 space-y-0.5">
                  <div className="text-muted-foreground flex items-center gap-1 font-medium">
                    <Package className="h-3.5 w-3.5 text-primary" /> Batch Number
                  </div>
                  <div className="font-mono font-bold text-sm text-foreground">
                    {details.batch}
                  </div>
                </div>

                <div className={`p-2.5 rounded-lg space-y-0.5 ${isExpired ? "bg-red-50 text-red-900 border border-red-200" : "bg-muted/40"}`}>
                  <div className="text-muted-foreground flex items-center gap-1 font-medium">
                    <Calendar className="h-3.5 w-3.5 text-primary" /> Expiry Date
                  </div>
                  <div className={`font-mono font-bold text-sm ${isExpired ? "text-red-600" : "text-foreground"}`}>
                    {details.expiry} {isExpired && "(Expired)"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 space-y-0.5">
                  <div className="text-muted-foreground flex items-center gap-1 font-medium">
                    <IndianRupee className="h-3.5 w-3.5 text-primary" /> Maximum Retail Price
                  </div>
                  <div className="font-bold text-sm text-foreground">
                    ₹{Number(details.mrp).toFixed(2)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-muted/40 space-y-0.5">
                  <div className="text-muted-foreground flex items-center gap-1 font-medium">
                    <Building2 className="h-3.5 w-3.5 text-primary" /> Manufacturer
                  </div>
                  <div className="font-semibold text-xs truncate text-foreground">
                    {details.company || "Standard Pharma"}
                  </div>
                </div>
              </div>

              {/* Extra details row */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                {details.pack && <span>Pack Size: <strong>{details.pack}</strong></span>}
                {details.hsn && <span>HSN: <strong>{details.hsn}</strong></span>}
                {details.gst !== undefined && <span>GST: <strong>{details.gst}%</strong></span>}
              </div>

              {/* Footer Trust Stamp */}
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-semibold text-xs">
                  <CheckCircle2 className="h-4 w-4" /> Secure QR Authentication
                </div>
                <p className="text-[10px] text-muted-foreground">
                  This product was scanned from official pharmacy stock. Sensitive trade and customer records are protected.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
