import type { Medicine } from "@/data/medicines";
import { calculateMedicineValuation } from "./medicine-units";

export interface InventoryPrintOptions {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  gstin?: string;
  drugLicense?: string;
  filtersSummary?: string[];
  reportTitle?: string;
}

function escapeHtml(s: any): string {
  return String(s ?? "").replace(/[<>&"]/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
  }[c] || c));
}

function money(n: number): string {
  return "₹" + Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function generateInventoryPrintHTML(
  medicines: Medicine[],
  opts: InventoryPrintOptions
): string {
  let totalUnits = 0;
  let totalMrpValue = 0;
  let totalCostValue = 0;

  for (const m of medicines) {
    totalUnits += Number(m.stock) || 0;
    const v = calculateMedicineValuation(m);
    totalMrpValue += v.retailValuation;
    totalCostValue += v.purchaseValuation;
  }

  const filterBadgesHtml = (opts.filtersSummary && opts.filtersSummary.length > 0)
    ? opts.filtersSummary
        .map((f) => `<span class="badge">${escapeHtml(f)}</span>`)
        .join(" ")
    : `<span class="badge">All Inventory</span>`;

  const rows = medicines.map((m, idx) => {
    const v = calculateMedicineValuation(m);
    const itemTotal = v.retailValuation;
    const addedDate = m.created_at ? new Date(m.created_at).toLocaleDateString("en-IN") : "—";

    return `
      <tr>
        <td class="text-center text-muted">${idx + 1}</td>
        <td class="font-mono text-muted">${escapeHtml(m.code || m.id)}</td>
        <td>
          <div class="font-semibold">${escapeHtml(m.name)}</div>
          ${m.generic ? `<div class="subtext">${escapeHtml(m.generic)}</div>` : ""}
        </td>
        <td>${escapeHtml(m.supplier || "—")}</td>
        <td class="font-semibold uppercase">${escapeHtml(m.company || "—")}</td>
        <td>${escapeHtml(m.type || "—")}</td>
        <td>${escapeHtml(m.category || "—")}</td>
        <td class="font-mono">${escapeHtml(m.hsn || "—")}</td>
        <td class="font-mono font-semibold">${escapeHtml(m.batch)}</td>
        <td class="font-mono">${escapeHtml(m.expiry || "—")}</td>
        <td>${escapeHtml(m.pack || "—")}</td>
        <td class="text-right tabular-nums">${money(v.packPurchaseRate)}</td>
        <td class="text-right tabular-nums font-semibold">${money(v.packMrp)}</td>
        <td class="text-center tabular-nums font-bold ${v.stockUnits < 20 ? "text-danger" : ""}">${v.stockUnits}</td>
        <td class="text-right tabular-nums font-bold">${money(itemTotal)}</td>
        <td class="text-center subtext">${escapeHtml(addedDate)}</td>
      </tr>
    `;
  }).join("");

  const nowFormatted = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(opts.reportTitle || "Inventory Report")} - ${escapeHtml(opts.storeName)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm 6mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 10px;
      line-height: 1.3;
      color: #111827;
      margin: 0;
      padding: 10px;
      background: #fff;
    }
    .header {
      border-bottom: 2px solid #1e40af;
      padding-bottom: 8px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .store-name {
      font-size: 18px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: -0.3px;
    }
    .store-meta {
      font-size: 10px;
      color: #4b5563;
      margin-top: 2px;
    }
    .report-title-box {
      text-align: right;
    }
    .report-title {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .report-meta {
      font-size: 9px;
      color: #6b7280;
      margin-top: 2px;
    }
    .filters-bar {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px 10px;
      margin-bottom: 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 9.5px;
    }
    .filters-label {
      font-weight: 700;
      color: #334155;
    }
    .badge {
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      padding: 1px 6px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 9px;
    }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6px 8px;
      text-align: center;
    }
    .kpi-label {
      font-size: 8.5px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .kpi-value {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 1px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 4px 5px;
      vertical-align: middle;
    }
    th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      text-align: left;
      font-size: 9px;
      letter-spacing: 0.2px;
    }
    tr:nth-child(even) td {
      background: #fafafa;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 8.5px; }
    .text-muted { color: #64748b; font-size: 8.5px; }
    .subtext { font-size: 8px; color: #64748b; }
    .text-danger { color: #dc2626; }
    .uppercase { text-transform: uppercase; }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .footer-notes {
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 9px;
      color: #64748b;
    }
    .signature-area {
      display: flex;
      gap: 40px;
    }
    .sig-box {
      border-top: 1px solid #334155;
      width: 140px;
      text-align: center;
      padding-top: 3px;
      font-weight: 600;
      color: #334155;
      font-size: 8.5px;
    }
    .no-print-bar {
      position: fixed;
      top: 10px;
      right: 10px;
      background: #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 12px;
      display: flex;
      gap: 8px;
      z-index: 9999;
    }
    .no-print-bar button {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    .no-print-bar button.secondary {
      background: #64748b;
    }
    @media print {
      .no-print-bar { display: none !important; }
      body { padding: 0; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body onload="setTimeout(() => { window.print(); }, 350);">
  <div class="no-print-bar">
    <button onclick="window.print()">Print / Save as PDF</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>

  <div class="header">
    <div>
      <div class="store-name">${escapeHtml(opts.storeName)}</div>
      <div class="store-meta">
        ${opts.storeAddress ? `${escapeHtml(opts.storeAddress)} · ` : ""}
        ${opts.storePhone ? `Ph: ${escapeHtml(opts.storePhone)} · ` : ""}
        ${opts.gstin ? `GSTIN: ${escapeHtml(opts.gstin)} · ` : ""}
        ${opts.drugLicense ? `D.L.: ${escapeHtml(opts.drugLicense)}` : ""}
      </div>
    </div>
    <div class="report-title-box">
      <div class="report-title">${escapeHtml(opts.reportTitle || "Inventory Stock Report")}</div>
      <div class="report-meta">Generated: ${nowFormatted}</div>
    </div>
  </div>

  <div class="filters-bar">
    <span class="filters-label">Active Filters:</span>
    ${filterBadgesHtml}
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">Filtered Medicines</div>
      <div class="kpi-value">${medicines.length} items</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Units in Stock</div>
      <div class="kpi-value">${totalUnits.toLocaleString("en-IN")} units</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Purchase Valuation (Cost)</div>
      <div class="kpi-value">${money(totalCostValue)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Retail Valuation (MRP)</div>
      <div class="kpi-value">${money(totalMrpValue)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="text-center" style="width: 25px;">#</th>
        <th style="width: 55px;">Code</th>
        <th style="min-width: 140px;">Medicine Name</th>
        <th style="width: 90px;">Supplier</th>
        <th style="width: 55px;">MFR</th>
        <th style="width: 50px;">Type</th>
        <th style="width: 70px;">Category</th>
        <th style="width: 60px;">HSN</th>
        <th style="width: 65px;">Batch</th>
        <th style="width: 50px;">Expiry</th>
        <th style="width: 45px;">Pack</th>
        <th class="text-right" style="width: 60px;">Pur. Rate</th>
        <th class="text-right" style="width: 60px;">MRP</th>
        <th class="text-center" style="width: 45px;">Stock</th>
        <th class="text-right" style="width: 70px;">Value (MRP)</th>
        <th class="text-center" style="width: 60px;">Added</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="16" class="text-center" style="padding: 20px;">No inventory records match the selected filters.</td></tr>'}
    </tbody>
    <tfoot>
      <tr style="background: #f1f5f9; font-weight: bold;">
        <td colspan="13" class="text-right">TOTALS:</td>
        <td class="text-center font-bold">${totalUnits.toLocaleString("en-IN")}</td>
        <td class="text-right font-bold">${money(totalMrpValue)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer-notes">
    <div>
      Showing ${medicines.length} medicine line(s) · Generated by RSP Medical Billing Software
    </div>
    <div class="signature-area">
      <div class="sig-box">Prepared By</div>
      <div class="sig-box">Pharmacist / Authorized Sign</div>
    </div>
  </div>
</body>
</html>`;
}

export function printInventoryReport(
  medicines: Medicine[],
  opts: InventoryPrintOptions
) {
  const html = generateInventoryPrintHTML(medicines, opts);
  const printWindow = window.open("", "_blank", "width=1100,height=800");

  if (!printWindow) {
    // Fallback if popup blocked: use iframe
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 2500);
    }, 400);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
