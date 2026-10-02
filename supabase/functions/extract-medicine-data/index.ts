// Supabase Edge Function: extract-medicine-data
// Secure, server-side AI medicine & invoice image extraction.
// The AI provider API key is stored ONLY in Supabase Edge Function Secrets (AI_API_KEY).
// It is NEVER sent to or visible in the frontend.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExtractedItem {
  medicine_name: string;
  manufacturer: string;
  composition: string;
  drug_name?: string;
  type: string;
  hsn: string | null;
  hsn_code: string | null;
  pack: string;
  pack_size: string;
  batch: string;
  batch_number: string;
  expiry: string;
  expiry_date: string;
  mrp: number | null;
  purchase_price: number | null;
  cost?: number | null;
  gst: number | null;
  gst_percentage: number | null;
  quantity: number | null;
  stock?: number | null;
  unit: string;
  barcode: string;
  confidence: number;
  notes: string;
}

interface ExtractedInvoice {
  supplier: string;
  supplier_name: string;
  invoice_no: string;
  invoice_number: string;
  supplier_date: string;
  invoice_date: string;
  items: ExtractedItem[];
}

const SYSTEM_PROMPT = `You are an expert pharmacy invoice and medicine packaging OCR specialist.
You are analyzing wholesale distributor purchase invoices, retail bills, medicine boxes, strips, or bottles.

CRITICAL INSTRUCTIONS:
1. Extract ALL distinct invoices and their medicine product line items.
2. DO NOT guess or invent information. If a field is not visible in the image, return null or empty string "".
3. Especially DO NOT invent HSN codes, GST percentages, Batch numbers, Expiry dates, MRP, or Purchase prices.
4. Extract invoice-level headers: supplier_name (distributor/seller), invoice_number, and invoice_date.
5. If HSN is not visible, set "hsn_code": null, "hsn": null.
6. If GST is not visible, set "gst_percentage": null, "gst": null.
7. Extract active medicine composition as "composition" and "drug_name".
8. Normalize expiry date to "YYYY-MM" format where visible (e.g. "08/27" -> "2027-08", "AUG-27" -> "2027-08").
9. Keep manufacturer (MFR) abbreviation verbatim as printed in the bill (e.g. "ATO", "APE", "ARI", "FDC", "GLE", "SUN", "CIPLA").
10. Group all medicine items under their respective invoice header.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact structure:
{
  "invoices": [
    {
      "supplier_name": "Distributor/stockist name printed on header",
      "supplier": "Distributor/stockist name printed on header",
      "invoice_number": "Invoice or bill number",
      "invoice_no": "Invoice or bill number",
      "invoice_date": "Date on invoice (e.g. DD/MM/YYYY)",
      "supplier_date": "Date on invoice (e.g. DD/MM/YYYY)",
      "items": [
        {
          "medicine_name": "Brand / medicine trade name",
          "manufacturer": "Short MFR code or company name",
          "composition": "Active generic drug name or composition (e.g. ACECLOFENAC + PARACETAMOL)",
          "drug_name": "Active generic drug name or composition",
          "type": "Form (e.g. Tablet, Syrup, Capsule, Injection)",
          "hsn_code": "4/6/8-digit HSN code or null if absent",
          "hsn": "4/6/8-digit HSN code or null if absent",
          "pack_size": "Packaging (e.g. 10x10, 60ML, 10s)",
          "pack": "Packaging (e.g. 10x10, 60ML, 10s)",
          "batch_number": "Batch or Lot number",
          "batch": "Batch or Lot number",
          "expiry_date": "YYYY-MM format",
          "expiry": "YYYY-MM format",
          "mrp": 201.56,
          "purchase_price": 170.00,
          "gst_percentage": 5,
          "gst": 5,
          "quantity": 10,
          "unit": "Strip or Tablet or Bottle",
          "barcode": "",
          "confidence": 95,
          "notes": ""
        }
      ]
    }
  ]
}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS = [1500, 3000, 6000];

async function callGeminiWithRetries(
  modelName: string,
  apiKey: string,
  payload: any,
  isFallback = false
): Promise<{ ok: boolean; status: number; text: string; json?: any }> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const attempts = [0, ...RETRY_DELAYS];
  if (isFallback) {
    // Limited retries for fallback model (immediate, 1500ms, 3000ms)
    attempts.length = 3;
  }

  let lastStatus = 0;
  let lastErrorText = "";

  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) {
      const delayMs = attempts[i];
      console.log(`Retrying Gemini request in ${delayMs}ms`);
      await sleep(delayMs);
    }

    if (i === 0) {
      console.log(`Trying model: ${modelName}`);
    }

    try {
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      lastStatus = res.status;

      if (isFallback) {
        console.log(`Fallback model response status: ${res.status}`);
      } else {
        console.log(`Gemini response status: ${res.status}`);
      }

      if (res.ok) {
        const json = await res.json().catch(() => null);
        return { ok: true, status: res.status, text: "", json };
      }

      lastErrorText = await res.text().catch(() => "");

      // If it's a permanent client error (e.g. 400 Bad Request, 401, 403), stop retrying
      if (!TRANSIENT_STATUSES.has(res.status)) {
        return { ok: false, status: res.status, text: lastErrorText };
      }
    } catch (networkErr: any) {
      lastStatus = 503;
      lastErrorText = networkErr?.message || "Network error connecting to Gemini";
      console.error(`Gemini connection error on attempt ${i + 1}:`, lastErrorText);
    }
  }

  return { ok: false, status: lastStatus, text: lastErrorText };
}

serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        ok: false,
        error: "Method not allowed. Use POST.",
        stage: "validation",
      }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 2. Read and validate request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({
          success: false,
          ok: false,
          error: "Invalid JSON in request payload.",
          stage: "validation",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read Secret API key securely on server (never exposed to client)
    const apiKey =
      Deno.env.get("AI_API_KEY") ||
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("OPENAI_API_KEY");

    if (!apiKey || apiKey.trim() === "") {
      return new Response(
        JSON.stringify({
          success: false,
          ok: false,
          error: "AI_API_KEY secret is not configured in Supabase Edge Function Secrets.",
          stage: "validation",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Diagnostic mode: if request includes "diagnostic": true, run lightweight Gemini model checks
    if (body?.diagnostic === true) {
      const modelsToTest = ["gemini-2.5-flash", "gemini-3.8-flash"];
      const diagnostics = [];
      for (const model of modelsToTest) {
        const payload = {
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { responseMimeType: "application/json" },
        };
        const result = await callGeminiWithRetries(model, apiKey, payload, false);
        const providerStatus = result.ok ? "OK" : "ERROR";
        let providerMessage = "";
        if (!result.ok) {
          try {
            const errJson = JSON.parse(result.text);
            providerMessage = errJson?.error?.message ?? "";
          } catch {}
        }
        console.log(`Model: ${model}\nStatus: ${result.status}\nProvider status: ${providerStatus}\nProvider message: ${providerMessage}`);
        diagnostics.push({ model, status: result.status, providerStatus, providerMessage });
      }
      return new Response(
        JSON.stringify({ success: true, diagnostics }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image } = body;
    const tenantId = body.tenantId || body.tenant_id;

    // Reject only if image or tenantId is genuinely missing
    if (!image || typeof image !== "string" || image.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          ok: false,
          error: "Missing image data in request payload.",
          stage: "validation",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenantId || typeof tenantId !== "string" || tenantId.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          ok: false,
          error: "Tenant ID is required.",
          stage: "validation",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Extract MIME type and base64 data dynamically (JPEG, PNG, WEBP, etc.)
    let mimeType = "image/jpeg";
    let base64Data = "";
    const trimmedImage = image.trim();

    if (trimmedImage.startsWith("data:")) {
      const commaIdx = trimmedImage.indexOf(",");
      if (commaIdx !== -1) {
        const header = trimmedImage.slice(0, commaIdx);
        base64Data = trimmedImage.slice(commaIdx + 1).replace(/\s/g, "");
        const mimeMatch = header.match(/^data:([^;]+);/i);
        if (mimeMatch && mimeMatch[1]) {
          mimeType = mimeMatch[1].trim().toLowerCase();
        }
      } else {
        base64Data = trimmedImage.replace(/\s/g, "");
      }
    } else {
      base64Data = trimmedImage.replace(/\s/g, "");
    }

    if (!base64Data || base64Data.length < 20) {
      return new Response(
        JSON.stringify({
          success: false,
          ok: false,
          error: "Invalid image data: base64 payload is missing or too short.",
          stage: "validation",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (base64Data.length > 20 * 1024 * 1024) {
      return new Response(
        JSON.stringify({
          success: false,
          ok: false,
          error: "Image size exceeds maximum limit (15MB).",
          stage: "validation",
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedResponse: any = null;



    // 5. Route to AI Provider (Gemini / OpenAI)
    if (apiKey.startsWith("AIza") || !apiKey.startsWith("sk-")) {
      // ── Google Gemini Provider ─────────────────────────────────────────────
      console.log("Starting Gemini image extraction");

      const geminiPayload = {
        contents: [
          {
            parts: [
              { text: `${SYSTEM_PROMPT}\nExtract medicine items and invoices strictly as JSON.` },
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
          responseMimeType: "application/json",
        },
      };

      const primaryModel = "gemini-3.8-flash";
      const fallbackModel = "gemini-3.7-flash";

      // Attempt 1 to 4 with primary model
      let geminiResult = await callGeminiWithRetries(primaryModel, apiKey, geminiPayload, false);

      // If primary model failed due to high demand (503) or transient issues, try fallback model
      if (!geminiResult.ok && TRANSIENT_STATUSES.has(geminiResult.status)) {
        console.log(`Primary model unavailable, trying fallback model: ${fallbackModel}`);
        geminiResult = await callGeminiWithRetries(fallbackModel, apiKey, geminiPayload, true);
      }

      if (!geminiResult.ok) {
        // Safe error response formatting
        if (geminiResult.status === 503 || TRANSIENT_STATUSES.has(geminiResult.status)) {
          console.error("Medicine extraction failed: AI service high demand after retries");
          return new Response(
            JSON.stringify({
              success: false,
              ok: false,
              error: "AI service is temporarily busy. Please try again in a moment.",
              stage: "gemini_request",
            }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let safeError = `Gemini API request failed (HTTP ${geminiResult.status})`;
        try {
          const parsedErr = JSON.parse(geminiResult.text);
          const geminiMsg = parsedErr?.error?.message;
          if (geminiMsg && typeof geminiMsg === "string") {
            const sanitized = geminiMsg.replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]");
            safeError = `Gemini API returned HTTP ${geminiResult.status}: ${sanitized}`;
          }
        } catch {
          // ignore
        }

        console.error("Medicine extraction failed", {
          stage: "gemini_request",
          status: geminiResult.status,
        });

        return new Response(
          JSON.stringify({
            success: false,
            ok: false,
            error: safeError,
            stage: "gemini_request",
          }),
          { status: geminiResult.status >= 400 && geminiResult.status < 500 ? 400 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const geminiJson = geminiResult.json;
      const candidate = geminiJson?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const rawText = candidate?.content?.parts?.[0]?.text;

      if (!rawText || typeof rawText !== "string" || rawText.trim() === "") {
        console.error("Medicine extraction failed", {
          stage: "gemini_response",
          finishReason,
        });
        return new Response(
          JSON.stringify({
            success: false,
            ok: false,
            error: finishReason
              ? `Gemini returned no extraction result (Finish reason: ${finishReason})`
              : "Gemini returned no extraction result",
            stage: "gemini_response",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Robust JSON Parsing
      try {
        let cleanText = rawText.trim();
        if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        }
        const firstBrace = cleanText.indexOf("{");
        const firstBracket = cleanText.indexOf("[");
        let startIdx = -1;
        let endIdx = -1;

        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
          startIdx = firstBrace;
          endIdx = cleanText.lastIndexOf("}");
        } else if (firstBracket !== -1) {
          startIdx = firstBracket;
          endIdx = cleanText.lastIndexOf("]");
        }

        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          cleanText = cleanText.slice(startIdx, endIdx + 1);
        }

        parsedResponse = JSON.parse(cleanText);
      } catch (parseErr: any) {
        console.error("Medicine extraction failed", {
          stage: "json_parse",
          error: parseErr?.message,
        });
        return new Response(
          JSON.stringify({
            success: false,
            ok: false,
            error: "Failed to parse structured medicine data from AI response.",
            stage: "json_parse",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // ── OpenAI Provider Fallback ───────────────────────────────────────────
      const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all supplier invoices and medicine items visible in this image.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: trimmedImage.startsWith("data:") ? trimmedImage : `data:${mimeType};base64,${base64Data}`,
                    detail: "high",
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!openaiRes.ok) {
        console.error("Medicine extraction failed", {
          stage: "gemini_request",
          status: openaiRes?.status,
        });
        return new Response(
          JSON.stringify({
            success: false,
            ok: false,
            error: `OpenAI API returned error (HTTP ${openaiRes.status}).`,
            stage: "gemini_request",
          }),
          { status: openaiRes.status === 429 ? 429 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const openaiJson = await openaiRes.json();
      const rawText = openaiJson?.choices?.[0]?.message?.content || "{}";
      try {
        parsedResponse = JSON.parse(rawText.replace(/```json\n?|```/g, "").trim());
      } catch (parseErr: any) {
        console.error("Medicine extraction failed", {
          stage: "json_parse",
          error: parseErr?.message,
        });
        return new Response(
          JSON.stringify({
            success: false,
            ok: false,
            error: "Failed to parse structured medicine data from AI response.",
            stage: "json_parse",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Sanitize and Validate AI Response
    const rawInvoices = Array.isArray(parsedResponse?.invoices)
      ? parsedResponse!.invoices
      : Array.isArray(parsedResponse)
      ? [{ supplier: "", supplier_name: "", invoice_no: "", invoice_number: "", supplier_date: "", invoice_date: "", items: parsedResponse }]
      : [];

    const sanitizedInvoices: ExtractedInvoice[] = rawInvoices.map((inv: any) => {
      const supplierName = String(inv.supplier_name || inv.supplier || "").trim();
      const invoiceNumber = String(inv.invoice_number || inv.invoice_no || inv.invoiceNo || "").trim();
      const invoiceDate = String(inv.invoice_date || inv.supplier_date || inv.supplierDate || "").trim();

      return {
        supplier: supplierName,
        supplier_name: supplierName,
        invoice_no: invoiceNumber,
        invoice_number: invoiceNumber,
        supplier_date: invoiceDate,
        invoice_date: invoiceDate,
        items: Array.isArray(inv.items)
          ? inv.items.map((it: any) => {
              const medName = String(it.medicine_name || it.name || "").trim();
              const mfr = String(it.manufacturer || it.company || it.mfr || "").trim();
              const comp = String(it.composition || it.drug_name || it.drugName || "").trim();
              const batchNo = String(it.batch_number || it.batch || "").trim();
              const expDate = String(it.expiry_date || it.expiry || "").trim();
              const rawHsn = it.hsn_code || it.hsn;
              const hsnCode = rawHsn ? String(rawHsn).replace(/[^0-9]/g, "") : null;
              const packSize = String(it.pack_size || it.pack || "10's").trim();
              const rawMrp = it.mrp !== null && it.mrp !== undefined && !isNaN(Number(it.mrp)) ? Number(it.mrp) : null;
              const rawCost =
                it.purchase_price !== null && it.purchase_price !== undefined && !isNaN(Number(it.purchase_price))
                  ? Number(it.purchase_price)
                  : it.cost !== null && it.cost !== undefined && !isNaN(Number(it.cost))
                  ? Number(it.cost)
                  : null;
              const rawGst =
                it.gst_percentage !== null && it.gst_percentage !== undefined && !isNaN(Number(it.gst_percentage))
                  ? Number(it.gst_percentage)
                  : it.gst !== null && it.gst !== undefined && !isNaN(Number(it.gst))
                  ? Number(it.gst)
                  : null;
              const rawQty =
                it.quantity !== null && it.quantity !== undefined && !isNaN(Number(it.quantity))
                  ? Number(it.quantity)
                  : it.stock !== null && it.stock !== undefined && !isNaN(Number(it.stock))
                  ? Number(it.stock)
                  : null;

              return {
                medicine_name: medName,
                manufacturer: mfr,
                composition: comp,
                drug_name: comp,
                type: String(it.type || "Tablet").trim(),
                hsn: hsnCode,
                hsn_code: hsnCode,
                pack: packSize,
                pack_size: packSize,
                batch: batchNo,
                batch_number: batchNo,
                expiry: expDate,
                expiry_date: expDate,
                mrp: rawMrp,
                purchase_price: rawCost,
                cost: rawCost,
                gst: rawGst,
                gst_percentage: rawGst,
                quantity: rawQty,
                stock: rawQty,
                unit: String(it.unit || it.type || "Tablet").trim(),
                barcode: String(it.barcode || "").trim(),
                confidence: typeof it.confidence === "number" ? it.confidence : 95,
                notes: String(it.notes || "").trim(),
              };
            })
          : [],
      };
    });

    const firstInvoice = sanitizedInvoices[0] || {
      supplier: "",
      supplier_name: "",
      invoice_no: "",
      invoice_number: "",
      supplier_date: "",
      invoice_date: "",
      items: [],
    };

    const firstItem = firstInvoice.items?.[0] || {
      medicine_name: "",
      manufacturer: "",
      composition: "",
      drug_name: "",
      batch_number: "",
      batch: "",
      mrp: null,
      pack_size: "",
      pack: "",
      expiry_date: "",
      expiry: "",
      hsn_code: null,
      hsn: null,
      gst_percentage: null,
      gst: null,
      barcode: "",
      confidence: 0,
      notes: "",
    };

    const allItems = sanitizedInvoices.flatMap((inv) => inv.items);

    const responseData = {
      // Invoice-level fields
      invoice_number: firstInvoice.invoice_number || firstInvoice.invoice_no,
      invoice_no: firstInvoice.invoice_number || firstInvoice.invoice_no,
      invoice_date: firstInvoice.invoice_date || firstInvoice.supplier_date,
      supplier_date: firstInvoice.invoice_date || firstInvoice.supplier_date,
      supplier_name: firstInvoice.supplier_name || firstInvoice.supplier,
      supplier: firstInvoice.supplier_name || firstInvoice.supplier,

      // Primary medicine item fields
      medicine_name: firstItem.medicine_name,
      manufacturer: firstItem.manufacturer,
      composition: firstItem.composition,
      batch_number: firstItem.batch_number,
      mrp: firstItem.mrp,
      pack_size: firstItem.pack_size,
      expiry_date: firstItem.expiry_date,
      hsn_code: firstItem.hsn_code,
      gst_percentage: firstItem.gst_percentage,
      barcode: firstItem.barcode,
      confidence: firstItem.confidence,
      notes: firstItem.notes,

      // Multiple medicine items
      items: allItems,

      // Invoices
      invoices: sanitizedInvoices,
    };

    console.log("Extraction completed");

    return new Response(
      JSON.stringify({
        success: true,
        ok: true,
        data: responseData,
        invoices: sanitizedInvoices,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const errorMsg = (err?.message || String(err) || "Unknown error").replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]");
    console.error("Medicine extraction failed", {
      stage: "unhandled",
      error: errorMsg,
    });
    return new Response(
      JSON.stringify({
        success: false,
        ok: false,
        error: `AI extraction error: ${errorMsg}`,
        stage: "unhandled",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
