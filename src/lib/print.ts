import type { Sale, PrinterSettings } from "./store";
import type { Medicine } from "@/data/medicines";
import { parsePackInfo } from "./medicine-units";

function escape(s: string) {
  return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

function money(n: number) {
  return "₹" + Number(n || 0).toFixed(2);
}

function formatDate(d: string | Date | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

export function receiptHTML(sale: Sale, p: PrinterSettings): string {
  const paper = p.paperSize || "80mm";
  const width = paper === "50mm" ? "50mm" : paper === "58mm" ? "58mm" : paper === "80mm" ? "80mm" : "210mm";
  const isThermal = paper !== "A4";

  // Responsive font sizes & paddings for 50mm, 58mm, 80mm
  const is50 = paper === "50mm";
  const is58 = paper === "58mm";

  const baseFontSize = is50 ? "10px" : is58 ? "11px" : "12px";
  const storeFontSize = is50 ? "13px" : is58 ? "14px" : "16px";
  const subFontSize = is50 ? "8.5px" : is58 ? "9px" : "10px";
  const grandFontSize = is50 ? "13px" : is58 ? "14px" : "16px";
  const bodyPadding = is50 ? "2px 2px" : is58 ? "3px 4px" : "4px 8px";

  const rows = sale.items
    .map((it) => {
      const uLabel = (it.unitLabel || "").toLowerCase();
      const unitShort = uLabel.includes("tab") ? "tab" : uLabel.includes("cap") ? "cap" : uLabel.includes("ml") ? "ml" : uLabel ? uLabel.slice(0, 3) : "";
      const qtyDesc = unitShort ? `${it.qty} ${unitShort}` : `${it.qty}`;
      const rateVal = it.unitMrp !== undefined ? it.unitMrp : it.mrp;

      return `
      <tr>
        <td class="col-item">
          <div class="nm">${escape(it.name)}</div>
          <div class="sub">Batch ${escape(it.batch)} · GST ${it.gst || 0}%</div>
        </td>
        <td class="col-qty c">${qtyDesc}</td>
        <td class="col-rate r">${money(rateVal)}</td>
        <td class="col-amt r">${money(it.total)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(sale.id)}</title>
<style>
  @page { size: ${width} auto; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: ${baseFontSize};
    color: #111827;
    background: #fff;
    width: 100%;
    max-width: ${width};
    margin: 0 auto;
    padding: ${bodyPadding};
    line-height: 1.35;
  }
  .center { text-align: center; }
  .store { font-size: ${storeFontSize}; font-weight: 700; color: #000; letter-spacing: -0.01em; margin-bottom: 2px; text-transform: uppercase; }
  .muted { color: #4b5563; font-size: ${subFontSize}; line-height: 1.3; }
  .divider { border: 0; border-top: 1px solid #d1d5db; margin: 5px 0; width: 100%; }
  
  .meta { font-size: ${baseFontSize}; margin: 3px 0; }
  .row { display: flex; justify-content: space-between; align-items: baseline; width: 100%; }
  .meta-line { margin-top: 1px; color: #1f2937; }
  
  table { width: 100%; border-collapse: collapse; margin: 2px 0; table-layout: auto; }
  th, td { padding: 3px 0; vertical-align: top; }
  th { font-weight: 600; font-size: ${baseFontSize}; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  
  .col-item { text-align: left; width: 44%; }
  .col-qty { text-align: center; width: 18%; }
  .col-rate { text-align: right; width: 18%; }
  .col-amt { text-align: right; width: 20%; }
  
  .l { text-align: left; } .c { text-align: center; } .r { text-align: right; }
  .nm { font-weight: 700; color: #000; word-break: break-word; }
  .sub { color: #6b7280; font-size: ${subFontSize}; margin-top: 1px; }
  
  .totals { width: 100%; margin: 4px 0; }
  .totals .row { padding: 1.5px 0; font-size: ${baseFontSize}; }
  .totals .row span:last-child { font-weight: 600; }
  
  .grand-row { display: flex; justify-content: space-between; align-items: baseline; font-size: ${grandFontSize}; font-weight: 700; padding: 2px 0; }
  .grand-amt { font-size: ${grandFontSize}; font-weight: 800; color: #10b981; }
  .payment-row { display: flex; justify-content: space-between; align-items: baseline; font-size: ${baseFontSize}; padding: 1.5px 0; }
  .payment-val { font-weight: 700; text-transform: uppercase; }
  
  .footer { text-align: center; margin-top: 6px; padding-bottom: 8px; }
  .footer-msg { font-weight: 700; color: #1f2937; font-size: ${baseFontSize}; margin-bottom: 2px; }
  .footer-sub { color: #6b7280; font-size: ${subFontSize}; }
  
  @media print {
    .noprint { display: none !important; }
    body { padding: ${is50 ? "1px 1px" : "2px 2px"}; }
  }
</style></head>
<body onload="setTimeout(()=>window.print(),200); window.onafterprint=()=>window.close();">
  <div class="center">
    <div class="store">${escape(p.storeName || "ANAM MEDICAL STORE")}</div>
    ${p.storeAddress ? `<div class="muted">${escape(p.storeAddress)}</div>` : ""}
    ${p.storePhone ? `<div class="muted">Ph: ${escape(p.storePhone)}</div>` : ""}
    ${p.gstin ? `<div class="muted">GSTIN: ${escape(p.gstin)}${p.drugLicense ? ` · DL: ${escape(p.drugLicense)}` : ""}</div>` : ""}
  </div>
  
  <div class="divider"></div>
  
  <div class="meta">
    <div class="row">
      <span>Bill: <b>${escape(sale.id)}</b></span>
      <span>${formatDate(sale.date)}</span>
    </div>
    <div class="meta-line">Customer: <b>${escape(sale.customerName || "Walk-in")}</b>${sale.phone ? ` · ${escape(sale.phone)}` : ""}</div>
    ${sale.doctor ? `<div class="meta-line">Doctor: ${escape(sale.doctor)}</div>` : ""}
    ${sale.cashierId || sale.cashierName ? `<div class="meta-line">Cashier: <b>${escape(sale.cashierId || "ADMIN")}</b>${sale.cashierName ? ` · ${escape(sale.cashierName)}` : ""}</div>` : ""}
  </div>
  
  <div class="divider"></div>
  
  <table>
    <thead>
      <tr>
        <th class="col-item l">Item / Batch</th>
        <th class="col-qty c">Qty</th>
        <th class="col-rate r">Rate</th>
        <th class="col-amt r">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  
  <div class="divider"></div>
  
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(sale.sub)}</span></div>
    <div class="row"><span>Discount</span><span>-${money(sale.disc)}</span></div>
    <div class="row"><span>GST</span><span>${money(sale.gst)}</span></div>
  </div>
  
  <div class="divider"></div>
  
  <div class="grand-row">
    <span>GRAND TOTAL</span>
    <span class="grand-amt">${money(sale.grand)}*</span>
  </div>
  <div class="payment-row">
    <span>Payment method</span>
    <span class="payment-val">${escape((sale.payment || "cash").toUpperCase())}</span>
  </div>
  
  <div class="divider"></div>
  
  <div class="footer">
    <div class="footer-msg">${escape(p.footer || "Thank you! Get well soon.")}</div>
    <div class="footer-sub">${sale.items.length} items · Powered by RSP Billing</div>
    <button class="noprint" onclick="window.print()" style="margin-top:10px;padding:4px 12px;font-size:11px;cursor:pointer">Print</button>
  </div>
</body></html>`;
}

export function printReceipt(sale: Sale, p: PrinterSettings, medicines?: Medicine[]) {
  if (p.paperSize === "A4" && medicines) {
    printA4Invoice(sale, p, medicines);
    return;
  }
  const html = receiptHTML(sale, p);
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => iframe.remove(), 2000); }, 300);
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
}

// ─── A4 GST Invoice ──────────────────────────────────────────────────────────

/** Convert a number to Indian Rupees in words */
function amountInWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
    "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety"];

  function words(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + " " + ones[n % 10] + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + words(n % 100);
    if (n < 100000) return words(Math.floor(n / 1000)) + "Thousand " + words(n % 1000);
    if (n < 10000000) return words(Math.floor(n / 100000)) + "Lakh " + words(n % 100000);
    return words(Math.floor(n / 10000000)) + "Crore " + words(n % 10000000);
  }

  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  let result = "";
  if (rupees > 0) result += words(rupees).trim() + " Rupee" + (rupees !== 1 ? "s" : "");
  if (paise > 0) result += (result ? " and " : "") + words(paise).trim() + " Paise";
  if (!result) result = "Zero Rupees";
  return result + " Only";
}

