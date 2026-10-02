import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  /** One or more photos (data URLs) of purchase bills / invoices / strips / boxes. */
  images: z.array(z.string().min(20)).min(1).max(12),
});

export type ExtractedRow = {
  name: string;
  /** Supplier / stockist firm that issued the bill. */
  company: string;
  /** Tax invoice / bill number printed on the bill. */
  invoice: string;
  mfr: string;
  type: string;
  category: string;
  hsn: string;
  batch: string;
  expiry: string;
  mrp: number;
  purchase: number;
  gst: number;
  pack: string;
  stock: number;
  confidence: number;
  notes: string;
};

const PROMPT =
  `You are an expert pharmacy data-entry assistant reading photos of medicine purchase invoices, ` +
  `stockist bills, medicine boxes and strips. Images may be low quality, rotated, skewed or small-printed.\n` +
  `Read EVERY distinct medicine line from ALL images and merge them into one list. One object per medicine batch line.\n` +
  `Invoice layouts vary — never assume a fixed column order; map by column header text and value shape.\n\n` +
  `Fields per row:\n` +
  `- name: item description exactly as printed (strip trailing pack info if it is a separate column).\n` +
  `- company: the SUPPLIER / stockist firm that ISSUED the bill — the seller name printed at the TOP of the invoice ` +
  `(e.g. "AMBIKAA MEDINEEDS"). It is the same for every row of one bill. Never put the medicine's manufacturer here. ` +
  `If the photo is only a strip/box with no bill, leave "".\n` +
  `- invoice: the tax invoice / bill number printed on the bill (e.g. "2600073008278"). Same for every row of one bill; "" if not visible.\n` +
  `- mfr: the SHORT manufacturer code exactly as printed on the bill (e.g. SUN, CIP, LUP, ATO). Never expand or invent it.\n` +
  `- type: dosage form if visible (Tablet, Capsule, Syrup, Injection, Ointment, Drops) else "".\n` +
  `- category: therapeutic category only if printed, else "".\n` +
  `- hsn: HSN/SAC digits (e.g. 30049099). IMPORTANT. If not clearly visible leave "" — never guess.\n` +
  `- batch: batch number exactly as printed.\n` +
  `- expiry: normalise to YYYY-MM. MM-YY or MM/YY means 20YY-MM.\n` +
  `- mrp: M.R.P. number.\n` +
  `- purchase: trade/purchase/rate per unit if shown, else 0.\n` +
  `- gst: total GST % (CGST + SGST added, e.g. 2.5+2.5 = 5). 0 if not visible.\n` +
  `- pack: pack size e.g. "10x10", "1x15", "100ml".\n` +
  `- stock: billed quantity (+ free quantity if shown), else 0.\n` +
  `- confidence: 0-100 how sure you are about this whole row.\n` +
  `- notes: short warning about any unreadable/uncertain field, else "".\n\n` +
  `Reply with STRICT JSON only, no markdown fence, no commentary: ` +
  `{"rows":[{"name":"","company":"","invoice":"","mfr":"","type":"","category":"","hsn":"","batch":"","expiry":"","mrp":0,"purchase":0,"gst":0,"pack":"","stock":0,"confidence":0,"notes":""}]}`;

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return String(v ?? "").trim();
}

/** Extract medicine rows out of photos (bill / invoice / strip / box) using AI vision. */
export const extractRowsFromImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, error: "AI is not configured.", rows: [] as ExtractedRow[] };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              ...data.images.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) return { ok: false as const, error: "Too many requests — try again in a minute.", rows: [] };
      if (res.status === 402) return { ok: false as const, error: "AI credits exhausted — top up to keep scanning.", rows: [] };
      return { ok: false as const, error: `Could not read the photos (${res.status}). ${detail.slice(0, 120)}`, rows: [] };
    }

    const json = (await res.json()) as any;
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const clean = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const m = clean.match(/\{[\s\S]*\}/);
      try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    }
    const list: any[] = Array.isArray(parsed?.rows) ? parsed.rows : Array.isArray(parsed) ? parsed : [];
    const rows: ExtractedRow[] = list
      .map((r) => ({
        name: str(r.name),
        company: str(r.company),
        invoice: str(r.invoice),
        mfr: str(r.mfr),
        type: str(r.type),
        category: str(r.category),
        hsn: str(r.hsn).replace(/[^0-9]/g, ""),
        batch: str(r.batch),
        expiry: str(r.expiry),
        mrp: num(r.mrp),
        purchase: num(r.purchase),
        gst: num(r.gst),
        pack: str(r.pack),
        stock: num(r.stock),
        confidence: Math.max(0, Math.min(100, num(r.confidence) || 70)),
        notes: str(r.notes),
      }))
      .filter((r) => r.name);

    if (rows.length === 0) return { ok: false as const, error: "No medicines found in those photos.", rows: [] };
    return { ok: true as const, error: "", rows };
  });
