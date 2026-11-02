// This experimental module traces a round piece's profile from a side-on photo against a plain background.
import { otsuThreshold } from './threshold';

// backgroundColor() is the median colour of the image's border pixels.
function backgroundColor(rgba: ArrayLike<number>, w: number, h: number): number[] {
  const border: number[][] = [[], [], []];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) for (let c = 0; c < 3; c++) border[c].push(rgba[(y * w + x) * 4 + c]);
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) for (let c = 0; c < 3; c++) border[c].push(rgba[(y * w + x) * 4 + c]);
  return border.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

// autoTolerance() picks the background tolerance with Otsu's method on each pixel's colour
// distance from the background. The background sits near 0 and the pot far out, and a soft
// shadow lands in between. The cutoff falls in the widest gap, which usually sits between
// the shadow and the pot.
export function autoTolerance(rgba: ArrayLike<number>, w: number, h: number): number {
  const bg = backgroundColor(rgba, w, h), hist = new Array(256).fill(0);
  for (let k = 0; k < w * h; k++) {
    hist[Math.min(255, Math.round(Math.hypot(rgba[k * 4] - bg[0], rgba[k * 4 + 1] - bg[1], rgba[k * 4 + 2] - bg[2])))]++;
  }
  return otsuThreshold(hist);
}

// segment() separates the piece from the background. Pixels further than tol from it (RGB distance) count as the piece.
// Only the largest connected region survives, which drops dust, shadows at the edges and other clutter.
export function segment(rgba: ArrayLike<number>, w: number, h: number, tol: number): Uint8Array {
  const bg = backgroundColor(rgba, w, h);
  const n = w * h, fg = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const dr = rgba[k * 4] - bg[0], dg = rgba[k * 4 + 1] - bg[1], db = rgba[k * 4 + 2] - bg[2];
    fg[k] = dr * dr + dg * dg + db * db > tol * tol ? 1 : 0;
  }

  const label = new Int32Array(n), queue = new Int32Array(n);
  let best = 0, bestSize = 0, next = 0;
  for (let k = 0; k < n; k++) {
    if (!fg[k] || label[k]) continue;
    const id = ++next;
    let tail = 0;
    label[k] = id; queue[tail++] = k;
    for (let hd = 0; hd < tail; hd++) {
      const p = queue[hd], x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < n && fg[q] && !label[q]) { label[q] = id; queue[tail++] = q; }
      }
    }
    if (tail > bestSize) { bestSize = tail; best = id; }
  }
  const out = new Uint8Array(n);
  for (let k = 0; k < n; k++) out[k] = label[k] === best && best ? 1 : 0;
  return out;
}

export interface TracedProfile {
  /** Heights above the base and outside diameters, in mm, from base to rim. */
  profile: { z: number; d: number }[];
  /** The piece's centre line, top row and bottom row, in image pixels. */
  axis: number; top: number; bottom: number;
}

// profileFromMask() measures the piece row by row. The centre line comes from the bottom 15% of
// the piece, where a handle rarely reaches. Each row's radius is the smaller of its two half-widths,
// so a handle on one side doesn't count. realHeight (mm) sets the scale.
export function profileFromMask(mask: Uint8Array, w: number, h: number, realHeight: number, points = 12): TracedProfile {
  const left = new Int32Array(h).fill(-1), right = new Int32Array(h).fill(-1);
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (left[y] < 0) left[y] = x; right[y] = x + 1; }
    if (left[y] >= 0) { if (top < 0) top = y; bottom = y; }
  }
  if (top < 0) throw new Error('No piece found in the photo. Try a plainer background or change the tolerance.');

  const centres: number[] = [];
  for (let y = Math.round(bottom - 0.15 * (bottom - top)); y <= bottom; y++) if (left[y] >= 0) centres.push((left[y] + right[y]) / 2);
  const axis = centres.sort((a, b) => a - b)[centres.length >> 1];
  const radius = (y: number) => (left[y] < 0 ? 0 : Math.max(0, Math.min(axis - left[y], right[y] - axis)));
  // A 5-row median smooths out pixel noise and small glaze drips along the edge.
  const smooth = (y: number) => {
    const rs = [];
    for (let k = Math.max(top, y - 2); k <= Math.min(bottom, y + 2); k++) rs.push(radius(k));
    return rs.sort((a, b) => a - b)[rs.length >> 1];
  };

  const scale = realHeight / (bottom - top + 1), count = Math.max(2, points), profile = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1), y = Math.round(bottom - t * (bottom - top));
    profile.push({ z: Math.round(t * realHeight * 10) / 10, d: Math.round(2 * smooth(y) * scale * 10) / 10 });
  }
  return { profile, axis, top, bottom };
}
