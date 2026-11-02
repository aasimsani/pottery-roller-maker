import { describe, expect, test } from 'vitest';
import { bandOnPiece, pieceProfile, surfaceLength, TEX_PAD, type Piece } from './piece';

const mug: Piece = { name: 'mug', profile: [{ z: 0, d: 78 }, { z: 95, d: 86 }] };
const plate: Piece = { name: 'plate', profile: [{ z: 0, d: 180 }, { z: 8, d: 260 }] };
// This bellied vase is widest in the middle.
const vase: Piece = { name: 'vase', profile: [{ z: 0, d: 80 }, { z: 60, d: 120 }, { z: 120, d: 80 }] };

describe('bandOnPiece', () => {
  test('a band on a straight mug keeps its measured diameters and margins', () => {
    const b = bandOnPiece(mug, { from: 20, to: 80, above: 5, below: 5, ends: 5, toBase: false });
    expect(b.slant).toBe(60);
    expect(b.botD).toBeCloseTo(78 + (8 * 20) / surfaceLength(mug), 6);
    expect(b.topD).toBeCloseTo(78 + (8 * 80) / surfaceLength(mug), 6);
    expect([b.frameBottom, b.frameTop, b.frame]).toEqual([5, 5, 5]);
    expect(b.curve).toBeCloseTo(0, 6);
  });

  test('reach the base makes the bottom margin run down to the base', () => {
    const b = bandOnPiece(mug, { from: 20, to: 80, above: 5, below: 5, ends: 5, toBase: true });
    expect(b.frameBottom).toBe(20);
  });

  test('the band is clamped to the piece', () => {
    const b = bandOnPiece(mug, { from: -10, to: 500, above: 5, below: 5, ends: 5, toBase: false });
    expect(b.slant).toBeCloseTo(surfaceLength(mug), 6);
  });

  test('a curved wall reports how far it bulges away from the flat stencil', () => {
    const b = bandOnPiece(vase, { from: 10, to: surfaceLength(vase) - 10, above: 0, below: 0, ends: 5, toBase: false });
    expect(b.curve).toBeGreaterThan(15);
  });
});

describe('pieceProfile', () => {
  test('the outer wall follows the piece, with texture rows running up its surface', () => {
    const { points, flat } = pieceProfile(mug);
    expect(flat).toBe(false);
    const outer = points.filter((p) => p.v < 1 - TEX_PAD + 1e-9 && p.v > TEX_PAD - 1e-9);
    expect(outer.map((p) => [p.r, p.z])).toEqual([[39, 0], [43, 95]]);
    expect(outer.map((p) => p.v)).toEqual([TEX_PAD, 1 - TEX_PAD]);
  });

  test('the profile starts and ends on the axis, so the vessel has a floor', () => {
    const { points } = pieceProfile(vase);
    expect(points[0].r).toBe(0);
    expect(points[points.length - 1].r).toBe(0);
    expect(points.every((p) => p.r >= 0)).toBe(true);
  });

  test('surfaces past the rim stay plain clay, so the inside never shows the pattern', () => {
    // Texture rows interpolate between neighbouring points, so a 1 → 0 run would sweep through the band.
    for (const piece of [mug, plate, vase]) {
      const { points } = pieceProfile(piece);
      const rim = points.findIndex((p) => p.v === 1 - TEX_PAD);
      expect(points.slice(rim + 1).every((p) => p.v === 1)).toBe(true);
    }
  });

  test('a plate is flat, with the painted rim on top', () => {
    expect(pieceProfile(plate).flat).toBe(true);
  });
});
