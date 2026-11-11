import { expect, test } from 'vitest';
import { rollerChecks, type RollerCheckInput } from './checks';

const ok: RollerCheckInput = {
  diameter: 40, length: 80, bedW: 256, bedD: 256, bedH: 256, potD: 80, taper: 0, relief: 0.3,
  thinReliefSpots: 0, thinGapSpots: 0, use: 'texture', depth: 1.2, boreWall: 10, solidFallback: false, minPlastic: 0.8, minHole: 0.8,
  handle: 'off', shaped: false, bow: 0, slip: 0,
};
const ids = (o: Partial<RollerCheckInput>) => rollerChecks({ ...ok, ...o }).map((c) => `${c.level}:${c.id}`);

test('a roller that fits and has relief passes', () => {
  expect(ids({})).toEqual([]);
});
test('errors come before warnings', () => {
  expect(ids({ taper: 8, length: 300 })).toEqual(['error:bed', 'warn:taper']);
});
test('a straight band passes the taper check, within 2% of the pot', () => {
  expect(ids({ taper: 1.5 })).toEqual([]);
});
test('a roller with nothing raised is an error', () => {
  expect(ids({ relief: 0 })).toEqual(['error:empty']);
});
test('only underglaze needs deep relief', () => {
  expect(ids({ use: 'underglaze', depth: 1 })).toEqual(['warn:underglaze-depth']);
  expect(ids({ use: 'texture', depth: 1 })).toEqual([]);
});
test('thin raised lines and narrow gaps warn, and a thin axle wall is an error', () => {
  expect(ids({ thinReliefSpots: 2, thinGapSpots: 1, boreWall: 2 })).toEqual(['error:bore', 'warn:thin-relief', 'warn:thin-gaps']);
});

test('thin lines and narrow gaps offer one-click fixes', () => {
  const fixes = rollerChecks({ ...ok, thinReliefSpots: 1, thinGapSpots: 1 }).map((c) => c.fixes?.map((f) => `${f.key}=${f.value}`));
  expect(fixes).toEqual([['fixLines=thicken', 'fixLines=remove'], ['fixGaps=fill', 'fixGaps=widen']]);
});

test('handle problems are warnings, because the roller still prints without one', () => {
  expect(ids({ handle: 'no-bore' })).toEqual(['warn:handle-bore']);
  expect(ids({ handle: 'too-big' })).toEqual(['warn:handle-bed']);
  expect(ids({ handle: 'ok' })).toEqual([]);
});

const shapeFix = [{ label: 'Shape the roller to the pot', key: 'shape', value: 'pot' }];
const find = (o: Partial<RollerCheckInput>, id: string) => rollerChecks({ ...ok, ...o }).find((c) => c.id === id);

test('a wall that bows warns that a straight roller misses it, and offers to shape the roller', () => {
  expect(find({ bow: 0.6 }, 'curve')).toMatchObject({ level: 'warn', fixes: shapeFix });
  expect(find({ bow: 0.6 }, 'curve')!.message).toContain('0.6 mm');
  expect(ids({ bow: 0.3 })).toEqual([]);
});
test('a tapered band offers the same fix', () => {
  expect(find({ taper: 8 }, 'taper')!.fixes).toEqual(shapeFix);
});
test('a roller shaped to the pot clears the taper and bow warnings', () => {
  expect(ids({ shaped: true, taper: 8, bow: 3 })).toEqual([]);
});
test('a shaped roller on a strong curve warns that the pattern drags, with the amount', () => {
  // A Ø40 roller on a Ø80 pot pressing 1.2 mm into soft clay stays in contact for about 11 mm of travel.
  expect(ids({ shaped: true, slip: 0.15 })).toEqual(['warn:smear']);
  expect(find({ shaped: true, slip: 0.15 }, 'smear')!.message).toMatch(/15%.*1\.7 mm/);
  expect(ids({ shaped: true, slip: 0.01 })).toEqual([]);
});
test('underglaze only kisses the clay, so it drags less, and a finer nozzle tolerates less', () => {
  expect(ids({ shaped: true, slip: 0.15, use: 'underglaze', depth: 1.5 })).toEqual([]);
  expect(ids({ shaped: true, slip: 0.15, use: 'underglaze', depth: 1.5, minPlastic: 0.4 })).toEqual(['warn:smear']);
});
