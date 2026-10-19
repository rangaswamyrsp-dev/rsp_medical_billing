// ── Medicine Unit & Pack Standardization Utility ─────────────────────────────
//
// Shared central calculation engine for:
// - Pack-to-base-unit conversion (e.g., 10x10 = 100, 1x15 = 15, 10'S = 10, 100ml = 100)
// - Stock calculation: Stock = (Qty × Units Per Pack) + Extra Qty
// - Base-unit selling price (Pack MRP ÷ Units Per Pack)
// - Base-unit purchase rate (Pack Rate ÷ Units Per Pack)
// - Human-readable stock formatting ("56 Tablets" / "5 Packs + 6 Tablets")
// ─────────────────────────────────────────────────────────────────────────────

export type PackInfo = {
  packSize: number;       // Base units per pack (Minimum 1). e.g. 100 for 10x10, 10 for 10's, 15 for 1x15
  isConvertible: boolean; // True if can be sold in loose base units (tablets, capsules, ml, g, etc.)
  packLabel: string;      // "Pack" | "Strip" | "Box" | "Bottle" | "Tube" | "Vial" | "Piece"
  unitLabel: string;      // "Tablet" | "Capsule" | "ml" | "g" | "Vial" | "Bottle" | "Piece" | "Unit"
  baseUnit: string;       // Alias for unitLabel
  isAmbiguous?: boolean;  // True if pack string could not be clearly parsed
  rawPack: string;
};

export type MedicinePackInput = {
  pack?: string | null;
  unit?: string | null;
  units?: string | null;
  type?: string | null;
};

/**
 * Known solid dose unit types.
 */
const TABLET_CAPSULE_KEYWORDS = [
  "tab", "tablet", "tablets", "cap", "capsule", "capsules", "strip", "strips", "pills",
];

/**
 * Liquid / volume based types.
 */
const LIQUID_VOLUME_KEYWORDS = [
  "syrup", "suspension", "liquid", "drop", "drops", "solution", "mouthwash", "lotion",
];

/**
 * Tube / weight based types.
 */
const TUBE_WEIGHT_KEYWORDS = [
  "cream", "gel", "ointment", "tube", "paste",
];

/**
 * Parses pack configuration and determines the exact units per pack and base selling unit.
 * Examples:
 * - "10x10" -> 100 tablets
 * - "1x15" -> 15 tablets / capsules
 * - "10'S" / "10s" -> 10 units
 * - "100ml" with unit "ml" -> 100 ml
 * - "15GR" / "25G" with unit "g" -> 15 / 25 grams
 */
