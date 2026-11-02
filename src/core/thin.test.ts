import { describe, expect, test } from 'vitest';
import { thinFeatures } from './thin';

// A 60 × 40 px canvas with one vertical bar of the given width, 30 px tall.
const bar = (width: number) => {
  const w = 60, h = 40, src = new Uint8Array(w * h);
  for (let y = 5; y < 35; y++) for (let x = 20; x < 20 + width; x++) src[y * w + x] = 1;
  return { src, w, h };
};

describe('thinFeatures', () => {
  test('flags a bar narrower than the minimum width', () => {
    const { src, w, h } = bar(5);
    const r = thinFeatures(src, w, h, 8, 20);
    expect(r.spots).toBe(1);
    expect(r.mask[20 * w + 22]).toBe(1);
  });

  test('passes a bar at or above the minimum width', () => {
    for (const width of [8, 12]) {
      const { src, w, h } = bar(width);
      expect(thinFeatures(src, w, h, 8, 20).spots).toBe(0);
    }
  });

  test('ignores the tiny slivers lost at square corners', () => {
    const w = 60, h = 60, src = new Uint8Array(w * h);
    for (let y = 10; y < 50; y++) for (let x = 10; x < 50; x++) src[y * w + x] = 1;
    expect(thinFeatures(src, w, h, 8, 20).spots).toBe(0);
  });

  test('finds the thin neck between two thick blobs', () => {
    const w = 80, h = 40, src = new Uint8Array(w * h);
    for (let y = 5; y < 35; y++) for (let x = 0; x < 80; x++) {
      const blob = x < 30 || x >= 50, neck = y >= 18 && y < 21;
      if (blob || neck) src[y * w + x] = 1;
    }
    const r = thinFeatures(src, w, h, 8, 20);
    expect(r.spots).toBe(1);
    expect(r.mask[19 * w + 40]).toBe(1);
    expect(r.mask[19 * w + 10]).toBe(0);
  });
});
