export interface Picture { rgba: Uint8ClampedArray; w: number; h: number; name: string }

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}

// loadImage() decodes a file and scales it down to maxW pixels wide, which keeps the heightmap quick to build.
export async function loadImage(file: File, maxW = 1600): Promise<Picture> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxW / bmp.width), w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const [, ctx] = canvas(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return { rgba: ctx.getImageData(0, 0, w, h).data, w, h, name: file.name };
}

// samplePattern() draws a vine that tiles left to right. Every shape is drawn three times,
// shifted by one width each way, so the shapes that cross an edge continue on the other side.
export function samplePattern(): Picture {
  const w = 800, h = 400, [, ctx] = canvas(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = ctx.fillStyle = '#000';
  ctx.lineCap = 'round';
  const wave = (x: number) => h / 2 + 80 * Math.sin((4 * Math.PI * x) / w);
  for (const dx of [-w, 0, w]) {
    ctx.lineWidth = 14;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) x ? ctx.lineTo(x + dx, wave(x)) : ctx.moveTo(dx, wave(0));
    ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const x = (k + 0.5) * (w / 8), y = wave(x), side = k % 2 ? 1 : -1;
      ctx.save();
      ctx.translate(x + dx, y + side * 46);
      ctx.rotate(side * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, 34, 15, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x + dx + w / 16, h / 2 - side * 120, 10, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.lineWidth = 10;
  for (const y of [22, h - 22]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  return { rgba: ctx.getImageData(0, 0, w, h).data, w, h, name: 'Sample vine' };
}

export function lumHistogram(p: Picture): number[] {
  const hist = new Array(256).fill(0);
  for (let k = 0; k < p.w * p.h; k++) hist[Math.round(0.299 * p.rgba[k * 4] + 0.587 * p.rgba[k * 4 + 1] + 0.114 * p.rgba[k * 4 + 2])]++;
  return hist;
}
