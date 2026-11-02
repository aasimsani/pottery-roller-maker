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

// heightmapFromBits() raises the set pixels, then box-blurs them by softenPx. The blur slopes the
// relief walls, which helps the roller lift off the clay. It wraps left to right, because the pattern runs round the roller.
export function heightmapFromBits(bits: Uint8Array, w: number, h: number, softenPx: number): Heightmap {
  const data = Float32Array.from(bits), r = Math.round(softenPx);
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

// A drum prints hollow or solid. A hollow drum is a relief tube of the given wall with an end plate
// at each end, which is a hub round the axle and spokes out to the tube. The middle stays empty.
// A solid drum leaves the inside to the slicer's sparse infill.
export interface DrumBuild {
  kind: 'hollow' | 'solid';
  wall: number;    // Wall under the relief, in mm.
  spokes: number;
  spokeW: number;  // Spoke thickness, in mm.
  hub: number;     // Wall around the axle hole, in mm.
  plate: number;   // Thickness of each end plate along the axle, in mm.
  infill: number;  // Sparse infill for a solid drum, from 0 to 1. It only feeds the estimate, because the slicer sets it.
}

export function volume({ positions: p, indices: i }: Mesh): number {
  let v = 0;
  for (let t = 0; t < i.length; t += 3) {
    const a = i[t] * 3, b = i[t + 1] * 3, c = i[t + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}

// spoke() is a box from radius r0 to r1 at angle a, from height z0 to z1.
function spoke(r0: number, r1: number, w: number, a: number, z0: number, z1: number): Mesh {
  const c = Math.cos(a), s = Math.sin(a), pos = new Float32Array(24);
  for (let k = 0; k < 8; k++) {
    const x = k & 1 ? r1 : r0, y = k & 2 ? w / 2 : -w / 2, z = k & 4 ? z1 : z0;
    pos.set([x * c - y * s, x * s + y * c, z], k * 3);
  }
  const quads = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
  return { positions: pos, indices: Uint32Array.from(quads.flatMap(([p, q, r, t]) => [p, q, r, p, r, t])) };
}

const FLAT: Heightmap = { w: 1, h: 1, data: new Float32Array(1) };

// drumParts() returns closed parts that may overlap. ponytail: the slicer unions overlapping shells,
// so the spokes simply reach 0.5 mm into the tube and the hub. Merge them with a mesh union if a slicer ever objects.
export function drumParts(m: Heightmap, s: RollerSpec, b: DrumBuild): Mesh[] {
  const Ri = s.diameter / 2 - s.depth - b.wall, hubR = s.bore / 2 + b.hub;
  if (b.kind === 'solid' || Ri - hubR < 1 || b.spokes < 1) return [rollerMesh(m, s)];
  const plate = Math.min(b.plate, s.length / 2), parts = [rollerMesh(m, { ...s, bore: 2 * Ri })];
  for (const z0 of [0, s.length - plate]) {
    const hub = rollerMesh(FLAT, { ...s, length: plate, diameter: 2 * hubR, depth: 0, rim: 0, cell: Math.max(s.cell, 1) });
    for (let k = 2; k < hub.positions.length; k += 3) hub.positions[k] += z0;
    parts.push(hub);
    for (let k = 0; k < b.spokes; k++) parts.push(spoke(hubR - 0.5, Ri + 0.5, b.spokeW, (k / b.spokes) * 2 * Math.PI, z0, z0 + plate));
  }
  return parts;
}

export function mergeMeshes(parts: Mesh[]): Mesh {
  const nv = parts.reduce((n, p) => n + p.positions.length, 0), ni = parts.reduce((n, p) => n + p.indices.length, 0);
  const positions = new Float32Array(nv), indices = new Uint32Array(ni);
  let pv = 0, pi = 0;
  for (const p of parts) {
    positions.set(p.positions, pv);
    for (let k = 0; k < p.indices.length; k++) indices[pi + k] = p.indices[k] + pv / 3;
    pv += p.positions.length; pi += p.indices.length;
  }
  return { positions, indices };
}

// filamentGrams() estimates the filament a drum takes, in PETG at 1.27 g/cm³ by default.
// A solid drum gets two 0.42 mm walls on its outer and bore surfaces and four 0.2 mm layers top and bottom,
// with sparse infill inside. A hollow drum's walls are thin enough that the slicer prints them nearly solid.
export function filamentGrams(parts: Mesh[], s: RollerSpec, b: DrumBuild, density = 1.27): number {
  const V = parts.reduce((v, p) => v + volume(p), 0);
  if (b.kind === 'hollow' && parts.length > 1) return (V / 1000) * density;
  const shell = Math.min(V, 0.84 * Math.PI * (s.diameter + s.bore) * s.length
    + 2 * 0.8 * Math.PI * ((s.diameter / 2) ** 2 - (s.bore / 2) ** 2));
  return ((shell + b.infill * (V - shell)) / 1000) * density;
}
