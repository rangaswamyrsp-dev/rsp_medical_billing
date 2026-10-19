// ── Barcode & QR Label Printing Engine & Preset Configurations ───────────────
import { code128Rects } from "@/lib/code128";
import type { Medicine } from "@/lib/store";

export type LabelPresetKey =
  | "roll-38x25-1" // 38mm x 25mm 1 Across (Thermal Roll)
  | "roll-38x25-2" // 38mm x 25mm 2 Across (Dual Roll)
  | "roll-50x25-1" // 50mm x 25mm 1 Across (Thermal Roll)
  | "roll-50x38-1" // 50mm x 38mm 1 Across (Large Thermal Roll)
  | "a4-24"        // A4 Sheet - 24 labels (3x8)
  | "a4-40"        // A4 Sheet - 40 labels (4x10)
  | "a4-65"        // A4 Sheet - 65 labels (5x13)
  | "custom";      // User Defined

export type BarcodeLabelSettings = {
  preset: LabelPresetKey;
  widthMm: number;
  heightMm: number;
  columns: number;
  gapMm: number;
  marginMm: number;
  barcodeType: "code128" | "qr";
  showStoreName: boolean;
  customStoreName: string;
  showMedicineName: boolean;
  showBatch: boolean;
  showExpiry: boolean;
  showMrp: boolean;
  showPacking: boolean;
  showCodeText: boolean;
  fontSize: "sm" | "md" | "lg";
  barcodeHeightMm: number;
};

export type PresetMeta = {
  key: LabelPresetKey;
  name: string;
  category: "Thermal Roll" | "A4 Sticker Sheet" | "Custom";
  widthMm: number;
  heightMm: number;
  columns: number;
  gapMm: number;
  marginMm: number;
  description: string;
};

export const LABEL_PRESETS: PresetMeta[] = [
  {
    key: "roll-38x25-1",
    name: "38mm × 25mm (Single Roll)",
    category: "Thermal Roll",
    widthMm: 38,
    heightMm: 25,
    columns: 1,
    gapMm: 2,
    marginMm: 1,
    description: "Standard pharmacy thermal roll for small medicine boxes & strips (TSC, Zebra, Xprinter)",
  },
  {
    key: "roll-38x25-2",
    name: "38mm × 25mm (Dual Roll · 2-Across)",
    category: "Thermal Roll",
    widthMm: 38,
    heightMm: 25,
    columns: 2,
    gapMm: 2,
    marginMm: 1,
    description: "Two labels side-by-side on wide continuous thermal roll",
  },
  {
    key: "roll-50x25-1",
    name: "50mm × 25mm (Retail Roll)",
    category: "Thermal Roll",
    widthMm: 50,
    heightMm: 25,
    columns: 1,
    gapMm: 2,
    marginMm: 1.5,
    description: "Retail standard single label roll with clear MRP and Batch details",
  },
  {
    key: "roll-50x38-1",
    name: "50mm × 38mm (Large Roll)",
    category: "Thermal Roll",
    widthMm: 50,
    heightMm: 38,
    columns: 1,
    gapMm: 3,
    marginMm: 2,
    description: "Spacious label with room for medicine name, composition, batch, expiry & MRP",
  },
  {
    key: "a4-24",
    name: "A4 Sheet · 24 Labels (3 × 8)",
    category: "A4 Sticker Sheet",
    widthMm: 64,
    heightMm: 33.8,
    columns: 3,
    gapMm: 2,
    marginMm: 5,
    description: "Standard pre-cut A4 sticker sheet for laser and inkjet printers (24 per sheet)",
  },
  {
    key: "a4-40",
    name: "A4 Sheet · 40 Labels (4 × 10)",
    category: "A4 Sticker Sheet",
    widthMm: 48.5,
    heightMm: 25.4,
    columns: 4,
    gapMm: 1.5,
    marginMm: 4,
    description: "Compact 40-per-page A4 sticker sheet",
  },
  {
    key: "a4-65",
    name: "A4 Sheet · 65 Labels (5 × 13)",
    category: "A4 Sticker Sheet",
    widthMm: 38.1,
    heightMm: 21.2,
    columns: 5,
    gapMm: 1,
    marginMm: 3,
    description: "High-density mini labels for ampoules, vials, and small blister strips",
  },
  {
    key: "custom",
    name: "Custom Dimensions",
    category: "Custom",
    widthMm: 50,
    heightMm: 25,
    columns: 1,
    gapMm: 2,
    marginMm: 1,
    description: "Enter your own label width, height, columns, and margins",
  },
];

