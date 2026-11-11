import { describe, expect, it } from 'vitest';
import { bow, fitRoller, type WallPoint } from './shape';

// wall() samples a pot's wall, given as its radius at each height, at n + 1 points from z0 to z1.
const wall = (r: (z: number) => number, z0: number, z1: number, n = 120): WallPoint[] =>
  Array.from({ length: n + 1 }, (_, i) => { const z = z0 + ((z1 - z0) * i) / n; return { r: r(z), z }; });
const whole = (w: WallPoint[]): [number, number] => [0, w.length - 1];
// belly() is a wall that curves at a 150 mm radius and is Ø80 at its widest, at z = 40.
const belly = wall((z) => -110 + Math.sqrt(150 ** 2 - (z - 40) ** 2), 10, 70);

describe('fitRoller', () => {
  it('gives a straight wall a straight roller, the pot\'s size divided by the turns per lap', () => {
    const w = wall(() => 40, 10, 70), f = fitRoller(w, whole(w), 2, 1);
    for (const r of f.r) expect(r).toBeCloseTo(20, 5);
    expect(f.t[0]).toBeCloseTo(0, 5);
    expect(f.t.at(-1)).toBeCloseTo(60, 5);
    expect(f.slip).toBeCloseTo(0, 5);
  });
  it('gives a tapered wall a cone that rolls without slipping, like a bevel gear', () => {
    const w = wall((z) => 30 + 0.2 * z, 0, 60), f = fitRoller(w, whole(w), 2, 1);
    f.r.forEach((r, i) => expect(r / w[i].r).toBeCloseTo(0.5, 5));
    expect(f.slip).toBeCloseTo(0, 5);
    for (let i = 1; i < f.t.length; i++) expect(f.t[i]).toBeGreaterThan(f.t[i - 1]);
  });
  it('hollows the roller where the wall bulges, so the two touch along the whole band', () => {
    const f = fitRoller(belly, whole(belly), 2, 1);
    // The bulge is symmetric, so the roller's axis stays upright and each radius plus the pot's is one constant.
    f.r.forEach((r, i) => expect(r + belly[i].r).toBeCloseTo(f.r[0] + belly[0].r, 4));
    expect(f.r[0] - f.r[60]).toBeCloseTo(150 - Math.sqrt(150 ** 2 - 30 ** 2), 3);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(f.r)).toBeCloseTo(mean(belly.map((p) => p.r)) / 2, 4);
  });
  it('reports how far the roller\'s surface outruns the pot\'s on a curved band', () => {
    const f = fitRoller(belly, whole(belly), 2, 1);
    expect(f.slip).toBeGreaterThan(0.05);
    expect(f.slip).toBeLessThan(0.2);
  });
  it('fits the band only, and still follows the wall under the plain ends', () => {
    // The wall is straight inside the band and flares away past it.
    const w = wall((z) => 40 + (z > 60 ? 0.5 * (z - 60) : 0), 0, 70, 140), f = fitRoller(w, [20, 120], 2, 1);
    for (let i = 20; i <= 120; i++) expect(f.r[i]).toBeCloseTo(20, 5);
    expect(f.r[140]).toBeCloseTo(20 - 5, 5);
  });
  it('sits on top of a plate\'s rim, as a cone whose point is at the plate\'s centre', () => {
    const w: WallPoint[] = Array.from({ length: 81 }, (_, i) => ({ r: 90 + i / 2, z: 0 })), f = fitRoller(w, whole(w), 2, -1);
    f.r.forEach((r, i) => expect(r / w[i].r).toBeCloseTo(0.5, 5));
  });
});

describe('bow', () => {
  it('measures how far the wall strays from a straight line between the band\'s edges', () => {
    expect(bow(belly, whole(belly))).toBeCloseTo(150 - Math.sqrt(150 ** 2 - 30 ** 2), 3);
    const cone = wall((z) => 30 + 0.2 * z, 0, 60);
    expect(bow(cone, whole(cone))).toBeCloseTo(0, 6);
  });
});
