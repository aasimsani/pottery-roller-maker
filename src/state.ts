import { useEffect, useState } from 'react';
import type { DrumBuild } from './core/roller';
import type { GapFix, LineFix } from './core/fix';
import type { Piece } from './core/piece';
import { layersFromMix, newDesignLayer, newLinesLayer, type Layer } from './layers';
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
  /** Relief height and edge softening, in mm. */
  depth: number; soften: number;
  /** Carries the pattern mirrored, so the clay shows it the right way round. */
  mirror: boolean;
  /** Axle hole diameter, in mm. 0 means no hole. */
  bore: number;
  build: DrumBuild;
  /** Raster pixel size for the pattern, and the drum mesh's spacing, in mm. */
  res: number; cell: number;
  // Printer (Bambu Lab P2S defaults)
  bedW: number; bedD: number; bedH: number;
  // The print check reads these limits before every download.
  nozzle: number; minPlastic: number; minHole: number; strict: boolean;
  /** Repairs the print check offers for thin raised lines and narrow gaps. They stay on, so they follow every design change. */
  fixLines: LineFix; fixGaps: GapFix;
  // Preview
  paintColor: string;
}

export type Use = 'texture' | 'underglaze';

export const DEFAULTS: Settings = {
  piece: { name: 'Straight mug', profile: [{ z: 0, d: 80 }, { z: 95, d: 80 }] },
  bandFrom: 15, bandTo: 80, ends: 4,
  laps: 2, use: 'texture', depth: 1.2, soften: 0.3, mirror: true, bore: 8.2,
  build: { kind: 'hollow', wall: 2, spokes: 6, spokeW: 3, hub: 3, plate: 6, infill: 0.15 },
  res: 0.15, cell: 0.4,
  bedW: 256, bedD: 256, bedH: 256,
  nozzle: 0.4, minPlastic: 0.8, minHole: 0.8, strict: true, fixLines: 'off', fixGaps: 'off',
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

// initialLayers() starts from the mix an earlier version saved, or from a sprig between two framing lines.
export function initialLayers(): Layer[] {
  try {
    const mix = JSON.parse(localStorage.getItem('mix') ?? 'null');
    if (Array.isArray(mix) && mix.length) return layersFromMix(mix);
  } catch { /* storage blocked or corrupt */ }
  return [newDesignLayer(builtinRef('Leafy sprig')), newLinesLayer()];
}

// usePersistent() is useState backed by localStorage. Storage can be missing or full
// (private windows, large uploaded images), so failures fall back to in-memory state.
export function usePersistent<T>(key: string, initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch { /* fall through to the initial value */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [key, value]);
  return [value, setValue];
}
