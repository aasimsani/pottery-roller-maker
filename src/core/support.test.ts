import { describe, expect, it } from 'vitest';
import { FOOT, frameSpan } from './handle';
import { fitSupport } from './support';

const mug = { name: 'Mug', profile: [{ z: 0, d: 80 }, { z: 95, d: 80 }] };
const spread = (v: number[]) => Math.max(...v) - Math.min(...v);

describe('fitSupport', () => {
  it('gives a straight mug a plain cylinder that fits inside with room for its frame', () => {
    const f = fitSupport(mug, { start: 5, slant: 85 }, 5, 8.2);
    expect(f.state).toBe('ok');
    expect(f.opening).toBeCloseTo(70);
    expect(spread(f.outline.r)).toBeLessThan(1e-6);
    expect(f.diameter).toBeCloseTo(35);
  });
  it('starts above the floor, far enough for the frame\'s foot, and ends at the band\'s top', () => {
    const f = fitSupport(mug, { start: 5, slant: 85 }, 5, 8.2);
    // The floor is one wall's thickness up. The 5 mm foot, the 0.6 mm end clearance and 1 mm of air sit under the roller.
    expect(f.fromZ).toBeGreaterThanOrEqual(5 + 5 + 0.6 + 1);
    expect(f.fromZ).toBeLessThan(5 + 5 + 0.6 + 1 + 0.6);
    expect(f.toZ).toBeCloseTo(90);
    expect(f.axial).toBeCloseTo(f.toZ - f.fromZ);
  });
  it('keeps the whole band when the band starts well above the floor', () => {
    const f = fitSupport(mug, { start: 30, slant: 40 }, 5, 8.2);
    expect(f.fromZ).toBeCloseTo(30);
    expect(f.axial).toBeCloseTo(40);
  });
  it('makes a cone for a flared pot, with the same share of the inside radius at every height', () => {
    const flared = { name: 'Flared', profile: [{ z: 0, d: 70 }, { z: 95, d: 90 }] };
    const f = fitSupport(flared, { start: 30, slant: 40 }, 5, 8.2);
    expect(f.state).toBe('ok');
    expect(f.outline.r.at(-1)!).toBeGreaterThan(f.outline.r[0] + 0.5);
    expect(f.slip).toBeLessThan(1e-3);
  });
  it('bulges in the middle for a bellied pot, because the inside of a belly is hollow', () => {
    const belly = { name: 'Belly', profile: [{ z: 0, d: 80 }, { z: 30, d: 104 }, { z: 60, d: 112 }, { z: 90, d: 104 }, { z: 120, d: 80 }] };
    const f = fitSupport(belly, { start: 30, slant: 60 }, 5, 8.2), r = f.outline.r, mid = r[Math.floor(r.length / 2)];
    expect(f.state).toBe('ok');
    expect(mid).toBeGreaterThan(r[0] + 0.5);
    expect(mid).toBeGreaterThan(r.at(-1)! + 0.5);
  });
  it('says when the opening is too narrow for the roller and its frame', () => {
    const bottle = { name: 'Bottle', profile: [{ z: 0, d: 90 }, { z: 100, d: 90 }, { z: 130, d: 40 }] };
    const f = fitSupport(bottle, { start: 20, slant: 60 }, 5, 8.2);
    expect(f.state).toBe('narrow');
    expect(f.opening).toBeLessThan(f.needs);
  });
  it('says when too little of the band is left above the floor', () => {
    expect(fitSupport(mug, { start: 0, slant: 20 }, 5, 8.2).state).toBe('short');
  });
  it('reports how far the rim stands above the frame\'s top arm, so the grip can start above it', () => {
    const tall = { name: 'Vase', profile: [{ z: 0, d: 100 }, { z: 200, d: 100 }] };
    const f = fitSupport(tall, { start: 40, slant: 60 }, 5, 8.2);
    // The top arm is 14.2 mm thick and sits 0.6 mm above the roller, whose top is at 100 mm.
    expect(f.reach).toBeCloseTo(200 - (100 + 0.6 + 14.2));
    expect(fitSupport(mug, { start: 5, slant: 85 }, 5, 8.2).reach).toBe(0);
  });

  describe('adjustments', () => {
    const band = { start: 30, slant: 40 };
    it('uses the diameter it is given instead of the automatic one', () => {
      const f = fitSupport(mug, band, 6, 8.2, { diameter: 26 });
      expect(f.state).toBe('ok');
      expect(f.diameter).toBeCloseTo(26);
      expect(fitSupport(mug, band, 6, 8.2).diameter).toBeCloseTo(34);
    });
    it('never goes thinner than the smallest roller that has room for the axle', () => {
      expect(fitSupport(mug, band, 6, 8.2, { diameter: 5 }).diameter).toBeCloseTo(18);
    });
    it('says narrow, and what it needs, when the diameter it is given can\'t pass the pot\'s mouth', () => {
      const f = fitSupport(mug, band, 6, 8.2, { diameter: 48 });
      expect(f.state).toBe('narrow');
      expect(f.needs).toBeCloseTo(frameSpan(48, 8.2) + 4);
      expect(f.needs).toBeGreaterThan(f.opening);
    });
    it('reaches past the band at either end, and falls short of it with a negative number', () => {
      const more = fitSupport(mug, band, 6, 8.2, { below: 10, above: 10 });
      expect(more.fromZ).toBeCloseTo(20); expect(more.toZ).toBeCloseTo(80); expect(more.axial).toBeCloseTo(60);
      const less = fitSupport(mug, band, 6, 8.2, { below: -5, above: -5 });
      expect(less.fromZ).toBeCloseTo(35); expect(less.toZ).toBeCloseTo(65); expect(less.axial).toBeCloseTo(30);
    });
    it('stops at the floor and the rim however far it is told to reach', () => {
      const f = fitSupport(mug, band, 6, 8.2, { below: 500, above: 500 });
      expect(f.fromZ).toBeGreaterThanOrEqual(6 + FOOT + 0.6);
      expect(f.toZ).toBeLessThanOrEqual(95 + 1e-6);
    });
    it('says short when the reach leaves under 15 mm of roller', () => {
      expect(fitSupport(mug, band, 6, 8.2, { below: -20, above: -10 }).state).toBe('short');
    });
  });
});
