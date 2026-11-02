import { describe, expect, test } from 'vitest';
import { geometry } from './geometry';
import { buildMask, connectIslands, countPieces, removePinches, type Mask, type Tile } from './mask';
import { meshSTL, rotateSTL } from './mesh';
import { fitAngle } from './bed';

describe('geometry', () => {
  test('unrolled band edges match the circumference at both edges', () => {
    // A cylinder, a flared pot, a narrowing vase, and a flat plate rim (slant == radius change).
    for (const [topD, botD, slant] of [[85, 85, 60], [90, 70, 60], [70, 90, 60], [260, 180, 40]]) {
      const g = geometry({ topD, botD, slant, coverage: 1, frame: 0, res: 0.2 });
      expect(g.arcLength(slant)).toBeCloseTo(Math.PI * topD, 1);
      expect(g.arcLength(0)).toBeCloseTo(Math.PI * botD, 1);
    }
  });

  test('margins above and below the band can differ, and the band stays put', () => {
    const even = geometry({ topD: 80, botD: 80, slant: 40, coverage: 0.25, frame: 5, res: 0.2 });
    const tall = geometry({ topD: 80, botD: 80, slant: 40, coverage: 0.25, frame: 5, frameTop: 3, frameBottom: 20, res: 0.2 });
    expect(Math.abs(even.heightMm - 50)).toBeLessThan(1);
    expect(Math.abs(tall.heightMm - 63)).toBeLessThan(1);
    // The bottom 20 mm of the tall stencil is plastic margin, and the band starts above it.
    const col = Math.floor(tall.W / 2);
    expect(tall.sample(col, tall.H - Math.round(10 / 0.2))?.frame).toBe(true);
    expect(tall.sample(col, tall.H - Math.round(25 / 0.2))?.frame).toBe(false);
  });

  test('wrap() takes a flat stencil point back to its place on the pot', () => {
    // Half a cylinder, 80 mm across, with no border: the paint area spans exactly half a turn.
    const g = geometry({ topD: 80, botD: 80, slant: 40, coverage: 0.5, frame: 0, res: 0.1 });
    const mid = g.wrap(g.W / 2, g.H / 2);
    expect(mid.s).toBeCloseTo(20, 1);
    expect(mid.theta).toBeCloseTo(0, 3);
    // Moving right along the flat stencil turns the same way round the pot, by arc length ÷ radius.
    const right = g.wrap(g.W / 2 + 100, g.H / 2);
    expect(right.theta).toBeCloseTo(10 / 40, 3);
    // Row 0 is the band's top edge, plus the one-pixel pad round the raster.
    expect(g.wrap(g.W / 2, 0).s).toBeCloseTo(40 + 0.1, 1);
  });

  test('wrap() follows a flared cone, where the top edge is the longer one', () => {
    const g = geometry({ topD: 90, botD: 70, slant: 60, coverage: 1, frame: 0, res: 0.2 });
    const top = g.wrap(g.W / 2, 1), bottom = g.wrap(g.W / 2, g.H - 1);
    expect(top.s).toBeGreaterThan(bottom.s);
    expect(g.radiusAt(top.s)).toBeGreaterThan(g.radiusAt(bottom.s));
    expect(g.radiusAt(0)).toBeCloseTo(35, 6);
    expect(g.radiusAt(60)).toBeCloseTo(45, 6);
  });

  test('a flat plate rim unrolls to a full ring', () => {
    const g = geometry({ topD: 100, botD: 60, slant: 20, coverage: 1, frame: 2, res: 0.5 });
    expect(Math.abs(g.widthMm - 104)).toBeLessThan(1.5);
    expect(Math.abs(g.heightMm - 104)).toBeLessThan(1.5);
    expect(g.sample(Math.floor(g.W / 2), Math.floor(g.H / 2))).toBeNull();
  });
});

describe('buildMask', () => {
  const g = geometry({ topD: 80, botD: 80, slant: 20, coverage: 0.25, frame: 0, res: 0.5 });

  test('an all-paint layer opens every pixel inside the stencil', () => {
    const tile: Tile = { w: 2, h: 2, paint: new Uint8Array(4).fill(1) };
    const m = buildMask(g, [{ tile, repeats: 3, rows: 2, stagger: true, offsetU: 0, offsetV: 0, from: 0, to: 1, blend: 'paint', haloPx: 0, growPx: 0 }]);
    let solidInside = 0;
    for (let k = 0; k < m.solid.length; k++) if (m.inside[k] && !m.frame[k]) solidInside += m.solid[k];
    expect(solidInside).toBe(0);
  });
});

// A mask with a 2px solid frame, a solid island in the middle, and paint between them.
function framedIsland(w = 30, h = 20): Mask {
  const solid = new Uint8Array(w * h), inside = new Uint8Array(w * h).fill(1), frame = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
    const island = x >= 12 && x < 18 && y >= 8 && y < 12;
    if (edge) frame[y * w + x] = 1;
    if (edge || island) solid[y * w + x] = 1;
  }
  return { w, h, res: 0.1, solid, inside, frame };
}

