import type { LineParams } from './core/lines';
import type { DesignRef } from './sources/types';

/**
 * One layer of the stencil design. Layers composite bottom first, and each keeps its own
 * repeat grid. Every field is plain data, so layers save to localStorage as they are.
 */
export interface Layer {
  id: string;
  kind: 'design' | 'lines';
  name: string;
  visible: boolean;
  /** The design drawn by a design layer. Lines layers have none. */
  ref?: DesignRef;
  /** 'paint' adds paint on top of lower layers, and 'cut' clears it. */
  blend: 'paint' | 'cut';
  /** Clears lower layers' paint within this distance of the shape, in mm. */
  halo: number;
  /** Widens the design's painted shapes on every side, in mm. */
  grow: number;
  /** The slice of the band the layer covers, in % of the band height from its top edge. */
  from: number; to: number;
  /** Repeats around the band and down the layer's slice. Textures and lines size their own repeats. */
  repeats: number; rows: number;
  stagger: boolean;
  /** Shifts the repeat, in % of a cell. */
  offsetX: number; offsetY: number;
  /** Motif size in % of its cell, and rotation in degrees. */
  size: number; rotate: number;
  /** 'grid' puts one motif in each cell, and 'scatter' places several at seeded random spots. */
  arrange: 'grid' | 'scatter';
  count: number; seed: number; jitter: number;
  /** Height of one repeat of a seamless pattern, in mm. */
  patternSize: number;
  /** Image thresholding for this layer's design. */
  threshold: number; invert: boolean; smooth: number;
  lines: LineParams;
}

const base = (): Omit<Layer, 'kind' | 'name' | 'ref'> => ({
  id: crypto.randomUUID(), visible: true, blend: 'paint', halo: 0, grow: 0,
  from: 0, to: 100, repeats: 3, rows: 1, stagger: false, offsetX: 0, offsetY: 0,
  size: 80, rotate: 0, arrange: 'grid', count: 6, seed: 1, jitter: 0.3, patternSize: 15,
  threshold: 128, invert: false, smooth: 0,
  lines: { positions: [6, 94], thickness: 1.5, style: 'solid', length: 6, gap: 3, amplitude: 1.5 },
});

export const newDesignLayer = (ref: DesignRef): Layer => ({ ...base(), kind: 'design', name: ref.title, ref });
export const newLinesLayer = (): Layer => ({ ...base(), kind: 'lines', name: 'Lines' });

/** Converts a mix saved by earlier versions into one layer per design. */
export function layersFromMix(mix: { ref: DesignRef; scale: number; rotate: number }[]): Layer[] {
  return mix.map((m) => ({ ...newDesignLayer(m.ref), size: Math.round(m.scale * 100), rotate: m.rotate }));
}
