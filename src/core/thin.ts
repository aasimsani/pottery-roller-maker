import { dilate, distanceTo } from './mask';

export interface ThinResult {
  /** 1 where a feature is narrower than the minimum width. */
  mask: Uint8Array;
  /** How many separate thin spots there are. */
  spots: number;
}

// thinFeatures() finds the parts of a shape narrower than minPx pixels, the way a slicer would
// lose them. It shrinks the shape by half the minimum width and grows the survivors back
// (a morphological opening), and anything that doesn't come back is too thin. Square corners
// lose a few pixels too, so spots smaller than minAreaPx are ignored.
export function thinFeatures(src: Uint8Array, w: number, h: number, minPx: number, minAreaPx: number): ThinResult {
  const n = w * h, r = minPx / 2, outside = new Uint8Array(n);
  for (let k = 0; k < n; k++) outside[k] = src[k] ? 0 : 1;
  const d = distanceTo(outside, w, h), core = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    // Pixels beyond the image edge count as outside the shape.
    const edge = Math.min(x + 1, y + 1, w - x, h - y);
    core[k] = src[k] && Math.min(d[k], edge) >= r ? 1 : 0;
  }
  const kept = dilate(core, w, h, r), thin = new Uint8Array(n), mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) thin[k] = src[k] && !kept[k] ? 1 : 0;

  let spots = 0;
  const seen = new Uint8Array(n), stack: number[] = [], spot: number[] = [];
  for (let k = 0; k < n; k++) {
    if (!thin[k] || seen[k]) continue;
    spot.length = 0; seen[k] = 1; stack.push(k);
    while (stack.length) {
      const p = stack.pop()!, x = p % w;
      spot.push(p);
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < n && thin[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (spot.length >= minAreaPx) { spots++; for (const p of spot) mask[p] = 1; }
  }
  return { mask, spots };
}
