import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type BarcodeProduct = {
  barcode: string;
  name: string;
  brand: string;
  description: string;
  category: string;
  image: string;
  unit: string;
  mrp: number;
  source: string;
};

type R = { ok: boolean; found: boolean; error: string; product: BarcodeProduct | null };

/** Pulls a size/unit such as "50g", "100 ml", "10 Tablets" from a product title. */
export function parseUnit(text: string): string {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(ml|l|ltr|gm|g|kg|mg|mcg|tablets?|tabs?|capsules?|caps?|strips?|bottles?)\b/i);
  if (!m) return "";
  const u = m[2].toLowerCase().replace(/^tabs?$/, "Tablets").replace(/^caps?$/, "Capsules");
  return `${m[1]}${u}`;
}

async function upcItemDb(code: string): Promise<R | null> {
  const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, { headers: { Accept: "application/json" } });
  if (res.status === 429) return { ok: false, found: false, error: "Daily free lookup limit reached.", product: null };
  if (!res.ok) return null;
  const json: any = await res.json();
  const it = json?.items?.[0];
  if (!it) return null;
  const brand = String(it.brand ?? "");
  // UPCitemdb titles are often SEO-stuffed ("Ayurvedic Azadirachta Indica 50gm Purifying Neem
  // Scrub 4 Dead Skin Blackhead"). Prefer the shortest clean variation: title, description
  // first line, or offer titles — keep the one that starts with the brand when possible.
  const candidates = [String(it.title ?? ""), String(it.description ?? "").split("\n")[0],
    ...(it.offers ?? []).map((o: any) => String(o.title ?? ""))].filter((s) => s.length > 3);
  let title = candidates.sort((a, b) => a.length - b.length)[0] ?? "";
  const branded = candidates.filter((c) => brand && c.toLowerCase().includes(brand.toLowerCase()));
  if (branded.length) title = branded.sort((a, b) => a.length - b.length)[0];
  let name = title;
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase())) name = name.slice(brand.length).trim();
  // MRP: prefer an INR offer price; fall back to any positive offer price.
  const offers = (it.offers ?? []).filter((o: any) => Number(o.price) > 0);
  const inr = offers.find((o: any) => String(o.currency).toUpperCase() === "INR") ?? offers[0];
  return {
    ok: true, found: true, error: "",
    product: {
      barcode: code, name: name || title, brand,
      description: String(it.description ?? ""),
      category: String(it.category ?? "").split(">").pop()?.trim() ?? "",
      image: String(it.images?.[0] ?? ""),
      unit: parseUnit(`${title} ${it.size ?? ""}`),
      mrp: inr ? Number(inr.price) : 0,
      source: "UPCitemdb",
    },
  };
}

async function openFacts(code: string, host: string, label: string): Promise<R | null> {
  const res = await fetch(`https://${host}/api/v2/product/${code}.json`, { headers: { "User-Agent": "RSPBilling/1.0" } });
  if (!res.ok) return null;
  const j: any = await res.json();
  const p = j?.product;
  if (!j?.status || !p?.product_name) return null;
  return {
    ok: true, found: true, error: "",
    product: {
      barcode: code, name: String(p.product_name), brand: String(p.brands ?? "").split(",")[0].trim(),
      description: "", category: String(p.categories ?? "").split(",").pop()?.trim() ?? "",
      image: String(p.image_url ?? ""), unit: parseUnit(String(p.quantity ?? "")) || String(p.quantity ?? ""),
      mrp: 0, source: label,
    },
  };
}

/** Looks up a barcode in free public databases. Never invents data. */
export const lookupBarcode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().trim().regex(/^\d{6,14}$/) }).parse(d))
  .handler(async ({ data }): Promise<R> => {
    let limitErr = "";
    let best: BarcodeProduct | null = null;
    for (const fn of [
      () => upcItemDb(data.code),
      () => openFacts(data.code, "world.openbeautyfacts.org", "Open Beauty Facts"),
      () => openFacts(data.code, "world.openfoodfacts.org", "Open Food Facts"),
    ]) {
      try {
        const r = await fn();
        if (r?.found && r.product) {
          // First hit with a price wins outright; otherwise merge fields from
          // later sources into the first hit so MRP/unit/brand fill in when any source has them.
          if (!best) best = r.product;
          else {
            best.mrp = best.mrp || r.product.mrp;
            best.unit = best.unit || r.product.unit;
            best.brand = best.brand || r.product.brand;
            best.category = best.category || r.product.category;
            best.image = best.image || r.product.image;
          }
          if (best.mrp > 0) return { ok: true, found: true, error: "", product: best };
        }
        if (r && !r.ok) limitErr = r.error;
      } catch (e) { console.error("barcode lookup step failed", e); }
    }
    if (best) return { ok: true, found: true, error: "", product: best };
    return { ok: true, found: false, error: limitErr, product: null };
  });
