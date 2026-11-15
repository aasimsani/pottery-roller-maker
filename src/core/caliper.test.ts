import { describe, expect, it } from 'vitest';
import { BEAM_CLEAR, FOOT, OPEN, PIN_SLOT, PIN_W, STEP, caliperParts, innerSpan, type CaliperSpec } from './caliper';
import { volume, type Mesh } from './roller';
import { closed, overhangs } from '../test/meshChecks';

const spec = (o: Partial<CaliperSpec> = {}): CaliperSpec => ({
  outerR: 20, outerFrom: 11, outerTo: 84, innerR: 17, innerFrom: 15, innerTo: 80, rim: 95, clay: 6, sink: 1.2, bore: 8.2, grip: 90, ...o,
});
const box = (m: Mesh) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < m.positions.length; k++) { lo[k % 3] = Math.min(lo[k % 3], m.positions[k]); hi[k % 3] = Math.max(hi[k % 3], m.positions[k]); }
  return { lo, hi };
};
const all = (c: ReturnType<typeof caliperParts>) => [c.yoke, c.slider, c.outerAxle, c.innerAxle, c.pin];

describe('caliperParts', () => {
  for (const s of [spec(), spec({ outerR: 14, innerR: 12, rim: 150, outerTo: 140, innerTo: 140, bore: 12, grip: 60 })]) {
    it(`gives closed parts with volume (outer Ø${2 * s.outerR}, inner Ø${2 * s.innerR}, rim ${s.rim})`, () => {
      for (const p of all(caliperParts(s))) { expect(closed(p)).toBe(true); expect(volume(p)).toBeGreaterThan(0); }
    });
  }
  it('prints every part without supports, except the slider\'s cover plate, which bridges over the rail', () => {
    const c = caliperParts(spec());
    for (const p of [c.yoke, c.outerAxle, c.innerAxle, c.pin]) expect(overhangs(p)).toBe(0);
    // The cover plate's underside is flat at one height. The test lists the heights of every other downward face.
    const m = c.slider, flat = new Set<number>();
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, d] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
      const z = [m.positions[a + 2], m.positions[b + 2], m.positions[d + 2]];
      if (z.every((v) => Math.abs(v - z[0]) < 1e-6) && z[0] > 1e-6) {
        const ux = m.positions[b] - m.positions[a], uy = m.positions[b + 1] - m.positions[a + 1], vx = m.positions[d] - m.positions[a], vy = m.positions[d + 1] - m.positions[a + 1];
        if (ux * vy - uy * vx < 0) flat.add(Math.round(z[0] * 100) / 100);
      }
    }
    expect([...flat]).toEqual([Math.round(c.dims.coverZ * 100) / 100]);
    // The bridge spans the rail's height and its clearance, which a printer can lay.
    expect(c.dims.bridge).toBeLessThanOrEqual(12);
  });
  it('holds the beam above the rim and above both rollers', () => {
    const c = caliperParts(spec());
    expect(c.dims.beamBottom).toBeGreaterThanOrEqual(95 + BEAM_CLEAR);
    expect(c.dims.beamBottom).toBeGreaterThanOrEqual(84 + 0.6);
    const tall = caliperParts(spec({ rim: 70, outerTo: 84, innerTo: 80 }));
    expect(tall.dims.beamBottom).toBeGreaterThanOrEqual(84 + 0.6);
  });
  it('sets the rollers\' centres one clay thickness, less the relief\'s sink, plus both radii apart, on a 2.5 mm grid', () => {
    const c = caliperParts(spec()), nominal = 20 + 6 - 1.2 + 17;
    expect(Math.abs(c.dims.gap - nominal)).toBeLessThanOrEqual(STEP / 2 + 1e-9);
    const spots = c.dims.positions;
    spots.slice(1).forEach((p, i) => expect(p - spots[i]).toBeCloseTo(STEP));
    expect(c.dims.gap).toBe(spots[c.dims.working]);
    // It closes at least 5 mm tighter than the clay, and opens at least OPEN wider, so the rim can slide between the rollers.
    expect(spots[0]).toBeLessThanOrEqual(nominal - 5 + 1e-9);
    expect(spots.at(-1)!).toBeGreaterThanOrEqual(nominal + OPEN - 1e-9);
  });
  it('gives the slider a slot for the pin at its centre, and the rail a window under every position', () => {
    const c = caliperParts(spec());
    expect(PIN_W).toBeLessThan(PIN_SLOT);
    for (const p of c.dims.positions) expect(c.dims.windows.some((w) => Math.abs(w.b - p) < 1e-9)).toBe(true);
    // Neighbouring positions use different rows, so each row's windows sit 5 mm apart with solid rail between them.
    c.dims.windows.slice(1).forEach((w, i) => expect(w.row).not.toBe(c.dims.windows[i].row));
  });
  it('leaves the inner bar clear of the pot\'s far wall by the span it reports', () => {
    const s = spec(), c = caliperParts(s), slider = box(c.slider);
    // The roller's pressing side is innerR toward the wall from its axis, and the bar's far edge is the slider's far end.
    expect(slider.hi[1] - (c.dims.gap - s.innerR)).toBeCloseTo(innerSpan(s.innerR, s.bore));
  });
  it('makes the grip run outward from the outer bar, away from the pot', () => {
    const s = spec(), c = caliperParts(s), yoke = box(c.yoke);
    expect(yoke.lo[1]).toBeCloseTo(-(s.outerR + 6 + 14.2 + s.grip));
  });
  it('makes both axles long enough to pass the roller and end inside their top blocks', () => {
    const s = spec(), c = caliperParts(s), a = box(c.outerAxle), b = box(c.innerAxle);
    const outerLen = c.dims.beamBottom + 14.2 - (s.outerFrom - 0.6 - FOOT);
    expect(a.hi[2] - a.lo[2]).toBeGreaterThan(outerLen - 5);
    expect(a.hi[2] - a.lo[2]).toBeLessThan(outerLen + 2.5);
    // The inner roller starts 4 mm higher, so its axle is 4 mm shorter.
    expect((a.hi[2] - a.lo[2]) - (b.hi[2] - b.lo[2])).toBeCloseTo(s.innerFrom - s.outerFrom);
  });

  describe('assembled', () => {
    const s = spec(), c = caliperParts(s);
    const inside = (m: Mesh, x: number, y: number, z: number) => { const b = box(m); return x >= b.lo[0] && x <= b.hi[0] && y >= b.lo[1] && y <= b.hi[1] && z >= b.lo[2] && z <= b.hi[2]; };
    const overlap = (p: Mesh, q: Mesh) => { const a = box(p), b = box(q); return [0, 1, 2].every((k) => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]) > 1e-6); };
    it('keeps the slider clear of the yoke everywhere, so it can slide', () => {
      for (const q of c.parts.slider) for (const y of c.parts.yoke) expect(overlap(q, y)).toBe(false);
    });
    it('leaves a window in the rail under every slider position, and solid rail between the windows', () => {
      const rows = [c.dims.railBottom + 1 + 3.4 / 2, c.dims.railTop - 1 - 3.4 / 2];
      for (const w of c.dims.windows) {
        const a = rows[w.row], other = rows[1 - w.row];
        expect(c.parts.yoke.some((p) => inside(p, a, w.b, 3))).toBe(false);
        // The same row has a rung 2.5 mm along, and the other row has its window there.
        expect(c.parts.yoke.some((p) => inside(p, a, w.b + STEP, 3))).toBe(true);
        expect(c.parts.yoke.some((p) => inside(p, other, w.b + STEP, 3))).toBe(w.b + STEP > c.dims.positions.at(-1)! + 1.7);
      }
    });
    it('wraps the rail with 0.3 mm of clearance on each side and leaves the cover plate over it', () => {
      expect(c.dims.bridge).toBeCloseTo(10 + 2 * 0.3);
      expect(c.dims.coverZ).toBeCloseTo(7.6 + 0.3);
    });
  });
});
