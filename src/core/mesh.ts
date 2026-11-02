type Vec3 = [number, number, number];

// meshSTL() extrudes the solid pixels into a closed, manifold binary STL. Each pixel-row
// run becomes a top and bottom face. Face edges carry a vertex at every run endpoint of
// the rows above and below, so faces and walls share exact edges and leave no T-junctions.
// maxRunPx also cuts every row at the same columns, so no face is wider than that. A shell
// wrapped onto a pot needs this, because a long flat face would cut a straight chord through the curve.
export function meshSTL(solid: Uint8Array, w: number, h: number, res: number, thick: number, maxRunPx = Infinity): ArrayBuffer {
  let buf = new Float32Array(1 << 16), len = 0;
  const put = (a: Vec3, b: Vec3, c: Vec3) => {
    if (len + 9 > buf.length) { const nb = new Float32Array(buf.length * 2); nb.set(buf); buf = nb; }
    buf.set(a, len); buf.set(b, len + 3); buf.set(c, len + 6); len += 9;
  };
  // Rows run top-down in the image, so 3D y = (h - line) * res keeps the top view unmirrored.
  const P = (x: number, line: number, z: number): Vec3 => [x * res, (h - line) * res, z];
  // tri() emits the triangle wound so its normal points along n.
  const tri = (a: Vec3, b: Vec3, c: Vec3, n: Vec3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (d >= 0) put(a, b, c); else put(a, c, b);
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3) => { tri(a, b, c, n); tri(a, c, d, n); };

  const runs: number[][] = [];
  for (let y = 0; y < h; y++) {
    const r: number[] = [];
    for (let x = 0; x < w;) {
      if (!solid[y * w + x]) { x++; continue; }
      const a = x;
      while (x < w && solid[y * w + x]) x++;
      r.push(a, x);
    }
    runs.push(r);
  }
  // cuts() lists the shared cut columns strictly between a and b.
  const cuts = (a: number, b: number) => {
    const out: number[] = [];
    if (Number.isFinite(maxRunPx)) for (let x = (Math.floor(a / maxRunPx) + 1) * maxRunPx; x < b; x += maxRunPx) out.push(x);
    return out;
  };
  const within = (r: number[] | undefined, a: number, b: number) =>
    [...new Set([...(r ? r.filter((x) => x > a && x < b) : []), ...cuts(a, b)])].sort((p, q) => p - q);

  for (let y = 0; y < h; y++) {
    const r = runs[y];
    for (let k = 0; k < r.length; k += 2) {
      const a = r[k], b = r[k + 1];
      const A = [a, ...within(runs[y - 1], a, b), b], B = [a, ...within(runs[y + 1], a, b), b];
      for (let i = 0, j = 0; i < A.length - 1 || j < B.length - 1;) {
        let t: [number, number][];
        if (i < A.length - 1 && (j === B.length - 1 || A[i + 1] <= B[j + 1])) { t = [[A[i], y], [A[i + 1], y], [B[j], y + 1]]; i++; }
        else { t = [[A[i], y], [B[j + 1], y + 1], [B[j], y + 1]]; j++; }
        const [p, q, s] = t;
        tri(P(p[0], p[1], thick), P(q[0], q[1], thick), P(s[0], s[1], thick), [0, 0, 1]);
        tri(P(p[0], p[1], 0), P(q[0], q[1], 0), P(s[0], s[1], 0), [0, 0, -1]);
      }
      quad(P(a, y, 0), P(a, y + 1, 0), P(a, y + 1, thick), P(a, y, thick), [-1, 0, 0]);
      quad(P(b, y, 0), P(b, y + 1, 0), P(b, y + 1, thick), P(b, y, thick), [1, 0, 0]);
    }
  }
  // Horizontal walls sit on line y, between image rows y-1 and y.
  for (let y = 0; y <= h; y++) {
    const ends = [...new Set([...(runs[y - 1] ?? []), ...(runs[y] ?? [])])].sort((a, b) => a - b);
    const bps = ends.flatMap((x, i) => (i ? [...cuts(ends[i - 1], x), x] : [x]));
    for (let k = 0; k < bps.length - 1; k++) {
      const p = bps[k], q = bps[k + 1];
      const above = y > 0 && solid[(y - 1) * w + p], below = y < h && solid[y * w + p];
      if (!above === !below) continue;
      quad(P(p, y, 0), P(q, y, 0), P(q, y, thick), P(p, y, thick), [0, below ? 1 : -1, 0]);
    }
  }

  const nt = len / 9, out = new DataView(new ArrayBuffer(84 + nt * 50));
  out.setUint32(80, nt, true);
  for (let t = 0, o = 84; t < nt; t++, o += 50) {
    const v = buf.subarray(t * 9, t * 9 + 9);
    const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2], vx = v[6] - v[0], vy = v[7] - v[1], vz = v[8] - v[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    out.setFloat32(o, nx / nl, true); out.setFloat32(o + 4, ny / nl, true); out.setFloat32(o + 8, nz / nl, true);
    for (let i = 0; i < 9; i++) out.setFloat32(o + 12 + i * 4, v[i], true);
  }
  return out.buffer;
}

// rotateSTL() returns a copy of a binary STL turned deg degrees about the z axis.
export function rotateSTL(buf: ArrayBuffer, deg: number): ArrayBuffer {
  const out = buf.slice(0), dv = new DataView(out), n = dv.getUint32(80, true);
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  for (let k = 0; k < n; k++) for (let i = 0; i < 4; i++) {
    const o = 84 + k * 50 + i * 12, x = dv.getFloat32(o, true), y = dv.getFloat32(o + 4, true);
    dv.setFloat32(o, x * c - y * s, true); dv.setFloat32(o + 4, x * s + y * c, true);
  }
  return out;
}
