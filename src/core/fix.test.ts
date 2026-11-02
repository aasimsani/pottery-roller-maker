import { describe, expect, it } from 'vitest';
import { fixRelief, thinOnRoller } from './fix';

// bits() draws a w × h pattern from rows of '#' (raised) and '.' (base).
const bits = (rows: string[]) => ({ w: rows[0].length, h: rows.length, data: Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0)) });
const invert = (a: Uint8Array) => a.map((v) => 1 - v);
const block = (gap: number) => bits(Array.from({ length: 30 }, () => `..${'#'.repeat(8)}${'.'.repeat(gap)}${'#'.repeat(8)}......`));

describe('thinOnRoller', () => {
  it('finds a 1 px gap between two raised blocks', () => {
    const p = block(1);
    expect(thinOnRoller(invert(p.data), p.w, p.h, 3, 1).spots).toBe(1);
  });
  it('treats past the band as low base, so relief near the edge leaves no narrow gap', () => {
    const p = bits(['......', '.####.', '.####.', '......']);
    expect(thinOnRoller(invert(p.data), p.w, p.h, 3, 1).spots).toBe(0);
  });
  it('wraps round the roller, so a wide line across the seam is not thin', () => {
    const p = bits(Array.from({ length: 8 }, () => '###.........###'));
    expect(thinOnRoller(p.data, p.w, p.h, 4, 0).spots).toBe(0);
  });
});

describe('fixRelief', () => {
  const o = { linePx: 3, gapPx: 3, lines: 'off' as const, gaps: 'off' as const };
  it('fills narrow gaps, so none are left', () => {
    const p = block(1), f = fixRelief(p.data, p.w, p.h, { ...o, gaps: 'fill' });
    expect(f.gaps).toBe(1);
    expect(thinOnRoller(invert(f.relief), p.w, p.h, 3, 1).spots).toBe(0);
  });
  it('widens narrow gaps, so none are left', () => {
    const p = block(1), f = fixRelief(p.data, p.w, p.h, { ...o, gaps: 'widen' });
    expect(thinOnRoller(invert(f.relief), p.w, p.h, 3, 1).spots).toBe(0);
    expect(f.relief.reduce((a, v) => a + v, 0)).toBeLessThan(p.data.reduce((a, v) => a + v, 0));
  });
  const line = bits(Array.from({ length: 30 }, () => '.....#..........'));
  it('thickens thin raised lines until they print', () => {
    const f = fixRelief(line.data, line.w, line.h, { ...o, lines: 'thicken' });
    expect(f.lines).toBe(1);
    expect(thinOnRoller(f.relief, line.w, line.h, 3, 0).spots).toBe(0);
  });
  it('removes thin raised lines', () => {
    expect(fixRelief(line.data, line.w, line.h, { ...o, lines: 'remove' }).relief.every((v) => v === 0)).toBe(true);
  });
});
