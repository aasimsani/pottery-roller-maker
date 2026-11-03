import { describe, expect, it } from 'vitest';
import { dropSpots, fixRelief, thinOnRoller } from './fix';

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

describe('spot fixes', () => {
  // Two thin vertical lines, 1 px wide, at x = 5 and x = 15, on a 30 × 30 pattern.
  const two = () => bits(Array.from({ length: 30 }, () => '.....#.........#..............'));
  const o = { linePx: 3, gapPx: 3, lines: 'off' as const, gaps: 'off' as const };
  const width = (relief: Uint8Array, w: number, y: number, x0: number, x1: number) => relief.slice(y * w + x0, y * w + x1).reduce((a, v) => a + v, 0);

  it('changes only the spot it names', () => {
    const p = two(), f = fixRelief(p.data, p.w, p.h, { ...o, spots: [{ kind: 'line', x: 5, y: 15, action: 'thicken', byPx: 3 }] });
    expect(width(f.relief, p.w, 15, 0, 10)).toBeGreaterThanOrEqual(3);
    expect(width(f.relief, p.w, 15, 10, 20)).toBe(1);
    expect(f.spots).toBe(1);
  });
  it('finds a spot from a click a few pixels off the line', () => {
    const p = two(), f = fixRelief(p.data, p.w, p.h, { ...o, spots: [{ kind: 'line', x: 8, y: 15, action: 'remove', byPx: 0 }] });
    expect(width(f.relief, p.w, 15, 0, 10)).toBe(0);
    expect(width(f.relief, p.w, 15, 10, 20)).toBe(1);
  });
  it('keeps a spot the user chose to leave, even when every other spot gets fixed', () => {
    const p = two(), f = fixRelief(p.data, p.w, p.h, { ...o, lines: 'remove', spots: [{ kind: 'line', x: 5, y: 15, action: 'leave', byPx: 0 }] });
    expect(width(f.relief, p.w, 15, 0, 10)).toBe(1);
    expect(width(f.relief, p.w, 15, 10, 20)).toBe(0);
  });
  it('widens a gap by the amount asked for', () => {
    const gap = (byPx: number) => {
      const p = block(1), f = fixRelief(p.data, p.w, p.h, { ...o, spots: [{ kind: 'gap', x: 10, y: 15, action: 'widen', byPx }] });
      return 18 - width(f.relief, p.w, 15, 2, 20);
    };
    expect(gap(4)).toBeGreaterThan(gap(2));
    expect(gap(2)).toBeGreaterThanOrEqual(3);
  });
  it('lets a spot that was left alone drop out of the warning count', () => {
    const p = two(), t = thinOnRoller(p.data, p.w, p.h, 3, 0);
    expect(t.spots).toBe(2);
    expect(dropSpots(t.mask, p.w, p.h, [{ x: 5, y: 15 }]).spots).toBe(1);
  });
});
