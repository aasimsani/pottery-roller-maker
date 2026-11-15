import { describe, expect, it } from 'vitest';
import { FOOT, HEAD, OPEN, innerSpan } from './caliper';
import { fitSupport } from './support';

const mug = { name: 'Mug', profile: [{ z: 0, d: 80 }, { z: 95, d: 80 }] };
const band = { start: 30, slant: 40 };

describe('fitSupport', () => {
  it('gives a straight mug the widest roller that leaves the slider room, up to 45 mm', () => {
    const f = fitSupport(mug, { start: 5, slant: 85 }, 5, 8.2);
    expect(f.state).toBe('ok');
    expect(f.opening).toBeCloseTo(70);
    expect(f.diameter).toBeCloseTo(35);
    expect(fitSupport({ name: 'Wide', profile: [{ z: 0, d: 160 }, { z: 95, d: 160 }] }, band, 5, 8.2).diameter).toBeCloseTo(45);
  });
  it('starts above the floor, far enough for the axle\'s head and the lower arm, and ends at the band\'s top', () => {
    const f = fitSupport(mug, { start: 5, slant: 85 }, 5, 8.2), lowest = 5 + HEAD + 1 + FOOT + 0.6;
    expect(f.fromZ).toBeGreaterThanOrEqual(lowest);
    expect(f.fromZ).toBeLessThan(lowest + 0.6);
    expect(f.toZ).toBeCloseTo(90);
    expect(f.length).toBeCloseTo(f.toZ - f.fromZ);
  });
  it('keeps the whole band when the band starts well above the floor', () => {
    const f = fitSupport(mug, band, 5, 8.2);
    expect(f.fromZ).toBeCloseTo(30);
    expect(f.length).toBeCloseTo(40);
  });
  it('says when the opening is too narrow for the roller and the slider', () => {
    const bottle = { name: 'Bottle', profile: [{ z: 0, d: 90 }, { z: 100, d: 90 }, { z: 130, d: 40 }] };
    const f = fitSupport(bottle, { start: 20, slant: 60 }, 5, 8.2);
    expect(f.state).toBe('narrow');
    expect(f.opening).toBeLessThan(f.needs);
  });
  it('says when too little of the band is left above the floor', () => {
    expect(fitSupport(mug, { start: 0, slant: 20 }, 5, 8.2).state).toBe('short');
  });

  describe('adjustments', () => {
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
      expect(f.needs).toBeCloseTo(innerSpan(24, 8.2) + OPEN + 3);
      expect(f.needs).toBeGreaterThan(f.opening);
    });
    it('reaches past the band at either end, and falls short of it with a negative number', () => {
      const more = fitSupport(mug, band, 6, 8.2, { below: 10, above: 10 });
      expect(more.fromZ).toBeCloseTo(20); expect(more.toZ).toBeCloseTo(80); expect(more.length).toBeCloseTo(60);
      const less = fitSupport(mug, band, 6, 8.2, { below: -5, above: -5 });
      expect(less.fromZ).toBeCloseTo(35); expect(less.toZ).toBeCloseTo(65); expect(less.length).toBeCloseTo(30);
    });
    it('stops at the floor and the rim however far it is told to reach', () => {
      const f = fitSupport(mug, band, 6, 8.2, { below: 500, above: 500 });
      expect(f.fromZ).toBeGreaterThanOrEqual(6 + HEAD + 1 + FOOT + 0.6);
      expect(f.toZ).toBeLessThanOrEqual(95 + 1e-6);
    });
    it('says short when the reach leaves under 15 mm of roller', () => {
      expect(fitSupport(mug, band, 6, 8.2, { below: -20, above: -10 }).state).toBe('short');
    });
  });
});
