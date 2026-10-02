import type { Sale, PrinterSettings } from "./store";

function escape(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

function money(n: number) {
  return "Rs." + n.toFixed(2);
}

export function receiptHTML(sale: Sale, p: PrinterSettings): string {
  const width = p.paperSize === "58mm" ? "58mm" : p.paperSize === "80mm" ? "80mm" : "210mm";
  const isThermal = p.paperSize !== "A4";
  const rows = sale.items
    .map(
      (it) => `
      <tr>
        <td class="l">
          <div class="nm">${escape(it.name)}</div>
          <div class="sub">Batch ${escape(it.batch)} · GST ${it.gst}%${it.discount ? ` · Disc ${it.discount}%` : ""}</div>
        </td>
        <td class="c">${it.qty}</td>
        <td class="r">${money(it.mrp)}</td>
        <td class="r">${money(it.total)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(sale.id)}</title>
<style>
  @page { size: ${width} auto; margin: 4mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${isThermal ? '"Courier New", monospace' : "Arial, sans-serif"}; font-size: ${isThermal ? "11px" : "12px"}; color:#000; margin:0; padding:0; width: ${width}; }
  .wrap { padding: 4px 6px; }
  .center { text-align:center; }
  .store { font-size: ${isThermal ? "14px" : "18px"}; font-weight:700; }
  .muted { color:#333; font-size:${isThermal ? "10px" : "11px"}; }
  hr { border:none; border-top:1px dashed #000; margin:6px 0; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding: 2px 0; vertical-align: top; }
  th { border-bottom:1px dashed #000; text-align:left; font-weight:700; }
  .l { text-align:left; } .c { text-align:center; } .r { text-align:right; }
  .nm { font-weight:600; }
  .sub { color:#333; font-size:${isThermal ? "9px" : "10px"}; }
  .totals { margin-top:6px; }
  .totals .row { display:flex; justify-content:space-between; padding:1px 0; }
  .grand { font-size:${isThermal ? "13px" : "16px"}; font-weight:700; border-top:1px dashed #000; padding-top:4px; margin-top:4px; }
  .footer { text-align:center; margin-top:8px; font-size:${isThermal ? "10px" : "11px"}; }
  @media print { .noprint { display:none; } }
</style></head>
<body onload="setTimeout(()=>window.print(),200); window.onafterprint=()=>window.close();">
  <div class="wrap">
    <div class="center">
      <div class="store">${escape(p.storeName)}</div>
      <div class="muted">${escape(p.storeAddress)}</div>
      <div class="muted">Ph: ${escape(p.storePhone)}</div>
      <div class="muted">GSTIN: ${escape(p.gstin)} · DL: ${escape(p.drugLicense)}</div>
    </div>
    <hr/>
    <div style="display:flex;justify-content:space-between">
      <span>Bill: <b>${escape(sale.id)}</b></span>
      <span>${new Date(sale.date).toLocaleString("en-IN")}</span>
    </div>
    <div>Customer: <b>${escape(sale.customerName || "Walk-in")}</b>${sale.phone ? " · " + escape(sale.phone) : ""}</div>
    ${sale.doctor ? `<div>Doctor: ${escape(sale.doctor)}</div>` : ""}
    ${sale.cashierId ? `<div>Cashier: <b>${escape(sale.cashierId)}</b>${sale.cashierName ? " · " + escape(sale.cashierName) : ""}</div>` : ""}
    <hr/>
    <table>
      <thead><tr><th class="l">Item</th><th class="c">Qty</th><th class="r">MRP</th><th class="r">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Sub Total</span><span>${money(sale.sub)}</span></div>
      <div class="row"><span>Discount</span><span>- ${money(sale.disc)}</span></div>
      <div class="row"><span>GST</span><span>${money(sale.gst)}</span></div>
      <div class="row grand"><span>GRAND TOTAL</span><span>${money(sale.grand)}</span></div>
      <div class="row"><span>Payment</span><span>${escape(sale.payment.toUpperCase())}</span></div>
    </div>
    <hr/>
    <div class="footer">${escape(p.footer)}</div>
    <div class="footer muted">${sale.items.length} item(s) · Powered by RSP Billing</div>
    <button class="noprint" onclick="window.print()" style="margin-top:10px;padding:6px 10px">Print</button>
  </div>
</body></html>`;
}

export function printReceipt(sale: Sale, p: PrinterSettings) {
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
