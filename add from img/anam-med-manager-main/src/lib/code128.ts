/**
 * Minimal Code 128-B encoder producing real, scannable bar widths.
 * Returns an array of {w, solid} modules, bar-first.
 */
const PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","233111",
];

export type Module = { w: number; solid: boolean };

export function code128b(input: string): Module[] {
  const text = (input || "").replace(/[^\x20-\x7E]/g, "").slice(0, 40) || "0";
  const values: number[] = [];
  for (const ch of text) values.push(ch.charCodeAt(0) - 32);

  const START_B = 104;
  let sum = START_B;
  values.forEach((v, i) => { sum += v * (i + 1); });
  const check = sum % 103;

  const seq = [START_B, ...values, check, 106];
  const mods: Module[] = [];
  for (const code of seq) {
    const p = PATTERNS[code];
    for (let i = 0; i < p.length; i++) mods.push({ w: Number(p[i]), solid: i % 2 === 0 });
  }
  // Trailing quiet-bar termination of stop pattern (2 modules)
  mods.push({ w: 2, solid: true });
  return mods;
}

/** SVG rect markup string (for print windows). */
export function code128Rects(code: string, width: number, height: number): string {
  const mods = code128b(code);
  const total = mods.reduce((n, m) => n + m.w, 0);
  const unit = width / total;
  let x = 0;
  let out = "";
  for (const m of mods) {
    const w = m.w * unit;
    if (m.solid) out += `<rect x="${x.toFixed(3)}" y="0" width="${w.toFixed(3)}" height="${height}" fill="#000"/>`;
    x += w;
  }
  return out;
}
