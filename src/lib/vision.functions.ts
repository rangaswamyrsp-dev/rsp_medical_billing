import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const legacySchema = z.object({
  image: z.string().min(20), // data URL
  columns: z.array(z.object({ key: z.string(), label: z.string(), type: z.string().optional() })),
});

export interface ExtractedMedicineItem {
  name: string;
  supplier?: string;
  invoiceNo?: string;
  company: string; // MFR short code
  type: string;
  category: string;
  hsn: string;
  batch: string;
  expiry: string;
  mrp: number;
  cost: number;
  gst: number;
  pack: string;
  stock: number;
  confidence?: string; // e.g. "OK · 98%"
  notes?: string;
}

const medicineVisionInputSchema = z.object({
  image: z.string().min(20), // data URL
  userApiKey: z.string().optional(),
  model: z.string().optional(),
});

const PROMPT_INSTRUCTIONS = `You are an elite pharmacy invoice & packaging OCR AI expert.
You are reading a photo of:
1) A wholesale/distributor/stockist purchase bill/invoice containing one or many medicine line items (e.g. AMBIKAA MEDINEEDS, Mahavir Pharma, Apollo, Sun Pharma, Cipla, Alkem, MedPlus, local distributors).
2) A medicine strip, box, bottle, vial, ampoule, or packaging (front/back).

CRITICAL EXTRACTION INSTRUCTIONS:
First, inspect the invoice header for:
- SUPPLIER: The distributor, stockist, or agency name printed at the very top of the bill (e.g. "AMBIKAA MEDINEEDS", "MAHAVIR PHARMA", "APOLLO DISTRIBUTORS"). Apply this same supplier to every product row extracted from this bill.
- INVOICE NO: The bill / invoice number printed near the top (e.g. "260007300637", "INV-1092"). Apply this same invoice number to every product row extracted from this bill.

Next, extract EVERY medicine product line item visible in the table or packaging:
1. MEDICINE NAME: Brand / trade name exactly as printed in the product description (e.g., "P 500 SUSPENSION", "PANTOP DSR CAPS", "OFM SYRUP", "ASCORIL LS SYP", "CYCLOPAM SYP", "ECOSPRIN GOLD 40", "Dolo 650").
2. SUPPLIER: The distributor name from the bill header (e.g. "AMBIKAA MEDINEEDS").
3. INVOICE NO: The invoice / bill number from the bill header (e.g. "260007300637").
4. MANUFACTURER (MFR): Keep short manufacturer abbreviation EXACTLY as printed in the bill column (e.g., "APE", "ARI", "FDC", "GLE", "IND", "USV", "SUN", "CIPLA", "ALKEM", "GSK"). Do NOT expand abbreviations.
5. MEDICINE TYPE: Form of the medicine (e.g. "Suspension", "Capsule", "Syrup", "Tablet", "Injection", "Ointment", "Drops", "Gel").
6. CATEGORY / COMPOSITION: Therapeutic category or active generic salt if visible (e.g. "Analgesic / Antipyretic", "Antibiotic", "Antacid / PPI").
7. HSN CODE (IMPORTANT & MANDATORY): Read the 4, 6, or 8 digit HSN/SAC code from the bill column (e.g. "3004", "33059090", "30042039", "30049099", "30049062"). If not visible, leave empty string ("").
8. PACK SIZE: Pack description from the bill (e.g. "60ML", "15", "100ML", "10's", "10x10").
9. BATCH NUMBER: Batch/Lot No. exactly as printed (e.g. "PFS25068", "SPA260010", "XSOM26013", "11260038", "26400150", "ECS26016").
10. EXPIRY DATE: Normalize to standard "YYYY-MM" format (e.g. "11/27" -> "2027-11", "12/27" -> "2027-12", "01/28" -> "2028-01", "10/28" -> "2028-10", "09/27" -> "2027-09").
11. MRP: Maximum retail price as a plain number (e.g. 44.73, 226.40, 65.84, 144.85, 101.50, 258.19).
12. PURCHASE PRICE: Cost / purchase rate before/after tax from invoice rate column (e.g. 34.08, 172.50, 50.16, 110.36, 77.33, 206.56).
13. GST %: Tax percentage as a number (0, 5, 12, 18, 28). Default to 5 if not specified.
14. QUANTITY: Billed quantity as a number (e.g. 6, 2, 4, 3, 10).
15. CONFIDENCE: Provide reading confidence string (e.g. "OK · 98%", "OK · 97%", "OK · 95%").

OUTPUT FORMAT:
Return a valid JSON array or { "medicines": [...] } object. Example:
[
  {
    "name": "P 500 SUSPENSION",
    "supplier": "AMBIKAA MEDINEEDS",
    "invoiceNo": "260007300637",
    "company": "APE",
    "type": "Suspension",
    "category": "",
    "hsn": "3004",
    "pack": "60ML",
    "batch": "PFS25068",
    "expiry": "2027-11",
    "mrp": 44.73,
    "cost": 34.08,
    "gst": 5,
    "stock": 6,
    "confidence": "OK · 98%"
  }
]`;

