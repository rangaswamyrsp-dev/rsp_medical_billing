import * as XLSX from "xlsx";
import type { Medicine } from "@/data/medicines";

export interface ParsedImportRow {
  id?: string;
  name: string;
  supplier?: string;
  invoiceNo?: string;
  supplierDate?: string;
  company: string; // MFR
  type: string;
  drugName: string; // Drug Name / Composition (Category removed)
  hsn: string;
  pack: string;
  batch: string;
  expiry: string;
  mrp: number;
  cost: number;
  gst: number;
  stock: number; // Qty
  unit?: string;
  check?: string;
  source?: string;
}

export const SAMPLE_EXCEL_PASTE_TEXT = `Medicine Name\tSupplier\tInvoice No\tSupplier Date\tMFR\tDrug Name / Composition\tType\tHSN\tPack\tBatch\tExpiry\tMRP\tPurchase Price\tGST\tQuantity\tUnit\nCETABLOCK TRIO\tAMBIKAA MEDINEEDS\t2600073008278\t29/09/2026\tATO\tACECLOFENAC + PARACETAMOL\tTablet\t30049099\t10x10\t25S3GTB062\t2027-08\t201.56\t170.00\t5\t10\tTablet`;

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
  // Remove non-alphanumeric except common dashes
  const clean = str.replace(/[^0-9A-Z]/gi, "");
  // If it contains valid digits
  return clean;
}

