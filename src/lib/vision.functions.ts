// RSP Medical Billing - Vision AI Integration via Supabase Edge Function
// Security Architecture:
// - All AI provider requests run strictly server-side in Supabase Edge Functions.
// - AI provider API keys NEVER exist in the React frontend, state, localStorage, or network payloads.
// - The frontend communicates ONLY with the Supabase Edge Function: "extract-medicine-data".

import { supabase } from "@/lib/supabase";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface ExtractedMedicineItem {
  medicine_name: string;
  manufacturer: string;
  drug_name: string; // Active Composition / Molecule
  type: string;
  hsn: string | null;
  pack: string;
  batch: string;
  expiry: string;
  mrp: number | null;
  purchase_price: number | null;
  gst: number | null;
  quantity: number | null;
  unit: string;
}

export interface ExtractedInvoiceGroup {
  supplier: string;
  invoice_no: string;
  supplier_date: string;
  items: ExtractedMedicineItem[];
}

export interface VisionExtractionResult {
  ok: boolean;
  error?: string;
  invoices: ExtractedInvoiceGroup[];
}

/**
 * Safely format an error string for UI display without exposing any secrets or keys.
 * Formats as: "AI image processing failed: <actual safe error>"
 */
function formatAiProcessingError(rawError: string): string {
  let cleaned = (rawError || "Unknown error").trim();
  // Strip any accidental API keys, tokens, or URL query secrets
  cleaned = cleaned.replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]");
  cleaned = cleaned.replace(/AIza[a-zA-Z0-9_-]{35}/g, "[REDACTED_KEY]");
  cleaned = cleaned.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[REDACTED_KEY]");
  cleaned = cleaned.replace(/bearer\s+[a-zA-Z0-9_.-]+/gi, "Bearer [REDACTED]");

  if (cleaned.startsWith("AI image processing failed:")) {
    return cleaned;
  }
  if (cleaned.startsWith("AI image processing failed")) {
    return cleaned.replace(/^AI image processing failed[.:\s]*/i, "AI image processing failed: ");
  }
  return `AI image processing failed: ${cleaned}`;
}

/**
 * Securely extracts medicine & invoice data from an image via Supabase Edge Function.
 * The AI secret key (AI_API_KEY) is stored solely in Supabase Edge Function Secrets.
 */
