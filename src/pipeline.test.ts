import { describe, expect, it, test } from 'vitest';
import { computeRoller } from './pipeline';
import { DEFAULTS, type Settings } from './state';
import { newLinesLayer } from './layers';

const mug = { name: 'Mug', profile: [{ z: 0, d: 80 }, { z: 95, d: 80 }] };
const s: Settings = { ...DEFAULTS, piece: mug, bandFrom: 20, bandTo: 70, laps: 2, ends: 4, res: 0.5, cell: 1 };

test('the roller is sized so a whole number of turns goes round the pot', () => {
  const r = computeRoller(s, [], new Map());
  expect(r.roller.diameter).toBeCloseTo(40);
  expect(r.roller.length).toBeCloseTo(50 + 2 * 4);
});

test("a layer's repeats count round the pot, in whole turns of the roller", () => {
  const lines = { ...newLinesLayer(), lines: { ...newLinesLayer().lines, style: 'wavy' as const, length: 21, amplitude: 3 } };
  const r = computeRoller({ ...s, laps: 3 }, [lines], new Map());
  expect(r.layerInfo.get(lines.id)!.repeats % 3).toBe(0);
});

test('lines raise relief and give a closed STL that passes the check', () => {
  const r = computeRoller(s, [newLinesLayer()], new Map());
  expect(r.checks.map((c) => c.id)).toEqual([]);
  expect(new DataView(r.stl).getUint32(80, true)).toBe((r.stl.byteLength - 84) / 50);
  expect(r.grams).toBeGreaterThan(0);
});

test('a tapered band warns that a straight roller skids on it', () => {
  const flared = { name: 'Flared', profile: [{ z: 0, d: 70 }, { z: 95, d: 90 }] };
  expect(computeRoller({ ...s, piece: flared }, [newLinesLayer()], new Map()).checks.map((c) => c.id)).toContain('taper');
});

test('a gap fix in the settings is applied and counted', () => {
  // Two lines 0.5 mm apart leave a gap narrower than the 0.8 mm minimum.
  const a = { ...newLinesLayer(), lines: { ...newLinesLayer().lines, positions: [40, 47], thickness: 3 } };
  const fine = { ...s, res: 0.25 };
  const before = computeRoller(fine, [a], new Map()), after = computeRoller({ ...fine, fixGaps: 'fill' }, [a], new Map());
  expect(before.checks.map((c) => c.id)).toContain('thin-gaps');
  expect(after.checks.map((c) => c.id)).not.toContain('thin-gaps');
  expect(after.fixed.gaps).toBeGreaterThan(0);
});

test('a roller can come with a handle and an axle, each its own STL', () => {
  const r = computeRoller({ ...s, handle: true }, [newLinesLayer()], new Map());
  expect(r.handle).toBeDefined();
  for (const stl of [r.handle!.stl, r.handle!.axleStl]) expect(new DataView(stl).getUint32(80, true)).toBe((stl.byteLength - 84) / 50);
  expect(r.checks.map((c) => c.id)).toEqual([]);
});

test('the handle needs an axle hole, and it warns when it is bigger than the bed', () => {
  expect(computeRoller({ ...s, handle: true, bore: 0 }, [newLinesLayer()], new Map()).checks.map((c) => c.id)).toContain('handle-bore');
  expect(computeRoller({ ...s, handle: true, bedW: 100, bedD: 100 }, [newLinesLayer()], new Map()).checks.map((c) => c.id)).toContain('handle-bed');
  expect(computeRoller({ ...s, handle: false }, [newLinesLayer()], new Map()).handle).toBeUndefined();
});

describe('spot fixes', () => {
  // Two lines 0.5 mm apart leave one narrow gap, which runs the whole way round at 43.5% of the band height.
  const a = { ...newLinesLayer(), lines: { ...newLinesLayer().lines, positions: [40, 47], thickness: 3 } };
  const fine = { ...s, res: 0.25, handle: false };
  it('a gap left alone stops counting as a warning', () => {
    const r = computeRoller({ ...fine, spotFixes: [{ kind: 'gap', u: 0.5, v: 0.435, action: 'leave', by: 0 }] }, [a], new Map());
    expect(r.checks.map((c) => c.id)).not.toContain('thin-gaps');
  });
  it('a gap widened by hand gets fixed, and the fix lands on it again after a rebuild at another detail', () => {
    for (const res of [0.25, 0.2]) {
      const r = computeRoller({ ...fine, res, spotFixes: [{ kind: 'gap', u: 0.5, v: 0.435, action: 'widen', by: 1 }] }, [a], new Map());
      expect(r.checks.map((c) => c.id)).not.toContain('thin-gaps');
      expect(r.fixed.spots).toBe(1);
    }
  });
});

