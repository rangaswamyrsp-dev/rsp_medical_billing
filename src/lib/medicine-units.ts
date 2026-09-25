// ── Medicine Unit & Pack Conversion Utility ──────────────────────────────────
//
// Handles pack parsing, unit detection (tablets, capsules, syrups, etc.),
// unit MRP calculation, total base units computation, and stock breakdown display.
// ─────────────────────────────────────────────────────────────────────────────

export type PackInfo = {
  packSize: number;         // e.g. 10 (tablets per strip/pack). Minimum 1.
  isConvertible: boolean;   // true if tablets/capsules/strips that can be sold loose
  packLabel: string;        // "Strip" | "Pack" | "Box" | "Bottle" | "Piece"
  unitLabel: string;        // "Tablet" | "Capsule" | "Piece" | "Unit" | "Bottle"
  rawPack: string;
};

/**
 * Non-convertible medicine keywords that should NOT be split into loose units
 * even if their pack contains a number like "100ml" or "15g".
 */
const NON_CONVERTIBLE_TYPES = [
  "syrup", "suspension", "liquid", "drop", "drops",
  "cream", "gel", "ointment", "tube", "lotion",
  "injection", "vial", "ampoule",
  "inhaler", "spray", "solution", "mouthwash",
];

/**
 * Known solid dose unit types that support pack/strip to unit conversion.
 */
const TABLET_CAPSULE_KEYWORDS = [
  "tab", "tablet", "tablets", "cap", "capsule", "capsules", "strip", "strips", "pills",
];

/**
 * Parses pack size and determines if the medicine supports unit-wise (loose) selling.
 */
export function parsePackInfo(m: { pack?: string | null; units?: string | null; type?: string | null }): PackInfo {
  const rawPack = (m.pack ?? "").trim();
  const rawUnits = (m.units ?? "").trim();
  const rawType = (m.type ?? "").trim().toLowerCase();
  const combinedType = `${rawType} ${rawUnits.toLowerCase()}`;

  // 1. Check if definitely non-convertible liquid / tube / vial
  const isNonConvertibleType = NON_CONVERTIBLE_TYPES.some((t) => combinedType.includes(t));
  if (isNonConvertibleType && !TABLET_CAPSULE_KEYWORDS.some((t) => rawPack.toLowerCase().includes(t))) {
    return {
      packSize: 1,
      isConvertible: false,
      packLabel: rawUnits || "Piece",
      unitLabel: rawUnits || "Piece",
      rawPack,
    };
  }

  // 2. Extract numeric pack size from patterns:
  // e.g. "1x10", "1*10", "10's", "10s", "10 tab", "10 tablets", "10", "15's", "14"
  let parsedSize = 1;

  // Pattern A: "1x10" or "2x10" -> last number or multiplied
  const multiPattern = /(\d+)\s*[xX*]\s*(\d+)/;
  const multiMatch = rawPack.match(multiPattern);
  if (multiMatch) {
    const p1 = parseInt(multiMatch[1], 10);
    const p2 = parseInt(multiMatch[2], 10);
    if (p1 > 0 && p2 > 0) {
      parsedSize = p1 * p2;
    }
  } else {
    // Pattern B: "10's", "10s", "10 tab", "10", etc.
    const numMatch = rawPack.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      // Avoid treating "100ml" or "500mg" as pack size 100/500 if ml/mg is adjacent
      const isLiquidVolume = /(ml|gm|mg|l|g)\b/i.test(rawPack);
      if (!isLiquidVolume && num > 1 && num <= 500) {
        parsedSize = num;
      }
    }
  }

  // 3. Determine if convertible
  // Convertible if parsedSize > 1 and it's either tab/cap or default pack format
  const isTabOrCap = TABLET_CAPSULE_KEYWORDS.some((t) =>
    combinedType.includes(t) || rawPack.toLowerCase().includes(t)
  );

  const isConvertible = parsedSize > 1 && (isTabOrCap || !isNonConvertibleType);

  // 4. Derive labels
  let packLabel = "Strip";
  let unitLabel = "Tablet";

  const normUnits = rawUnits.toLowerCase().replace(/s+$/, "");

  if (combinedType.includes("cap") || rawPack.toLowerCase().includes("cap")) {
    unitLabel = "Capsule";
    packLabel = "Strip";
  } else if (combinedType.includes("tab") || rawPack.toLowerCase().includes("tab")) {
    unitLabel = "Tablet";
    packLabel = "Strip";
  } else if (normUnits === "strip") {
    unitLabel = "Tablet";
    packLabel = "Strip";
  } else if (rawUnits && normUnits !== "pack") {
    unitLabel = rawUnits.replace(/s+$/i, "");
    packLabel = "Pack";
  } else {
    packLabel = "Pack";
    unitLabel = "Unit";
  }

  return {
    packSize: isConvertible ? parsedSize : 1,
    isConvertible,
    packLabel,
    unitLabel,
    rawPack,
  };
}

/**
 * Calculates unit MRP with high internal precision.
 * e.g. Pack MRP = 110, Pack Size = 10 -> 11.00
 * e.g. Pack MRP = 99, Pack Size = 10 -> 9.90
 */
export function calculateUnitMrp(packMrp: number, packSize: number): number {
  if (!packSize || packSize <= 1) return Number(packMrp) || 0;
  const unitRate = (Number(packMrp) || 0) / packSize;
  return Math.round(unitRate * 10000) / 10000;
}

/**
 * Computes total base units from pack quantity and loose extra units.
 * e.g. 1 strip + 2 tablets (pack size 10) = 12 units
 */
export function calculateTotalUnits(packQty: number, extraUnits: number, packSize: number): number {
  const pQty = Math.max(0, Number(packQty) || 0);
  const eUnits = Math.max(0, Number(extraUnits) || 0);
  const size = Math.max(1, Number(packSize) || 1);
  return pQty * size + eUnits;
}

/**
 * Formats total base units into human-readable pack + loose unit breakdown.
 * e.g. 67 tablets (pack size 10) -> "6 Strips + 7 Tablets"
 * e.g. 100 tablets (pack size 10) -> "10 Strips"
 * e.g. 8 tablets (pack size 10) -> "8 Tablets"
 */
export function formatStockBreakdown(stock: number, packSize: number, packLabel = "Strip", unitLabel = "Tablet"): string {
  const s = Math.max(0, Number(stock) || 0);
  if (packSize <= 1) {
    return `${s} ${unitLabel}`;
  }
  const packs = Math.floor(s / packSize);
  const loose = s % packSize;

  if (packs > 0 && loose > 0) {
    return `${packs} ${packLabel}${packs > 1 ? "s" : ""} + ${loose} ${unitLabel}${loose > 1 ? "s" : ""}`;
  }
  if (packs > 0) {
    return `${packs} ${packLabel}${packs > 1 ? "s" : ""}`;
  }
  return `${loose} ${unitLabel}${loose > 1 ? "s" : ""}`;
}
