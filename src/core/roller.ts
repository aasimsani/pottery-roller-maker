// A heightmap holds relief heights from 0 (base radius) to 1 (tip radius). Row 0 is the top of the pattern.
export interface Heightmap { w: number; h: number; data: Float32Array }

export interface RollerSpec {
  diameter: number;  // Diameter at the tips of the relief, in mm. The roller rolls on this diameter.
  length: number;    // Length of the drum, in mm.
  depth: number;     // Relief height, in mm.
  repeats: number;   // Copies of the pattern around one turn.
  rim: number;       // Plain band at each end, in mm.
  bore: number;      // Axle hole diameter, in mm. 0 makes a solid drum.
  cell: number;      // Mesh spacing on the surface, in mm.
  mirror: boolean;   // The clay shows the mirror image of the roller, so mirror makes the impression read the right way round.
}

export interface Mesh { positions: Float32Array; indices: Uint32Array }

// One turn lays π·D of pattern. With the image's proportions kept, that is repeats image widths.
export const diameterForPattern = (patternHeight: number, aspect: number, repeats: number) =>
  (repeats * patternHeight * aspect) / Math.PI;

export const lengthForDiameter = (diameter: number, aspect: number, repeats: number, rim: number) =>
  (Math.PI * diameter) / (repeats * aspect) + 2 * rim;

// A pot's circumference holds a whole number of turns when D = potØ / laps, so the pattern meets itself.
export const diameterForPot = (potDiameter: number, laps: number) => potDiameter / laps;

// heightAt() samples the pattern at angle theta (radians) and height z (mm from the bottom end).
// The image wraps around the roller, and it's bilinear, so the seam is continuous when the image tiles.
export function heightAt(m: Heightmap, s: RollerSpec, theta: number, z: number): number {
  const ph = s.length - 2 * s.rim;
  if (ph <= 0 || z < s.rim || z > s.length - s.rim) return 0;
  let u = ((theta / (2 * Math.PI)) * s.repeats) % 1;
  if (u < 0) u += 1;
  if (s.mirror) u = 1 - u;
  const x = u * m.w - 0.5, y = Math.min(m.h - 1, Math.max(0, ((s.length - s.rim - z) / ph) * m.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, y1 = Math.min(m.h - 1, y0 + 1);
  const at = (xx: number, yy: number) => m.data[yy * m.w + (((xx % m.w) + m.w) % m.w)];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x0 + 1, y1) * fx) * fy;
}

// seamMismatch() is the mean height jump between the right and left edge columns, from 0 to 1.
export function seamMismatch(m: Heightmap): number {
  let sum = 0;
  for (let y = 0; y < m.h; y++) sum += Math.abs(m.data[y * m.w + m.w - 1] - m.data[y * m.w]);
  return sum / m.h;
}

// heightmapFromImage() raises pixels darker than threshold, then box-blurs by softenPx.
// The blur slopes the relief walls, which helps the roller release from the clay. It wraps left to right.
export function heightmapFromImage(rgba: ArrayLike<number>, w: number, h: number,
  o: { threshold: number; invert: boolean; softenPx: number }): Heightmap {
  const data = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) {
    const lum = 0.299 * rgba[k * 4] + 0.587 * rgba[k * 4 + 1] + 0.114 * rgba[k * 4 + 2];
    data[k] = (lum < o.threshold) !== o.invert ? 1 : 0;
  }
  const r = Math.round(o.softenPx);
  if (r > 0) {
    const tmp = new Float32Array(w * h), n = 2 * r + 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += data[y * w + (((x + d) % w) + w) % w];
      tmp[y * w + x] = s / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x];
      data[y * w + x] = s / n;
    }
  }
  return { w, h, data };
}

// rollerMesh() builds a closed drum along +z: a displaced outer wall, flat end caps, and an axle bore.
// Columns wrap, so the seam shares vertices and the mesh stays watertight.
export function rollerMesh(m: Heightmap, s: RollerSpec): Mesh {
  const Rb = s.diameter / 2 - s.depth, rb = s.bore / 2;
  const nt = Math.max(16, Math.round((Math.PI * s.diameter) / s.cell));
  const nz = Math.max(2, Math.round(s.length / s.cell) + 1);
  const inner = rb > 0 ? 2 * nt : 2;
  const pos = new Float32Array((nz * nt + inner) * 3);
  const ang = (i: number) => (i / nt) * 2 * Math.PI;
  for (let j = 0; j < nz; j++) {
    const z = (s.length * j) / (nz - 1);
    for (let i = 0; i < nt; i++) {
      const a = ang(i), r = Rb + s.depth * heightAt(m, s, a, z), k = (j * nt + i) * 3;
      pos[k] = r * Math.cos(a); pos[k + 1] = r * Math.sin(a); pos[k + 2] = z;
    }
  }
  const base = nz * nt;
  if (rb > 0) {
    for (let e = 0; e < 2; e++) for (let i = 0; i < nt; i++) {
      const k = (base + e * nt + i) * 3, a = ang(i);
      pos[k] = rb * Math.cos(a); pos[k + 1] = rb * Math.sin(a); pos[k + 2] = e * s.length;
    }
  } else {
    pos.set([0, 0, 0, 0, 0, s.length], base * 3);
  }

  const idx: number[] = [];
  const o = (i: number, j: number) => j * nt + (i % nt);
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nt; i++) {
    const a = o(i, j), b = o(i + 1, j), c = o(i + 1, j + 1), d = o(i, j + 1);
    idx.push(a, b, c, a, c, d);
  }
  const top = nz - 1;
  for (let i = 0; i < nt; i++) {
    const o0 = o(i, 0), o1 = o(i + 1, 0), t0 = o(i, top), t1 = o(i + 1, top);
    if (rb > 0) {
      const q0 = base + i, q1 = base + ((i + 1) % nt), p0 = base + nt + i, p1 = base + nt + ((i + 1) % nt);
      idx.push(t0, t1, p1, t0, p1, p0);   // top cap faces +z
      idx.push(o0, q1, o1, o0, q0, q1);   // bottom cap faces −z
      idx.push(q0, p1, q1, q0, p0, p1);   // bore wall faces the axis
    } else {
      idx.push(t0, t1, base + 1);
      idx.push(o0, base, o1);
    }
  }
  return { positions: pos, indices: Uint32Array.from(idx) };
}

export function toSTL({ positions: p, indices: i }: Mesh): ArrayBuffer {
  const tris = i.length / 3, buf = new ArrayBuffer(84 + 50 * tris), dv = new DataView(buf);
  dv.setUint32(80, tris, true);
  for (let t = 0; t < tris; t++) {
    const a = i[t * 3] * 3, b = i[t * 3 + 1] * 3, c = i[t * 3 + 2] * 3, off = 84 + t * 50;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    [nx, ny, nz, p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]
      .forEach((v, k) => dv.setFloat32(off + k * 4, v, true));
  }
  return buf;
}