// This vase's wall curves at a 150 mm radius. It is Ø80 at its widest, 60 mm up, and the band sits across that belly.
const vase = { name: 'Vase', profile: Array.from({ length: 13 }, (_, i) => ({ z: 10 * i, d: 2 * (-110 + Math.sqrt(150 ** 2 - (10 * i - 60) ** 2)) })) };
const onVase: Settings = { ...s, piece: vase, bandFrom: 32, bandTo: 92 };
const ids = (r: { checks: { id: string }[] }) => r.checks.map((c) => c.id);

describe('a roller shaped to the pot', () => {
  it('a straight roller on a bellied vase warns that it misses the wall, and offers the fix', () => {
    const r = computeRoller(onVase, [newLinesLayer()], new Map());
    expect(r.roller.bow).toBeGreaterThan(2.5);
    expect(r.roller.bow).toBeLessThan(3.2);
    expect(r.checks.find((c) => c.id === 'curve')!.fixes![0]).toMatchObject({ key: 'shape', value: 'pot' });
    expect(r.roller.outline).toBeUndefined();
  });
  it('shaping it gives a roller that is thinner in the middle and touches the whole band', () => {
    const r = computeRoller({ ...onVase, shape: 'pot' }, [newLinesLayer()], new Map());
    expect(ids(r)).not.toContain('curve');
    expect(r.roller.maxD - r.roller.minD).toBeGreaterThan(5);
    expect(r.roller.outline!.r.length).toBe(r.roller.outline!.t.length);
    // The surface is a little longer than the axis it wraps.
    expect(r.roller.axial).toBeLessThan(r.roller.length);
    expect(r.roller.axial).toBeGreaterThan(r.roller.length - 1);
    expect(new DataView(r.stl).getUint32(80, true)).toBe((r.stl.byteLength - 84) / 50);
    // A curve this strong drags a texture at the band's edges, and the check says so.
    expect(ids(r)).toEqual(['smear']);
  });
  it('changes nothing on a straight mug', () => {
    const straight = computeRoller(s, [newLinesLayer()], new Map()), shaped = computeRoller({ ...s, shape: 'pot' }, [newLinesLayer()], new Map());
    expect(shaped.roller.minD).toBeCloseTo(40, 4);
    expect(shaped.roller.maxD).toBeCloseTo(40, 4);
    expect(shaped.roller.axial).toBeCloseTo(straight.roller.length, 4);
    expect(shaped.stl.byteLength).toBe(straight.stl.byteLength);
    expect(ids(shaped)).toEqual([]);
  });
  it('turns a tapered band\'s roller into a cone, which clears the taper warning', () => {
    const flared = { name: 'Flared', profile: [{ z: 0, d: 70 }, { z: 95, d: 90 }] };
    const r = computeRoller({ ...s, piece: flared, shape: 'pot' }, [newLinesLayer()], new Map());
    expect(ids(r)).toEqual([]);
    expect(r.roller.slip).toBeCloseTo(0, 5);
    expect(r.roller.maxD - r.roller.minD).toBeGreaterThan(2);
  });
  it('sizes the handle to the shaped roller\'s widest part and its length along the axis', () => {
    const r = computeRoller({ ...onVase, shape: 'pot', handle: true }, [newLinesLayer()], new Map());
    expect(r.handle).toBeDefined();
    expect(ids(r)).not.toContain('handle-bed');
    // The fork spans the roller's axis plus a clearance at each end, and two arms 6 mm wider than the 8.2 mm axle hole.
    expect(r.handle!.size[0]).toBeCloseTo(r.roller.axial + 2 * 0.6 + 2 * 14.2, 1);
  });
});
