import { describe, expect, it } from 'vitest';
import {
  diameterForPattern, diameterForPot, drumParts, filamentGrams, heightAt, heightmapFromBits, lengthForDiameter,
  rollerMesh, seamMismatch, toSTL, volume, type DrumBuild, type Heightmap, type Mesh, type RollerSpec,
} from './roller';
import { closed, edgeCounts, overhangs } from '../test/meshChecks';

const spec = (o: Partial<RollerSpec> = {}): RollerSpec => ({
  diameter: 40, length: 50, depth: 1.5, repeats: 1, rim: 0, bore: 8, cell: 1, mirror: true, ...o,
});
// ramp() rises from 0 at the left edge to 1 at the right, so it has a hard seam.
const ramp = (w = 8, h = 4): Heightmap => {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = x / (w - 1);
  return { w, h, data };
};
const flat = (v: number): Heightmap => ({ w: 4, h: 4, data: new Float32Array(16).fill(v) });

describe('sizing', () => {
  it('lays repeats × one image width per turn when proportions are kept', () => {
    const D = diameterForPattern(60, 1408 / 768, 2);
    expect(Math.PI * D).toBeCloseTo(2 * 60 * (1408 / 768));
    expect(lengthForDiameter(D, 1408 / 768, 2, 5)).toBeCloseTo(60 + 10);
  });
  it('fits a whole number of turns around a pot', () => {
    expect(Math.PI * diameterForPot(150, 3) * 3).toBeCloseTo(Math.PI * 150);
  });
});

describe('heightAt', () => {
  it('is continuous across the seam for a seamless pattern', () => {
    const m = flat(0.5);
    expect(heightAt(m, spec(), 0, 25)).toBeCloseTo(heightAt(m, spec(), 2 * Math.PI - 1e-9, 25));
  });
  it('mirror reverses the pattern around the roller', () => {
    const m = ramp(), a = 0.3;
    expect(heightAt(m, spec({ mirror: true }), a, 25)).toBeCloseTo(heightAt(m, spec({ mirror: false }), 2 * Math.PI - a, 25));
  });
  it('keeps the plain ends at the base radius', () => {
    expect(heightAt(flat(1), spec({ rim: 5 }), 1, 2)).toBe(0);
    expect(heightAt(flat(1), spec({ rim: 5 }), 1, 25)).toBe(1);
  });
});

describe('seamMismatch', () => {
  it('is 0 for a pattern whose edges meet and large for one that jumps', () => {
    expect(seamMismatch(flat(1))).toBe(0);
    expect(seamMismatch(ramp())).toBeGreaterThan(0.5);
  });
});

describe('heightmapFromBits', () => {
  it('raises set pixels, and softening spreads their edges without changing the total', () => {
    const bits = new Uint8Array([0, 0, 1, 1, 0, 0]);
    expect([...heightmapFromBits(bits, 6, 1, 0).data]).toEqual([0, 0, 1, 1, 0, 0]);
    const soft = heightmapFromBits(bits, 6, 1, 1).data;
    expect(soft[2]).toBeLessThan(1);
    expect(soft[1]).toBeGreaterThan(0);
    expect(soft.reduce((a, v) => a + v, 0)).toBeCloseTo(2);
  });
});

describe('rollerMesh', () => {
  for (const bore of [8, 0]) {
    it(`is closed and consistently wound (bore ${bore})`, () => {
      const mesh = rollerMesh(ramp(), spec({ bore }));
      const e = edgeCounts(mesh.indices);
      for (const [key, n] of e) {
        expect(n).toBe(1);
        const [a, b] = key.split(',');
        expect(e.get(`${b},${a}`)).toBe(1);
      }
    });
  }
  it('has the volume of a tube when the pattern is flat, so normals point out', () => {
    const s = spec({ cell: 0.25 }), R = s.diameter / 2 - s.depth, r = s.bore / 2;
    expect(volume(rollerMesh(flat(0), s)) / (Math.PI * (R * R - r * r) * s.length)).toBeCloseTo(1, 2);
  });
  it('writes a binary STL with one 50-byte record per triangle', () => {
    const mesh = rollerMesh(ramp(), spec());
    const buf = toSTL(mesh), tris = mesh.indices.length / 3;
    expect(buf.byteLength).toBe(84 + 50 * tris);
    expect(new DataView(buf).getUint32(80, true)).toBe(tris);
  });
});

const hollow = (o: Partial<DrumBuild> = {}): DrumBuild => ({ kind: 'hollow', wall: 3, spokes: 4, spokeW: 3, hub: 3, plate: 6, infill: 0.15, ...o });

describe('drumParts', () => {
  it('builds a hollow drum from closed parts that use less plastic than a solid one', () => {
    const s = spec({ cell: 0.5 }), parts = drumParts(ramp(), s, hollow());
    // The tube, the roof, then the bottom hub and its spokes.
    expect(parts.length).toBe(1 + 1 + 1 + 4);
    for (const p of parts) { expect(closed(p)).toBe(true); expect(volume(p)).toBeGreaterThan(0); }
    expect(parts.reduce((v, p) => v + volume(p), 0)).toBeLessThan(volume(rollerMesh(ramp(), s)) * 0.6);
  });
  it('keeps the bottom plate on the bed and the roof inside the drum', () => {
    const s = spec({ cell: 0.5 }), [, top, ...plate] = drumParts(ramp(), s, hollow());
    const zs = (p: Mesh) => p.positions.filter((_, k) => k % 3 === 2);
    for (const p of plate) { expect(Math.min(...zs(p))).toBeCloseTo(0); expect(Math.max(...zs(p))).toBeCloseTo(6); }
    expect(Math.max(...zs(top))).toBeCloseTo(s.length);
    expect(Math.min(...zs(top))).toBeGreaterThan(6);
  });
  it('falls back to a solid drum when the wall leaves no room for spokes', () => {
    expect(drumParts(ramp(), spec({ diameter: 20 }), hollow({ wall: 6 })).length).toBe(1);
  });
});

describe('filamentGrams', () => {
  const s = spec({ cell: 0.5 }), solid = drumParts(flat(0), s, hollow({ kind: 'solid' }));
  it('counts the whole volume at 100% infill', () => {
    expect(filamentGrams(solid, s, hollow({ kind: 'solid', infill: 1 }))).toBeCloseTo((volume(solid[0]) / 1000) * 1.27, 1);
  });
  it('uses less filament at lower infill', () => {
    expect(filamentGrams(solid, s, hollow({ kind: 'solid', infill: 0.1 }))).toBeLessThan(filamentGrams(solid, s, hollow({ kind: 'solid', infill: 1 })) * 0.6);
  });
});

describe('hollow drum printability', () => {
  for (const diameter of [40, 80, 150]) {
    it(`prints standing up with nothing starting in mid-air (Ø${diameter})`, () => {
      const s = spec({ diameter, length: 90, cell: 1 });
      const parts = drumParts(flat(0), s, hollow());
      expect(parts.length).toBeGreaterThan(1);
      for (const p of parts) { expect(closed(p)).toBe(true); expect(overhangs(p)).toBe(0); }
    });
  }
  it('still uses less plastic than a solid drum', () => {
    const s = spec({ diameter: 80, length: 90, cell: 1 });
    expect(drumParts(flat(0), s, hollow()).reduce((v, p) => v + volume(p), 0)).toBeLessThan(volume(rollerMesh(flat(0), s)) * 0.5);
  });
});