export const DEFAULT_BARCODE_LABEL_SETTINGS: BarcodeLabelSettings = {
  preset: "roll-50x25-1",
  widthMm: 50,
  heightMm: 25,
  columns: 1,
  gapMm: 2,
  marginMm: 1.5,
  barcodeType: "code128",
  showStoreName: true,
  customStoreName: "",
  showMedicineName: true,
  showBatch: true,
  showExpiry: true,
  showMrp: true,
  showPacking: true,
  showCodeText: true,
  fontSize: "md",
  barcodeHeightMm: 8,
};

const STORAGE_KEY = "rsp_barcode_label_settings_v1";

export function loadBarcodeSettings(): BarcodeLabelSettings {
  if (typeof window === "undefined") return DEFAULT_BARCODE_LABEL_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BARCODE_LABEL_SETTINGS;
    return { ...DEFAULT_BARCODE_LABEL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BARCODE_LABEL_SETTINGS;
  }
}

export function saveBarcodeSettings(settings: BarcodeLabelSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

/**
 * Builds HTML for an individual label box based on current settings and medicine details.
 */
export function buildSingleLabelHtml(
  m: Medicine,
  s: BarcodeLabelSettings,
  defaultStoreName: string,
  shopId = "T001",
): string {
  const store = (s.customStoreName.trim() || defaultStoreName || "MEDICAL STORE").toUpperCase();
  const medId = m.code || m.id || "MED0001";
  const bHeight = s.barcodeHeightMm || 8;

  // Typography scaling
  const fontClass =
    s.fontSize === "sm" ? "font-sm" : s.fontSize === "lg" ? "font-lg" : "font-md";

  // Barcode / QR rendering
  let codeGraphic = "";
  if (s.barcodeType === "qr") {
    // Secure QR payload containing shop ID, medicine ID, and exact batch
    const lookupPath = `/medicine-lookup?shop=${encodeURIComponent(shopId)}&med=${encodeURIComponent(medId)}&batch=${encodeURIComponent(m.batch || "")}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&qzone=2&data=${encodeURIComponent(lookupPath)}`;
    codeGraphic = `
      <div class="qr-block">
        <div class="qr-wrap">
          <img src="${qrSrc}" alt="QR" class="qr-img" />
        </div>
        ${s.showCodeText ? `<div class="lbl-med-id font-bold">${medId}</div>` : ""}
      </div>
    `;
  } else {
    // Crisp Code 128 SVG
    const rects = code128Rects(medId, 240, 60);
    codeGraphic = `
      <div class="bc-wrap" style="height:${bHeight}mm">
        <svg viewBox="0 0 240 60" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
          ${rects}
        </svg>
      </div>
      ${s.showCodeText ? `<div class="bc-text">${medId}</div>` : ""}
    `;
  }

  const metaItems: string[] = [];
  if (s.showBatch && m.batch) metaItems.push(`B:${m.batch}`);
  if (s.showExpiry && m.expiry) metaItems.push(`EXP:${m.expiry}`);
  if (s.showPacking && m.pack) metaItems.push(`PK:${m.pack}`);

  return `
    <div class="lbl-card ${fontClass}" style="width:${s.widthMm}mm; height:${s.heightMm}mm;">
      ${s.showStoreName ? `<div class="lbl-store truncate">${store}</div>` : ""}
      ${s.showMedicineName ? `<div class="lbl-name truncate font-bold">${m.name}</div>` : ""}
      
      <div class="lbl-center">
        ${codeGraphic}
      </div>

      <div class="lbl-footer">
        ${metaItems.length > 0 ? `<div class="lbl-meta truncate">${metaItems.join(" · ")}</div>` : ""}
        ${s.showMrp ? `<div class="lbl-mrp font-bold">MRP ₹${Number(m.mrp).toFixed(2)}</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * Generates the full printable document HTML and opens the browser print preview.
 */
export function printBarcodeLabels(
  items: { medicine: Medicine; qty: number }[],
  settings: BarcodeLabelSettings,
  defaultStoreName: string,
  shopId = "T001",
): { error?: string } {
  const activeItems = items.filter((it) => it.qty > 0);
  if (activeItems.length === 0) return { error: "No items selected to print (all quantities are 0)" };

  const labelsHtml = activeItems
    .flatMap(({ medicine, qty }) =>
      Array.from({ length: qty }).map(() =>
        buildSingleLabelHtml(medicine, settings, defaultStoreName, shopId)
      )
    )
    .join("\n");

  const isA4 = settings.preset.startsWith("a4");
  const pageSizeRule = isA4
    ? "@page { size: A4 portrait; margin: " + settings.marginMm + "mm; }"
    : `@page { size: ${settings.widthMm * settings.columns + (settings.columns - 1) * settings.gapMm + settings.marginMm * 2}mm auto; margin: ${settings.marginMm}mm; }`;

  const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode Labels · RSP Medical</title>
  <style>
    ${pageSizeRule}
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(${settings.columns}, ${settings.widthMm}mm);
      gap: ${settings.gapMm}mm;
      justify-content: ${settings.columns === 1 ? "flex-start" : "center"};
    }
    .lbl-card {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      padding: 1mm 1.5mm;
      text-align: center;
      background: #fff;
      border: 1px dotted #ccc;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      .lbl-card {
        border: ${isA4 ? "0.5px solid transparent" : "none"};
      }
    }
    .truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .font-bold {
      font-weight: 700;
    }
    /* Typography Presets */
    .font-sm .lbl-store { font-size: 5.5pt; letter-spacing: 0.2px; line-height: 1.1; }
    .font-sm .lbl-name { font-size: 6.5pt; line-height: 1.15; }
    .font-sm .bc-text { font-size: 6pt; font-family: monospace; font-weight: 700; }
    .font-sm .lbl-meta { font-size: 5pt; line-height: 1; }
    .font-sm .lbl-mrp { font-size: 6pt; }

    .font-md .lbl-store { font-size: 6.5pt; letter-spacing: 0.3px; line-height: 1.15; }
    .font-md .lbl-name { font-size: 7.5pt; line-height: 1.2; }
    .font-md .bc-text { font-size: 7pt; font-family: monospace; font-weight: 700; }
    .font-md .lbl-meta { font-size: 5.5pt; line-height: 1.1; }
    .font-md .lbl-mrp { font-size: 7pt; }

    .font-lg .lbl-store { font-size: 7.5pt; letter-spacing: 0.4px; line-height: 1.2; }
    .font-lg .lbl-name { font-size: 8.5pt; line-height: 1.25; }
    .font-lg .bc-text { font-size: 8pt; font-family: monospace; font-weight: 700; }
    .font-lg .lbl-meta { font-size: 6pt; line-height: 1.15; }
    .font-lg .lbl-mrp { font-size: 8pt; }

    .lbl-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0.5mm 0;
      flex-grow: 1;
    }
    .bc-wrap {
      width: 96%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bc-wrap svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .qr-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5mm;
    }
    .qr-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      padding: 0.8mm;
      border-radius: 1mm;
      box-shadow: 0 0 0 0.5px rgba(0,0,0,0.05);
    }
    .qr-img {
      width: 14mm;
      height: 14mm;
      display: block;
      image-rendering: pixelated;
    }
    .lbl-med-id {
      font-size: 6.5pt;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      letter-spacing: 0.5px;
      color: #000;
      line-height: 1;
    }
    .lbl-footer {
      display: flex;
      flex-direction: column;
      gap: 0.2mm;
    }
  </style>
</head>
<body>
  <div class="grid">
    ${labelsHtml}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 350);
    };
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=850,height=900");
  if (!w) {
    return { error: "Print popup blocked by browser. Please allow popups for printing." };
  }
  w.document.open();
  w.document.write(fullHtml);
  w.document.close();
  return {};
}
