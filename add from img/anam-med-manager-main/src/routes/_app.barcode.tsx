import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScanBarcode, Printer, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { code128b, code128Rects } from "@/lib/code128";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/barcode")({
  head: () => ({
    meta: [
      { title: "Barcode Labels · RSP Billing Software" },
      { name: "description", content: "Generate and print small scannable Code 128 product labels with your shop name." },
      { property: "og:title", content: "Barcode Labels · RSP Billing Software" },
      { property: "og:description", content: "Generate and print small scannable Code 128 product labels." },
    ],
  }),
  component: BarcodePage,
});

function BarcodeSVG({ code, width = 200, height = 44 }: { code: string; width?: number; height?: number }) {
  const mods = useMemo(() => code128b(code), [code]);
  const total = mods.reduce((n, m) => n + m.w, 0);
  const unit = width / total;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      {mods.map((m, i) => {
        const w = m.w * unit;
        const rect = m.solid ? <rect key={i} x={x} y={0} width={w} height={height} fill="#000" /> : null;
        x += w;
        return rect;
      })}
    </svg>
  );
}

function BarcodePage() {
  const meds = useStore((s) => s.medicines);
  const printer = useStore((s) => s.printer);
  const [selected, setSelected] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return meds;
    return meds.filter((m) => [m.name, m.company, m.batch, m.code ?? "", m.id].some((v) => v.toLowerCase().includes(t)));
  }, [meds, q]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const labelHTML = (m: (typeof meds)[number]) => {
    const code = m.code || m.id;
    const rects = code128Rects(code, 240, 60);
    return `
      <div class="lbl">
        <div class="shop">${printer.storeName}</div>
        <div class="nm">${m.name}</div>
        <svg viewBox="0 0 240 60" width="100%" height="13mm" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${rects}</svg>
        <div class="code">${code}</div>
        <div class="tiny">${m.batch ? "B:" + m.batch + " " : ""}${m.expiry ? "E:" + m.expiry + " " : ""}MRP Rs.${m.mrp}</div>
      </div>`;
  };

  const printAll = () => {
    if (selected.length === 0) return toast.error("Select products to print labels");
    const chosen = meds.filter((m) => selected.includes(m.id));
    const labels = Array.from({ length: qty }).flatMap(() => chosen.map(labelHTML)).join("");

    const html = `<!doctype html><html><head><title>Barcode Labels</title>
      <style>
        @page { margin: 5mm; }
        *{ -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing:border-box; }
        body{ font-family: Arial, sans-serif; margin:0; color:#000; }
        .grid{ display:grid; grid-template-columns: repeat(4, 38mm); gap:2mm; }
        .lbl{ width:38mm; padding:1mm 1.5mm; text-align:center; page-break-inside:avoid; border:1px dotted #bbb; }
        .shop{ font-size:6pt; font-weight:700; text-transform:uppercase; letter-spacing:.2px; }
        .nm{ font-size:6pt; line-height:1.05; height:7.5pt; overflow:hidden; }
        .code{ font-family:"Courier New",monospace; font-size:8pt; font-weight:700; letter-spacing:.6px; }
        .tiny{ font-size:5.5pt; }
        svg{ display:block; width:100%; margin:0.6mm 0 0.3mm; }
      </style></head><body>
      <div class="grid">${labels}</div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=900");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else toast.error("Popup blocked — allow popups for printing.");
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ScanBarcode className="h-6 w-6 text-primary" /> Barcode Labels
        </h1>
        <p className="text-sm text-muted-foreground">
          Real Code&nbsp;128 barcodes — scannable, small 38mm labels with your shop name, product code, batch, expiry and MRP.
        </p>
      </div>

      <Card className="p-4 flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <Label className="text-xs">Copies per product</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="w-28" />
        </div>
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="text-sm text-muted-foreground">{selected.length} selected</div>
        <Button variant="outline" onClick={() => setSelected(list.map((m) => m.id))}>Select all</Button>
        <Button variant="outline" onClick={() => setSelected([])}>Clear</Button>
        <Button onClick={printAll}><Printer className="h-4 w-4 mr-1.5" /> Print labels</Button>
      </Card>

      {list.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No products yet. Add stock first — every product gets a barcode automatically.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((m) => {
          const active = selected.includes(m.id);
          const code = m.code || m.id;
          return (
            <Card
              key={m.id}
              onClick={() => toggle(m.id)}
              className={"p-3 cursor-pointer transition-all " + (active ? "ring-2 ring-primary" : "hover:bg-muted/40")}
            >
              <div className="text-[9px] font-bold uppercase tracking-wide text-center truncate">{printer.storeName}</div>
              <div className="text-[10px] leading-tight text-center truncate">{m.name}</div>
              <div className="mt-1.5 bg-white rounded-sm px-1 py-0.5">
                <BarcodeSVG code={code} />
              </div>
              <div className="font-mono text-xs font-bold tracking-wider text-center mt-1">{code}</div>
              <div className="text-[9px] text-center text-muted-foreground">
                {m.batch && `B:${m.batch} `}{m.expiry && `E:${m.expiry} `}₹{m.mrp}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
