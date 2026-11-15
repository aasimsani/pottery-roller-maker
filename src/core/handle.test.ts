import { describe, expect, it } from 'vitest';
import { FOOT, handleParts, supportParts, type HandleSpec } from './handle';
import { volume, type Mesh } from './roller';
import { closed, overhangs } from '../test/meshChecks';

const spec = (o: Partial<HandleSpec> = {}): HandleSpec => ({ rollerLength: 73, rollerDiameter: 40, bore: 8.2, grip: 90, ...o });
const box = (m: Mesh) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < m.positions.length; k++) { lo[k % 3] = Math.min(lo[k % 3], m.positions[k]); hi[k % 3] = Math.max(hi[k % 3], m.positions[k]); }
  return { lo, hi };
};

describe('handleParts', () => {
  for (const s of [spec(), spec({ rollerLength: 150, rollerDiameter: 90, bore: 12 })]) {
    it(`prints flat with every part closed and nothing in mid-air (Ø${s.rollerDiameter} × ${s.rollerLength})`, () => {
      const { fork, axle } = handleParts(s);
      for (const p of [...fork, axle]) { expect(closed(p)).toBe(true); expect(volume(p)).toBeGreaterThan(0); expect(overhangs(p)).toBe(0); }
    });
  }
  it('holds the roller between its arms with 0.6 mm to spare at each end', () => {
    const [left, right] = handleParts(spec()).fork.map(box);
    expect(right.lo[0] - left.hi[0]).toBeCloseTo(73 + 2 * 0.6);
  });
  it('makes an axle the roller spins on, long enough to pass through both arms', () => {
    const s = spec(), { fork, axle } = handleParts(s), a = box(axle), shaft = (s.bore - 0.4) / 2;
    const arms = box(fork[0]).hi[0] - box(fork[0]).lo[0];
    expect(a.hi[2] - a.lo[2]).toBeGreaterThan(73 + 2 * 0.6 + 2 * arms);
    // The axle's widest point is its head, so measure the shaft half way up.
    const mid = (a.lo[2] + a.hi[2]) / 2;
    let r = 0;
    for (let k = 0; k < axle.positions.length; k += 3) if (Math.abs(axle.positions[k + 2] - mid) < (a.hi[2] - a.lo[2]) / 2 - 3) r = Math.max(r, Math.hypot(axle.positions[k], axle.positions[k + 1]));
    expect(r).toBeLessThanOrEqual(shaft + 1e-3);
  });
});

describe('supportParts', () => {
  for (const s of [spec({ rollerLength: 78, rollerDiameter: 35 }), spec({ rollerLength: 150, rollerDiameter: 45, bore: 12, grip: 60 })]) {
    it(`prints flat with every part closed and nothing in mid-air (Ø${s.rollerDiameter} × ${s.rollerLength})`, () => {
      const { frame, axle } = supportParts(s);
      for (const p of [...frame, axle]) { expect(closed(p)).toBe(true); expect(volume(p)).toBeGreaterThan(0); expect(overhangs(p)).toBe(0); }
    });
  }
  it('holds the roller between a thin foot and a full arm, with 0.6 mm to spare at each end', () => {
    const [foot, arm] = supportParts(spec()).frame.map(box);
    expect(foot.hi[0] - foot.lo[0]).toBeCloseTo(FOOT);
    expect(arm.hi[0] - arm.lo[0]).toBeCloseTo(14.2);
    expect(arm.lo[0] - foot.hi[0]).toBeCloseTo(73 + 2 * 0.6);
  });
  it('runs the grip on past the full arm, in line with the axle, so it comes out of the pot\'s mouth', () => {
    const { frame } = supportParts(spec()), all = frame.map(box), arm = all[1], grip = all.at(-1)!;
    expect(grip.hi[0] - arm.hi[0]).toBeCloseTo(90);
    // Nothing reaches past the foot, so the foot can sit just above the pot's floor.
    expect(Math.min(...all.map((b) => b.lo[0]))).toBeCloseTo(all[0].lo[0]);
    // The grip stays on the bar's side of the axle, away from the wall the roller presses on.
    expect(grip.lo[1]).toBeGreaterThan(0);
  });
  it('makes an axle that ends flush with the foot', () => {
    const { frame, axle } = supportParts(spec()), a = box(axle), all = frame.map(box);
    // The 2 mm head stops at the full arm, and the shaft spans the arm, the roller's gap and the foot.
    expect(a.hi[2] - a.lo[2]).toBeCloseTo(2 + (all[1].hi[0] - all[0].lo[0]));
  });
});
