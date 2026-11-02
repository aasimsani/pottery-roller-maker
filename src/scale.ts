import type { Piece } from './core/piece';
import type { Layer } from './layers';
import type { Settings } from './state';

/** The widest diameter anywhere on the piece, in mm. */
export const widestD = (piece: Piece) => Math.max(...piece.profile.map((q) => q.d));

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// scaleDesign() resizes the piece and the design together by factor k, so the same design fits a
// bigger or smaller pot. Every size the design sets in mm grows with it. Slices, line positions, and
// repeats are already shares of the band, so they follow on their own. Margins, thickness, and the
// printer limits describe printing and handling, so they keep their values.
export function scaleDesign(s: Settings, layers: Layer[], k: number): [Settings, Layer[]] {
  const piece = { name: `${s.piece.name} ×${r3(k)}`, profile: s.piece.profile.map((q) => ({ z: r3(q.z * k), d: r3(q.d * k) })) };
  const scaled = layers.map((l) => ({
    ...l, patternSize: r3(l.patternSize * k), halo: r3(l.halo * k), grow: r3((l.grow ?? 0) * k),
    lines: { ...l.lines, thickness: r3(l.lines.thickness * k), length: r3(l.lines.length * k), gap: r3(l.lines.gap * k), amplitude: r3(l.lines.amplitude * k) },
  }));
  return [{ ...s, piece, bandFrom: r3(s.bandFrom * k), bandTo: r3(s.bandTo * k) }, scaled];
}
