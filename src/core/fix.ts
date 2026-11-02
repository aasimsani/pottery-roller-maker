import { countPieces, dilate } from './mask';
import { thinFeatures } from './thin';

export type LineFix = 'off' | 'thicken' | 'remove';
export type GapFix = 'off' | 'fill' | 'widen';

const wrap = (x: number, w: number) => ((x % w) + w) % w;

// thinOnRoller() runs thinFeatures() on a pattern that wraps round the roller. It pads the sides with
// columns from the other side, so a line that crosses the seam isn't taken for a thin stub. It pads the
// top and bottom with edge, which is 0 for raised relief and 1 for the base, because past the band the plain ends are low base.
export function thinOnRoller(bits: Uint8Array, w: number, h: number, minPx: number, edge: 0 | 1): { mask: Uint8Array; spots: number } {
  const pad = Math.ceil(minPx) + 2, W = w + 2 * pad, H = h + 2 * pad, wide = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sy = y - pad;
    wide[y * W + x] = sy < 0 || sy >= h ? edge : bits[sy * w + wrap(x - pad, w)];
  }
  const t = thinFeatures(wide, W, H, minPx, 2 * minPx * minPx).mask, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = t[(y + pad) * W + x + pad];
  return { mask, spots: countPieces(mask, w, h) };
}

// fixRelief() repairs what the print check flags. Thin raised lines get thickened, or removed. Narrow
// gaps get filled in, so the parts either side join, or widened, by trimming the relief beside them.
// Lines go first, because thickening a line can close a gap next to it. It returns how many spots of each it fixed.
// ponytail: dilate() doesn't wrap, so a fix right on the seam reaches one side only. Wrap it if a seam ever shows.
export function fixRelief(src: Uint8Array, w: number, h: number,
  o: { linePx: number; gapPx: number; lines: LineFix; gaps: GapFix }): { relief: Uint8Array; lines: number; gaps: number } {
  const relief = src.slice();
  let lines = 0, gaps = 0;
  if (o.lines !== 'off') {
    const t = thinOnRoller(relief, w, h, o.linePx, 0);
    lines = t.spots;
    if (o.lines === 'remove') for (let k = 0; k < relief.length; k++) { if (t.mask[k]) relief[k] = 0; }
    else { const grown = dilate(t.mask, w, h, o.linePx / 2); for (let k = 0; k < relief.length; k++) if (grown[k]) relief[k] = 1; }
  }
  if (o.gaps !== 'off') {
    const t = thinOnRoller(relief.map((v) => 1 - v), w, h, o.gapPx, 1);
    gaps = t.spots;
    if (o.gaps === 'fill') for (let k = 0; k < relief.length; k++) { if (t.mask[k]) relief[k] = 1; }
    else { const grown = dilate(t.mask, w, h, o.gapPx / 2); for (let k = 0; k < relief.length; k++) if (grown[k]) relief[k] = 0; }
  }
  return { relief, lines, gaps };
}
