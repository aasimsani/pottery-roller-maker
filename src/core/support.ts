// support.ts sizes the smooth roller that rides inside a pot. It backs the wall up while the texture roller presses on
// the outside, so soft clay takes the pattern and the pot keeps its shape. The caliper holds both rollers on parallel
// axles, so the support roller is a plain cylinder.
import { END_CLEARANCE } from './handle';
import { ARM, FOOT, HEAD, INNER_GAP, OPEN, innerSpan } from './caliper';
import { surfaceLength, wallAt, type Piece } from './piece';
import type { WallPoint } from './shape';

/** The thinnest support roller worth printing, in mm. A thinner one leaves no room round the axle. */
const MIN_D = 18;
/** The widest support roller, in mm. A wider one only adds filament, because the inside of a pot already wraps round it. */
const MAX_D = 45;
/** Air under the axle's head, and between the slider's far end and the pot's far wall, in mm. */
const FLOOR_AIR = 1, AIR = 3;
/** The shortest roller that still helps, in mm. */
const MIN_LENGTH = 15;

export interface SupportFit {
  /** The pot's opening can be too narrow for the roller and the slider, and the band can sit too low to leave room for a roller. */
  state: 'ok' | 'narrow' | 'short';
  /** The narrowest inside diameter between the roller and the rim, and the narrowest the slider needs, with the rollers open, in mm. */
  opening: number; needs: number;
  /** The roller's diameter and its length along the axle, in mm. */
  diameter: number; length: number;
  /** The heights of the roller's two ends above the table, in mm. */
  fromZ: number; toZ: number;
}

/** What the person can adjust. A diameter of 0 lets the fit pick one. Below and above reach past the band's edges, and a negative number falls short of them, in mm. */
export interface SupportOptions { diameter?: number; below?: number; above?: number; arm?: number }

// innerAt() is the point on the inside of the wall behind the point s mm along the outside. It lies one clay
// thickness in from the outside, square to the wall.
function innerAt(piece: Piece, s: number, clay: number): WallPoint {
  const a = wallAt(piece, s - 0.25), b = wallAt(piece, s + 0.25), p = wallAt(piece, s), len = Math.hypot(b.r - a.r, b.z - a.z) || 1;
  return { r: p.r - (clay * (b.z - a.z)) / len, z: p.z + (clay * (b.r - a.r)) / len };
}

// fitSupport() sizes the roller to the inside of the band. The roller starts above the floor, with room for the axle's
// head and the lower arm, and it ends at the band's top. Its diameter is the widest that leaves the slider room to
// pass through the pot's mouth with the rollers open, unless the person sets one.
// ponytail: the axles are treated as upright. A strongly tapered pot leans them a few degrees, so the roller touches
// the wall along a line and not a band, and the print check's taper warning already says so.
export function fitSupport(piece: Piece, band: { start: number; slant: number }, clay: number, _bore: number, o: SupportOptions = {}): SupportFit {
  const base = piece.profile[0].z, S = surfaceLength(piece);
  const lowest = base + clay + HEAD + FLOOR_AIR + FOOT + END_CLEARANCE;
  // The reach moves the roller's two ends along the pot's surface, and the pot's floor and rim stop them.
  const s0 = Math.max(0, band.start - (o.below ?? 0)), s1 = Math.min(S, band.start + band.slant + (o.above ?? 0)), span = Math.max(0, s1 - s0);
  const n = Math.max(2, Math.ceil(span / 0.5));
  const wall: WallPoint[] = [];
  let from = s1;
  for (let i = 0; i <= n; i++) {
    const s = s0 + (span * i) / n, p = innerAt(piece, s, clay);
    if (p.z < lowest) continue;
    if (!wall.length) from = s;
    wall.push(p);
  }
  let opening = Infinity;
  for (let s = from; s <= S; s += 1) opening = Math.min(opening, 2 * innerAt(piece, s, clay).r);
  opening = Math.min(opening, 2 * innerAt(piece, S, clay).r);
  const given = o.diameter && o.diameter > 0 ? Math.max(MIN_D, o.diameter) : 0, arm = o.arm ?? ARM, around = INNER_GAP + arm + OPEN + AIR;
  const needs = innerSpan((given || MIN_D) / 2, arm) + OPEN + AIR, want = given || Math.min(opening / 2, opening - around, MAX_D);
  const length = wall.length ? wall[wall.length - 1].z - wall[0].z : 0, none = { opening, needs, diameter: 0, length, fromZ: 0, toZ: 0 };
  if (length < MIN_LENGTH) return { state: 'short', ...none };
  if (want < MIN_D || needs > opening) return { state: 'narrow', ...none };
  return { state: 'ok', opening, needs, diameter: want, length, fromZ: wall[0].z, toZ: wall[wall.length - 1].z };
}
