import { latheMesh, volume, type Mesh } from './roller';

/** What the handle is sized from, in mm. The roller's length and tip diameter, its axle hole, and the grip's length. */
export interface HandleSpec { rollerLength: number; rollerDiameter: number; bore: number; grip: number }

/** Space left between each end of the roller and the arm beside it, in mm. */
export const END_CLEARANCE = 0.6;
/** The axle is this much thinner than the roller's hole, so the roller spins on it, in mm. */
export const AXLE_PLAY = 0.4;
/** The arms' holes are this much wider than the axle, so it pushes in snugly and stays put, in mm. */
const ARM_FIT = 0.2;
const GRIP_WIDTH = 22;
/** The space between the roller and the bar that joins the arms, in mm. */
export const BACK_GAP = 6;
/** The thickness of the inside support's lower arm, in mm. It is thin, so the roller reaches close to the pot's floor. */
export const FOOT = 5;
/** The arms and the bar are square in section, and this wide, in mm. */
export const armSide = (bore: number) => Math.max(14, bore + 6);
/** The room the support's frame takes across a pot, from the roller's pressing side to the grip's far edge, in mm. */
export const frameSpan = (rollerDiameter: number, bore: number) => rollerDiameter + BACK_GAP + armSide(bore) / 2 + GRIP_WIDTH / 2;

// flipIfInside() reverses every triangle when the mesh's volume comes out negative, so its normals point out.
function flipIfInside(m: Mesh): Mesh {
  if (volume(m) < 0) for (let t = 0; t < m.indices.length; t += 3) [m.indices[t + 1], m.indices[t + 2]] = [m.indices[t + 2], m.indices[t + 1]];
  return m;
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Mesh {
  const positions = new Float32Array(24);
  for (let k = 0; k < 8; k++) positions.set([k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0], k * 3);
  const quads = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
  return flipIfInside({ positions, indices: Uint32Array.from(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])) });
}

// teardrop() outlines a hole that runs sideways through a part printed flat. Its bottom is a circle, and its top rises
// to a point along two 45° lines, which a printer lays without support. Every vertex sits at a known angle from the
// centre, which holedBlock() uses to match it to a point on the block's square outline.
function teardrop(r: number): { angle: number; at: [number, number] }[] {
  const pts: { angle: number; at: [number, number] }[] = [];
  const deg = (d: number) => (d * Math.PI) / 180;
  pts.push({ angle: deg(45), at: [r * Math.cos(deg(45)), r * Math.sin(deg(45))] });
  pts.push({ angle: deg(90), at: [0, r * Math.SQRT2] });
  for (let d = 135; d < 405; d += 7.5) pts.push({ angle: deg(d), at: [r * Math.cos(deg(d)), r * Math.sin(deg(d))] });
  return pts;
}

// holedBlock() is the end of one arm: a square bar along x with a teardrop hole through it. The square and the hole
// share one set of angles from the hole's centre, so the bar's ends are rings of quads with no gaps.
function holedBlock(x0: number, x1: number, side: number, r: number): Mesh {
  const hole = teardrop(r), n = hole.length, a = side / 2, cy = 0, cz = side / 2;
  const outer = hole.map(({ angle }) => {
    const c = Math.cos(angle), s = Math.sin(angle), k = a / Math.max(Math.abs(c), Math.abs(s));
    return [c * k, s * k] as [number, number];
  });
  const positions = new Float32Array(4 * n * 3);
  [x0, x1].forEach((x, e) => {
    outer.forEach(([y, z], k) => positions.set([x, cy + y, cz + z], (e * 2 * n + k) * 3));
    hole.forEach(({ at: [y, z] }, k) => positions.set([x, cy + y, cz + z], (e * 2 * n + n + k) * 3));
  });
  const O = (e: number, k: number) => e * 2 * n + (k % n), H = (e: number, k: number) => e * 2 * n + n + (k % n), idx: number[] = [];
  const quad = (p: number, q: number, s: number, t: number) => idx.push(p, q, s, p, s, t);
  for (let k = 0; k < n; k++) {
    quad(O(1, k), O(1, k + 1), H(1, k + 1), H(1, k));
    quad(O(0, k), H(0, k), H(0, k + 1), O(0, k + 1));
    quad(O(0, k), O(0, k + 1), O(1, k + 1), O(1, k));
    quad(H(0, k), H(1, k), H(1, k + 1), H(0, k + 1));
  }
  return flipIfInside({ positions, indices: Uint32Array.from(idx) });
}

// handleParts() builds a U-shaped handle that prints flat, and an axle that prints standing on its head.
// The roller sits between the two arms. The axle passes through the arms and the roller along x, at y = 0.
// ponytail: the fork's parts overlap by 0.5 mm and the slicer unions them, the same as the drum's spokes.
export function handleParts(h: HandleSpec): { fork: Mesh[]; axle: Mesh } {
  const axleD = h.bore - AXLE_PLAY, side = armSide(h.bore), gap = h.rollerLength + 2 * END_CLEARANCE;
  const r = (axleD + ARM_FIT) / 2, x = gap / 2, yb = h.rollerDiameter / 2 + BACK_GAP;
  const fork = [
    holedBlock(-x - side, -x, side, r),
    holedBlock(x, x + side, side, r),
    box(-x - side, -x, side / 2 - 0.5, yb + 0.5, 0, side),
    box(x, x + side, side / 2 - 0.5, yb + 0.5, 0, side),
    box(-x - side, x + side, yb, yb + side, 0, side),
    box(-GRIP_WIDTH / 2, GRIP_WIDTH / 2, yb + side - 0.5, yb + side + h.grip, 0, side),
  ];
  // The axle stands on a 2 mm head that stops it at one arm, and a 1.6 mm vent runs up its middle.
  const len = gap + 2 * side + 1.5, head = axleD / 2 + 2;
  const axle = latheMesh([[0.8, 0], [head, 0], [head, 2], [axleD / 2, 2], [axleD / 2, 2 + len], [0.8, 2 + len]], 64);
  return { fork, axle };
}

// supportParts() builds the frame that holds a smooth roller against the inside of a pot, and its axle. The frame
// prints flat. A bar runs beside the roller and carries on past its top end as the grip, so the grip comes straight
// up out of the pot's mouth. The roller sits between a thin foot at the floor end and a full arm at the top end.
// The axle goes in from the grip end, and it ends flush with the foot, so nothing reaches below the foot.
export function supportParts(h: HandleSpec): { frame: Mesh[]; axle: Mesh } {
  const axleD = h.bore - AXLE_PLAY, side = armSide(h.bore), gap = h.rollerLength + 2 * END_CLEARANCE;
  const r = (axleD + ARM_FIT) / 2, x = gap / 2, yb = h.rollerDiameter / 2 + BACK_GAP, mid = yb + side / 2;
  const frame = [
    holedBlock(-x - FOOT, -x, side, r),
    holedBlock(x, x + side, side, r),
    box(-x - FOOT, -x, side / 2 - 0.5, yb + 0.5, 0, side),
    box(x, x + side, side / 2 - 0.5, yb + 0.5, 0, side),
    box(-x - FOOT, x + side, yb, yb + side, 0, side),
    box(x + side - 0.5, x + side + h.grip, mid - GRIP_WIDTH / 2, mid + GRIP_WIDTH / 2, 0, side),
  ];
  const len = FOOT + gap + side, head = axleD / 2 + 2;
  const axle = latheMesh([[0.8, 0], [head, 0], [head, 2], [axleD / 2, 2], [axleD / 2, 2 + len], [0.8, 2 + len]], 64);
  return { frame, axle };
}
