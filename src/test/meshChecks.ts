import type { Mesh } from '../core/roller';

// edgeCounts() maps each directed edge "a,b" to how often triangles use it.
export function edgeCounts(idx: Uint32Array) {
  const m = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const key = `${idx[t + k]},${idx[t + (k + 1) % 3]}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

export const closed = (mesh: Mesh) => {
  const e = edgeCounts(mesh.indices);
  return [...e].every(([key, n]) => { const [a, b] = key.split(','); return n === 1 && e.get(`${b},${a}`) === 1; });
};

// overhangs() counts downward-facing triangles that neither rest on the bed nor slope at 45° or steeper.
// A printer can't lay plastic on those without support, so a part that has them starts in mid-air.
export function overhangs({ positions: p, indices: i }: Mesh): number {
  let bad = 0;
  for (let t = 0; t < i.length; t += 3) {
    const [a, b, c] = [i[t] * 3, i[t + 1] * 3, i[t + 2] * 3];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
    if (!len) continue;
    const onBed = Math.max(p[a + 2], p[b + 2], p[c + 2]) < 1e-6;
    if (!onBed && nz / len < -Math.SQRT1_2 - 1e-3) bad++;
  }
  return bad;
}

