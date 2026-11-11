import { expect, test } from 'vitest';
import { DEFAULTS, nozzleSettings, settingsFrom } from './state';
import { storageKey } from './state';

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

test('a nozzle sets the minimum widths to two line widths, and the detail to match', () => {
  expect(nozzleSettings(0.2)).toEqual({ nozzle: 0.2, minPlastic: 0.4, minHole: 0.4, res: 0.1, cell: 0.25 });
  expect(nozzleSettings(0.4)).toMatchObject({ minPlastic: 0.8, minHole: 0.8, res: 0.15, cell: 0.4 });
  expect(nozzleSettings(0.8)).toMatchObject({ minPlastic: 1.6, res: 0.25, cell: 0.8 });
});

test('every key but the shared saved pieces lives under the app prefix, so the existing roller keys stay put', () => {
  expect(storageKey('settings')).toBe('roller.settings');
  expect(storageKey('layers')).toBe('roller.layers');
  expect(storageKey('pieces')).toBe('pieces');
});

test('settings saved before shaped rollers existed keep a straight roller', () => {
  expect(settingsFrom({ laps: 3 }).shape).toBe('straight');
});
