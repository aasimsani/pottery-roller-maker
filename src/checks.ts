/** Everything the print check looks at, measured on the finished roller. */
export interface RollerCheckInput {
  /** The roller's widest tip diameter and its length along the axis, and the printer's bed, all in mm. The roller prints standing on its end. */
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
  /** True when the roller's side follows the pot's wall. A straight roller is a plain cylinder. */
  shaped: boolean;
  /** How far the wall strays from a straight line across the band, in mm. */
  bow: number;
  /** The largest share by which a shaped roller's surface outruns or lags the pot's. 0.05 means 5%. */
  slip: number;
}

export interface Check {
  id: string;
  /** An error means the print will fail. A warning means it prints but may work badly. */
  level: 'error' | 'warn';
  message: string;
  /** One-click repairs. Each sets one fix setting, which the pipeline then applies on every rebuild. */
  fixes?: { label: string; key: 'fixLines' | 'fixGaps' | 'shape'; value: string }[];
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
  const shape: Check['fixes'] = [{ label: 'Shape the roller to the pot', key: 'shape', value: 'pot' }];
  add(i.shaped || i.taper <= Math.max(1, 0.02 * i.potD), 'taper', 'warn',
    `The band narrows by ${i.taper.toFixed(1)} mm across its height, so a straight roller skids on it. Shape the roller to the pot, or pick a straighter band.`, shape);
  // A 0.3 mm gap already matters. Underglaze only transfers where the roller touches, and a texture presses that much shallower.
  add(i.shaped || i.bow <= 0.3, 'curve', 'warn',
    `The wall bows by ${i.bow.toFixed(1)} mm across the band, so a straight roller misses the pot by that much. Shape the roller to the pot, or pick a narrower band.`, shape);
  // A shaped roller touches everywhere, but on a curved band its surface can't match the pot's speed everywhere, so
  // it slides a little while each raised part is in contact. The contact lasts while the tips sink in and lift out.
  // ponytail: the tips sink the relief's depth into soft clay, and 0.05 mm is a guess for underglaze on leather-hard
  // clay. Measure a print and tune these if the warning ever misleads.
  const sink = i.use === 'texture' ? i.depth : 0.05, contact = 2 * Math.sqrt((2 * sink) / (2 / i.diameter + 2 / i.potD)), smear = i.slip * contact;
  add(!i.shaped || smear <= i.minPlastic / 2, 'smear', 'warn',
    `The band curves, so the roller's surface runs up to ${(100 * i.slip).toFixed(0)}% faster or slower than the pot's and drags the pattern by about ${smear.toFixed(1)} mm. Use a narrower band, or fewer turns per lap.`);
  add(i.thinReliefSpots === 0, 'thin-relief', 'warn',
    `${n(i.thinReliefSpots, 'raised line is', 'raised lines are')} narrower than ${i.minPlastic} mm and won't print cleanly. Thicken or remove ${i.thinReliefSpots > 1 ? 'them' : 'it'} here, click one on the roller to fix just that spot, or make the design bigger.`,
    [{ label: 'Thicken them', key: 'fixLines', value: 'thicken' }, { label: 'Remove them', key: 'fixLines', value: 'remove' }]);
  add(i.thinGapSpots === 0, 'thin-gaps', 'warn',
    `${n(i.thinGapSpots, 'gap between raised parts is', 'gaps between raised parts are')} narrower than ${i.minHole} mm, so ${i.use === 'underglaze' ? 'underglaze' : 'clay'} will fill ${i.thinGapSpots > 1 ? 'them' : 'it'}. Fill ${i.thinGapSpots > 1 ? 'them' : 'it'} in so the parts join, widen ${i.thinGapSpots > 1 ? 'them' : 'it'}, click one on the roller to fix just that spot, or make the design bigger.`,
    [{ label: 'Fill them in', key: 'fixGaps', value: 'fill' }, { label: 'Widen them', key: 'fixGaps', value: 'widen' }]);
  add(i.use !== 'underglaze' || i.depth >= 1.5, 'underglaze-depth', 'warn',
    'Shallow relief lets underglaze reach the low parts. 1.5 mm or more keeps them clean.');
  add(i.handle !== 'no-bore', 'handle-bore', 'warn', 'The handle needs an axle hole. Set the axle hole above 0, or turn the handle off.');
  add(i.handle !== 'too-big', 'handle-bed', 'warn', 'The handle is bigger than the bed. Shorten its grip.');
  add(!i.solidFallback, 'solid-fallback', 'warn', 'The drum is too thin for spokes, so it prints solid. Use a thinner wall, or more turns per lap for a smaller pot.');
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}
