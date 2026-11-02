import { describe, expect, it } from 'vitest';
import {
  diameterForPattern, diameterForPot, drumParts, filamentGrams, heightAt, heightmapFromImage, lengthForDiameter,
  rollerMesh, seamMismatch, toSTL, volume, type DrumBuild, type Heightmap, type Mesh, type RollerSpec,
} from './roller';

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

describe('heightmapFromImage', () => {
  it('raises dark pixels unless inverted', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    expect([...heightmapFromImage(rgba, 2, 1, { threshold: 128, invert: false, softenPx: 0 }).data]).toEqual([1, 0]);
    expect([...heightmapFromImage(rgba, 2, 1, { threshold: 128, invert: true, softenPx: 0 }).data]).toEqual([0, 1]);
  });
});

// edgeCounts() maps each directed edge "a,b" to how often triangles use it.
function edgeCounts(idx: Uint32Array) {
  const m = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const key = `${idx[t + k]},${idx[t + (k + 1) % 3]}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}
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

const closed = (mesh: Mesh) => {
  const e = edgeCounts(mesh.indices);
  return [...e].every(([key, n]) => { const [a, b] = key.split(','); return n === 1 && e.get(`${b},${a}`) === 1; });
};
const hollow = (o: Partial<DrumBuild> = {}): DrumBuild => ({ kind: 'hollow', wall: 3, spokes: 4, spokeW: 3, hub: 3, plate: 6, infill: 0.15, ...o });

describe('drumParts', () => {
  it('builds a hollow drum from closed parts that use less plastic than a solid one', () => {
    const s = spec({ cell: 0.5 }), parts = drumParts(ramp(), s, hollow());
    // The tube, then a hub and its spokes at each end.
    expect(parts.length).toBe(1 + 2 * (1 + 4));
    for (const p of parts) { expect(closed(p)).toBe(true); expect(volume(p)).toBeGreaterThan(0); }
    expect(parts.reduce((v, p) => v + volume(p), 0)).toBeLessThan(volume(rollerMesh(ramp(), s)) * 0.6);
  });
  it('keeps the end plates inside the drum length', () => {
    const s = spec({ cell: 0.5 });
    for (const p of drumParts(ramp(), s, hollow()).slice(1)) {
      const z = p.positions.filter((_, k) => k % 3 === 2);
      expect(Math.min(...z)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...z)).toBeLessThanOrEqual(s.length);
      expect(Math.max(...z) - Math.min(...z)).toBeCloseTo(6);
    }
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