export async function extractMedicinesFromImageEdgeFn(
  imageDataUrl: string,
  tenantId?: string
): Promise<VisionExtractionResult> {
  if (!tenantId) {
    return {
      ok: false,
      error: formatAiProcessingError("Active business tenant could not be determined."),
      invoices: [],
    };
  }

  if (!imageDataUrl || imageDataUrl.length < 50) {
    return {
      ok: false,
      error: formatAiProcessingError("Please provide a valid image file."),
      invoices: [],
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("extract-medicine-data", {
      body: {
        image: imageDataUrl,
        tenantId: tenantId,
      },
    });

    if (error) {
      const errorName: string = (error as any).name || "";

      // ── FunctionsHttpError: function reached but returned non-2xx ─────────
      // error.context is the raw Response object — read its body for the real message.
      if (errorName === "FunctionsHttpError") {
        let bodyError = "";
        const response = (error as any).context as Response | undefined;

        if (response) {
          try {
            // Clone so body stream stays usable
            const cloned = response.clone();
            const bodyJson = await cloned.json().catch(() => null);
            if (bodyJson && typeof bodyJson === "object") {
              bodyError = bodyJson.error || bodyJson.message || "";
            }
            if (!bodyError) {
              bodyError = await response.text().catch(() => "");
            }
          } catch {
            // ignore parse failures
          }
        }

        if (!bodyError && data && typeof data === "object") {
          bodyError = (data as any).error || (data as any).message || "";
        }

        const diagMsg = bodyError || error.message || "Edge Function returned a non-2xx error.";
        return {
          ok: false,
          error: formatAiProcessingError(diagMsg),
          invoices: [],
        };
      }

      // ── FunctionsRelayError: Supabase relay can't reach the function ──────
      if (errorName === "FunctionsRelayError") {
        return {
          ok: false,
          error: formatAiProcessingError(
            "Supabase relay could not reach 'extract-medicine-data'. Check that the function is deployed and active."
          ),
          invoices: [],
        };
      }

      // ── FunctionsFetchError: network error before reaching Supabase ───────
      if (errorName === "FunctionsFetchError") {
        return {
          ok: false,
          error: formatAiProcessingError(
            "Network error: could not reach the Supabase Edge Function. Check your network connection."
          ),
          invoices: [],
        };
      }

      // ── Generic fallback ──────────────────────────────────────────────────
      return {
        ok: false,
        error: formatAiProcessingError(error.message || "Edge Function returned an unknown error."),
        invoices: [],
      };
    }

    if (!data || typeof data !== "object") {
      return {
        ok: false,
        error: formatAiProcessingError("Invalid response received from extraction service."),
        invoices: [],
      };
    }

    if (data.ok === false || data.success === false) {
      const err: string = data.error || data.message || "AI extraction failed.";
      return {
        ok: false,
        error: formatAiProcessingError(err),
        invoices: [],
      };
    }

    const invoices = Array.isArray(data.invoices)
      ? data.invoices
      : Array.isArray(data.data?.invoices)
      ? data.data.invoices
      : Array.isArray(data.data?.items)
      ? [{ supplier: "", invoice_no: "", supplier_date: "", items: data.data.items }]
      : [];

    return {
      ok: true,
      invoices,
    };
  } catch (err: any) {
    const msg: string = err?.message || String(err) || "";
    return {
      ok: false,
      error: formatAiProcessingError(msg || "Failed to communicate with secure AI service."),
      invoices: [],
    };
  }
}




// ── Backward-Compatible Wrappers ─────────────────────────────────────────────

const medicineVisionInputSchema = z.object({
  image: z.string().min(20),
  userApiKey: z.string().optional(),
  model: z.string().optional(),
  tenantId: z.string().optional(),
});

export const extractMedicinesFromImageServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => medicineVisionInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error: string; medicines: any[]; invoices?: ExtractedInvoiceGroup[] }> => {
    // Route directly through the secure Supabase Edge Function
    const result = await extractMedicinesFromImageEdgeFn(data.image, data.tenantId);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "AI extraction failed",
        medicines: [],
        invoices: [],
      };
    }

    // Flatten to medicine items for backwards compatibility
    const flattenedMedicines: any[] = [];
    result.invoices.forEach((inv) => {
      inv.items.forEach((item) => {
        flattenedMedicines.push({
          name: item.medicine_name,
          supplier: inv.supplier,
          invoiceNo: inv.invoice_no,
          supplierDate: inv.supplier_date,
          company: item.manufacturer,
          type: item.type,
          drugName: item.drug_name,
          hsn: item.hsn || "",
          batch: item.batch,
          expiry: item.expiry,
          mrp: item.mrp || 0,
          cost: item.purchase_price || 0,
          gst: item.gst ?? 5,
          pack: item.pack,
          stock: item.quantity || 1,
          unit: item.unit,
          confidence: "AI",
        });
      });
    });

    return {
      ok: true,
      error: "",
      medicines: flattenedMedicines,
      invoices: result.invoices,
    };
  });

const legacySchema = z.object({
  image: z.string().min(20),
  columns: z.array(z.object({ key: z.string(), label: z.string(), type: z.string().optional() })),
});

export const extractRowsFromImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => legacySchema.parse(d))
  .handler(async ({ data }) => {
    // Route through secure Edge Function without exposing any keys
    const result = await extractMedicinesFromImageEdgeFn(data.image);
    if (!result.ok) {
      return { ok: false as const, error: result.error || "AI extraction failed.", tsv: "" };
    }

    const header = data.columns.map((c) => c.label).join("\t");
    const lines = [header];

    result.invoices.forEach((inv) => {
      inv.items.forEach((it) => {
        const rowVals = data.columns.map((col) => {
          const k = col.key.toLowerCase();
          if (k.includes("name")) return it.medicine_name;
          if (k.includes("company") || k.includes("mfr")) return it.manufacturer;
          if (k.includes("batch")) return it.batch;
          if (k.includes("exp")) return it.expiry;
          if (k.includes("mrp")) return it.mrp ?? "";
          if (k.includes("cost") || k.includes("rate") || k.includes("purchase")) return it.purchase_price ?? "";
          if (k.includes("gst")) return it.gst ?? 5;
          if (k.includes("qty") || k.includes("stock")) return it.quantity ?? 1;
          if (k.includes("pack")) return it.pack;
          if (k.includes("hsn")) return it.hsn ?? "";
          if (k.includes("drug") || k.includes("composition") || k.includes("generic")) return it.drug_name;
          if (k.includes("supplier")) return inv.supplier;
          if (k.includes("invoice")) return inv.invoice_no;
          return "";
        });
        lines.push(rowVals.join("\t"));
      });
    });

    return { ok: true as const, error: "", tsv: lines.join("\n") };
  });
