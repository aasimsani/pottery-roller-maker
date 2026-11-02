export interface BandParams {
  /** Diameter at the band's upper (or outer) edge, in mm. */
  topD: number;
  /** Diameter at the band's lower (or inner) edge, in mm. */
  botD: number;
  /** Band length measured along the surface, in mm. */
  slant: number;
  /** Fraction of the circumference the paint area covers (1 = all the way round). */
  coverage: number;
  /** Solid border added outside the paint area, in mm. */
  frame: number;
  /** Border above the band's top edge, in mm. Defaults to frame. */
  frameTop?: number;
  /** Border below the band's bottom edge, in mm. Defaults to frame. */
  frameBottom?: number;
  /** Raster pixel size, in mm. */
  res: number;
}

export interface Sample {
  frame: boolean;
  /** 0→1 left to right across the paint area. */
  u: number;
  /** 0→1 from the band's top edge to its bottom edge. */
  v: number;
}

export type Geometry = ReturnType<typeof geometry>;

// geometry() unrolls a band on any round object (mug, pot, vase, bowl wall, plate rim)
// into a flat annular sector. The band is a cone section, and a flat plate rim
// (slant == |topD - botD| / 2) unrolls to a ring.
// Raster rows run from the band's top edge (row 0) to its bottom edge.
export function geometry(p: BandParams) {
  const rb = p.botD / 2;
  // ponytail: a cylinder is treated as a cone with a 0.0001 mm taper, so one code path
  // handles both. The flat arc then sags < 0.001 mm over 300 mm, far below print resolution.
  let dr = p.topD / 2 - rb;
  if (Math.abs(dr) < 1e-4) dr = 1e-4;
  const slant = Math.max(p.slant, Math.abs(dr));
  const sinA = Math.abs(dr) / slant;
  const ell = (s: number) => (rb + (dr * s) / slant) / sinA; // distance from the cone apex at s mm up the band
  const lA = ell(0), lB = ell(slant);
  const lLo = Math.min(lA, lB), lHi = Math.max(lA, lB);
  const f = p.frame, res = p.res, fT = p.frameTop ?? f, fB = p.frameBottom ?? f;
  // The band's bottom edge sits at lA, so its margin extends away from lB.
  const lMin = lA < lB ? lA - fB : lB - fT, lMax = lA < lB ? lB + fT : lA + fB;
  const hIn = Math.PI * sinA * p.coverage; // half-angle of the paint area
  const hOut = Math.min(Math.PI, hIn + (lMin > f ? Math.asin(f / lMin) : Math.PI / 2));
  const topIsOuter = lB > lA;

  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let k = 0; k <= 720; k++) {
    const psi = -hOut + (2 * hOut * k) / 720;
    for (const l of [lMin, lMax]) {
      const x = l * Math.sin(psi), y = l * Math.cos(psi);
      xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
      ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    }
  }
  xmin -= res; ymin -= res; xmax += res; ymax += res;
  const W = Math.ceil((xmax - xmin) / res), H = Math.ceil((ymax - ymin) / res);
  const rowY = (j: number) => (topIsOuter ? ymax - (j + 0.5) * res : ymin + (j + 0.5) * res);

  return {
    W, H, res,
    widthMm: W * res, heightMm: H * res,
    slant, height: Math.sqrt(slant * slant - dr * dr),
    arcLength: (s: number) => ell(s) * 2 * hIn,
    /** Size of one repeat cell in mm, measured along the band's middle line. */
    cellMm: (repeats: number, rows: number): [number, number] => [(ell(slant / 2) * 2 * hIn) / repeats, (lHi - lLo) / rows],
    /** Classifies the centre of pixel (i, j), or returns null outside the stencil. */
    sample(i: number, j: number): Sample | null {
      const x = xmin + (i + 0.5) * res, y = rowY(j);
      const l = Math.hypot(x, y), psi = Math.atan2(x, y);
      if (l < lMin || l > lMax) return null;
      const a = Math.abs(psi) - hIn;
      if (a > 0 && (a >= Math.PI / 2 || l * Math.sin(a) > f)) return null;
      const frame = a > 0 || l < lLo || l > lHi;
      return { frame, u: (psi + hIn) / (2 * hIn), v: (lB - l) / (lB - lA) };
    },
    /** The whole stencil's extent, margins included: s from its bottom to its top edge, and frac (as in toPixel) end to end. */
    sRange: [-fB, slant + fT] as [number, number],
    fracRange: [-(hOut - hIn) / (2 * hIn), 1 + (hOut - hIn) / (2 * hIn)] as [number, number],
    /** Distance from the cone's apex at s mm up the band, which scales lengths across it. */
    ell,
    /** Radius of the pot at s mm up the surface from the band's bottom edge. */
    radiusAt: (s: number) => rb + (dr * s) / slant,
    /** The cone's radius change over the band, in mm. Its vertical height is `height`. */
    dr,
    /**
     * Maps a flat raster point (i pixels across, j pixels down, at pixel corners) back to its place
     * on the pot. The point lands s mm up the surface from the band's bottom edge and theta radians
     * round the axis, with 0 at the paint area's centre. It inverts the unrolling, so lengths along
     * the surface are kept.
     */
    wrap(i: number, j: number) {
      const x = xmin + i * res, y = topIsOuter ? ymax - j * res : ymin + j * res;
      const l = Math.hypot(x, y), psi = Math.atan2(x, y);
      return { s: ((l * sinA - rb) * slant) / dr, theta: psi / sinA };
    },
    /** Maps a point on the band (s mm up the surface, fraction across the paint area) to a raster pixel index, or -1. */
    toPixel(s: number, frac: number): number {
      const l = ell(s), psi = (frac * 2 - 1) * hIn;
      const x = l * Math.sin(psi), y = l * Math.cos(psi);
      const i = Math.floor((x - xmin) / res);
      const j = Math.floor((topIsOuter ? ymax - y : y - ymin) / res);
      return i >= 0 && j >= 0 && i < W && j < H ? j * W + i : -1;
    },
  };
}
