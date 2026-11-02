import type { Geometry } from './geometry';

/** One repeat cell's paint mask. A 1 in paint means a hole that paint goes through. */
export interface Tile { w: number; h: number; paint: Uint8Array }

/** A rasterised stencil. A solid pixel is plastic, and a non-solid pixel inside the stencil is a hole. */
export interface Mask { w: number; h: number; res: number; solid: Uint8Array; inside: Uint8Array; frame: Uint8Array }

export type IslandMode = 'bridge' | 'drop' | 'keep';

/** One layer of the design, already rendered into a repeat cell. */
export interface MaskLayer {
  tile: Tile;
  /** Cells around the band, and down the layer's slice of it. */
  repeats: number; rows: number;
  /** Shifts every other row by half a cell. */
  stagger: boolean;
  /** Shifts the whole repeat, in fractions of a cell. */
  offsetU: number; offsetV: number;
  /** The slice of the band this layer covers, as fractions from the top edge. */
  from: number; to: number;
  /** 'paint' adds paint on top of lower layers, and 'cut' clears it. */
  blend: 'paint' | 'cut';
  /** For paint layers, clears lower layers' paint within this many pixels of the shape. */
  haloPx: number;
  /** Widens the layer's shapes by this many pixels on every side, for line art too fine to print. */
  growPx: number;
}

// buildMask() rasterises the stencil from its layers, bottom layer first. Every layer keeps
// its own repeat grid, so a moon can repeat twice round the band over a jigsaw that repeats ten times.
export function buildMask(g: Geometry, layers: MaskLayer[]): Mask {
  const { W, H } = g, n = W * H;
  const solid = new Uint8Array(n), inside = new Uint8Array(n), frame = new Uint8Array(n);
  const U = new Float32Array(n), V = new Float32Array(n);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const s = g.sample(i, j);
    if (!s) continue;
    const k = j * W + i;
    inside[k] = 1;
    if (s.frame) frame[k] = 1;
    else { U[k] = s.u; V[k] = s.v; }
  }

  const paint = new Uint8Array(n), shape = new Uint8Array(n);
  for (const L of layers) {
    shape.fill(0);
    const { tile } = L, span = L.to - L.from;
    for (let k = 0; k < n; k++) {
      if (!inside[k] || frame[k]) continue;
      const lv = (V[k] - L.from) / span;
      if (lv < 0 || lv >= 1) continue;
      const row = lv * L.rows + L.offsetV, ri = Math.floor(row);
      let col = U[k] * L.repeats + L.offsetU;
      if (L.stagger && ri % 2) col += 0.5;
      const tx = Math.min(tile.w - 1, Math.floor((col - Math.floor(col)) * tile.w));
      const ty = Math.min(tile.h - 1, Math.floor((row - ri) * tile.h));
      shape[k] = tile.paint[ty * tile.w + tx];
    }
    if (L.growPx > 0) {
      const grown = dilate(shape, W, H, L.growPx);
      for (let k = 0; k < n; k++) shape[k] = grown[k] && inside[k] && !frame[k] ? 1 : 0;
    }
    if (L.blend === 'cut') {
      for (let k = 0; k < n; k++) if (shape[k]) paint[k] = 0;
      continue;
    }
    if (L.haloPx > 0) {
      const near = dilate(shape, W, H, L.haloPx);
      for (let k = 0; k < n; k++) if (near[k]) paint[k] = 0;
    }
    for (let k = 0; k < n; k++) if (shape[k]) paint[k] = 1;
  }
  for (let k = 0; k < n; k++) solid[k] = inside[k] && (frame[k] || !paint[k]) ? 1 : 0;
  return { w: W, h: H, res: g.res, solid, inside, frame };
}

// distanceTo() gives each pixel's distance, in pixels, to the nearest set pixel of seed. It is a
// two-pass chamfer transform (steps of 1 and √2), within ~8% of the true Euclidean distance.
export function distanceTo(seed: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9, d = new Float32Array(w * h), D = Math.SQRT2;
  for (let k = 0; k < w * h; k++) d[k] = seed[k] ? 0 : INF;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (x > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
    if (y > 0) {
      d[k] = Math.min(d[k], d[k - w] + 1);
      if (x > 0) d[k] = Math.min(d[k], d[k - w - 1] + D);
      if (x < w - 1) d[k] = Math.min(d[k], d[k - w + 1] + D);
    }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const k = y * w + x;
    if (x < w - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
    if (y < h - 1) {
      d[k] = Math.min(d[k], d[k + w] + 1);
      if (x < w - 1) d[k] = Math.min(d[k], d[k + w + 1] + D);
      if (x > 0) d[k] = Math.min(d[k], d[k + w - 1] + D);
    }
  }
  return d;
}

/** Grows a mask by r pixels, roughly circularly. */
export function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const d = distanceTo(src, w, h), out = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) out[k] = d[k] <= r ? 1 : 0;
  return out;
}

