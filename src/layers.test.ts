import { expect, test } from 'vitest';
import { layersFromMix, newDesignLayer, newLinesLayer } from './layers';
import { builtinRef } from './sources/builtin';

test('a design layer covers the whole band and repeats on its own', () => {
  const l = newDesignLayer(builtinRef('Leafy sprig'));
  expect(l).toMatchObject({ kind: 'design', visible: true, blend: 'paint', from: 0, to: 100, repeats: 3, rows: 1, size: 80 });
  expect(newDesignLayer(builtinRef('Waves')).name).toBe('Waves');
});

test('every layer gets its own id', () => {
  expect(newLinesLayer().id).not.toBe(newLinesLayer().id);
});

test('a lines layer defaults to framing lines near both band edges', () => {
  expect(newLinesLayer().lines).toMatchObject({ positions: [6, 94], style: 'solid' });
});

test('a saved mix becomes one layer per design, keeping size and rotation', () => {
  const layers = layersFromMix([
    { ref: builtinRef('Waves'), scale: 0.5, rotate: 0 },
    { ref: builtinRef('Dot'), scale: 0.6, rotate: 30 },
  ]);
  expect(layers.map((l) => l.name)).toEqual(['Waves', 'Dot']);
  expect(layers[1]).toMatchObject({ size: 60, rotate: 30 });
});
