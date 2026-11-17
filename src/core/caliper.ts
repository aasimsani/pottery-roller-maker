// caliper.ts builds the caliper tool for rolling on soft clay. One yoke holds the texture roller outside the wall, and
// a slider that rides on the yoke's rail carries a smooth support roller inside. The rail runs over the rim, so one hand
// on the grip holds both rollers on the wall from each side. The slider locks with a pin at one of several positions,
// which opens the rollers wide enough to lower the tool over the rim and closes them on the wall.
//
// Every part prints flat, and its coordinates are a (along the axles, up in use), b (across the wall, with + toward the pot's
// middle) and z (print height). The texture roller's axle sits at b = 0 and the support roller's at b = gap.
import { ARM_FIT, AXLE_PLAY, BACK_GAP, END_CLEARANCE, GRIP_WIDTH, armSide, box, holedBlock } from './handle';
import { latheMesh, mergeMeshes, type Mesh } from './roller';

/** The thickness of each roller's lower arm, in mm. It is thin so the inside roller can sit close to the pot's floor. */
export const FOOT = 6;
/** Air between the rim and the beam that crosses it, in mm. */
export const BEAM_CLEAR = 4;
/** The inner arm's default width across the wall, and the gap between it and the smooth roller, in mm. */
export const ARM = 8, INNER_GAP = 3;
/** How far past its working position the slider opens, and how far inside it closes, in mm. */
export const OPEN = 7.5;
const CLOSE = 5;
/** The distance between the slider's pin positions, in mm. Two rows of windows in the rail, offset by half of 5 mm, give it. */
export const STEP = 2.5;
/** The thickness of the axle's head, which sits under each lower arm, in mm. */
export const HEAD = 2;
/** The rail is RAIL_H tall and RAIL_Z thick. The slider's channel is SLIP wider on every side. */
const RAIL_H = 10, RAIL_Z = 7.6, SLIP = 0.3;
/** The channel's length along the rail, and the thickness of its walls, in mm. */
const CHANNEL = 24, WALL = 3;
/** The pin's width, the slot it passes through in the slider, and the rail's windows, in mm. */
export const PIN_W = 3, PIN_SLOT = 3.4, WINDOW = 3.4;

/** What the tool is sized from, in mm. Heights count up from the table. */
export interface CaliperSpec {
  /** The texture roller's tip radius, and the heights of its two ends. */
  outerR: number; outerFrom: number; outerTo: number;
  /** The support roller's radius, and the heights of its two ends. */
  innerR: number; innerFrom: number; innerTo: number;
  /** The rim's height, the wall's thickness, and how far the texture's tips sink into the clay. */
  rim: number; clay: number; sink: number;
  bore: number; grip: number;
  /** The width of the arm that hangs down inside the pot, across the wall. A thinner arm passes a narrower mouth. */
  arm: number;
}

/** How far the slider's far end reaches past the support roller's pressing side, in mm. The pot must be at least this wide inside, with the slider open. */
export const innerSpan = (innerR: number, arm: number) => 2 * innerR + INNER_GAP + arm;

export interface Caliper {
  yoke: Mesh; slider: Mesh; outerAxle: Mesh; innerAxle: Mesh; pin: Mesh;
  /** The shells that make the yoke and the slider, before they are merged. Where shells touch, the slicer joins them. */
  parts: { yoke: Mesh[]; slider: Mesh[] };
  dims: {
    /** The distance between the two axles with the slider at its working position, and every position it locks at. */
    gap: number; positions: number[]; working: number;
    /** The heights of the rail's lower and upper faces, in mm above the table. */
    railBottom: number; railTop: number;
    /** Where the rail's windows sit along b, and which of the two rows each one is in. */
    windows: { b: number; row: 0 | 1 }[];
    /** The beam's lower face, in mm above the table. */
    beamBottom: number;
    /** The height of the cover plate's flat underside inside the slider, and how far it spans over the rail. */
    coverZ: number; bridge: number;
  };
}

