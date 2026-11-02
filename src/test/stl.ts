import { expect } from 'vitest';

export interface StlStats { volume: number; min: number[]; max: number[]; centroid: number[] }

// checkStl() asserts a binary STL is a closed surface with consistent outward winding:
// every directed edge appears exactly once and its reverse exactly once. It returns the
// signed volume (positive when faces point outward), the bounding box, and the vertex centroid.
export function checkStl(buf: ArrayBuffer): StlStats {
  const dv = new DataView(buf), n = dv.getUint32(80, true);
  const key = (o: number) => [0, 4, 8].map((k) => dv.getFloat32(o + k, true).toFixed(4)).join(',');
  const edges = new Map<string, number>();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], sum = [0, 0, 0];
  let volume = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    const v = [0, 1, 2].map((i) => key(o + i * 12));
    const p = [0, 1, 2].map((i) => [0, 4, 8].map((k) => dv.getFloat32(o + i * 12 + k, true)));
    for (const q of p) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], q[a]); max[a] = Math.max(max[a], q[a]); sum[a] += q[a]; }
    const [a, b, c] = p;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (let i = 0; i < 3; i++) {
      const e = v[i] + '>' + v[(i + 1) % 3];
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  for (const [e, count] of edges) {
    expect(count, `edge used ${count}x: ${e}`).toBe(1);
    const [a, b] = e.split('>');
    expect(edges.has(b + '>' + a), `open edge ${e}`).toBe(true);
  }
  return { volume, min, max, centroid: sum.map((x) => x / (3 * n)) };
}
