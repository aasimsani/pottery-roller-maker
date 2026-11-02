import type { DesignRef, SearchPage } from './types';

type Ctx = CanvasRenderingContext2D;

// Each motif draws black (paint) shapes in a 100 × 100 box. Textures repeat edge to edge,
// so they join up seamlessly with the neighbouring cells.
const ellipse = (c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => {
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
};
const almond = (c: Ctx, x: number, y: number, len: number, wid: number, rot: number) => {
  c.save(); c.translate(x, y); c.rotate(rot); c.beginPath();
  c.moveTo(0, 0); c.quadraticCurveTo(wid, -len / 2, 0, -len); c.quadraticCurveTo(-wid, -len / 2, 0, 0); c.fill(); c.restore();
};
const flower = (c: Ctx, x: number, y: number, s: number, petals: number) => {
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    ellipse(c, x + Math.sin(a) * 1.7 * s, y - Math.cos(a) * 1.7 * s, 0.75 * s, 1.15 * s, a);
  }
  ellipse(c, x, y, 0.55 * s, 0.55 * s);
};

interface Builtin { draw: (c: Ctx) => void; texture?: boolean }

const BUILTINS: Record<string, Builtin> = {
  'Daisy': { draw: (c) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ellipse(c, 50 + Math.sin(a) * 30, 50 - Math.cos(a) * 30, 6, 16, a); } ellipse(c, 50, 50, 9, 9); } },
  'Blossom': { draw: (c) => flower(c, 50, 50, 14, 5) },
  'Ditsy florals': { draw: (c) => { flower(c, 26, 30, 6, 5); flower(c, 72, 64, 7, 5); flower(c, 78, 18, 4, 5); almond(c, 36, 74, 18, 7, -0.6); almond(c, 52, 28, 14, 6, 0.9); } },
  'Leafy sprig': {
    draw: (c) => {
      c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(50, 96); c.bezierCurveTo(40, 70, 62, 40, 50, 6); c.stroke();
      ([[48, 80, -1], [53, 66, 1], [52, 50, -1], [55, 36, 1], [52, 22, -1]] as const).forEach(([x, y, s], i) => almond(c, x, y, 24 - i * 2, 9, s));
    },
  },
  'Tulip': {
    draw: (c) => {
      c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(50, 54); c.lineTo(50, 96); c.stroke();
      almond(c, 50, 92, 40, 12, -0.55); almond(c, 50, 96, 34, 10, 0.6);
      c.beginPath(); c.moveTo(30, 18); c.lineTo(40, 30); c.lineTo(50, 12); c.lineTo(60, 30); c.lineTo(70, 18);
      c.quadraticCurveTo(74, 52, 50, 56); c.quadraticCurveTo(26, 52, 30, 18); c.fill();
    },
  },
  'Leaf': {
    draw: (c) => {
      almond(c, 30, 88, 92, 34, 0.55);
      c.save(); c.globalCompositeOperation = 'destination-out'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(24, 98); c.quadraticCurveTo(48, 60, 70, 20); c.stroke(); c.restore();
    },
  },
  'Dot': { draw: (c) => ellipse(c, 50, 50, 22, 22) },
  'Waves': { texture: true, draw: (c) => { c.lineWidth = 9; c.beginPath(); for (let x = 0; x <= 100; x++) c.lineTo(x, 50 - 22 * Math.sin((x / 100) * Math.PI * 2)); c.stroke(); } },
  'Stripes': { texture: true, draw: (c) => c.fillRect(42, 0, 16, 100) },
  'Chevrons': { texture: true, draw: (c) => { c.lineWidth = 10; c.beginPath(); c.moveTo(-5, 35); c.lineTo(50, 70); c.lineTo(105, 35); c.stroke(); } },
};

export const BUILTIN_NAMES = Object.keys(BUILTINS);

/** Draws a built-in design into a w × h box. Black is paint. */
export function drawBuiltin(name: string, c: Ctx, w: number, h: number): void {
  const b = BUILTINS[name];
  if (!b) throw new Error(`Unknown built-in design ${name}`);
  c.save(); c.fillStyle = c.strokeStyle = '#000'; c.scale(w / 100, h / 100); b.draw(c); c.restore();
}

const thumbs = new Map<string, string>();
function thumb(name: string): string {
  if (typeof document === 'undefined') return '';
  if (!thumbs.has(name)) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 96, 96);
    drawBuiltin(name, c, 96, 96);
    thumbs.set(name, cv.toDataURL());
  }
  return thumbs.get(name)!;
}

export const builtinRef = (name: string): DesignRef => ({
  source: 'builtin', id: name, title: name, thumb: thumb(name), data: name, texture: BUILTINS[name]?.texture,
  credit: { source: 'Built in', license: 'free to use' },
});

export function searchBuiltin(query: string): SearchPage {
  const q = query.trim().toLowerCase();
  return { items: BUILTIN_NAMES.filter((n) => !q || n.toLowerCase().includes(q)).map(builtinRef) };
}
