// shrink.ts keeps an uploaded image small enough for the browser to save with the design. A layer stores its image
// as a data URL, and localStorage holds about 5 MB for all three pottery apps together.

/** The longest side an uploaded image keeps, in pixels. The finest roller raster is 0.1 mm, so this covers 200 mm of pattern. */
export const MAX_SIDE = 2048;
const THUMB_SIDE = 160;

/** The size an image takes when its longest side must fit within max. A smaller image keeps its size. */
export function fitWithin(w: number, h: number, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)];
}

// needsShrinking() picks out big photos and drawings. A small image costs little to keep, an SVG is text that scales
// cleanly, and an https image is only a link.
export const needsShrinking = (url: string) => url.startsWith('data:image/') && !url.startsWith('data:image/svg') && url.length > 300_000;

// shrinkImage() redraws a big upload on white, no larger than MAX_SIDE, and saves it as a JPEG with a small thumbnail.
// The design only reads light against dark, so a JPEG loses nothing it uses. When the browser can't decode the image,
// the original comes back unchanged.
export async function shrinkImage(url: string): Promise<{ data: string; thumb: string }> {
  if (!needsShrinking(url)) return { data: url, thumb: url };
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const draw = (max: number, quality: number) => {
      const [w, h] = fitWithin(img.naturalWidth, img.naturalHeight, max), c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', quality);
    };
    return { data: draw(MAX_SIDE, 0.85), thumb: draw(THUMB_SIDE, 0.7) };
  } catch {
    return { data: url, thumb: url };
  }
}
