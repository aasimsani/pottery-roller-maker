import { expect, test } from 'vitest';
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
