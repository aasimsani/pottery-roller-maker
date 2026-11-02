import { expect, test } from 'vitest';
import { rollerChecks, type RollerCheckInput } from './checks';

const ok: RollerCheckInput = {
  diameter: 40, length: 80, bedW: 256, bedD: 256, bedH: 256, potD: 80, taper: 0, relief: 0.3,
  thinReliefSpots: 0, thinGapSpots: 0, use: 'texture', depth: 1.2, boreWall: 10, solidFallback: false, minPlastic: 0.8, minHole: 0.8,
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
