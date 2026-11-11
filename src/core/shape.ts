// shape.ts fits a roller's side to a pot's wall, so the roller touches a curved or tapered band along its whole length.

/** One point of the pot's wall in its cross-section: the radius from the pot's axis and the height, in mm. */
export interface WallPoint { r: number; z: number }

/** A roller's side, sampled at the same points as the wall it was fitted to. */
export interface Outline {
  /** Each sample's distance along the roller's axis from its first end, and the roller's tip radius there, in mm. */
  t: number[]; r: number[];
  /** The largest share by which the roller's surface outruns or lags the pot's inside the band. 0.05 means 5%. */
  slip: number;
}

// chordFrame() describes the wall in the frame of the straight line between the band's two edges. x runs along that
// line, and y points at the roller. The roller sits outside a pot (side 1) and on top of a plate (side -1).
function chordFrame(wall: WallPoint[], [a, b]: [number, number], side: 1 | -1) {
  const A = wall[a], B = wall[b], len = Math.hypot(B.r - A.r, B.z - A.z) || 1;
  const dr = (B.r - A.r) / len, dz = (B.z - A.z) / len;
  return { x: wall.map((p) => p.r * dr + p.z * dz), y: wall.map((p) => side * (p.r * dz - p.z * dr)) };
}

/** How far the wall strays from a straight line between the band's edges, in mm. A straight roller misses the pot by this much. */
export function bow(wall: WallPoint[], band: [number, number], side: 1 | -1 = 1): number {
  const { y } = chordFrame(wall, band, side);
  let most = 0;
  for (let i = band[0]; i <= band[1]; i++) most = Math.max(most, Math.abs(y[i] - y[band[0]]));
  return most;
}

// fitRoller() shapes a roller's side to the wall. The roller's surface is the wall itself, swept round the roller's
// axis, so the two touch at every point of the band. That leaves the axis free to move and lean, and the fit puts it
// where the roller's radius stays closest to the pot's radius divided by the turns per lap. A point where the two
// match rolls without slipping. A straight wall gets an exact match everywhere: a cylinder on a cylinder, and a cone
// on a tapered wall. A curved wall can't match everywhere, so slip reports the worst mismatch.
export function fitRoller(wall: WallPoint[], band: [number, number], laps: number, side: 1 | -1): Outline {
  const [a, b] = band, n = b - a + 1, k = 1 / laps, { x, y } = chordFrame(wall, band, side);
  // lean is the angle between the roller's axis and the band's straight line. offsets() is each band sample's
  // radius target minus its distance below the axis's direction, so their spread is zero when the fit is exact.
  const offsets = (lean: number) => {
    const c = Math.cos(lean), s = Math.sin(lean);
    let mean = 0, spread = 0;
    for (let i = a; i <= b; i++) mean += (c * y[i] + s * x[i] + k * wall[i].r) / n;
    for (let i = a; i <= b; i++) spread += (c * y[i] + s * x[i] + k * wall[i].r - mean) ** 2 / n;
    return { mean, spread };
  };
  // A coarse scan finds the right valley, and a golden-section search then narrows it down.
  const deg = Math.PI / 180;
  let best = 0;
  for (let d = -85; d <= 85; d++) if (offsets(d * deg).spread < offsets(best).spread) best = d * deg;
  let lo = best - deg, hi = best + deg;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 60; i++) {
    const p = hi - g * (hi - lo), q = lo + g * (hi - lo);
    if (offsets(p).spread < offsets(q).spread) hi = q; else lo = p;
  }
  const lean = (lo + hi) / 2, c = Math.cos(lean), s = Math.sin(lean), { mean } = offsets(lean);
  const r = wall.map((_, i) => mean - c * y[i] - s * x[i]), along = wall.map((_, i) => c * x[i] - s * y[i]);
  let slip = 0;
  for (let i = a; i <= b; i++) slip = Math.max(slip, Math.abs(r[i] / (k * wall[i].r) - 1));
  return { t: along.map((v) => v - along[0]), r, slip };
}
