import type { Tile } from './mask';

export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'wavy';

export interface LineParams {
  /** Line centres, in % of the band height from its top edge. */
  positions: number[];
  /** Line thickness (dot diameter for dotted lines), in mm. */
  thickness: number;
  style: LineStyle;
  /** Dash length for dashed lines, or wavelength for wavy lines, in mm. */
  length: number;
  /** Gap between dashes or dots, in mm. */
  gap: number;
  /** Wave height either side of the centre line, in mm. */
  amplitude: number;
}

/** Length of one repeat along the band, in mm. A solid line looks the same at any period. */
export function linePeriod(p: LineParams): number {
  switch (p.style) {
    case 'dashed': return Math.max(0.5, p.length + p.gap);
    case 'dotted': return Math.max(0.5, p.thickness + p.gap);
    case 'wavy': return Math.max(1, p.length);
    default: return 10;
  }
}

// makeLinesTile() draws the lines into one repeat cell of cellW × cellH mm, analytically per
// pixel. Each line's shape repeats once per cell, so cellW should be a whole share of linePeriod().
export function makeLinesTile(p: LineParams, cellW: number, cellH: number, res: number): Tile {
  const w = Math.max(1, Math.round(cellW / res)), h = Math.max(1, Math.round(cellH / res));
  const paint = new Uint8Array(w * h), r = p.thickness / 2;
  const centres = p.positions.map((pos) => (pos / 100) * cellH);
  for (let y = 0; y < h; y++) {
    const ym = ((y + 0.5) / h) * cellH;
    for (let x = 0; x < w; x++) {
      const xm = ((x + 0.5) / w) * cellW;
      paint[y * w + x] = centres.some((c) => {
        switch (p.style) {
          case 'dashed': return Math.abs(ym - c) <= r && xm < p.length * (cellW / linePeriod(p));
          case 'dotted': return Math.hypot(xm - cellW / 2, (ym - c) * (cellW / linePeriod(p))) <= r * (cellW / linePeriod(p));
          case 'wavy': return Math.abs(ym - (c + p.amplitude * Math.sin((2 * Math.PI * xm) / cellW))) <= r;
          default: return Math.abs(ym - c) <= r;
        }
      }) ? 1 : 0;
    }
  }
  return { w, h, paint };
}
