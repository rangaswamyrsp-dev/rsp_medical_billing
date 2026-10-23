import * as XLSX from "xlsx";
import type { Medicine } from "@/data/medicines";
import {
  parsePackInfo,
  calculateStock,
  calculateUnitMrp,
  calculateUnitPurchaseRate,
  calculateMedicineValuation,
} from "./medicine-units";

export interface ParsedImportRow {
  id?: string;
  rack?: string;
  box_no?: string;
  name: string;
  supplier?: string;
  invoiceNo?: string;
  supplierDate?: string;
  company: string; // MFR
  type: string;
  drugName: string; // Drug Name / Composition
  hsn: string;
  pack: string;
  batch: string;
  expiry: string;
  mrp: number; // Pack MRP
  cost: number; // P. Rate
  gst: number;
  qtyPacks: number; // Qty in Packs
  extraQty: number; // Loose Extra Qty
  stock: number; // Calculated Authoritative Stock (Base Units)
  importedStock?: number; // Stock as written in Excel (if provided)
  stockDiscrepancy?: boolean;
  unit: string;
  packSize: number;
  unitMrp?: number;
  unitCost?: number;
  validationErrors?: string[];
  check?: "OK" | "WARNING" | "ERROR" | "AI" | string;
  source?: string;
}

export const SAMPLE_EXCEL_PASTE_TEXT = `Medicine Name\tSupplier\tInvoice No\tSupplier Date\tMFR\tDrug Name / Composition\tType\tHSN\tPack\tBatch\tExpiry\tMRP\tP. Rate\tGST\tQty\tExtra Qty\tUnit\nCETABLOCK TRIO\tAMBIKAA MEDINEEDS\t2600073008278\t29/09/2026\tATO\tACECLOFENAC + PARACETAMOL\tTablet\t30049099\t10x10\t25S3GTB062\t2027-08\t201.56\t170.00\t5\t10\t0\tTablet`;

/** Format date string or excel serial to YYYY-MM */
export function normalizeExpiryDate(val: any): string {
  if (!val) return "";
  if (typeof val === "number") {
    // Excel date serial number
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      return `${year}-${month}`;
    }
  }

  const str = String(val).trim().toUpperCase();
  if (!str) return "";

  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(str)) return str;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.slice(0, 7);

  // MM/YYYY or MM-YYYY
  const mYMatch = str.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mYMatch) {
    const month = mYMatch[1].padStart(2, "0");
    return `${mYMatch[2]}-${month}`;
  }

  // MM/YY or MM-YY (e.g. 08/27 -> 2027-08)
  const mYYMatch = str.match(/^(\d{1,2})[\/\-](\d{2})$/);
  if (mYYMatch) {
    const month = mYYMatch[1].padStart(2, "0");
    const year = 2000 + Number(mYYMatch[2]);
    return `${year}-${month}`;
  }

  // Month name e.g. AUG-27 or AUG/2027 or AUGUST 2027
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const namedMatch = str.match(/([A-Z]{3,9})[\s\/\-\.]*(\d{2,4})/);
  if (namedMatch) {
    const prefix = namedMatch[1].slice(0, 3);
    const m = months[prefix];
    if (m) {
      let yr = Number(namedMatch[2]);
      if (yr < 100) yr += 2000;
      return `${yr}-${m}`;
    }
  }

  return str;
}

/** Clean & extract numeric HSN (4, 6, 8 digits) */
export function normalizeHsnCode(val: any): string {
  if (!val) return "";
  const str = String(val).trim();
  return str.replace(/[^0-9A-Z]/gi, "");
}

