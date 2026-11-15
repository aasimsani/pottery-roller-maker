import { describe, expect, it } from 'vitest';
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
});