/** Build GST slab breakup from sale items.
 *  MRP is GST-inclusive, so taxable = total / (1 + rate/100)
 */
function buildGSTBreakup(sale: Sale): { rate: number; taxable: number; cgst: number; sgst: number }[] {
  const slabs: Record<number, { taxable: number; cgst: number; sgst: number }> = {};
  for (const it of sale.items) {
    const rate = it.gst || 0;
    if (!slabs[rate]) slabs[rate] = { taxable: 0, cgst: 0, sgst: 0 };
    const totalAmt = it.total; // already after discount
    const taxable = totalAmt / (1 + rate / 100);
    const gstAmt = totalAmt - taxable;
    slabs[rate].taxable += taxable;
    slabs[rate].cgst += gstAmt / 2;
    slabs[rate].sgst += gstAmt / 2;
  }
  return [0, 5, 12, 18, 28].map((rate) => ({
    rate,
    taxable: slabs[rate]?.taxable ?? 0,
    cgst: slabs[rate]?.cgst ?? 0,
    sgst: slabs[rate]?.sgst ?? 0,
  }));
}

export function a4InvoiceHTML(sale: Sale, p: PrinterSettings, medicines: Medicine[]): string {
  const esc = (s: any) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const fmt = (n: number) => n.toFixed(2);
  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return d; }
  };

  // Build medicine lookup map by id for extra fields
  const medMap = new Map<string, Medicine>(medicines.map((m) => [m.id, m]));

  // ── Item rows
  const MIN_ROWS = 10;
  const itemRows = sale.items.map((it, i) => {
    const med = medMap.get(it.id);
    const pInfo = parsePackInfo(med || it);
    const pack = esc(it.pack || med?.pack || (pInfo.packSize > 1 ? String(pInfo.packSize) : "1"));
    const hsn = esc(med?.hsn || "");
    const expiry = esc(med?.expiry || "");
    const packSize = it.packSize || pInfo.packSize || 1;
    const isConvert = pInfo.isConvertible && packSize > 1;

    let packQtyVal: string | number = "—";
    let extraUnitsVal: string | number = "—";
    const totalQtyVal = it.totalUnits !== undefined ? it.totalUnits : it.qty;

    if (it.packQty !== undefined || it.looseQty !== undefined) {
      packQtyVal = it.packQty ?? 0;
      extraUnitsVal = isConvert ? (it.looseQty ?? 0) : "—";
    } else if (isConvert) {
      packQtyVal = Math.floor(it.qty / packSize);
      extraUnitsVal = it.qty % packSize;
    } else {
      packQtyVal = it.qty;
      extraUnitsVal = "—";
    }

    const unitName = esc(
      it.sellingUnit ||
      (it.looseQty && !it.packQty
        ? pInfo.unitLabel
        : isConvert
        ? pInfo.unitLabel
        : (med?.units || med?.type || pInfo.unitLabel))
    ).toUpperCase();

    const rateVal = it.unitMrp !== undefined ? it.unitMrp : it.mrp;

    return `
      <tr>
        <td class="tc">${i + 1}</td>
        <td class="tl">${esc(it.name)}</td>
        <td class="tc">${pack}</td>
        <td class="tc">${hsn}</td>
        <td class="tc">${esc(it.batch)}</td>
        <td class="tc">${it.gst ? it.gst + "%" : "0%"}</td>
        <td class="tc">${expiry}</td>
        <td class="tc">${packQtyVal}</td>
        <td class="tc">${extraUnitsVal}</td>
        <td class="tc"><strong>${totalQtyVal}</strong></td>
        <td class="tc">${unitName}</td>
        <td class="tr">${fmt(rateVal)}</td>
        <td class="tr">${fmt(it.total)}</td>
      </tr>`;
  });

  // Pad with blank rows if fewer than MIN_ROWS items
  const blankRows = Math.max(0, MIN_ROWS - sale.items.length);
  const emptyRow = `<tr><td colspan="13" style="height:18px">&nbsp;</td></tr>`;
  const paddingRows = Array(blankRows).fill(emptyRow).join("");

  // ── GST Breakup
  const gstBreakup = buildGSTBreakup(sale);
  const gstRows = gstBreakup.map((g) => `
    <tr>
      <td>${g.rate}%:</td>
      <td class="tr">${fmt(g.taxable)}</td>
      <td class="tr">${fmt(g.cgst)}</td>
      <td class="tr">${fmt(g.taxable)}</td>
      <td class="tr">${fmt(g.sgst)}</td>
    </tr>`).join("");

  // ── Totals
  const subTotal = sale.sub;
  const discount = sale.disc;
  const gstAmt = sale.gst;
  const netAmount = sale.grand;
  const netWords = amountInWords(netAmount);

  // ── Drug Licenses — split if two values comma-separated
  const dlRaw = (p.drugLicense || "").trim();
  const dlParts = dlRaw.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean);
  const dl1 = dlParts[0] || "";
  const dl2 = dlParts[1] || "";

  // ── Invoice date
  const invDate = fmtDate(sale.date);

  // ── Note text
  const noteText = p.footer ? p.footer : "HAVE A NICE DAY";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GST Invoice ${esc(sale.id)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 8mm 10mm 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #000;
    background: #fff;
    width: 100%;
  }
  .invoice-wrap { width: 100%; max-width: 210mm; margin: 0 auto; padding: 4px; }

  /* ── Header ── */
  .inv-header {
    display: grid;
    grid-template-columns: 1fr auto;
    border: 1.5px solid #000;
    border-bottom: none;
  }
  .inv-header .left { padding: 6px 8px; }
  .inv-header .right {
    padding: 6px 8px;
    text-align: right;
    border-left: 1px solid #000;
    white-space: nowrap;
  }
  .store-name { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
  .gst-title { font-size: 14px; font-weight: 800; text-transform: uppercase; margin-bottom: 2px; }
  .store-meta { font-size: 10.5px; line-height: 1.5; }
  .dl-row { font-size: 10px; line-height: 1.5; }

  /* ── Patient / Invoice Row ── */
  .patient-row {
    display: grid;
    grid-template-columns: 1fr auto;
    border: 1.5px solid #000;
    border-bottom: none;
  }
  .patient-left { padding: 4px 8px; }
  .patient-right { padding: 4px 8px; border-left: 1px solid #000; white-space: nowrap; text-align: right; }
  .field-line { margin: 1.5px 0; font-size: 10.5px; }
  .field-label { font-weight: 700; }
  .doctor-row { border: 1.5px solid #000; border-bottom: none; padding: 3px 8px; font-size: 10.5px; }

  /* ── Medicine Table ── */
  .items-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; border-bottom: none; }
  .items-table th {
    background: #f0f0f0;
    border: 1px solid #000;
    padding: 3px 4px;
    font-size: 10px;
    font-weight: 800;
    text-align: center;
  }
  .items-table td {
    border: 1px solid #000;
    padding: 2px 4px;
    font-size: 10.5px;
    vertical-align: middle;
  }
  .items-table tbody tr:nth-child(even) { background: #fafafa; }

  /* ── Words + GST + Totals section ── */
  .bottom-section {
    border: 1.5px solid #000;
    border-bottom: none;
  }
  .words-row {
    padding: 4px 8px;
    border-bottom: 1px solid #000;
    font-size: 10.5px;
    font-style: italic;
  }
  .gst-totals-row {
    display: grid;
    grid-template-columns: 1fr auto;
    border-bottom: 1px solid #000;
  }
  .gst-side {
    padding: 4px 8px;
    border-right: 1px solid #000;
  }
  .gst-side table { border-collapse: collapse; width: 100%; }
  .gst-side table td { font-size: 10px; padding: 1.5px 4px; border: 1px solid #bbb; }
  .gst-side table th { font-size: 10px; font-weight: 700; padding: 2px 4px; border: 1px solid #888; background: #f5f5f5; text-align: center; }
  .totals-side { padding: 4px 10px; min-width: 200px; }
  .totals-side table { width: 100%; border-collapse: collapse; }
  .totals-side table td { font-size: 11px; padding: 2.5px 4px; }
  .net-row td { font-size: 13px !important; font-weight: 900 !important; border-top: 1.5px solid #000 !important; padding-top: 4px !important; }

  /* ── Note + Signature Row ── */
  .note-sig-row {
    display: grid;
    grid-template-columns: 1fr auto;
    border: 1.5px solid #000;
    border-bottom: none;
  }
  .note-left { padding: 5px 8px; font-size: 10.5px; }
  .sig-right { padding: 5px 8px; border-left: 1px solid #000; text-align: right; font-size: 10.5px; white-space: nowrap; min-width: 200px; }
  .sig-line { margin-top: 28px; border-top: 1px solid #000; font-size: 9.5px; text-align: center; padding-top: 2px; }

  /* ── Software footer ── */
  .sw-footer {
    border: 1.5px solid #000;
    padding: 4px 8px;
    text-align: center;
    font-size: 9.5px;
    color: #333;
    letter-spacing: 0.3px;
  }

  /* ── Utility ── */
  .tl { text-align: left; }
  .tc { text-align: center; }
  .tr { text-align: right; }
  .bold { font-weight: 700; }

  /* ── No-print toolbar ── */
  .noprint-bar {
    position: fixed; top: 10px; right: 10px;
    background: #fff; border: 1px solid #ccc;
    border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.15);
    padding: 6px 12px; display: flex; gap: 8px; z-index: 9999;
  }
  .noprint-bar button {
    background: #1d4ed8; color: #fff; border: none;
    padding: 6px 14px; border-radius: 4px;
    font-weight: 700; font-size: 12px; cursor: pointer;
  }
  .noprint-bar button.sec { background: #64748b; }
  @media print { .noprint-bar { display: none !important; } }
</style>
</head>
<body onload="setTimeout(()=>window.print(),300);">
  <div class="noprint-bar">
    <button onclick="window.print()">🖨 Print / PDF</button>
    <button class="sec" onclick="window.close()">Close</button>
  </div>

  <div class="invoice-wrap">

    <!-- ══ HEADER ══ -->
    <div class="inv-header">
      <div class="left">
        <div class="store-name">${esc(p.storeName)}</div>
        ${p.storeAddress ? `<div class="store-meta">${esc(p.storeAddress)}</div>` : ""}
        ${p.storePhone ? `<div class="store-meta">Ph: ${esc(p.storePhone)}</div>` : ""}
      </div>
      <div class="right">
        <div class="gst-title">GST &nbsp; Invoice</div>
        ${p.gstin ? `<div class="dl-row">GSTIN &nbsp;: ${esc(p.gstin)}</div>` : ""}
        ${dl1 ? `<div class="dl-row">DL No1 : ${esc(dl1)}</div>` : ""}
        ${dl2 ? `<div class="dl-row">DL No2 : ${esc(dl2)}</div>` : ""}
      </div>
    </div>

    <!-- ══ PATIENT & INVOICE DETAILS ══ -->
    <div class="patient-row">
      <div class="patient-left">
        <div class="field-line"><span class="field-label">Patient Name : </span>${esc(sale.customerName || "Walk-in")}</div>
      </div>
      <div class="patient-right">
        <div class="field-line"><span class="field-label">InvNo &nbsp;&nbsp;: </span>${esc(sale.id)}</div>
        <div class="field-line"><span class="field-label">InvDate: </span>${invDate}</div>
        <div class="field-line"><span class="field-label">Type &nbsp;&nbsp;: </span>${esc(sale.payment)}</div>
      </div>
    </div>

    <!-- ══ DOCTOR ROW ══ -->
    ${sale.doctor ? `<div class="doctor-row"><span class="field-label">Doctor Name : </span>${esc(sale.doctor)}</div>` : `<div class="doctor-row">&nbsp;</div>`}

    <!-- ══ ITEM TABLE ══ -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:24px">SNo</th>
          <th style="min-width:120px">Product Name</th>
          <th style="width:36px">Pack</th>
          <th style="width:60px">HSN</th>
          <th style="width:58px">Batch</th>
          <th style="width:32px">GST</th>
          <th style="width:48px">Exp</th>
          <th style="width:36px">Pack Qty</th>
          <th style="width:34px">Extra</th>
          <th style="width:38px">Total Qty</th>
          <th style="width:44px">Units</th>
          <th style="width:52px">Rate</th>
          <th style="width:60px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows.join("")}
        ${paddingRows}
      </tbody>
    </table>

    <!-- ══ BOTTOM SECTION: Words + GST + Totals ══ -->
    <div class="bottom-section">

      <!-- Amount in Words -->
      <div class="words-row">
        <span class="bold">Total Amount (In Words) : </span>${esc(netWords)}
      </div>

      <!-- GST Breakup + Totals Box -->
      <div class="gst-totals-row">
        <div class="gst-side">
          <table>
            <thead>
              <tr>
                <th>GST %</th>
                <th>CGST% VALUE</th>
                <th>CGST AMT</th>
                <th>SGST% VALUE</th>
                <th>SGST AMT</th>
              </tr>
            </thead>
            <tbody>
              ${gstRows}
            </tbody>
          </table>
        </div>
        <div class="totals-side">
          <table>
            <tr>
              <td>SubTotal</td>
              <td class="tr">${fmt(subTotal)}</td>
            </tr>
            <tr>
              <td>Less Disc</td>
              <td class="tr">${fmt(discount)}</td>
            </tr>
            <tr>
              <td>Gst Amt</td>
              <td class="tr">${fmt(gstAmt)}</td>
            </tr>
            <tr class="net-row">
              <td class="bold">NET AMOUNT :</td>
              <td class="tr bold">${fmt(netAmount)}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>

    <!-- ══ NOTE + AUTHORISED SIGNATURE ══ -->
    <div class="note-sig-row">
      <div class="note-left">
        <span class="bold">Note : </span>${esc(noteText)}
      </div>
      <div class="sig-right">
        <div>For <strong>${esc(p.storeName)}</strong></div>
        <div class="sig-line">Authorised Signatory</div>
      </div>
    </div>

    <!-- ══ SOFTWARE FOOTER ══ -->
    <div class="sw-footer">
      OUR SOFTWARE &nbsp;|&nbsp; Manage your business with &nbsp;<strong>RSPSoftwares.com</strong>
    </div>

  </div>
</body>
</html>`;
}

export function printA4Invoice(sale: Sale, p: PrinterSettings, medicines: Medicine[]) {
  const html = a4InvoiceHTML(sale, p, medicines);
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => iframe.remove(), 2500); }, 400);
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
}
