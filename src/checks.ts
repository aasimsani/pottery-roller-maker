/** Everything the print check looks at, measured on the finished roller. */
export interface RollerCheckInput {
  /** The roller's tip diameter and length, and the printer's bed, all in mm. The roller prints standing on its end. */
  diameter: number; length: number; bedW: number; bedD: number; bedH: number;
  /** The pot's mean diameter across the band, and how much the band's two edges differ in diameter, in mm. */
  potD: number; taper: number;
  /** Share of the pattern (0–1) that is raised. */
  relief: number;
  /** Raised lines narrower than minPlastic, and gaps between raised parts narrower than minHole. */
  thinReliefSpots: number; thinGapSpots: number; minPlastic: number; minHole: number;
  use: 'texture' | 'underglaze'; depth: number;
  /** Plastic left between the axle hole and the bottom of the relief, in mm. */
  boreWall: number;
  /** True when a hollow drum had no room for spokes and printed solid. */
  solidFallback: boolean;
  /** Whether the handle is off, fine, missing its axle hole, or too big for the bed. */
  handle: 'off' | 'ok' | 'no-bore' | 'too-big';
}

export interface Check {
  id: string;
  /** An error means the print will fail. A warning means it prints but may work badly. */
  level: 'error' | 'warn';
  message: string;
  /** One-click repairs. Each sets one fix setting, which the pipeline then applies on every rebuild. */
  fixes?: { label: string; key: 'fixLines' | 'fixGaps'; value: string }[];
}

/** Edge clearance kept on every side of the bed, in mm. */
export const BED_MARGIN = 3;

// rollerChecks() is the guardrail before download. It returns only the checks that fail, errors first.
export function rollerChecks(i: RollerCheckInput): Check[] {
  const out: Check[] = [];
  const add = (ok: boolean, id: string, level: Check['level'], message: string, fixes?: Check['fixes']) => { if (!ok) out.push({ id, level, message, fixes }); };
  const n = (k: number, one: string, many: string) => `${k} ${k > 1 ? many : one}`;

  add(i.relief > 0, 'empty', 'error', 'Nothing is raised yet. Add a design, or lower a layer’s threshold.');
  const across = Math.min(i.bedW, i.bedD) - 2 * BED_MARGIN;
  add(i.diameter <= across && i.length <= i.bedH, 'bed', 'error',
    `The roller is Ø${i.diameter.toFixed(0)} × ${i.length.toFixed(0)} mm standing up, and the bed takes Ø${across} × ${i.bedH} mm. Use more turns per lap for a thinner roller, or a shorter band.`);
  add(i.boreWall >= 3, 'bore', 'error', `The axle hole leaves ${i.boreWall.toFixed(1)} mm of plastic under the relief. Make the hole smaller, or the roller wider.`);
  add(i.taper <= Math.max(1, 0.02 * i.potD), 'taper', 'warn',
    `The band narrows by ${i.taper.toFixed(1)} mm across its height, so a straight roller skids on it. Pick a straighter band, or roll a slab and build with it.`);
  add(i.thinReliefSpots === 0, 'thin-relief', 'warn',
    `${n(i.thinReliefSpots, 'raised line is', 'raised lines are')} narrower than ${i.minPlastic} mm and won't print cleanly. Thicken or remove ${i.thinReliefSpots > 1 ? 'them' : 'it'} here, or make the design bigger.`,
    [{ label: 'Thicken them', key: 'fixLines', value: 'thicken' }, { label: 'Remove them', key: 'fixLines', value: 'remove' }]);
  add(i.thinGapSpots === 0, 'thin-gaps', 'warn',
    `${n(i.thinGapSpots, 'gap between raised parts is', 'gaps between raised parts are')} narrower than ${i.minHole} mm, so ${i.use === 'underglaze' ? 'underglaze' : 'clay'} will fill ${i.thinGapSpots > 1 ? 'them' : 'it'}. Fill ${i.thinGapSpots > 1 ? 'them' : 'it'} in so the parts join, widen ${i.thinGapSpots > 1 ? 'them' : 'it'}, or make the design bigger.`,
    [{ label: 'Fill them in', key: 'fixGaps', value: 'fill' }, { label: 'Widen them', key: 'fixGaps', value: 'widen' }]);
  add(i.use !== 'underglaze' || i.depth >= 1.5, 'underglaze-depth', 'warn',
    'Shallow relief lets underglaze reach the low parts. 1.5 mm or more keeps them clean.');
  add(i.handle !== 'no-bore', 'handle-bore', 'warn', 'The handle needs an axle hole. Set the axle hole above 0, or turn the handle off.');
  add(i.handle !== 'too-big', 'handle-bed', 'warn', 'The handle is bigger than the bed. Shorten its grip.');
  add(!i.solidFallback, 'solid-fallback', 'warn', 'The drum is too thin for spokes, so it prints solid. Use a thinner wall, or more turns per lap for a smaller pot.');
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}
