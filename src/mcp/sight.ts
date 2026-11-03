// sight.ts draws the pictures and the summaries that let Claude see a design. Every picture can carry a coordinate
// grid in shares (u across, v down) of the pattern, and numbered markers on the flagged spots, so Claude can name a
// place and pass it straight to fix_spot or view_region.
import type { Mask } from '../core/mask';
import { cssRgb } from '../render/preview';

// printsMask() is what actually reaches the pot. A raised line too thin to print doesn't print, and a gap too narrow to
// stay clean fills in, with underglaze on an underglaze roller and with clay on a texture roller.
export function printsMask(relief: Uint8Array, thinLines: Uint8Array, thinGaps: Uint8Array): Uint8Array {
  return relief.map((v, k) => ((v && !thinLines[k]) || thinGaps[k] ? 1 : 0));
}

// coverageGrid() splits the pattern into cols × rows cells and gives each cell its share raised, in %, and how many
// flagged spots fall in it. It's the cheap, text-only look: a model can check the balance before it asks for a picture.
export function coverageGrid(relief: Uint8Array, w: number, h: number, cols: number, rows: number, spots: { u: number; v: number }[]) {
  const sum = Array.from({ length: rows }, () => new Array(cols).fill(0)), count = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.min(rows - 1, Math.floor((y / h) * rows)), c = Math.min(cols - 1, Math.floor((x / w) * cols)), v = relief[y * w + x];
    sum[r][c] += v; count[r][c]++; total += v;
  }
  const spotCells = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const { u, v } of spots) spotCells[Math.min(rows - 1, Math.floor(v * rows))][Math.min(cols - 1, Math.floor(u * cols))]++;
  return { cells: sum.map((row, r) => row.map((s, c) => Math.round((100 * s) / Math.max(1, count[r][c])))), spots: spotCells, raised: Math.round((100 * total) / Math.max(1, w * h)) };
}

// gridTicks() picks round grid positions between a and b, at the smallest step that keeps the lines readable.
export function gridTicks(a: number, b: number): number[] {
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5];
  const step = steps.find((s) => Math.floor(b / s + 1e-9) - Math.ceil(a / s - 1e-9) + 1 <= 12) ?? 0.5;
  const out: number[] = [];
  for (let i = Math.ceil(a / step - 1e-9); i * step <= b + 1e-9; i++) out.push(Math.round(i * step * 1e6) / 1e6 + 0);
  return out;
}

export interface NumberedSpot { n: number; kind: 'line' | 'gap'; x: number; y: number }
export interface Region { u0: number; v0: number; u1: number; v1: number }

const label = (t: number) => String(t).replace(/^0(?=\.)/, '');

// renderSight() draws one region of the pattern into a new canvas at most maxPx across. A small region scales up with
// hard pixel edges, up to 8×, so fine detail stays readable. relief is what to show raised, and problems tints the
// flagged pixels red (thin lines) and purple (narrow gaps).
export function renderSight(mask: Mask, relief: Uint8Array, r: Region, o: {
  maxPx: number; grid: boolean; spots: NumberedSpot[]; problems?: { lines: Uint8Array; gaps: Uint8Array };
}): HTMLCanvasElement {
  const { w, h } = mask, x0 = Math.floor(r.u0 * w), y0 = Math.floor(r.v0 * h);
  const cw = Math.max(1, Math.ceil(r.u1 * w) - x0), ch = Math.max(1, Math.ceil(r.v1 * h) - y0);
  const src = document.createElement('canvas');
  src.width = cw; src.height = ch;
  const img = src.getContext('2d')!.createImageData(cw, ch), d = img.data;
  const plastic = cssRgb('--plastic'), hole = cssRgb('--hole'), thin = cssRgb('--island'), narrow = cssRgb('--thin-hole');
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const k = (y0 + y) * w + x0 + x, o4 = (y * cw + x) * 4;
    const col = o.problems?.lines[k] ? thin : o.problems?.gaps[k] ? narrow : relief[k] ? plastic : hole;
    d[o4] = col[0]; d[o4 + 1] = col[1]; d[o4 + 2] = col[2]; d[o4 + 3] = 255;
  }
  src.getContext('2d')!.putImageData(img, 0, 0);

  const k = Math.min(8, o.maxPx / cw), out = document.createElement('canvas');
  out.width = Math.round(cw * k); out.height = Math.round(ch * k);
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, out.width, out.height);
  const X = (u: number) => ((u * w - x0) / cw) * out.width, Y = (v: number) => ((v * h - y0) / ch) * out.height;

  if (o.grid) {
    g.font = '600 12px system-ui, sans-serif'; g.lineWidth = 1;
    for (const u of gridTicks(r.u0, r.u1)) {
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.moveTo(X(u) + 0.5, 0); g.lineTo(X(u) + 0.5, out.height); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(X(u) + 2, 2, 38, 15); g.fillStyle = '#fff'; g.fillText(`u${label(u)}`, X(u) + 4, 14);
    }
    for (const v of gridTicks(r.v0, r.v1)) {
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.moveTo(0, Y(v) + 0.5); g.lineTo(out.width, Y(v) + 0.5); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(2, Y(v) + 2, 38, 15); g.fillStyle = '#fff'; g.fillText(`v${label(v)}`, 4, Y(v) + 14);
    }
  }
  // Numbers sit on each spot's own point, in a white disc with a ring in the spot's colour.
  for (const s of o.spots) {
    const sx = ((s.x + 0.5 - x0) / cw) * out.width, sy = ((s.y + 0.5 - y0) / ch) * out.height;
    if (sx < 0 || sy < 0 || sx > out.width || sy > out.height) continue;
    g.beginPath(); g.arc(sx, sy, 10, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = s.kind === 'line' ? `rgb(${thin.join(',')})` : `rgb(${narrow.join(',')})`; g.stroke();
    g.fillStyle = '#111'; g.font = '700 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(s.n), sx, sy + 0.5); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
  return out;
}
