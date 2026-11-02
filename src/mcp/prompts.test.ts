import { expect, it } from 'vitest';
import { imagePrompt } from './prompts';

it('sizes the image prompt to the live roller', () => {
  // One turn of a Ø40 roller is 125.7 mm, over a 65 mm band, with 0.8 mm minimum lines.
  const text = imagePrompt({ diameter: 40, bandHeight: 65, repeatsPerTurn: 1, minLine: 0.8, minGap: 1.2, use: 'texture' }, 'moth and vines');
  expect(text).toContain('1.93:1');
  expect(text).toContain('1.2% of the image height'); // 0.8 / 65
  expect(text).toContain('1.8% of the image height'); // 1.2 / 65
  expect(text).toContain('moth and vines');
});
