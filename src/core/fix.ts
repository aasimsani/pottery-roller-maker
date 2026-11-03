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

export type SpotAction = 'thicken' | 'remove' | 'fill' | 'widen' | 'leave';
/** One spot the user fixed by hand, at pixel (x, y) of the pattern. byPx is how much to thicken or widen it. */
export interface SpotFixPx { kind: 'line' | 'gap'; x: number; y: number; action: SpotAction; byPx: number }

/** How far from a click, in pixels, the nearest thin spot still counts as the one clicked. */
export const SPOT_REACH = 6;

// spotAt() finds the thin spot nearest (x, y) within SPOT_REACH, and returns its pixels. A spot is one connected
// piece of the thin mask, the same pieces the print check counts. It returns null when no spot is near.
export function spotAt(mask: Uint8Array, w: number, h: number, x: number, y: number): number[] | null {
  let best = -1, bestD = Infinity;
  for (let dy = -SPOT_REACH; dy <= SPOT_REACH; dy++) for (let dx = -SPOT_REACH; dx <= SPOT_REACH; dx++) {
    const yy = Math.round(y) + dy, xx = wrap(Math.round(x) + dx, w), d = dx * dx + dy * dy;
    if (yy >= 0 && yy < h && mask[yy * w + xx] && d < bestD) { bestD = d; best = yy * w + xx; }
  }
  if (best < 0) return null;
  const seen = new Uint8Array(w * h), out: number[] = [], stack = [best];
  seen[best] = 1;
  while (stack.length) {
    const p = stack.pop()!, px = p % w;
    out.push(p);
    for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, p - w, p + w])
      if (q >= 0 && q < w * h && mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
  }
  return out;
}

// dropSpots() takes the spots the user chose to leave out of a thin mask, so the print check stops counting them.
export function dropSpots(mask: Uint8Array, w: number, h: number, points: { x: number; y: number }[]): { mask: Uint8Array; spots: number } {
  const out = mask.slice();
  for (const { x, y } of points) for (const k of spotAt(out, w, h, x, y) ?? []) out[k] = 0;
  return { mask: out, spots: countPieces(out, w, h) };
}

// grow() sets value wherever the pixels lie within byPx / 2 of the spot, so a line or a gap gets byPx wider in all.
function grow(relief: Uint8Array, w: number, h: number, spot: Uint8Array, byPx: number, value: 0 | 1) {
  const grown = dilate(spot, w, h, byPx / 2);
  for (let k = 0; k < relief.length; k++) if (grown[k]) relief[k] = value;
}

// fixRelief() repairs what the print check flags. Thin raised lines get thickened, or removed. Narrow gaps get
// filled in, so the parts either side join, or widened, by trimming the relief beside them. Thickening and widening
// add lineByPx and gapByPx, which default to the minimum widths.
//
// Spot fixes come first and win. Each one picks the thin spot nearest its point and applies its own action, and
// "leave" keeps a spot exactly as drawn. The fix for everything else then skips every spot a spot fix claimed.
// Lines go before gaps, because thickening a line can close a gap next to it. It returns how many spots it fixed.
// ponytail: dilate() doesn't wrap, so a fix right on the seam reaches one side only. Wrap it if a seam ever shows.
export function fixRelief(src: Uint8Array, w: number, h: number, o: {
  linePx: number; gapPx: number; lines: LineFix; gaps: GapFix; lineByPx?: number; gapByPx?: number; spots?: SpotFixPx[];
}): { relief: Uint8Array; lines: number; gaps: number; spots: number } {
  const relief = src.slice(), n = w * h, spots = o.spots ?? [];
  let lines = 0, gaps = 0, applied = 0;
  for (const kind of ['line', 'gap'] as const) {
    const t = kind === 'line' ? thinOnRoller(relief, w, h, o.linePx, 0) : thinOnRoller(relief.map((v) => 1 - v), w, h, o.gapPx, 1);
    const claimed = new Uint8Array(n);
    for (const f of spots.filter((s) => s.kind === kind)) {
      const px = spotAt(t.mask, w, h, f.x, f.y);
      if (!px) continue;
      applied++;
      const spot = new Uint8Array(n);
      for (const k of px) { spot[k] = 1; claimed[k] = 1; }
      if (f.action === 'thicken') grow(relief, w, h, spot, f.byPx, 1);
      else if (f.action === 'widen') grow(relief, w, h, spot, f.byPx, 0);
      else if (f.action === 'remove' || f.action === 'fill') for (const k of px) relief[k] = f.action === 'fill' ? 1 : 0;
    }
    const rest = t.mask.map((v, k) => (v && !claimed[k] ? 1 : 0));
    const action = kind === 'line' ? o.lines : o.gaps;
    if (action === 'off') continue;
    const count = countPieces(rest, w, h);
    if (kind === 'line') lines = count; else gaps = count;
    if (action === 'remove') { for (let k = 0; k < n; k++) if (rest[k]) relief[k] = 0; }
    else if (action === 'fill') { for (let k = 0; k < n; k++) if (rest[k]) relief[k] = 1; }
    else grow(relief, w, h, rest, kind === 'line' ? o.lineByPx ?? o.linePx : o.gapByPx ?? o.gapPx, action === 'thicken' ? 1 : 0);
  }
  return { relief, lines, gaps, spots: applied };
}
