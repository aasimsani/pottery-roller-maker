import { describe, expect, test } from 'vitest';
import { clampTo, parseNumber, stepBy } from './number';

describe('parseNumber', () => {
  test('reads plain and decimal numbers', () => {
    expect(parseNumber('80')).toBe(80);
    expect(parseNumber(' 12.5 ')).toBe(12.5);
    expect(parseNumber('-3')).toBe(-3);
  });

  test('reads a decimal comma and ignores a typed unit', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('80 mm')).toBe(80);
  });

  test('returns null for text that is not a number yet', () => {
    for (const t of ['', '-', '.', 'abc']) expect(parseNumber(t)).toBeNull();
  });
});

describe('stepBy', () => {
  test('moves by the step and lands on a clean decimal', () => {
    expect(stepBy(0.3, 0.1, 1)).toBe(0.4); // 0.3 + 0.1 is 0.40000000000000002 in floating point
    expect(stepBy(80, 0.5, -1)).toBe(79.5);
  });

  test('stays inside min and max', () => {
    expect(stepBy(1, 0.5, -4, 0)).toBe(0);
    expect(stepBy(59.5, 0.5, 4, 0, 60)).toBe(60);
  });
});

describe('clampTo', () => {
  test('keeps a value inside the limits it has', () => {
    expect(clampTo(-2, 0)).toBe(0);
    expect(clampTo(99, undefined, 60)).toBe(60);
    expect(clampTo(5)).toBe(5);
  });
});
