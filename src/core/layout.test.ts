import { describe, expect, test } from 'vitest';
import { planCells, type LayoutItem } from './layout';

const motif = (scale = 0.8, rotate = 0): LayoutItem => ({ texture: false, scale, rotate });
const texture: LayoutItem = { texture: true, scale: 0.5, rotate: 0 };
const opts = { count: 8, seed: 3, jitter: 0.3 };

describe('planCells', () => {
  test('together puts every motif side by side in one cell, inside its own column', () => {
    const cells = planCells([motif(), motif(), texture, motif()], 'together', 90, 30, opts);
    expect(cells).toHaveLength(1);
    expect(cells[0].textures).toEqual([2]);
    const ps = cells[0].placements;
    expect(ps.map((p) => p.item)).toEqual([0, 1, 3]);
    ps.forEach((p, i) => {
      expect(p.cx - p.w / 2).toBeGreaterThanOrEqual(i * 30 - 1e-9);
      expect(p.cx + p.w / 2).toBeLessThanOrEqual((i + 1) * 30 + 1e-9);
    });
  });

  test('scatter is repeatable for a seed, stays in the cell and avoids overlaps on the wrapped cell', () => {
    const items = [motif(0.3), motif(0.25, 45)];
    const a = planCells(items, 'scatter', 60, 40, opts), b = planCells(items, 'scatter', 60, 40, opts);
    expect(a).toEqual(b);
    const ps = a[0].placements;
    expect(ps.length).toBeGreaterThan(2);
    for (const p of ps) {
      expect(p.cx).toBeGreaterThanOrEqual(0); expect(p.cx).toBeLessThan(60);
      expect(p.cy).toBeGreaterThanOrEqual(0); expect(p.cy).toBeLessThan(40);
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const dx = Math.min(Math.abs(ps[i].cx - ps[j].cx), 60 - Math.abs(ps[i].cx - ps[j].cx));
      const dy = Math.min(Math.abs(ps[i].cy - ps[j].cy), 40 - Math.abs(ps[i].cy - ps[j].cy));
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual((ps[i].w + ps[j].w) / 2 * 0.85 - 1e-9);
    }
    expect(planCells(items, 'scatter', 60, 40, { ...opts, seed: 4 })).not.toEqual(a);
  });

  test('an empty mix plans one empty cell', () => {
    expect(planCells([], 'scatter', 50, 50, opts)).toEqual([{ textures: [], placements: [] }]);
  });
});
