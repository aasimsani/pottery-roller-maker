import { useEffect, useState } from 'react';
import type { DrumBuild } from './core/roller';
import type { GapFix, LineFix, SpotAction } from './core/fix';
import type { Piece } from './core/piece';
import { newDesignLayer, newLinesLayer, type Layer } from './layers';
import { builtinRef } from './sources/builtin';

export interface Settings {
  /** The pot being decorated, base to rim. */
  piece: Piece;
  /** The pattern band on the pot, in mm along the surface from the base. It sets the roller's patterned length. */
  bandFrom: number; bandTo: number;
  /** Plain band at each end of the roller, in mm. */
  ends: number;
  // Roller
  /** Roller turns per lap of the pot. The roller's diameter is the pot's divided by this, so the pattern meets itself. */
  laps: number;
  use: Use;
  /** A straight roller is a plain cylinder. A roller shaped to the pot follows the wall across the band, so it touches a curved or tapered pot along its whole length. */
  shape: 'straight' | 'pot';
  /** Relief height and edge softening, in mm. */
  depth: number; soften: number;
  /** Carries the pattern mirrored, so the clay shows it the right way round. */
  mirror: boolean;
  /** Axle hole diameter, in mm. 0 means no hole. */
  bore: number;
  build: DrumBuild;
  /** Prints a U-shaped handle and an axle with the roller, and the grip's length in mm. */
  handle: boolean; grip: number;
  /** Raster pixel size for the pattern, and the drum mesh's spacing, in mm. */
  res: number; cell: number;
  // Printer (Bambu Lab P2S defaults)
  bedW: number; bedD: number; bedH: number;
  // The print check reads these limits before every download.
  nozzle: number; minPlastic: number; minHole: number; strict: boolean;
  /** Repairs the print check offers for thin raised lines and narrow gaps. They stay on, so they follow every design change. */
  fixLines: LineFix; fixGaps: GapFix;
  /** How much the fixes for everything thicken a line or widen a gap, in mm. 0 means just enough to pass. */
  fixLinesBy: number; fixGapsBy: number;
  /** Fixes for single spots, placed as shares (0–1) across and down the pattern, so they stay put when the detail changes. */
  spotFixes: SpotFix[];
  // Preview
  paintColor: string;
}

export type Use = 'texture' | 'underglaze';

/** A fix for one spot. by is how much to thicken or widen it, in mm. */
export interface SpotFix { kind: 'line' | 'gap'; u: number; v: number; action: SpotAction; by: number }

export const DEFAULTS: Settings = {
  piece: { name: 'Straight mug', profile: [{ z: 0, d: 80 }, { z: 95, d: 80 }] },
  bandFrom: 15, bandTo: 80, ends: 4,
  laps: 2, use: 'texture', shape: 'straight', depth: 1.2, soften: 0.3, mirror: true, bore: 8.2,
  build: { kind: 'hollow', wall: 2, spokes: 6, spokeW: 3, hub: 3, plate: 6, infill: 0.15 },
  handle: true, grip: 90,
  res: 0.15, cell: 0.4,
  bedW: 256, bedD: 256, bedH: 256,
  nozzle: 0.4, minPlastic: 0.8, minHole: 0.8, strict: true, fixLines: 'off', fixGaps: 'off', fixLinesBy: 0, fixGapsBy: 0, spotFixes: [],
  paintColor: '#2b4c8c',
};

// nozzleSettings() fits the print check and the detail to a nozzle. Two line widths is the practical
// minimum for a raised line or a gap, and the pattern and the mesh only need to be a little finer than one line.
export function nozzleSettings(nozzle: number): Pick<Settings, 'nozzle' | 'minPlastic' | 'minHole' | 'res' | 'cell'> {
  const min = Math.round(nozzle * 20) / 10, fine = nozzle <= 0.25, normal = nozzle <= 0.45;
  return { nozzle, minPlastic: min, minHole: min, res: fine ? 0.1 : normal ? 0.15 : 0.25, cell: fine ? 0.25 : normal ? 0.4 : 0.8 };
}

// settingsFrom() fills saved settings in with defaults, including any drum-build fields added since they were saved.
export function settingsFrom(saved: Record<string, unknown> | null): Settings {
  const s = { ...DEFAULTS, ...(saved ?? {}) } as Settings;
  return { ...s, build: { ...DEFAULTS.build, ...(s.build ?? {}) } };
}

// initialLayers() starts from a sprig between two framing lines.
export function initialLayers(): Layer[] {
  return [newDesignLayer(builtinRef('Leafy sprig')), newLinesLayer()];
}

// All three pottery apps run on aasimsani.net and share one localStorage, so each app keeps its keys under its own
// prefix. Saved pieces stay shared with the stencil maker, which saves the same pots.
const APP = 'roller.';
const SHARED = new Set<string>(['pieces']);
export const storageKey = (key: string) => (SHARED.has(key) ? key : APP + key);

// The roller started with prefixed keys, so it has no older values to read.
const LEGACY: Record<string, (v: unknown) => unknown> = {};

// usePersistent() is useState backed by localStorage. Storage can be missing or full
// (private windows, large uploaded images), so failures fall back to in-memory state.
// The first load reads what an older version saved under the bare key, through LEGACY, and saves it under the prefix.
// The third value says whether the last save worked, so the app can warn before a reload loses the work.
export function usePersistent<T>(key: string, initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const full = storageKey(key);
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(full);
      if (raw) return JSON.parse(raw) as T;
      const old = full !== key && LEGACY[key] ? localStorage.getItem(key) : null;
      if (old) return LEGACY[key](JSON.parse(old)) as T;
    } catch { /* fall through to the initial value */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const [stored, setStored] = useState(true);
  useEffect(() => {
    try { localStorage.setItem(full, JSON.stringify(value)); setStored(true); } catch { setStored(false); }
  }, [full, value]);
  return [value, setValue, stored];
}
