import type { DesignRef } from '../sources/types';
import { drawBuiltin } from '../sources/builtin';
import { fetchIconSvg } from '../sources/iconify';
import { commonsImageUrl } from '../sources/commons';
import { siImageUrl } from '../sources/smithsonian';
import { svgDataUrl } from '../sources/types';

/** A loaded design that can draw itself into a w × h box. Black is paint. */
export interface Art {
  draw(c: CanvasRenderingContext2D, w: number, h: number): void;
  /** Width ÷ height of the design. */
  aspect: number;
}

export const refKey = (ref: DesignRef) => `${ref.source}:${ref.id}`;

const cache = new Map<string, Promise<Art>>();

export function loadArt(ref: DesignRef): Promise<Art> {
  const key = refKey(ref);
  if (!cache.has(key)) {
    const p = load(ref);
    p.catch(() => cache.delete(key)); // a failed load can be retried
    cache.set(key, p);
  }
  return cache.get(key)!;
}

async function load(ref: DesignRef): Promise<Art> {
  const data = ref.data ?? ref.id;
  switch (ref.source) {
    case 'builtin': return { aspect: 1, draw: (c, w, h) => drawBuiltin(data, c, w, h) };
    // New mixes store the icon's SVG. Mixes saved before that store only its id, such as "mdi:flower".
    case 'iconify': return image(svgDataUrl(data.startsWith('<svg') ? data : await fetchIconSvg(data)));
    case 'commons': return image(await commonsImageUrl(data));
    case 'smithsonian': return image(siImageUrl(data, 1600));
    // The pattern libraries are about 1 MB, so they load only when a pattern is used.
    case 'patternmonster': return image(svgDataUrl((await import('../sources/patternMonster')).patternMonsterSvg(data)));
    case 'hero': return image(svgDataUrl((await import('../sources/heroPatterns')).heroPatternSvg(data)));
    case 'upload': return image(data);
  }
}

// Remote images load with crossOrigin so the canvas stays readable. Every source here sends
// Access-Control-Allow-Origin: *, and the threshold step needs getImageData().
async function image(url: string): Promise<Art> {
  const img = new Image();
  if (/^https?:/.test(url)) img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
  return { aspect, draw: (c, w, h) => c.drawImage(img, 0, 0, w, h) };
}

/** Luminance histogram of the given designs, each drawn on white the way a repeat cell draws it. */
export function artHistogram(arts: Art[], size = 256): number[] {
  const hist = new Array(256).fill(0);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  for (const art of arts) {
    c.fillStyle = '#fff'; c.fillRect(0, 0, size, size);
    const w = art.aspect >= 1 ? size : size * art.aspect, h = art.aspect >= 1 ? size / art.aspect : size;
    c.save(); c.translate((size - w) / 2, (size - h) / 2); art.draw(c, w, h); c.restore();
    const d = c.getImageData(0, 0, size, size).data;
    for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  }
  return hist;
}
