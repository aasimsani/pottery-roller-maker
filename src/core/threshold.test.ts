import { expect, test } from 'vitest';
import { otsuThreshold } from './threshold';

const hist = (entries: [number, number][]) => {
  const h = new Array(256).fill(0);
  for (const [lum, count] of entries) h[lum] += count;
  return h;
};

test('splits ink from paper between the two peaks', () => {
  const t = otsuThreshold(hist([[30, 100], [35, 80], [220, 900], [230, 1200]]));
  expect(t).toBeGreaterThan(35);
  expect(t).toBeLessThanOrEqual(220);
});

test('a faint pencil sketch gets a threshold above its grey lines', () => {
  // Grey lines at 150–160 on white paper need a cutoff above 160, which a fixed 128 misses.
  const t = otsuThreshold(hist([[150, 300], [160, 200], [250, 5000]]));
  expect(t).toBeGreaterThan(160);
  expect(t).toBeLessThanOrEqual(250);
});

test('maximises the between-class variance', () => {
  const h = hist([[20, 50], [90, 120], [140, 80], [240, 600]]);
  const t = otsuThreshold(h);
  const score = (th: number) => {
    let w0 = 0, w1 = 0, s0 = 0, s1 = 0;
    h.forEach((c, i) => { if (i < th) { w0 += c; s0 += c * i; } else { w1 += c; s1 += c * i; } });
    return w0 && w1 ? w0 * w1 * (s0 / w0 - s1 / w1) ** 2 : 0;
  };
  for (let th = 1; th < 256; th++) expect(score(th)).toBeLessThanOrEqual(score(t) + 1e-6);
});

test('a one-tone image falls back to the middle', () => {
  expect(otsuThreshold(hist([[200, 1000]]))).toBe(128);
  expect(otsuThreshold(new Array(256).fill(0))).toBe(128);
});
