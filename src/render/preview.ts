import type { Mask } from '../core/mask';

type RGB = [number, number, number];

/** Resolves a CSS colour (including var() tokens) to RGB by painting one canvas pixel. */
export function cssRgb(value: string): RGB {
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  c.fillStyle = value.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(value).trim() : value;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

// drawRoller() shows the roller's surface unrolled: raised relief in plastic, the low base as a hole,
// and, when asked, raised lines too thin to print and gaps too narrow to stay clean.
export function drawRoller(cv: HTMLCanvasElement, mask: Mask, problems?: { relief: Uint8Array; gaps: Uint8Array }): void {
  cv.width = mask.w; cv.height = mask.h;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(mask.w, mask.h), d = img.data;
  const plastic = cssRgb('--plastic'), hole = cssRgb('--hole'), thin = cssRgb('--island'), narrow = cssRgb('--thin-hole');
  for (let k = 0; k < mask.solid.length; k++) {
    const col = problems?.relief[k] ? thin : problems?.gaps[k] ? narrow : mask.inside[k] && !mask.solid[k] ? plastic : hole, o = k * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
