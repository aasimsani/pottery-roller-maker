import { expect, test } from 'vitest';
import { DEFAULTS, settingsFrom } from './state';

test('saved settings keep their piece and fill in anything missing, including the drum build', () => {
  const piece = { name: 'Tall mug', profile: [{ z: 0, d: 70 }, { z: 120, d: 74 }] };
  const s = settingsFrom({ piece, bandFrom: 10, bandTo: 100, build: { kind: 'solid' } });
  expect(s.piece).toEqual(piece);
  expect(s.laps).toBe(DEFAULTS.laps);
  expect(s.build).toEqual({ ...DEFAULTS.build, kind: 'solid' });
});

test('nothing saved gives the defaults', () => {
  expect(settingsFrom(null)).toEqual(DEFAULTS);
});
