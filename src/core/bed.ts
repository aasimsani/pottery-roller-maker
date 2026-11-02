import type { Mask } from './mask';

// fitAngle() returns the smallest whole-degree rotation that fits the stencil on a
// bedW × bedD mm bed, or null when no rotation fits. Only the first and last
// pixel of each row can sit on the rotated bounding box, so only those get tested.
export function fitAngle(m: Pick<Mask, 'w' | 'h' | 'res' | 'inside'>, bedW: number, bedD: number): number | null {
  const pts: number[] = [];
  for (let y = 0; y < m.h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < m.w; x++) if (m.inside[y * m.w + x]) { if (a < 0) a = x; b = x; }
    if (a < 0) continue;
    for (const x of [a, b + 1]) for (const yy of [y, y + 1]) pts.push(x * m.res, yy * m.res);
  }
  for (let deg = 0; deg < 90; deg++) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const u = pts[i] * c - pts[i + 1] * s, v = pts[i] * s + pts[i + 1] * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    if (u1 - u0 <= bedW && v1 - v0 <= bedD) return deg;
    if (u1 - u0 <= bedD && v1 - v0 <= bedW) return deg + 90;
  }
  return null;
}
