import { describe, expect, test } from 'vitest';
import { autoTolerance, profileFromMask, segment } from './photo';

// photo() paints a synthetic RGBA image with a light background and the shapes that fill(x, y) draws.
function photo(w: number, h: number, fill: (x: number, y: number) => [number, number, number] | null) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fill(x, y) ?? [235, 232, 228];
    d.set([...c, 255], (y * w + x) * 4);
  }
  return d;
}

// A straight mug body 40 px wide and 90 px tall, with a handle loop on its right and a glaze highlight inside.
const mugPhoto = photo(120, 130, (x, y) => {
  const body = x >= 30 && x < 70 && y >= 20 && y < 110;
  const handle = x >= 70 && x < 88 && y >= 40 && y < 85 && !(x >= 74 && x < 84 && y >= 48 && y < 77);
  if (body && x >= 45 && x < 50 && y >= 50 && y < 60) return [240, 238, 236]; // highlight, close to the background colour
  if (body || handle) return [70, 90, 140];
  if (x >= 5 && x < 7 && y >= 5 && y < 7) return [20, 20, 20]; // a speck of dust
  return null;
});

describe('segment', () => {
  test('keeps the piece and its handle, and drops specks', () => {
    const m = segment(mugPhoto, 120, 130, 60);
    expect(m[60 * 120 + 50]).toBe(1); // body
    expect(m[60 * 120 + 85]).toBe(1); // handle
    expect(m[6 * 120 + 6]).toBe(0); // dust
    expect(m[60 * 120 + 79]).toBe(0); // the hole through the handle stays background
  });
});

describe('profileFromMask', () => {
  test('measures the body, ignoring the handle, scaled to the real height', () => {
    const m = segment(mugPhoto, 120, 130, 60);
    const { profile } = profileFromMask(m, 120, 130, 90, 7);
    expect(profile[0].z).toBe(0);
    expect(profile.at(-1)!.z).toBeCloseTo(90, 6);
    for (const p of profile) expect(Math.abs(p.d - 40)).toBeLessThanOrEqual(1.5);
  });

  test('follows a flared wall from a narrow base to a wide rim', () => {
    const flare = photo(140, 120, (x, y) => (y >= 10 && y < 110 && Math.abs(x - 70) < 20 + (110 - y) * 0.15 ? [60, 60, 60] : null));
    const { profile } = profileFromMask(segment(flare, 140, 120, 60), 140, 120, 100, 5);
    expect(profile[0].d).toBeLessThan(profile.at(-1)!.d - 20);
  });

  test('an empty photo finds nothing', () => {
    expect(() => profileFromMask(new Uint8Array(100), 10, 10, 50)).toThrow(/No piece/);
  });
});

describe('autoTolerance', () => {
  // A 78 → 86 mm flared mug, 95 px tall at 1 px/mm, with a soft grey shadow spreading under its base.
  const shadowed = photo(160, 140, (x, y) => {
    const half = 39 + ((110 - y) / 95) * 4;
    if (y >= 15 && y < 110 && Math.abs(x - 80) < half) return [52, 70, 110];
    if (Math.abs(x - 80) < 50 && y >= 105 && y < 116) return [200, 198, 194];
    return null;
  });

  test('picks a cutoff between the shadow and the pot', () => {
    const t = autoTolerance(shadowed, 160, 140);
    const shadowDist = Math.hypot(235 - 200, 232 - 198, 228 - 194), potDist = Math.hypot(235 - 52, 232 - 70, 228 - 110);
    expect(t).toBeGreaterThan(shadowDist);
    expect(t).toBeLessThan(potDist);
  });

  test('so the traced base ignores the shadow', () => {
    const m = segment(shadowed, 160, 140, autoTolerance(shadowed, 160, 140));
    const { profile } = profileFromMask(m, 160, 140, 95, 5);
    expect(Math.abs(profile[0].d - 78)).toBeLessThan(2);
    expect(Math.abs(profile.at(-1)!.d - 86)).toBeLessThan(2);
  });
});
