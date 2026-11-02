import type { CellPlan } from '../core/layout';
import type { Tile } from '../core/mask';
import type { Art } from './art';

export interface ImageOptions {
  /** Pixels darker than this (0–255) become paint. */
  threshold: number;
  invert: boolean;
  /** Blur radius in mm applied before thresholding. */
  smooth: number;
}

export interface TileItem { scale: number; art?: Art }

// renderTile() draws one planned repeat cell and thresholds it into a paint mask.
// Textures repeat a whole number of times across the cell, so neighbouring cells join seamlessly.
export function renderTile(
  plan: CellPlan, items: TileItem[], cellW: number, cellH: number, res: number,
  { threshold, invert, smooth }: ImageOptions, wrap: boolean,
): Tile {
  const tw = Math.max(8, Math.min(3000, Math.round(cellW / res))), th = Math.max(8, Math.min(3000, Math.round(cellH / res)));
  const sx = tw / cellW, sy = th / cellH;
  const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.fillStyle = '#fff'; c.fillRect(0, 0, tw, th);
  c.filter = smooth > 0 ? `blur(${smooth / res}px)` : 'none';

  for (const i of plan.textures) {
    const art = items[i].art;
    if (!art) continue;
    const tilesY = Math.max(1, Math.round(1 / items[i].scale)), h = cellH / tilesY;
    const tilesX = Math.max(1, Math.round(cellW / (h * art.aspect))), w = cellW / tilesX;
    for (let ix = 0; ix < tilesX; ix++) for (let iy = 0; iy < tilesY; iy++) {
      c.save(); c.translate(ix * w * sx, iy * h * sy); art.draw(c, w * sx, h * sy); c.restore();
    }
  }
  const offsets = wrap ? [-1, 0, 1] : [0];
  for (const p of plan.placements) {
    const art = items[p.item].art;
    if (!art) continue;
    // Fit the design inside its box without stretching it.
    const fitW = art.aspect > p.w / p.h, dw = fitW ? p.w : p.h * art.aspect, dh = fitW ? p.w / art.aspect : p.h;
    for (const ox of offsets) for (const oy of offsets) {
      c.save();
      c.translate((p.cx + ox * cellW) * sx, (p.cy + oy * cellH) * sy);
      c.rotate((p.rotate * Math.PI) / 180);
      c.translate((-dw / 2) * sx, (-dh / 2) * sy);
      art.draw(c, dw * sx, dh * sy);
      c.restore();
    }
  }

  const d = c.getImageData(0, 0, tw, th).data, paint = new Uint8Array(tw * th);
  for (let i = 0; i < paint.length; i++) {
    const lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    paint[i] = (lum < threshold) !== invert ? 1 : 0;
  }
  return { w: tw, h: th, paint };
}
