// ── Standardized Purchase & Stock Calculation Engine ──────────────────────────
//
// Single authoritative calculation function for purchase lines, invoice totals,
// stock conversions, and pricing across Edit preview, Saved purchase,
// Finalized details, Reports, and Accounts.
// ─────────────────────────────────────────────────────────────────────────────

import { parsePackInfo, calculateUnitMrp, calculateUnitPurchaseRate } from "./medicine-units";

export type PurchaseItemInput = {
  name: string;
  batch?: string;
  expiry?: string;
  qty?: number;             // Stock in base units (or pack quantity if qtyMode === 'packs')
  stockUnits?: number;      // Explicit base-unit stock quantity
  extraQty?: number;        // Additional loose base units outside full packs
  rate: number;             // Purchase rate per pack (or per base unit if packSize === 1)
  gst?: number;             // GST percentage (e.g. 5, 12, 18)
  mrp?: number;             // Selling price per pack
  pack?: string;            // Pack string e.g. "1x15", "10x10", "100ml"
  packSize?: number;        // Base units per pack
  unit?: string;            // Base unit label e.g. "Tablet", "Capsule", "ml"
  qtyMode?: "stock" | "packs"; // Default: 'stock' when editing base units, 'packs' if pure pack count
};

export type PurchaseLineResult = {
  name: string;
  batch: string;
  expiry: string;
  packSize: number;
  packLabel: string;
  unitLabel: string;
  qtyPacks: number;
  extraQty: number;
  totalStockUnits: number;
  packPurchaseRate: number;
  unitPurchaseRate: number;
  packMrp: number;
  unitMrp: number;
  gstPercent: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
};

export type PurchaseInvoiceTotals = {
  itemCount: number;
  totalPacks: number;
  totalStockUnits: number;
  taxableSubtotal: number;
  totalGst: number;
  grandTotal: number;
};

/**
 * Calculates a single purchase line using consistent pack-to-unit and pricing rules.
 *
 * Formula:
 * Stock (Base Units) = total units purchased
 * Pack Rate = Purchase Rate per pack
 * Unit Rate = Pack Rate ÷ Units Per Pack
 * Taxable Subtotal = Total Base Units × Unit Rate
 * GST Amount = Taxable Subtotal × (GST% ÷ 100)
 * Line Total = Taxable Subtotal + GST Amount
 */
export function calculatePurchaseLine(item: PurchaseItemInput): PurchaseLineResult {
  const pInfo = parsePackInfo({
    pack: item.pack,
    unit: item.unit,
    type: item.name,
  });

  const packSize = Math.max(1, item.packSize || pInfo.packSize || 1);
  const packLabel = pInfo.packLabel || "Pack";
  const unitLabel = item.unit || pInfo.unitLabel || "Unit";

  let totalStockUnits = 0;
  let qtyPacks = 0;
  let extraQty = 0;

  if (item.stockUnits !== undefined && item.stockUnits !== null) {
    totalStockUnits = Math.max(0, Number(item.stockUnits) || 0);
    qtyPacks = packSize > 1 ? Math.floor(totalStockUnits / packSize) : totalStockUnits;
    extraQty = packSize > 1 ? totalStockUnits % packSize : 0;
  } else if (item.qtyMode === "packs") {
    qtyPacks = Math.max(0, Number(item.qty) || 0);
    extraQty = Math.max(0, Number(item.extraQty) || 0);
    totalStockUnits = (qtyPacks * packSize) + extraQty;
  } else {
    // Default: item.qty represents the primary quantity (Stock in base units)
    totalStockUnits = Math.max(0, Number(item.qty) || 0);
    qtyPacks = packSize > 1 ? Math.floor(totalStockUnits / packSize) : totalStockUnits;
    extraQty = packSize > 1 ? totalStockUnits % packSize : 0;
  }

  const packPurchaseRate = Math.max(0, Number(item.rate) || 0);
  const unitPurchaseRate = calculateUnitPurchaseRate(packPurchaseRate, packSize);

  const packMrp = item.mrp ? Math.max(0, Number(item.mrp)) : Math.round(packPurchaseRate * 1.4);
  const unitMrp = calculateUnitMrp(packMrp, packSize);

  const gstPercent = item.gst !== undefined ? Math.max(0, Number(item.gst)) : 5;

  // Taxable subtotal: Total Base Units * Unit Purchase Rate
  // Which is mathematically identical to (qtyPacks * packPurchaseRate) + (extraQty * unitPurchaseRate)
  const taxableAmount = totalStockUnits * unitPurchaseRate;
  const gstAmount = taxableAmount * (gstPercent / 100);
  const lineTotal = taxableAmount + gstAmount;

  return {
    name: (item.name || "").trim(),
    batch: (item.batch || "").trim(),
    expiry: (item.expiry || "").trim(),
    packSize,
    packLabel,
    unitLabel,
    qtyPacks,
    extraQty,
    totalStockUnits,
    packPurchaseRate,
    unitPurchaseRate,
    packMrp,
    unitMrp,
    gstPercent,
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    lineTotal: Math.round(lineTotal * 100) / 100,
  };
}

/**
 * Calculates complete invoice totals across all lines.
 */
export function calculatePurchaseInvoiceTotals(items: PurchaseItemInput[]): PurchaseInvoiceTotals {
  let totalPacks = 0;
  let totalStockUnits = 0;
  let taxableSubtotal = 0;
  let totalGst = 0;
  let grandTotal = 0;

  (items || []).forEach((it) => {
    if (!it.name?.trim()) return;
    const res = calculatePurchaseLine(it);
    totalPacks += res.qtyPacks;
    totalStockUnits += res.totalStockUnits;
    taxableSubtotal += res.taxableAmount;
    totalGst += res.gstAmount;
    grandTotal += res.lineTotal;
  });

  return {
    itemCount: (items || []).filter((i) => i.name?.trim()).length,
    totalPacks,
    totalStockUnits,
    taxableSubtotal: Math.round(taxableSubtotal * 100) / 100,
    totalGst: Math.round(totalGst * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}
