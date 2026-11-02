export type MixMode = 'together' | 'scatter';

/** What the layout needs to know about one design in the mix. */
export interface LayoutItem {
  texture: boolean;
  /** Motif size as a fraction of its box, or texture repeat size as a fraction of the cell height. */
  scale: number;
  /** Rotation in degrees. */
  rotate: number;
}

/** One motif drawn inside a w × h mm box centred at (cx, cy), in cell coordinates. */
export interface Placement { item: number; cx: number; cy: number; w: number; h: number; rotate: number }

/** The designs drawn into one repeat cell. Textures fill the whole cell underneath the motifs. */
export interface CellPlan { textures: number[]; placements: Placement[] }

export interface ScatterOptions { count: number; seed: number; jitter: number }

// mulberry32 is a tiny seeded PRNG, so a scatter looks the same every time for one seed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// planCells() arranges designs in one repeat cell. 'together' shares the cell between all
// motifs, and 'scatter' places motifs at seeded random spots. Scatter wraps around the cell
// edges, so the repeat stays seamless.
export function planCells(items: LayoutItem[], mode: MixMode, cellW: number, cellH: number, opts: ScatterOptions): CellPlan[] {
  const textures = items.flatMap((it, i) => (it.texture ? [i] : []));
  const motifs = items.flatMap((it, i) => (it.texture ? [] : [i]));
  const box = (item: number, cx: number, cy: number, bw: number, bh: number): Placement =>
    ({ item, cx, cy, w: bw * items[item].scale, h: bh * items[item].scale, rotate: items[item].rotate });

  if (mode !== 'scatter') {
    const colW = cellW / Math.max(1, motifs.length);
    return [{ textures, placements: motifs.map((m, k) => box(m, colW * (k + 0.5), cellH / 2, colW, cellH)) }];
  }

  const rand = rng(opts.seed), placements: Placement[] = [];
  const base = Math.min(cellW, cellH);
  for (let k = 0; motifs.length && k < opts.count; k++) {
    const item = motifs[k % motifs.length];
    const size = base * items[item].scale * (1 - opts.jitter * 0.4 * rand());
    const rotate = items[item].rotate + (rand() * 2 - 1) * opts.jitter * 180;
    // ponytail: rejection sampling with 60 tries; a dense scatter just places fewer motifs.
    for (let tries = 0; tries < 60; tries++) {
      const cx = rand() * cellW, cy = rand() * cellH;
      const clear = placements.every((p) => {
        const dx = Math.min(Math.abs(p.cx - cx), cellW - Math.abs(p.cx - cx));
        const dy = Math.min(Math.abs(p.cy - cy), cellH - Math.abs(p.cy - cy));
        return Math.hypot(dx, dy) >= ((p.w + size) / 2) * 0.85;
      });
      if (clear) { placements.push({ item, cx, cy, w: size, h: size, rotate }); break; }
    }
  }
  return [{ textures, placements }];
}