/** Export full or filtered inventory stock to Excel (.xlsx) */
export function exportInventoryToExcel(
  medicines: Medicine[],
  storeName: string = "RSP Pharmacy",
  filterLabel?: string
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const rows = medicines.map((m) => {
    const purchaseRate = m.new_rate !== undefined ? Number(m.new_rate) : (m.cost !== undefined ? Number(m.cost) : 0);
    const stockQty = Number(m.stock) || 0;
    const mrp = Number(m.mrp) || 0;
    const totalValue = Math.round(stockQty * mrp);
    const addedDate = m.created_at ? new Date(m.created_at).toLocaleDateString("en-IN") : "";

    return {
      "Product Code": m.code || m.id,
      "Medicine Name": m.name,
      "Supplier": m.supplier || "",
      "Manufacturer (MFR)": m.company || "",
      "Type": m.type || "",
      "Category": m.category || m.generic || "",
      "HSN Code": m.hsn || "",
      "GST %": m.gst ?? 5,
      "Pack Size": m.pack || "",
      "Batch": m.batch,
      "Expiry": m.expiry || "",
      "MRP (Rs)": mrp,
      "Purchase Price (Rs)": purchaseRate,
      "Stock Qty": stockQty,
      "Stock Value (Rs)": totalValue,
      "Added Date": addedDate,
      "Box / Rack": [m.box_no, m.rack].filter(Boolean).join(" / "),
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, // Code
    { wch: 28 }, // Name
    { wch: 22 }, // Supplier
    { wch: 18 }, // MFR
    { wch: 12 }, // Type
    { wch: 22 }, // Category
    { wch: 12 }, // HSN Code
    { wch: 8 },  // GST %
    { wch: 12 }, // Pack
    { wch: 14 }, // Batch
    { wch: 12 }, // Expiry
    { wch: 12 }, // MRP
    { wch: 16 }, // Purchase Price
    { wch: 12 }, // Stock Qty
    { wch: 16 }, // Stock Value
    { wch: 14 }, // Added Date
    { wch: 14 }, // Location
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory Stock");

  const sanitizedStore = storeName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
  const tag = filterLabel ? `_${filterLabel.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 25)}` : "";
  XLSX.writeFile(wb, `Inventory_Stock_${sanitizedStore}${tag}_${dateStr}.xlsx`);
}

/** Download standard Excel template with sample rows and HSN column */
export function downloadMedicineImportTemplate() {
  const sampleData = [
    {
      "Medicine Name": "Paracetamol 650mg",
      "Manufacturer (MFR)": "SUN",
      "Type": "Tablet",
      "Category": "Analgesic / Antipyretic",
      "HSN Code": "300490",
      "GST %": 5,
      "Pack Size": "15's",
      "Batch": "PAC129",
      "Expiry (YYYY-MM)": "2027-10",
      "MRP": 30.50,
      "Purchase Price": 18.00,
      "Quantity": 150,
    },
    {
      "Medicine Name": "Augmentin 625 Duo",
      "Manufacturer (MFR)": "GSK",
      "Type": "Tablet",
      "Category": "Antibiotic",
      "HSN Code": "300410",
      "GST %": 12,
      "Pack Size": "10's",
      "Batch": "AUG881",
      "Expiry (YYYY-MM)": "2026-12",
      "MRP": 204.00,
      "Purchase Price": 145.00,
      "Quantity": 50,
    },
    {
      "Medicine Name": "Pan 40",
      "Manufacturer (MFR)": "ALKEM",
      "Type": "Tablet",
      "Category": "Antacid / PPI",
      "HSN Code": "300490",
      "GST %": 5,
      "Pack Size": "15's",
      "Batch": "PAN402",
      "Expiry (YYYY-MM)": "2028-04",
      "MRP": 155.00,
      "Purchase Price": 98.00,
      "Quantity": 80,
    },
    {
      "Medicine Name": "Ascoril LS Syrup",
      "Manufacturer (MFR)": "GLEN",
      "Type": "Syrup",
      "Category": "Cough / Respiratory",
      "HSN Code": "300490",
      "GST %": 12,
      "Pack Size": "100ml",
      "Batch": "ASC554",
      "Expiry (YYYY-MM)": "2027-02",
      "MRP": 118.00,
      "Purchase Price": 75.00,
      "Quantity": 30,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws["!cols"] = [
    { wch: 24 }, // Medicine Name
    { wch: 18 }, // Manufacturer
    { wch: 12 }, // Type
    { wch: 22 }, // Category
    { wch: 12 }, // HSN Code
    { wch: 8 },  // GST %
    { wch: 12 }, // Pack Size
    { wch: 14 }, // Batch
    { wch: 16 }, // Expiry
    { wch: 10 }, // MRP
    { wch: 14 }, // Purchase Price
    { wch: 10 }, // Quantity
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Medicines Template");
  XLSX.writeFile(wb, "Medicines_Import_Template.xlsx");
}

/** Parse an uploaded Excel (.xlsx, .xls) or CSV file with flexible column headers */
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

  // Find column mapping by checking keys of first row
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
  const supplierKey = findKey(["supplier", "suppliername", "distributor", "party", "wholesaler", "vendor", "agency"]);
  const invoiceKey = findKey(["invoiceno", "invoice", "billno", "billnumber", "invno", "invoicenumber"]);
  const dateKey = findKey(["supplierdate", "invoicedate", "billdate", "date"]);
  const mfrKey = findKey(["manufacturer", "mfr", "company", "mfg", "brand", "make"]);
  const drugKey = findKey(["drugnames", "drugname", "composition", "drugnamecomposition", "generic", "genericname", "salt", "saltcomposition", "molecule", "contents"]);
  const typeKey = findKey(["types", "type", "medicinetype", "dosageform", "form"]);
  const hsnKey = findKey(["hsncode", "hsn", "hsnsac", "sac", "hsnno"]);
  const gstKey = findKey(["gst", "gstpercent", "taxpercent", "taxrate", "gstslab", "tax"]);
  const packKey = findKey(["packsize", "pack", "packing", "pkg", "package"]);
  const batchKey = findKey(["batchno", "batch", "batchnumber", "lot", "lotno"]);
  const expiryKey = findKey(["expiry", "expirydate", "exp", "expdate"]);
  const mrpKey = findKey(["mrp", "maxretailprice", "retailprice", "price"]);
  const costKey = findKey(["purchaseprice", "purchaserate", "cost", "prate", "rate", "costprice", "purrate", "newrate", "basicrate"]);
  const qtyKey = findKey(["quantity", "qty", "stock", "stockqty", "units", "count"]);
  const unitKey = findKey(["unit", "units", "uom", "sellingunit"]);

  const result: ParsedImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const name = nameKey ? String(row[nameKey] ?? "").trim() : "";
    // If there's no name in this row, skip
    if (!name) continue;

    const supplier = supplierKey ? String(row[supplierKey] ?? "").trim() : "";
    const invoiceNo = invoiceKey ? String(row[invoiceKey] ?? "").trim() : "";
    const supplierDate = dateKey ? String(row[dateKey] ?? "").trim() : "";
    const company = mfrKey ? String(row[mfrKey] ?? "").trim() : "";
    const drugName = drugKey ? String(row[drugKey] ?? "").trim() : "";
    const type = typeKey ? String(row[typeKey] ?? "").trim() : "";
    const hsn = hsnKey ? normalizeHsnCode(row[hsnKey]) : "";
    const batch = batchKey ? String(row[batchKey] ?? "").trim() : "";
    const rawExp = expiryKey ? row[expiryKey] : "";
    const expiry = normalizeExpiryDate(rawExp);

    const mrpVal = mrpKey ? Number(String(row[mrpKey]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const costVal = costKey ? Number(String(row[costKey]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const gstVal = gstKey ? Number(String(row[gstKey]).replace(/[^0-9.]/g, "")) || 5 : 5;
    const pack = packKey ? String(row[packKey] ?? "").trim() : "";
    const stock = qtyKey ? Number(String(row[qtyKey]).replace(/[^0-9.]/g, "")) || 0 : 0;
    const unit = unitKey ? String(row[unitKey] ?? "").trim() : "";

    result.push({
      id: `row-${i}-${Date.now()}`,
      name,
      supplier,
      invoiceNo,
      supplierDate,
      company, // Keep short name verbatim
      drugName, // Drug Name / Composition
      type,
      hsn,
      pack,
      batch,
      expiry,
      mrp: mrpVal,
      cost: costVal,
      gst: gstVal,
      stock,
      unit: unit || type || "Tablet",
      check: "OK",
      source: "Excel",
    });
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

  // Determine separator (tab or comma or multiple spaces)
  const firstLine = lines[0];
  const isTab = firstLine.includes("\t");

  const rows: string[][] = lines.map((line) => {
    if (isTab) {
      return line.split("\t").map((c) => c.trim());
    }
    if (line.includes(",")) {
      return line.split(",").map((c) => c.trim());
    }
    // Fallback: split by 2 or more spaces
    return line.split(/\s{2,}/).map((c) => c.trim());
  });

  if (rows.length === 0) return [];

  // Check if first line is header
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
  const mfrIdx = isHeader ? findIdx(["manufacturer", "mfr", "company", "make"]) : 1;
  const drugIdx = isHeader ? findIdx(["drugnames", "drugname", "composition", "generic", "salt"]) : -1;
  const typeIdx = isHeader ? findIdx(["types", "type", "dosageform", "form"]) : 2;
  const hsnIdx = isHeader ? findIdx(["hsn", "hsncode", "sac"]) : -1;
  const packIdx = isHeader ? findIdx(["pack", "packsize", "packing"]) : -1;
  const batchIdx = isHeader ? findIdx(["batchno", "batch", "lot"]) : 3;
  const expIdx = isHeader ? findIdx(["expiry", "exp", "expdate"]) : -1;
  const mrpIdx = isHeader ? findIdx(["mrp", "retailprice", "price"]) : -1;
  const costIdx = isHeader ? findIdx(["purchaseprice", "purchaserate", "cost", "rate", "purchase"]) : -1;
  const gstIdx = isHeader ? findIdx(["gst", "tax"]) : -1;
  const qtyIdx = isHeader ? findIdx(["quantity", "qty", "stock"]) : -1;
  const unitIdx = isHeader ? findIdx(["unit", "units", "uom", "sellingunit"]) : -1;

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
    const stock = qtyIdx !== -1 ? Number(String(cols[qtyIdx]).replace(/[^0-9.]/g, "")) || 1 : 1;
    const unit = unitIdx !== -1 ? cols[unitIdx] || "" : "";

    results.push({
      id: `paste-${idx}-${Date.now()}`,
      name,
      supplier,
      invoiceNo,
      supplierDate,
      company,
      drugName, // Drug Name / Composition
      type,
      hsn,
      pack,
      batch,
      expiry,
      mrp,
      cost,
      gst,
      stock,
      unit: unit || type || "Tablet",
      check: "OK",
      source: "Pasted",
    });
  });

  return results;
}