/** Extract medicine items from an image using Gemini / OpenAI Vision */
export const extractMedicinesFromImageServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => medicineVisionInputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error: string; medicines: ExtractedMedicineItem[] }> => {
    const rawKey =
      data.userApiKey ||
      process.env["GEMINI_API_KEY"] ||
      process.env["AI_API_KEY"] ||
      process.env["OPENAI_API_KEY"] ||
      "";

    const apiKey = rawKey.trim();
    if (!apiKey) {
      return {
        ok: false,
        error: "AI Vision is not configured. Please provide a Gemini API Key in Settings or the Import window.",
        medicines: [],
      };
    }

    // Determine API provider: Google Gemini or OpenAI / Gateway
    const isGemini = apiKey.startsWith("AIza") || process.env["GEMINI_API_KEY"] || !apiKey.startsWith("sk-");

    try {
      if (isGemini) {
        // Parse data URL to extract mime type and base64
        const parts = data.image.split(",");
        const mimeMatch = parts[0]?.match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const base64Data = parts[1] || parts[0];

        const model = data.model || "gemini-2.0-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT_INSTRUCTIONS },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: "application/json",
              temperature: 0.1,
            },
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          if (res.status === 429) {
            return { ok: false, error: "AI rate limit reached. Please wait a few seconds and try again.", medicines: [] };
          }
          if (res.status === 400 || res.status === 403) {
            return { ok: false, error: `Invalid AI Key or request (${res.status}): ${detail.slice(0, 150)}`, medicines: [] };
          }
          return { ok: false, error: `Could not process image (${res.status}): ${detail.slice(0, 150)}`, medicines: [] };
        }

        const json = (await res.json()) as any;
        const rawContent: string =
          json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

        const cleanJson = rawContent.replace(/```[a-z]*\n?/gi, "").trim();
        if (!cleanJson) {
          return { ok: false, error: "No medicine records could be extracted from this photo.", medicines: [] };
        }

        let parsed: any;
        try {
          parsed = JSON.parse(cleanJson);
        } catch {
          // If wrapped in an object e.g. { medicines: [...] }
          const match = cleanJson.match(/\[[\s\S]*\]/);
          if (match) parsed = JSON.parse(match[0]);
          else throw new Error("Invalid JSON returned from Vision AI");
        }

        const items: any[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.medicines)
            ? parsed.medicines
            : Array.isArray(parsed?.items)
              ? parsed.items
              : [parsed];

        const normalized = items
          .filter((item) => item && (item.name || item.batch))
          .map((item: any) => ({
            name: String(item.name || "").trim(),
            supplier: String(item.supplier || "").trim(),
            invoiceNo: String(item.invoiceNo || item.invoice_no || item.invoice || "").trim(),
            company: String(item.company || item.mfr || "").trim(), // Short name verbatim
            type: String(item.type || "").trim(),
            category: String(item.category || "").trim(),
            hsn: String(item.hsn || "").trim(),
            batch: String(item.batch || "").trim(),
            expiry: String(item.expiry || "").trim(),
            mrp: Number(item.mrp) || 0,
            cost: Number(item.cost || item.purchase || item.rate) || 0,
            gst: Number(item.gst) || 5,
            pack: String(item.pack || "").trim(),
            stock: Number(item.stock || item.qty || item.quantity) || 1,
            confidence: String(item.confidence || "OK · 98%"),
            notes: item.notes || "",
          }));

        return { ok: true, error: "", medicines: normalized };
      } else {
        // OpenAI / Custom Gateway
        const gatewayUrl = process.env["AI_GATEWAY_URL"] || "https://api.openai.com/v1/chat/completions";
        const modelName = process.env["OPENAI_MODEL"] || "gpt-4o";

        console.log(`[Vision] Using OpenAI model: ${modelName}, gateway: ${gatewayUrl}`);

        const res = await fetch(gatewayUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelName,
            max_tokens: 4096,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: PROMPT_INSTRUCTIONS + "\nRespond with a valid JSON object containing { \"medicines\": [...] }." },
                  { type: "image_url", image_url: { url: data.image, detail: "high" } },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.error(`[Vision] OpenAI API error ${res.status}: ${detail.slice(0, 500)}`);
          if (res.status === 401) {
            return { ok: false, error: "Invalid OpenAI API Key. Please check your key in .env or Settings.", medicines: [] };
          }
          if (res.status === 429) {
            const isCreditsExhausted = detail.includes("insufficient_quota") || detail.includes("credit_balance_exhausted");
            if (isCreditsExhausted) {
              return {
                ok: false,
                error: "OpenAI Credits Exhausted (429): Your OpenAI account has no credits remaining. Please add credits at https://platform.openai.com/settings/organization/billing/ or use a free Google Gemini API Key in the AI API Key settings.",
                medicines: [],
              };
            }
            return { ok: false, error: "OpenAI rate limit reached. Please wait a few seconds and try again.", medicines: [] };
          }
          if (res.status === 400) {
            return { ok: false, error: `Bad request to OpenAI (400). The image may be too large or in an unsupported format. ${detail.slice(0, 150)}`, medicines: [] };
          }
          if (res.status === 404) {
            return { ok: false, error: `Model "${modelName}" not found. Your API key may not have access to this model. Try adding OPENAI_MODEL=gpt-4o-mini in .env.local`, medicines: [] };
          }
          return { ok: false, error: `Could not read photo (${res.status}): ${detail.slice(0, 200)}`, medicines: [] };
        }

        const json = (await res.json()) as any;
        const rawContent = json?.choices?.[0]?.message?.content ?? "{}";
        console.log(`[Vision] OpenAI raw response length: ${rawContent.length} chars`);
        const cleanContent = rawContent.replace(/```[a-z]*\n?/gi, "").trim();

        let parsed: any;
        try {
          parsed = JSON.parse(cleanContent);
        } catch {
          // Try to extract array from malformed response
          const arrMatch = cleanContent.match(/\[[\s\S]*\]/);
          if (arrMatch) {
            parsed = JSON.parse(arrMatch[0]);
          } else {
            console.error("[Vision] Failed to parse response:", cleanContent.slice(0, 300));
            return { ok: false, error: "AI returned invalid data format. Please try again.", medicines: [] };
          }
        }

        const list = Array.isArray(parsed) ? parsed : parsed.medicines || parsed.items || [];

        return {
          ok: true,
          error: "",
          medicines: list.map((item: any) => ({
            name: String(item.name || "").trim(),
            supplier: String(item.supplier || "").trim(),
            invoiceNo: String(item.invoiceNo || item.invoice_no || item.invoice || "").trim(),
            company: String(item.company || item.mfr || "").trim(),
            type: String(item.type || "").trim(),
            category: String(item.category || "").trim(),
            hsn: String(item.hsn || "").trim(),
            batch: String(item.batch || "").trim(),
            expiry: String(item.expiry || "").trim(),
            mrp: Number(item.mrp) || 0,
            cost: Number(item.cost || item.purchase || item.rate) || 0,
            gst: Number(item.gst) || 5,
            pack: String(item.pack || "").trim(),
            stock: Number(item.stock || item.qty || item.quantity) || 1,
            confidence: String(item.confidence || "OK · 98%"),
          })),
        };
      }
    } catch (err: any) {
      return {
        ok: false,
        error: `Vision scanning failed: ${err?.message || String(err)}`,
        medicines: [],
      };
    }
  });