describe('connectIslands', () => {
  test('islands get bridged to the frame so nothing falls out', () => {
    const m = framedIsland();
    expect(connectIslands(m, { mode: 'keep', bridgePx: 3, minIslandPx: 0 }).islands).toBe(1);
    expect(connectIslands(m, { mode: 'bridge', bridgePx: 3, minIslandPx: 0 }).islands).toBe(1);
    expect(connectIslands(m, { mode: 'keep', bridgePx: 3, minIslandPx: 0 }).islands).toBe(0);
  });

  test('with no border, every island is bridged to the largest piece, so the stencil prints in one piece', () => {
    // Paint lines 2 px wide every 10 px form a jigsaw-like grid. They cut the plastic into 25 separate squares, and the stencil has no frame.
    const w = 50, h = 50, solid = new Uint8Array(w * h), inside = new Uint8Array(w * h).fill(1), frame = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) solid[y * w + x] = x % 10 < 8 && y % 10 < 8 ? 1 : 0;
    const m: Mask = { w, h, res: 0.1, solid, inside, frame };
    expect(countPieces(m.solid, w, h)).toBe(25);
    const r = connectIslands(m, { mode: 'bridge', bridgePx: 3, minIslandPx: 0 });
    expect(r.islands).toBe(24);
    expect(countPieces(m.solid, w, h)).toBe(1);
  });

  test('countPieces counts plastic that only touches at a corner as separate pieces', () => {
    expect(countPieces(Uint8Array.from([1, 0, 0, 1]), 2, 2)).toBe(2);
    expect(countPieces(Uint8Array.from([1, 1, 0, 1]), 2, 2)).toBe(1);
    expect(countPieces(new Uint8Array(4), 2, 2)).toBe(0);
  });

  test('drop mode turns islands into paint', () => {
    const m = framedIsland();
    connectIslands(m, { mode: 'drop', bridgePx: 3, minIslandPx: 0 });
    expect(m.solid[10 * m.w + 15]).toBe(0);
  });
});

// Every directed edge must appear exactly once and its reverse exactly once:
// that is a closed, consistently wound (outward-facing) surface. Returns the volume.
function checkMesh(buf: ArrayBuffer): number {
  const dv = new DataView(buf), n = dv.getUint32(80, true);
  const key = (o: number) => [0, 4, 8].map((k) => dv.getFloat32(o + k, true).toFixed(4)).join(',');
  const edges = new Map<string, number>();
  let vol = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    const v = [0, 1, 2].map((i) => key(o + i * 12));
    const [a, b, c] = [0, 1, 2].map((i) => [0, 4, 8].map((k) => dv.getFloat32(o + i * 12 + k, true)));
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
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
  return vol;
}

describe('meshSTL', () => {
  test('STL is watertight with outward normals and the right volume', () => {
    const w = 40, h = 30, solid = new Uint8Array(w * h);
    // Random blobs plus deliberate diagonal pinches stress the run stitching.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < w * h; i++) solid[i] = rnd() < 0.55 ? 1 : 0;
    solid[0] = 1; solid[1] = 0; solid[w] = 0; solid[w + 1] = 1;
    removePinches(solid, w, h);
    const area = solid.reduce((a, b) => a + b, 0) * 0.1 * 0.1;
    expect(checkMesh(meshSTL(solid, w, h, 0.1, 0.6))).toBeCloseTo(area * 0.6, 3);
  });

  test('maxRunPx splits long runs so no triangle spans more than that many pixels across', () => {
    const w = 60, h = 6, solid = new Uint8Array(w * h).fill(1);
    solid[2 * w + 30] = 0; // one hole, so walls and faces both get split
    const buf = meshSTL(solid, w, h, 1, 0.6, 8);
    const dv = new DataView(buf), n = dv.getUint32(80, true);
    let widest = 0;
    for (let t = 0; t < n; t++) {
      const xs = [0, 1, 2].map((i) => dv.getFloat32(84 + t * 50 + 12 + i * 12, true));
      widest = Math.max(widest, Math.max(...xs) - Math.min(...xs));
    }
    expect(widest).toBeLessThanOrEqual(8 + 1e-6);
    expect(checkMesh(buf)).toBeCloseTo((w * h - 1) * 0.6, 3);
  });

  test('removePinches leaves no diagonal-only 2x2 blocks', () => {
    const w = 3, h = 3, solid = Uint8Array.from([1, 0, 1, 0, 1, 0, 1, 0, 1]);
    removePinches(solid, w, h);
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = solid[y * w + x], b = solid[y * w + x + 1], c = solid[(y + 1) * w + x], d = solid[(y + 1) * w + x + 1];
      expect((a && d && !b && !c) || (b && c && !a && !d)).toBeFalsy();
    }
  });

  test('rotateSTL keeps the mesh watertight and the volume unchanged', () => {
    const w = 20, h = 10, solid = new Uint8Array(w * h).fill(1);
    expect(checkMesh(rotateSTL(meshSTL(solid, w, h, 1, 0.6), 30))).toBeCloseTo(20 * 10 * 0.6, 2);
  });
});

describe('fitAngle', () => {
  // A w×h mm rectangle of "inside" pixels at 1 mm resolution.
  const rectMask = (w: number, h: number) => ({ w, h, res: 1, inside: new Uint8Array(w * h).fill(1) });

  test('keeps 0° when the stencil already fits', () => {
    expect(fitAngle(rectMask(100, 60), 250, 250)).toBe(0);
  });

  test('finds a rotation for a strip longer than the bed', () => {
    const a = fitAngle(rectMask(290, 50), 250, 250)!;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(90);
    const t = (a * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
    expect(290 * c + 50 * s).toBeLessThanOrEqual(251);
    expect(290 * s + 50 * c).toBeLessThanOrEqual(251);
  });

  test('returns null when nothing fits', () => {
    expect(fitAngle(rectMask(300, 200), 250, 250)).toBeNull();
  });
});