export function parsePackInfo(
  input: MedicinePackInput | string,
  defaultUnit?: string
): PackInfo {
  const m: MedicinePackInput =
    typeof input === "string"
      ? { pack: input, unit: defaultUnit }
      : input;
  const rawPack = (m.pack ?? "").trim();
  const rawUnit = (m.unit || m.units || defaultUnit || "").trim();
  const rawType = (m.type ?? "").trim().toLowerCase();
  const combinedContext = `${rawType} ${rawUnit.toLowerCase()} ${rawPack.toLowerCase()}`;

  let parsedSize = 1;
  let packLabel = "Pack";
  let unitLabel = rawUnit || "Unit";
  let isAmbiguous = false;

  // 1. Check compound pack pattern: "10x10", "10*10", "2x10", "1x15"
  const multiPattern = /(\d+)\s*[xX*]\s*(\d+)/;
  const multiMatch = rawPack.match(multiPattern);
  if (multiMatch) {
    const p1 = parseInt(multiMatch[1], 10);
    const p2 = parseInt(multiMatch[2], 10);
    if (p1 > 0 && p2 > 0) {
      parsedSize = p1 * p2;
    }
  } else {
    // 2. Check volume pattern: "100ml", "200 ml", "60ml", "10ml"
    const mlMatch = rawPack.match(/(\d+)\s*ml\b/i);
    if (mlMatch) {
      const ml = parseInt(mlMatch[1], 10);
      if (rawUnit.toLowerCase().includes("ml") || LIQUID_VOLUME_KEYWORDS.some((k) => combinedContext.includes(k))) {
        parsedSize = ml > 0 ? ml : 1;
        unitLabel = "ml";
        packLabel = "Bottle";
      } else {
        parsedSize = 1;
        unitLabel = rawUnit || "Bottle";
        packLabel = "Pack";
      }
    } else {
      // 3. Check gram / weight pattern: "15GR", "25G", "15gm", "30g"
      const gramMatch = rawPack.match(/(\d+)\s*(?:g|gm|gr|gram|grams)\b/i);
      if (gramMatch) {
        const gm = parseInt(gramMatch[1], 10);
        if (
          rawUnit.toLowerCase().includes("g") ||
          rawUnit.toLowerCase().includes("gram") ||
          TUBE_WEIGHT_KEYWORDS.some((k) => combinedContext.includes(k))
        ) {
          parsedSize = gm > 0 ? gm : 1;
          unitLabel = "g";
          packLabel = "Tube";
        } else {
          parsedSize = 1;
          unitLabel = rawUnit || "Tube";
          packLabel = "Pack";
        }
      } else {
        // 4. Check "10's", "10s", "10 Tab", "15 Caps", "10"
        const numMatch = rawPack.match(/(\d+)/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (num > 1 && num <= 1000) {
            parsedSize = num;
          }
        }
      }
    }
  }

  // Determine standard unit label and pack label if not already assigned
  if (rawUnit) {
    unitLabel = rawUnit;
  } else if (combinedContext.includes("cap")) {
    unitLabel = "Capsule";
    packLabel = "Strip";
  } else if (combinedContext.includes("tab")) {
    unitLabel = "Tablet";
    packLabel = "Strip";
  } else if (LIQUID_VOLUME_KEYWORDS.some((k) => combinedContext.includes(k))) {
    unitLabel = parsedSize > 1 ? "ml" : "Bottle";
    packLabel = "Bottle";
  } else if (TUBE_WEIGHT_KEYWORDS.some((k) => combinedContext.includes(k))) {
    unitLabel = parsedSize > 1 ? "g" : "Tube";
    packLabel = "Tube";
  } else if (combinedContext.includes("inject") || combinedContext.includes("vial")) {
    unitLabel = "Vial";
    packLabel = "Pack";
  }

  // Adjust pack label for compound packs (e.g., 10x10 is a Box of 100 tablets)
  if (multiMatch && (unitLabel.toLowerCase().includes("tab") || unitLabel.toLowerCase().includes("cap"))) {
    packLabel = "Box";
  } else if (parsedSize > 1 && !multiMatch && (unitLabel.toLowerCase().includes("tab") || unitLabel.toLowerCase().includes("cap"))) {
    packLabel = "Strip";
  }

  const isConvertible = parsedSize > 1;

  return {
    packSize: Math.max(1, parsedSize),
    isConvertible,
    packLabel,
    unitLabel,
    baseUnit: unitLabel,
    isAmbiguous,
    rawPack,
  };
}

/**
 * Standard authoritative stock formula:
 * Stock = (Qty × Units Per Pack) + Extra Qty
 */
export function calculateStock(qtyPacks: number, extraQty: number, packSize: number): number {
  const q = Math.max(0, Number(qtyPacks) || 0);
  const extra = Math.max(0, Number(extraQty) || 0);
  const size = Math.max(1, Number(packSize) || 1);
  return q * size + extra;
}

/**
 * Alias for backward compatibility with existing codebase
 */
export const calculateTotalUnits = calculateStock;

/**
 * Proportional Base-Unit MRP calculation:
 * Base-unit price = Pack MRP ÷ Units Per Pack
 * e.g. Pack = 10, Pack MRP = 100 -> ₹10.00
 * e.g. Pack = 10x10 (100 units), Pack MRP = 201.56 -> ₹2.0156
 */
export function calculateUnitMrp(packMrp: number, packSize: number): number {
  const size = Math.max(1, Number(packSize) || 1);
  const mrp = Math.max(0, Number(packMrp) || 0);
  if (size <= 1) return mrp;
  return Math.round((mrp / size) * 10000) / 10000;
}

/**
 * Proportional Base-Unit Purchase Rate:
 * Base-unit purchase rate = Pack Purchase Rate ÷ Units Per Pack
 */
export function calculateUnitPurchaseRate(packRate: number, packSize: number): number {
  const size = Math.max(1, Number(packSize) || 1);
  const rate = Math.max(0, Number(packRate) || 0);
  if (size <= 1) return rate;
  return Math.round((rate / size) * 10000) / 10000;
}