/** Legacy server function preserved for backward compatibility */
export const extractRowsFromImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => legacySchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["AI_API_KEY"] || process.env["OPENAI_API_KEY"];
    if (!key) return { ok: false as const, error: "AI is not configured.", tsv: "" };

    const header = data.columns.map((c) => c.label).join("\t");
    const prompt =
      `You are reading a photo of a product/medicine purchase bill, invoice or packaging.\n` +
      `Extract every product row you can read.\n` +
      `Reply with TAB separated values ONLY, no markdown, no commentary.\n` +
      `First line must be exactly this header:\n${header}\n` +
      `Then one line per product with the same number of tab separated columns.\n` +
      `Use empty string when a value is not visible. Numbers must be plain digits. Expiry format YYYY-MM.`;

    const gatewayUrl = process.env["AI_GATEWAY_URL"] || "https://api.openai.com/v1/chat/completions";
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) return { ok: false as const, error: "Too many requests — try again in a minute.", tsv: "" };
      if (res.status === 402) return { ok: false as const, error: "AI credits exhausted.", tsv: "" };
      return { ok: false as const, error: `Could not read the photo (${res.status}). ${detail.slice(0, 120)}`, tsv: "" };
    }

    const json = (await res.json()) as any;
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const tsv = raw.replace(/```[a-z]*\n?/gi, "").trim();
    if (!tsv) return { ok: false as const, error: "No products found in the photo.", tsv: "" };
    return { ok: true as const, error: "", tsv };
  });