/** Export full or filtered inventory stock to Excel (.xlsx) */
export function exportInventoryToExcel(
  medicines: Medicine[],
  storeName: string = "RSP Pharmacy",
  filterLabel?: string
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const rows = medicines.map((m) => {
    const v = calculateMedicineValuation(m);
    const info = parsePackInfo(m);
    const packQty = info.packSize > 1 ? Math.floor(v.stockUnits / info.packSize) : v.stockUnits;
    const extraQty = info.packSize > 1 ? v.stockUnits % info.packSize : 0;

    return {
      "Medicine Name": m.name,
      "Supplier": m.supplier || "—",
      "MFR": m.company || "—",
      "Drug Name / Composition": m.generic || "—",
      "Type": m.type || "Tablet",
      "HSN": m.hsn || "—",
      "Pack": m.pack || "—",
      "Batch": m.batch,
      "Expiry": m.expiry || "—",
      "MRP (Pack)": v.packMrp.toFixed(2),
      "P. Rate (Pack)": v.packPurchaseRate.toFixed(2),
      "GST %": m.gst,
      "Qty (Packs)": packQty,
      "Extra Qty": extraQty,
      "Unit": info.unitLabel,
      "Stock (Base Units)": v.stockUnits,
      "Purchase Valuation (Cost)": v.purchaseValuation,
      "Retail Valuation (MRP)": v.retailValuation,
      "Rack": m.rack || "—",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 28 }, // Name
    { wch: 22 }, // Supplier
    { wch: 18 }, // MFR
    { wch: 28 }, // Composition
    { wch: 12 }, // Type
    { wch: 12 }, // HSN
    { wch: 12 }, // Pack
    { wch: 14 }, // Batch
    { wch: 12 }, // Expiry
    { wch: 14 }, // MRP
    { wch: 14 }, // P. Rate
    { wch: 8 },  // GST
    { wch: 12 }, // Qty (Packs)
    { wch: 10 }, // Extra Qty
    { wch: 12 }, // Unit
    { wch: 18 }, // Stock
    { wch: 10 }, // Rack
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  const fileName = `${storeName.replace(/[^a-zA-Z0-9]/g, "_")}_Inventory_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/** Generate a clean template for bulk import matching the standardized 18 fields */
export function generateMedicineExcelTemplate() {
  const sampleData = [
    {
      "Medicine Name": "CETABLOCK TRIO",
      "Supplier": "AMBIKAA MEDINEEDS",
      "Invoice No": "2600073008278",
      "Supplier Date": "29/09/2026",
      "MFR": "ATO",
      "Drug Name / Composition": "ACECLOFENAC + PARACETAMOL",
      "Type": "Tablet",
      "HSN": "30049099",
      "Pack": "10x10",
      "Batch": "25S3GTB062",
      "Expiry": "2027-08",
      "MRP": 201.56,
      "P. Rate": 170.00,
      "GST %": 5,
      "Qty (Packs)": 10,
      "Extra Qty": 0,
      "Unit": "Tablet",
      "Stock (Base Units)": 1000,
    },
    {
      "Medicine Name": "DOLO 650",
      "Supplier": "MEDISAFE PHARMA",
      "Invoice No": "INV-10928",
      "Supplier Date": "01/10/2026",
      "MFR": "MICRO",
      "Drug Name / Composition": "PARACETAMOL 650MG",
      "Type": "Tablet",
      "HSN": "300490",
      "Pack": "1x15",
      "Batch": "DL9901",
      "Expiry": "2028-03",
      "MRP": 34.00,
      "P. Rate": 24.50,
      "GST %": 12,
      "Qty (Packs)": 5,
      "Extra Qty": 6,
      "Unit": "Tablet",
      "Stock (Base Units)": 81,
    },
    {
      "Medicine Name": "ASCORIL LS SYRUP",
      "Supplier": "GLENMARK PHARMA",
      "Invoice No": "INV-7788",
      "Supplier Date": "05/10/2026",
      "MFR": "GLENMARK",
      "Drug Name / Composition": "LEVOSALBUTAMOL + AMBROXOL",
      "Type": "Syrup",
      "HSN": "300490",
      "Pack": "100ml",
      "Batch": "ASC554",
      "Expiry": "2027-02",
      "MRP": 118.00,
      "P. Rate": 75.00,
      "GST %": 12,
      "Qty (Packs)": 1,
      "Extra Qty": 0,
      "Unit": "ml",
      "Stock (Base Units)": 100,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws["!cols"] = [
    { wch: 24 }, // Medicine Name
    { wch: 20 }, // Supplier
    { wch: 16 }, // Invoice No
    { wch: 14 }, // Supplier Date
    { wch: 16 }, // MFR
    { wch: 28 }, // Composition
    { wch: 12 }, // Type
    { wch: 12 }, // HSN
    { wch: 12 }, // Pack
    { wch: 14 }, // Batch
    { wch: 12 }, // Expiry
    { wch: 10 }, // MRP
    { wch: 12 }, // P. Rate
    { wch: 8 },  // GST
    { wch: 12 }, // Qty (Packs)
    { wch: 10 }, // Extra Qty
    { wch: 10 }, // Unit
    { wch: 18 }, // Stock
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Standardized Template");
  XLSX.writeFile(wb, "RSP_Medicines_Import_Template.xlsx");
}

/** Helper to validate and calculate a row's standardized fields */
function processImportRow(
  raw: {
    name: string;
    supplier?: string;
    invoiceNo?: string;
    supplierDate?: string;
    company?: string;
    drugName?: string;
    type?: string;
    hsn?: string;
    pack?: string;
    batch?: string;
    expiry?: string;
    mrp: number;
    cost: number;
    gst: number;
    qtyPacks: number;
    extraQty: number;
    importedStock?: number;
    unit?: string;
    rack?: string;
    box_no?: string;
    source?: string;
  },
  idx: number
): ParsedImportRow {
  const errors: string[] = [];

  if (!raw.name.trim()) {
    errors.push("Medicine Name is missing");
  }
  if (!raw.batch?.trim()) {
    errors.push("Batch is missing");
  }
  if (!raw.expiry?.trim()) {
    errors.push("Expiry is missing or invalid");
  }
  if (raw.mrp <= 0) {
    errors.push("MRP must be greater than ₹0");
  }
  if (raw.cost < 0) {
    errors.push("P. Rate cannot be negative");
  }
  if (raw.qtyPacks < 0) {
    errors.push("Qty (Packs) cannot be negative");
  }
  if (raw.extraQty < 0) {
    errors.push("Extra Qty cannot be negative");
  }

  // Parse pack configuration and calculate authoritative stock
  const pInfo = parsePackInfo({
    pack: raw.pack,
    unit: raw.unit,
    type: raw.type,
  });

  const calculatedStock = calculateStock(raw.qtyPacks, raw.extraQty, pInfo.packSize);

  let stockDiscrepancy = false;
  if (
    raw.importedStock !== undefined &&
    raw.importedStock > 0 &&
    raw.importedStock !== calculatedStock
  ) {
    stockDiscrepancy = true;
    errors.push(
      `Conflicting stock: File says ${raw.importedStock}, but calculation (${raw.qtyPacks} packs × ${pInfo.packSize} + ${raw.extraQty} extra) is ${calculatedStock}`
    );
  }

  const unitMrp = calculateUnitMrp(raw.mrp, pInfo.packSize);
  const unitCost = calculateUnitPurchaseRate(raw.cost, pInfo.packSize);

  let checkStatus: "OK" | "WARNING" | "ERROR" = "OK";
  if (errors.length > 0) {
    checkStatus = errors.some((e) =>
      e.includes("missing") || e.includes("must be") || e.includes("cannot be")
    )
      ? "ERROR"
      : "WARNING";
  }

  return {
    id: `row-${idx}-${Date.now()}`,
    name: raw.name.trim(),
    supplier: raw.supplier?.trim() || "",
    invoiceNo: raw.invoiceNo?.trim() || "",
    supplierDate: raw.supplierDate?.trim() || "",
    company: raw.company?.trim() || "",
    drugName: raw.drugName?.trim() || "",
    type: raw.type?.trim() || (pInfo.unitLabel === "ml" ? "Syrup" : "Tablet"),
    hsn: raw.hsn?.trim() || "",
    pack: raw.pack?.trim() || pInfo.rawPack || `${pInfo.packSize}'s`,
    batch: raw.batch?.trim() || "",
    expiry: raw.expiry?.trim() || "",
    mrp: raw.mrp,
    cost: raw.cost,
    gst: raw.gst,
    qtyPacks: raw.qtyPacks,
    extraQty: raw.extraQty,
    rack: raw.rack?.trim() || "",
    box_no: raw.box_no?.trim() || "",
    stock: calculatedStock,
    importedStock: raw.importedStock,
    stockDiscrepancy,
    unit: raw.unit?.trim() || pInfo.unitLabel,
    packSize: pInfo.packSize,
    unitMrp,
    unitCost,
    validationErrors: errors,
    check: checkStatus,
    source: raw.source || "Excel",
  };
}

/** Parse uploaded Excel (.xlsx, .xls) or CSV file */
export async function parseMedicineExcelFile(file: File): Promise<ParsedImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("File has no readable worksheets.");

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    header: 0,
    defval: "",
    blankrows: false,
    raw: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("No data rows found in the sheet.");
  }

  const firstRow = rawRows[0];
  const keys = Object.keys(firstRow);
  const cleanKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

  const findKey = (candidates: string[]): string | undefined => {
    return keys.find((k) => {
      const c = cleanKey(k);
      return candidates.some((cand) => c.includes(cand) || cand.includes(c));
    });
  };

  const nameKey = findKey(["itemname", "medicinename", "productname", "itemdescription", "medicine", "product", "name"]);
  const supplierKey = findKey(["supplier", "suppliername", "distributor", "party", "wholesaler", "vendor"]);
  const invoiceKey = findKey(["invoiceno", "invoice", "billno", "invno", "invoicenumber"]);
  const dateKey = findKey(["supplierdate", "invoicedate", "billdate", "date"]);
  const mfrKey = findKey(["manufacturer", "mfr", "company", "mfg", "brand", "make"]);
  const drugKey = findKey(["drugname", "composition", "drugnamecomposition", "generic", "genericname", "salt", "saltcomposition"]);
  const typeKey = findKey(["type", "types", "medicinetype", "dosageform", "form"]);
  const hsnKey = findKey(["hsncode", "hsn", "hsnsac", "sac"]);
  const gstKey = findKey(["gst", "gstpercent", "taxpercent", "taxrate", "tax"]);
  const packKey = findKey(["pack", "packsize", "packing", "pkg"]);
  const batchKey = findKey(["batch", "batchno", "batchnumber", "lot"]);
  const expiryKey = findKey(["expiry", "expirydate", "exp", "expdate"]);
  const mrpKey = findKey(["mrp", "maxretailprice", "retailprice", "packmrp"]);
  const costKey = findKey(["prate", "purchaseprice", "purchaserate", "cost", "rate", "costprice"]);
  const qtyPacksKey = findKey(["qtyparks", "qtypacks", "packsqty", "qty", "packs", "quantity"]);
  const extraQtyKey = findKey(["extraqty", "extra", "looseqty", "loose", "extraunits"]);
  const stockKey = findKey(["stock", "stockbaseunits", "baseunits", "totalunits", "totalstock"]);
  const unitKey = findKey(["unit", "units", "uom", "sellingunit", "baseunit"]);
  const rackKey = findKey(["rack", "rackno", "shelf", "shelfno", "location"]);
  const boxKey = findKey(["box", "boxno", "bin", "binno"]);

  const result: ParsedImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const name = nameKey ? String(row[nameKey] ?? "").trim() : "";
    if (!name) continue;

    const supplier = supplierKey ? String(row[supplierKey] ?? "").trim() : "";
    const invoiceNo = invoiceKey ? String(row[invoiceKey] ?? "").trim() : "";
    const supplierDate = dateKey ? String(row[dateKey] ?? "").trim() : "";
    const company = mfrKey ? String(row[mfrKey] ?? "").trim() : "";
    const drugName = drugKey ? String(row[drugKey] ?? "").trim() : "";
    const type = typeKey ? String(row[typeKey] ?? "").trim() : "";
    const hsn = hsnKey ? normalizeHsnCode(row[hsnKey]) : "";
    const batch = batchKey ? String(row[batchKey] ?? "").trim() : "";
    const expiry = expiryKey ? normalizeExpiryDate(row[expiryKey]) : "";

    const mrp = mrpKey ? Number(String(row[mrpKey]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const cost = costKey ? Number(String(row[costKey]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const gst = gstKey ? Number(String(row[gstKey]).replace(/[^0-9.]/g, "")) || 5 : 5;
    const pack = packKey ? String(row[packKey] ?? "").trim() : "";

    const rawQty = qtyPacksKey ? Number(String(row[qtyPacksKey]).replace(/[^0-9.]/g, "")) || 0 : 1;
    const rawExtra = extraQtyKey ? Number(String(row[extraQtyKey]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const rawStock = stockKey ? Number(String(row[stockKey]).replace(/[^0-9.]/g, "")) : undefined;
    const unit = unitKey ? String(row[unitKey] ?? "").trim() : "";
    const rack = rackKey ? String(row[rackKey] ?? "").trim() : "";
    const box_no = boxKey ? String(row[boxKey] ?? "").trim() : "";

    const processed = processImportRow(
      {
        name,
        supplier,
        invoiceNo,
        supplierDate,
        company,
        drugName,
        type,
        hsn,
        pack,
        batch,
        expiry,
        mrp,
        cost,
        gst,
        qtyPacks: rawQty,
        extraQty: rawExtra,
        importedStock: rawStock,
        unit,
        source: "Excel",
      },
      i
    );

    result.push(processed);
  }

  return result;
}

/** Parse raw text copied and pasted from Excel */
export function parseMedicinePastedText(rawText: string): ParsedImportRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const isTab = firstLine.includes("\t");

  const rows: string[][] = lines.map((line) => {
    if (isTab) return line.split("\t").map((c) => c.trim());
    if (line.includes(",")) return line.split(",").map((c) => c.trim());
    return line.split(/\s{2,}/).map((c) => c.trim());
  });

  if (rows.length === 0) return [];

  const headerRow = rows[0];
  const cleanHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = headerRow.map(cleanHeader);

  const findIdx = (cands: string[]): number => {
    return headers.findIndex((h) => cands.some((c) => h.includes(c) || c.includes(h)));
  };

  const nameIdx = findIdx(["itemname", "medicinename", "productname", "medicine", "product", "name"]);
  const isHeader = nameIdx !== -1;
  const dataRows = isHeader ? rows.slice(1) : rows;

  const supplierIdx = isHeader ? findIdx(["supplier", "distributor", "party", "vendor"]) : -1;
  const invIdx = isHeader ? findIdx(["invoiceno", "invoice", "billno", "invno"]) : -1;
  const dateIdx = isHeader ? findIdx(["supplierdate", "invoicedate", "billdate", "date"]) : -1;
  const mfrIdx = isHeader ? findIdx(["manufacturer", "mfr", "company", "make"]) : -1;
  const drugIdx = isHeader ? findIdx(["drugname", "composition", "generic", "salt"]) : -1;
  const typeIdx = isHeader ? findIdx(["type", "types", "dosageform", "form"]) : -1;
  const hsnIdx = isHeader ? findIdx(["hsn", "hsncode", "sac"]) : -1;
  const packIdx = isHeader ? findIdx(["pack", "packsize", "packing"]) : -1;
  const batchIdx = isHeader ? findIdx(["batch", "batchno", "lot"]) : -1;
  const expIdx = isHeader ? findIdx(["expiry", "exp", "expdate"]) : -1;
  const mrpIdx = isHeader ? findIdx(["mrp", "retailprice", "price"]) : -1;
  const costIdx = isHeader ? findIdx(["prate", "purchaseprice", "purchaserate", "cost", "rate"]) : -1;
  const gstIdx = isHeader ? findIdx(["gst", "tax"]) : -1;
  const qtyPacksIdx = isHeader ? findIdx(["qtyparks", "qtypacks", "qty", "packs", "quantity"]) : -1;
  const extraQtyIdx = isHeader ? findIdx(["extraqty", "extra", "looseqty", "loose"]) : -1;
  const stockIdx = isHeader ? findIdx(["stock", "stockbaseunits", "baseunits"]) : -1;
  const unitIdx = isHeader ? findIdx(["unit", "units", "uom", "sellingunit"]) : -1;
  const rackIdx = isHeader ? findIdx(["rack", "rackno", "shelf", "location"]) : -1;
  const boxIdx = isHeader ? findIdx(["box", "boxno", "bin"]) : -1;

  const actualNameIdx = isHeader ? nameIdx : 0;
  const results: ParsedImportRow[] = [];

  dataRows.forEach((cols, idx) => {
    const name = cols[actualNameIdx] || "";
    if (!name) return;

    const supplier = supplierIdx !== -1 ? cols[supplierIdx] || "" : "";
    const invoiceNo = invIdx !== -1 ? cols[invIdx] || "" : "";
    const supplierDate = dateIdx !== -1 ? cols[dateIdx] || "" : "";
    const company = mfrIdx !== -1 ? cols[mfrIdx] || "" : "";
    const drugName = drugIdx !== -1 ? cols[drugIdx] || "" : "";
    const type = typeIdx !== -1 ? cols[typeIdx] || "" : "";
    const hsn = hsnIdx !== -1 ? normalizeHsnCode(cols[hsnIdx]) : "";
    const pack = packIdx !== -1 ? cols[packIdx] || "" : "";
    const batch = batchIdx !== -1 ? cols[batchIdx] || "" : "";
    const expiry = expIdx !== -1 ? normalizeExpiryDate(cols[expIdx]) : "";

    const mrp = mrpIdx !== -1 ? Number(String(cols[mrpIdx]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const cost = costIdx !== -1 ? Number(String(cols[costIdx]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const gst = gstIdx !== -1 ? Number(String(cols[gstIdx]).replace(/[^0-9.]/g, "")) || 5 : 5;
    const rawQty = qtyPacksIdx !== -1 ? Number(String(cols[qtyPacksIdx]).replace(/[^0-9.]/g, "")) || 0 : 1;
    const rawExtra = extraQtyIdx !== -1 ? Number(String(cols[extraQtyIdx]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const rawStock = stockIdx !== -1 ? Number(String(cols[stockIdx]).replace(/[^0-9.]/g, "")) : undefined;
    const unit = unitIdx !== -1 ? cols[unitIdx] || "" : "";
    const rack = rackIdx !== -1 ? cols[rackIdx] || "" : "";
    const box_no = boxIdx !== -1 ? cols[boxIdx] || "" : "";

    const processed = processImportRow(
      {
        name,
        supplier,
        invoiceNo,
        supplierDate,
        company,
        drugName,
        type,
        hsn,
        pack,
        batch,
        expiry,
        mrp,
        cost,
        gst,
        qtyPacks: rawQty,
        extraQty: rawExtra,
        importedStock: rawStock,
        unit,
        source: "Pasted",
      },
      idx
    );

    results.push(processed);
  });

  return results;
}