export function caliperParts(c: CaliperSpec): Caliper {
  const side = armSide(c.bore), axleD = c.bore - AXLE_PLAY, r = (axleD + ARM_FIT) / 2;
  const outerBottom = c.outerFrom - END_CLEARANCE - FOOT, innerBottom = c.innerFrom - END_CLEARANCE - FOOT;
  const beamBottom = Math.max(c.rim + BEAM_CLEAR, c.outerTo + END_CLEARANCE, c.innerTo + END_CLEARANCE);
  const blockTop = beamBottom + side, railBottom = blockTop + SLIP, railTop = railBottom + RAIL_H;

  // The slider's positions run from the closest to the widest, and the working one is nearest to touching the wall.
  const nominal = c.outerR + c.clay - c.sink + c.innerR;
  const first = Math.max(nominal - CLOSE, side / 2 + CHANNEL / 2 + 1);
  const count = Math.max(1, Math.ceil((nominal + OPEN - first) / STEP - 1e-6));
  const positions = Array.from({ length: count + 1 }, (_, k) => first + k * STEP);
  const working = Math.min(count, Math.max(0, Math.round((nominal - first) / STEP)));
  const gap = positions[working];
  const windows = positions.map((b, k) => ({ b, row: (k % 2) as 0 | 1 }));

  // The yoke: the texture roller's lower arm and beam block, a back bar outside them, the grip, and the rail.
  const barNear = -(c.outerR + BACK_GAP), barFar = barNear - side, mid = (outerBottom + blockTop) / 2;
  const rail0 = side / 2 - 0.5, rail1 = positions[count] + 8;
  const rowBand = (row: 0 | 1): [number, number] => (row === 0 ? [railBottom + 1, railBottom + 1 + WINDOW] : [railTop - 1 - WINDOW, railTop - 1]);
  const railBox = (a0: number, a1: number, b0: number, b1: number) => box(a0, a1, b0, b1, 0, RAIL_Z);
  const yoke: Mesh[] = [
    holedBlock(outerBottom, outerBottom + FOOT, side, r),
    holedBlock(beamBottom, blockTop, side, r),
    box(outerBottom, blockTop, barFar, barNear, 0, side),
    box(outerBottom, outerBottom + FOOT, barFar, -side / 2 + 0.5, 0, side),
    box(beamBottom, blockTop, barFar, -side / 2 + 0.5, 0, side),
    // The post closes the beam block's hole from above, and the rail grows out of it.
    box(blockTop - 0.5, railTop, -side / 2, side / 2, 0, side),
    box(mid - GRIP_WIDTH / 2, mid + GRIP_WIDTH / 2, barFar - c.grip, barFar + 0.5, 0, side),
    railBox(railBottom, rowBand(0)[0], rail0, rail1),
    railBox(rowBand(0)[1], rowBand(1)[0], rail0, rail1),
    railBox(rowBand(1)[1], railTop, rail0, rail1),
  ];
  // Each row of windows has solid rungs between them. The rungs reach 0.5 mm into the rail's borders so the parts join.
  for (const row of [0, 1] as const) {
    const [a0, a1] = rowBand(row), cuts = windows.filter((w) => w.row === row).map((w) => [w.b - WINDOW / 2, w.b + WINDOW / 2]);
    let from = rail0;
    for (const [s, e] of [...cuts, [rail1, rail1]]) { if (s > from) yoke.push(railBox(a0 - 0.5, a1 + 0.5, from, s)); from = e; }
  }

  // The slider: a block for the support roller's axle, a channel that wraps the rail, a bar that hangs down inside the
  // pot, and a foot. The channel's cover plate has a slot at the axle's position for the pin.
  const lo = gap - CHANNEL / 2, hi = gap + CHANNEL / 2, inner = gap + c.innerR + INNER_GAP, upper = railTop + SLIP, coverZ = RAIL_Z + SLIP;
  const slider: Mesh[] = [
    holedBlock(beamBottom, blockTop, side, r, gap),
    box(blockTop - WALL, blockTop, lo, hi, 0, side),
    box(upper, upper + WALL, lo, hi, 0, side),
    box(blockTop - WALL, upper + WALL, lo, gap - PIN_SLOT / 2, coverZ, side),
    box(blockTop - WALL, upper + WALL, gap + PIN_SLOT / 2, hi, coverZ, side),
    box(beamBottom, blockTop, gap + side / 2 - 0.5, inner + c.arm, 0, side),
    box(innerBottom, blockTop, inner, inner + c.arm, 0, side),
    holedBlock(innerBottom, innerBottom + FOOT, side, r, gap),
    box(innerBottom, innerBottom + FOOT, gap + side / 2 - 0.5, inner + c.arm, 0, side),
  ];

  // Each axle stands on its head, and its shaft ends in the blind hole of its top block.
  const head = axleD / 2 + 2;
  const axle = (bottom: number) => {
    const len = blockTop - WALL - 0.5 - bottom;
    return latheMesh([[0.8, 0], [head, 0], [head, HEAD], [axleD / 2, HEAD], [axleD / 2, HEAD + len], [0.8, HEAD + len]], 64);
  };
  // The pin stands on its square head. Its shaft goes through the cover plate's slot and one of the rail's windows.
  const pin = mergeMeshes([box(0, 8, 0, 8, 0, 2), box(2.5, 2.5 + PIN_W, 2.5, 2.5 + PIN_W, 0, 17.5)]);

  return {
    yoke: mergeMeshes(yoke), slider: mergeMeshes(slider), outerAxle: axle(outerBottom), innerAxle: axle(innerBottom), pin,
    parts: { yoke, slider },
    dims: { gap, positions, working, windows, railBottom, railTop, beamBottom, coverZ, bridge: upper - blockTop },
  };
}
