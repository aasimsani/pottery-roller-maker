import { describe, expect, it } from 'vitest';
import { coverageGrid, gridTicks, printsMask } from './sight';

describe('printsMask', () => {
  it('drops thin raised lines, fills narrow gaps, and keeps everything else as drawn', () => {
    const relief = Uint8Array.from([1, 1, 0, 1, 0, 0]);
    const thinLines = Uint8Array.from([0, 1, 0, 0, 0, 0]);
    const thinGaps = Uint8Array.from([0, 0, 1, 0, 0, 0]);
    expect([...printsMask(relief, thinLines, thinGaps)]).toEqual([1, 0, 1, 1, 0, 0]);
  });
});

describe('coverageGrid', () => {
  it('gives each cell its share raised, and the cells average to the whole', () => {
    // A 4 × 2 pattern, raised on its left half only.
    const relief = Uint8Array.from([1, 1, 0, 0, 1, 1, 0, 0]);
    const g = coverageGrid(relief, 4, 2, 2, 1, []);
    expect(g.cells).toEqual([[100, 0]]);
    expect(g.raised).toBe(50);
  });
  it('counts the flagged spots in each cell', () => {
    const g = coverageGrid(new Uint8Array(8), 4, 2, 2, 1, [{ u: 0.2, v: 0.5 }, { u: 0.9, v: 0.5 }, { u: 0.8, v: 0.1 }]);
    expect(g.spots).toEqual([[1, 2]]);
  });
});

describe('gridTicks', () => {
  it('picks round steps that give a readable number of lines at any zoom', () => {
    for (const [a, b] of [[0, 1], [0.3, 0.42], [0.5, 0.505]] as const) {
      const t = gridTicks(a, b);
      expect(t.length).toBeGreaterThanOrEqual(4);
      expect(t.length).toBeLessThanOrEqual(12);
      for (const v of t) expect(v).toBeGreaterThanOrEqual(a - 1e-9);
    }
    expect(gridTicks(0, 1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });
});
