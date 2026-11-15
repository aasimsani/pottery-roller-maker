// support.ts sizes a smooth roller that goes inside a pot. It backs the wall up while a texture roller presses on the
// outside, so soft clay takes the pattern and the pot keeps its shape.
import { END_CLEARANCE, BACK_GAP, FOOT, armSide } from './handle';
import { surfaceLength, wallAt, type Piece } from './piece';
import { fitRoller, type WallPoint } from './shape';

/** The thinnest support roller worth printing, in mm. A thinner one leaves no room round the axle and the frame's foot. */
const MIN_D = 18;
/** The widest support roller, in mm. A wider one only adds filament, because the inside of a pot already wraps round it. */
const MAX_D = 45;
/** Air left under the frame's foot, and between the frame and the far side of the pot, in mm. */
const FLOOR_GAP = 1, SIDE_GAP = 4;
/** The shortest roller that still helps, in mm. */
const MIN_LENGTH = 15;

export interface SupportFit {
  /** The pot's opening can be too narrow for the roller and its frame, and the band can sit too low to leave room for a roller. */
  state: 'ok' | 'narrow' | 'short';
  /** The narrowest inside diameter between the roller and the rim, and the narrowest the frame can pass, in mm. */
  opening: number; needs: number;
  /** The roller's side: the height along its axis (t) and its radius (r), in mm, from its floor end to its top end. */
  outline: { t: number[]; r: number[] };
  /** The mean, thinnest and widest diameters, the length along the axis, and the length along the surface, in mm. */
  diameter: number; minD: number; maxD: number; axial: number; length: number;
  /** The largest share by which the roller's surface outruns or lags the pot's inside. 0.05 means 5%. */
  slip: number;
  /** The heights above the table of the roller's two ends, in mm. */
  fromZ: number; toZ: number;
  /** How far the rim stands above the frame's top arm, in mm. The grip grows by this much, so it starts at the rim. */
  reach: number;
}

// innerAt() is the point on the inside of the wall behind the point s mm along the outside. It lies one clay
// thickness in from the outside, square to the wall.
function innerAt(piece: Piece, s: number, clay: number): WallPoint {
  const a = wallAt(piece, s - 0.25), b = wallAt(piece, s + 0.25), p = wallAt(piece, s), len = Math.hypot(b.r - a.r, b.z - a.z) || 1;
  return { r: p.r - (clay * (b.z - a.z)) / len, z: p.z + (clay * (b.r - a.r)) / len };
}

// fitSupport() shapes the roller to the inside of the band, the way fitRoller() shapes the texture roller to the
// outside. The roller's radius is the same share of the pot's inside radius at every height, so it rolls without
// scrubbing. The floor is taken to be as thick as the wall, and the roller starts above the frame's foot.
// ponytail: the axis is treated as upright when the frame is checked against the floor and the rim. A strongly
// tapered pot leans it a few degrees, so check the corners by hand if the frame ever catches there.
export function fitSupport(piece: Piece, band: { start: number; slant: number }, clay: number, bore: number): SupportFit {
  const side = armSide(bore), base = piece.profile[0].z, rim = piece.profile[piece.profile.length - 1].z, S = surfaceLength(piece);
  const lowest = base + clay + FOOT + END_CLEARANCE + FLOOR_GAP, n = Math.max(2, Math.ceil(band.slant / 0.5));
  const wall: WallPoint[] = [];
  let from = band.start + band.slant;
  for (let i = 0; i <= n; i++) {
    const s = band.start + (band.slant * i) / n, p = innerAt(piece, s, clay);
    if (p.z < lowest) continue;
    if (!wall.length) from = s;
    wall.push(p);
  }
  let opening = Infinity;
  for (let s = from; s <= S; s += 1) opening = Math.min(opening, 2 * innerAt(piece, s, clay).r);
  opening = Math.min(opening, 2 * innerAt(piece, S, clay).r);
  const needs = MIN_D + BACK_GAP + side + SIDE_GAP, want = Math.min(opening / 2, opening - BACK_GAP - side - SIDE_GAP, MAX_D);
  let length = 0;
  for (let i = 1; i < wall.length; i++) length += Math.hypot(wall[i].r - wall[i - 1].r, wall[i].z - wall[i - 1].z);
  const none: SupportFit = { state: 'short', opening, needs, outline: { t: [], r: [] }, diameter: 0, minD: 0, maxD: 0, axial: 0, length, slip: 0, fromZ: 0, toZ: 0, reach: 0 };
  if (length < MIN_LENGTH) return none;
  if (want < MIN_D) return { ...none, state: 'narrow' };
  const meanR = wall.reduce((a, p) => a + p.r, 0) / wall.length;
  const fit = fitRoller(wall, [0, wall.length - 1], (2 * meanR) / want, -1), minD = 2 * Math.min(...fit.r), maxD = 2 * Math.max(...fit.r);
  if (minD < MIN_D) return { ...none, state: 'narrow' };
  const toZ = wall[wall.length - 1].z;
  return {
    state: 'ok', opening, needs, outline: { t: fit.t, r: fit.r }, diameter: (2 * fit.r.reduce((a, v) => a + v, 0)) / fit.r.length, minD, maxD,
    axial: fit.t[fit.t.length - 1], length, slip: fit.slip, fromZ: wall[0].z, toZ, reach: Math.max(0, rim - (toZ + END_CLEARANCE + side)),
  };
}
