import { expect, it } from 'vitest';
import { fitWithin, needsShrinking } from './shrink';

it('scales a big image down to fit, and keeps its proportions', () => {
  expect(fitWithin(4096, 2048, 2048)).toEqual([2048, 1024]);
  expect(fitWithin(1000, 3000, 2048)).toEqual([683, 2048]);
});
it('never scales a small image up', () => {
  expect(fitWithin(800, 400, 2048)).toEqual([800, 400]);
});
it('shrinks big photos and drawings, and leaves small images and SVGs as they are', () => {
  expect(needsShrinking('data:image/jpeg;base64,' + 'A'.repeat(400_000))).toBe(true);
  expect(needsShrinking('data:image/png;base64,' + 'A'.repeat(1000))).toBe(false);
  expect(needsShrinking('data:image/svg+xml,' + 'A'.repeat(400_000))).toBe(false);
  expect(needsShrinking('https://example.com/big.jpg')).toBe(false);
});