/**
 * Formats total base units into clean primary and breakdown displays:
 * e.g. 56 tablets (pack size 10) ->
 * primary: "56 Tablets"
 * breakdown: "5 Packs + 6 Tablets"
 */
export function formatStockDisplay(
  stock: number,
  packSize: number,
  unitLabel: string = "Tablet",
  packLabel: string = "Pack"
): { primary: string; breakdown: string; full: string } {
  const s = Math.max(0, Number(stock) || 0);
  const size = Math.max(1, Number(packSize) || 1);

  const uName = s === 1 ? unitLabel : `${unitLabel}${unitLabel.endsWith("s") ? "" : "s"}`;
  const primary = `${s.toLocaleString("en-IN")} ${uName}`;

  if (size <= 1) {
    return { primary, breakdown: primary, full: primary };
  }

  const packs = Math.floor(s / size);
  const loose = s % size;
  const pName = packs === 1 ? packLabel : `${packLabel}${packLabel.endsWith("s") ? "" : "s"}`;
  const lName = loose === 1 ? unitLabel : `${unitLabel}${unitLabel.endsWith("s") ? "" : "s"}`;

  let breakdown = "";
  if (packs > 0 && loose > 0) {
    breakdown = `${packs} ${pName} + ${loose} ${lName}`;
  } else if (packs > 0) {
    breakdown = `${packs} ${pName}`;
  } else {
    breakdown = `${loose} ${lName}`;
  }

  const full = `${primary} (${breakdown})`;
  return { primary, breakdown, full };
}

/**
 * Backward compatibility alias
 */
export function formatStockBreakdown(
  stock: number,
  packSize: number,
  packLabel: string = "Strip",
  unitLabel: string = "Tablet"
): string {
  return formatStockDisplay(stock, packSize, unitLabel, packLabel).breakdown;
}

export type MedicineValuation = {
  packSize: number;
  stockUnits: number;
  packPurchaseRate: number;
  unitPurchaseRate: number;
  packMrp: number;
  unitMrp: number;
  purchaseValuation: number;       // Math.round(stockUnits * unitPurchaseRate)
  retailValuation: number;         // Math.round(stockUnits * unitMrp)
  exactPurchaseValuation: number;   // stockUnits * unitPurchaseRate
  exactRetailValuation: number;     // stockUnits * unitMrp
};

/**
 * Standard central valuation calculator.
 *
 * Guaranteed formula:
 * Purchase Valuation = Stock in Base Units × (Purchase Rate per Pack ÷ Units per Pack)
 * Retail Valuation = Stock in Base Units × (MRP per Pack ÷ Units per Pack)
 *
 * Row-level valuation and summary cards use this exact same formula.
 */
export function calculateMedicineValuation(
  medicine: {
    stock?: number | null;
    mrp?: number | null;
    cost?: number | null;
    new_rate?: number | null;
    pack?: string | null;
    unit?: string | null;
    units?: string | null;
    type?: string | null;
    name?: string | null;
  }
): MedicineValuation {
  const stockUnits = Math.max(0, Number(medicine.stock) || 0);
  const pInfo = parsePackInfo(medicine);
  const packSize = Math.max(1, pInfo.packSize || 1);

  const packMrp = Math.max(0, Number(medicine.mrp) || 0);
  const packPurchaseRate =
    medicine.new_rate !== undefined && medicine.new_rate !== null
      ? Number(medicine.new_rate) || 0
      : Number(medicine.cost) || 0;

  const unitMrp = packSize > 1 ? packMrp / packSize : packMrp;
  const unitPurchaseRate = packSize > 1 ? packPurchaseRate / packSize : packPurchaseRate;

  const exactRetailValuation = stockUnits * unitMrp;
  const exactPurchaseValuation = stockUnits * unitPurchaseRate;

  const retailValuation = Math.round(exactRetailValuation);
  const purchaseValuation = Math.round(exactPurchaseValuation);

  return {
    packSize,
    stockUnits,
    packPurchaseRate,
    unitPurchaseRate,
    packMrp,
    unitMrp,
    purchaseValuation,
    retailValuation,
    exactPurchaseValuation,
    exactRetailValuation,
  };
}
