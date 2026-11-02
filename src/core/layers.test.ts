import { describe, expect, test } from 'vitest';
import { geometry } from './geometry';
import { buildMask, dilate, type MaskLayer, type Tile } from './mask';
import { linePeriod, makeLinesTile, type LineParams } from './lines';

// A straight 100 × 20 mm band at 0.5 mm per pixel, with no border.
const g = geometry({ topD: 100 / Math.PI, botD: 100 / Math.PI, slant: 20, coverage: 1, frame: 0, res: 0.5 });
const tile = (w: number, h: number, f: (x: number, y: number) => boolean): Tile => {
  const paint = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) paint[y * w + x] = f(x, y) ? 1 : 0;
  return { w, h, paint };
};
const all = tile(2, 2, () => true);
const layer = (t: Tile, over: Partial<MaskLayer> = {}): MaskLayer =>
  ({ tile: t, repeats: 1, rows: 1, stagger: false, offsetU: 0, offsetV: 0, from: 0, to: 1, blend: 'paint', haloPx: 0, growPx: 0, ...over });
// isPaint() reads the mask at a point given as fractions across (u) and down (v) the band.
const isPaint = (m: ReturnType<typeof buildMask>, u: number, v: number) => {
  const j = Math.floor(v * m.h), row = j * m.w;
  let i = 0, left = -1, right = -1;
  for (; i < m.w; i++) if (m.inside[row + i]) { if (left < 0) left = i; right = i; }
  const k = row + Math.round(left + u * (right - left));
  return m.inside[k] === 1 && m.solid[k] === 0;
};

describe('layered buildMask', () => {
  test('each layer repeats independently around the band', () => {
    const half = tile(4, 1, (x) => x < 2); // left half of each cell is paint
    const m = buildMask(g, [layer(half, { repeats: 2 })]);
    expect([0.1, 0.35, 0.6, 0.85].map((u) => isPaint(m, u, 0.5))).toEqual([true, false, true, false]);
    const m3 = buildMask(g, [layer(half, { repeats: 4 })]);
    expect([0.05, 0.2, 0.3, 0.45].map((u) => isPaint(m3, u, 0.5))).toEqual([true, false, true, false]);
  });

  test('an offset of half a cell shifts the repeat', () => {
    const half = tile(4, 1, (x) => x < 2);
    const m = buildMask(g, [layer(half, { repeats: 2, offsetU: 0.5 })]);
    expect([0.1, 0.35].map((u) => isPaint(m, u, 0.5))).toEqual([false, true]);
  });

  test('a layer only paints inside its slice of the band', () => {
    const m = buildMask(g, [layer(all, { from: 0, to: 0.5 })]);
    expect(isPaint(m, 0.5, 0.25)).toBe(true);
    expect(isPaint(m, 0.5, 0.75)).toBe(false);
  });

  test('later layers paint on top, and a cut layer clears paint below it', () => {
    const m = buildMask(g, [layer(all), layer(all, { from: 0.5, to: 1, blend: 'cut' })]);
    expect(isPaint(m, 0.5, 0.25)).toBe(true);
    expect(isPaint(m, 0.5, 0.75)).toBe(false);
  });

  test('thicken widens a layer\'s painted lines on both sides', () => {
    // One thin vertical line in the middle of the band: 1 tile pixel of 50 = 2 mm wide.
    const line = tile(50, 1, (x) => x === 25);
    const width = (m: ReturnType<typeof buildMask>) => {
      const row = Math.floor(m.h / 2) * m.w;
      let n = 0;
      for (let i = 0; i < m.w; i++) if (m.inside[row + i] && !m.solid[row + i]) n++;
      return n * 0.5; // mm, at 0.5 mm per pixel
    };
    expect(width(buildMask(g, [layer(line)]))).toBeCloseTo(2, 0);
    expect(width(buildMask(g, [layer(line, { growPx: 2 })]))).toBeCloseTo(4, 0);
  });

  test('a clear margin keeps lower layers away from the shape but paints the shape itself', () => {
    const dot = tile(20, 20, (x, y) => Math.hypot(x - 9.5, y - 9.5) < 3); // a small dot in the middle of the band
    const m = buildMask(g, [layer(all), layer(dot, { haloPx: 4 })]);
    expect(isPaint(m, 0.5, 0.5)).toBe(true); // the dot
    expect(isPaint(m, 0.5, 0.5 + 0.17)).toBe(false); // the clear ring around it
    expect(isPaint(m, 0.1, 0.5)).toBe(true); // the jigsaw-style background further away
  });
});

describe('dilate', () => {
  test('grows a shape by a radius in pixels, roughly circularly', () => {
    const w = 15, h = 15, src = new Uint8Array(w * h);
    src[7 * w + 7] = 1;
    const d = dilate(src, w, h, 3);
    expect(d[7 * w + 10]).toBe(1); // 3 px straight out
    expect(d[7 * w + 11]).toBe(0); // 4 px straight out
    expect(d[9 * w + 9]).toBe(1); // 2.8 px diagonally
    expect(d[10 * w + 10]).toBe(0); // 4.2 px diagonally
  });
});

describe('lines', () => {
  const base: LineParams = { positions: [50], thickness: 2, style: 'solid', length: 6, gap: 4, amplitude: 2 };
  const coverage = (t: Tile) => t.paint.reduce((a, b) => a + b, 0) / t.paint.length;

  test('a solid line covers its thickness across the whole cell', () => {
    expect(coverage(makeLinesTile(base, 10, 20, 0.1))).toBeCloseTo(2 / 20, 2);
  });

  test('dashes cover length ÷ period of the line', () => {
    const p = { ...base, style: 'dashed' as const };
    expect(linePeriod(p)).toBe(10);
    expect(coverage(makeLinesTile(p, linePeriod(p), 20, 0.1))).toBeCloseTo((2 / 20) * 0.6, 2);
  });

  test('dots are round, with one dot per period', () => {
    const p = { ...base, style: 'dotted' as const };
    expect(linePeriod(p)).toBe(6);
    expect(coverage(makeLinesTile(p, linePeriod(p), 20, 0.05))).toBeCloseTo((Math.PI * 1 * 1) / (6 * 20), 2);
  });

  test('several positions draw several lines', () => {
    expect(coverage(makeLinesTile({ ...base, positions: [10, 50, 90] }, 10, 20, 0.1))).toBeCloseTo(3 * (2 / 20), 2);
  });
});