// removePinches() fills one pixel of every diagonal-only 2x2 block. Pixels that touch
// only at a corner would otherwise share a single mesh edge between four faces.
export function removePinches(solid: Uint8Array, w: number, h: number): void {
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const k = y * w + x, a = solid[k], b = solid[k + 1], c = solid[k + w], d = solid[k + w + 1];
      if (a && d && !b && !c) { solid[k + 1] = 1; changed = true; }
      else if (b && c && !a && !d) { solid[k] = 1; changed = true; }
    }
  }
}

export interface IslandResult { islands: number; islandMask: Uint8Array; bridgeMask: Uint8Array }

// countPieces() counts the separate pieces of plastic, joined edge to edge. Pixels that only
// touch at a corner don't hold together in a print, so they count as separate.
export function countPieces(solid: Uint8Array, w: number, h: number): number {
  const n = w * h, seen = new Uint8Array(n), stack: number[] = [];
  let pieces = 0;
  for (let k = 0; k < n; k++) {
    if (!solid[k] || seen[k]) continue;
    pieces++; seen[k] = 1; stack.push(k);
    while (stack.length) {
      const p = stack.pop()!, x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < n && solid[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
  }
  return pieces;
}

// connectIslands() finds solid regions that don't touch the frame. These would fall
// out of a real stencil. Islands smaller than minIslandPx are always turned into paint.
// Mode 'bridge' links each remaining island with a strip of plastic, 'drop' paints over
// them, and 'keep' only reports them.
export function connectIslands(
  m: Mask,
  { mode, bridgePx, minIslandPx }: { mode: IslandMode; bridgePx: number; minIslandPx: number },
): IslandResult {
  const { w, h, solid, inside, frame } = m, n = w * h;
  const seen = new Uint8Array(n), queue = new Int32Array(n);
  const islandMask = new Uint8Array(n), bridgeMask = new Uint8Array(n);
  let tail = 0;
  const nbrs = (k: number, fn: (q: number) => void) => {
    const x = k % w;
    if (x > 0) fn(k - 1);
    if (x < w - 1) fn(k + 1);
    if (k >= w) fn(k - w);
    if (k < n - w) fn(k + w);
  };
  const flood = (start: number) => { // floods one solid component into the queue
    const from = tail;
    seen[start] = 1; queue[tail++] = start;
    for (let hd = from; hd < tail; hd++) nbrs(queue[hd], (q) => {
      if (solid[q] && !seen[q]) { seen[q] = 1; queue[tail++] = q; }
    });
    return from;
  };
  for (let k = 0; k < n; k++) if (frame[k] && solid[k] && !seen[k]) flood(k);
  if (tail === 0) {
    // With no border to anchor to, the largest piece of plastic becomes the anchor instead.
    // Without one, nothing would seed the bridge search and every island would stay loose.
    let best = -1, bestSize = 0;
    for (let k = 0; k < n; k++) {
      if (!solid[k] || seen[k]) continue;
      const from = flood(k);
      if (tail - from > bestSize) { bestSize = tail - from; best = k; }
    }
    seen.fill(0); tail = 0;
    if (best >= 0) flood(best);
  }
  const mainEnd = tail;

  // Label the islands, dropping tiny specks first.
  let islands = 0;
  for (let k = 0; k < n; k++) {
    if (!solid[k] || seen[k]) continue;
    const from = flood(k), size = tail - from;
    for (let t = from; t < tail; t++) {
      const q = queue[t];
      if (size < minIslandPx || mode === 'drop') solid[q] = 0;
      else islandMask[q] = 1;
    }
    if (size >= minIslandPx) islands++;
  }
  if (mode !== 'bridge' || !islands) return { islands, islandMask, bridgeMask };

  // Breadth-first search from the frame-connected plastic through paint pixels.
  // Reaching an island traces the path back as a bridge, and the island then joins the search.
  // ponytail: islands join the queue at the current frontier, so later bridges can be a
  // few pixels longer than the true shortest ones.
  const parent = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  tail = 0;
  for (let t = 0; t < mainEnd; t++) { const k = queue[t]; done[k] = 1; queue[tail++] = k; }
  const path: number[] = [];
  for (let hd = 0; hd < tail; hd++) {
    const p = queue[hd];
    nbrs(p, (q) => {
      if (done[q] || !inside[q]) return;
      if (islandMask[q]) {
        for (let c = p; c !== -1 && !solid[c]; c = parent[c]) path.push(c);
        const st = [q]; done[q] = 1;
        while (st.length) {
          const r = st.pop()!; queue[tail++] = r;
          nbrs(r, (s) => { if (islandMask[s] && !done[s]) { done[s] = 1; st.push(s); } });
        }
      } else if (!solid[q]) {
        done[q] = 1; parent[q] = p; queue[tail++] = q;
      }
    });
  }
  const rad = Math.max(0.5, bridgePx / 2), ri = Math.ceil(rad);
  for (const k of path) {
    const x0 = k % w, y0 = (k / w) | 0;
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      const x = x0 + dx, y = y0 + dy, q = y * w + x;
      if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= rad * rad && inside[q] && !solid[q]) {
        solid[q] = 1; bridgeMask[q] = 1;
      }
    }
  }
  return { islands, islandMask, bridgeMask };
}
