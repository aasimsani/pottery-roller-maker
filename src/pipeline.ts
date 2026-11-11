import { geometry, type BandParams, type Geometry } from './core/geometry';
import { buildMask, type Mask, type MaskLayer } from './core/mask';
import { planCells } from './core/layout';
import { linePeriod, makeLinesTile } from './core/lines';
import { bandOnPiece, isFlat, wallAt, type Band } from './core/piece';
import { bow, fitRoller } from './core/shape';
import { dropSpots, fixRelief, thinOnRoller } from './core/fix';
import { drumParts, filamentGrams, heightmapFromBits, mergeMeshes, toSTL, type DrumBuild, type RollerSpec } from './core/roller';
import { BED_MARGIN, rollerChecks, type Check } from './checks';
import { handleParts } from './core/handle';
import { packPlate } from './core/plate';
import { renderTile } from './render/tile';
import { refKey, type Art } from './render/art';
import type { Layer } from './layers';
import type { Settings } from './state';

/** How a layer actually repeats once sized to the band. Textures and lines pick their own counts. */
export interface LayerInfo { repeats: number; rows: number; cellW: number; cellH: number }

/** The roller's size, and the pot it was sized for, in mm. */
export interface RollerSize {
  /** The tip diameter the pattern is laid out on, and the length along the surface. A shaped roller's diameter is its mean across the band. */
  diameter: number; length: number; potD: number; taper: number;
  /** How far the wall strays from a straight line across the band. */
  bow: number;
  /** The thinnest and widest tip diameters, and the length along the axis. A straight roller has one diameter, and its two lengths match. */
  minD: number; maxD: number; axial: number;
  /** A roller shaped to the pot has a side that follows the wall. slip is the largest share by which its surface outruns or lags the pot's. */
  outline?: { t: number[]; r: number[] }; slip: number;
}

export interface RollerResult {
  /** The unrolled roller surface. Columns run once round the roller, and rows run down the band. */
  g: Geometry;
  /** The parameters g was built from, so a result posted back from a worker can rebuild it. */
  gp: BandParams;
  /** A solid pixel is the low base, and a non-solid pixel inside the mask is raised relief. */
  mask: Mask;
  band: Band;
  roller: RollerSize;
  /** Raised lines too thin to print, and gaps too narrow to stay clean (1 = too thin). */
  thinRelief: Uint8Array; thinGaps: Uint8Array;
  checks: Check[];
  /** How many thin lines and narrow gaps the fixes for everything repaired, and how many spot fixes found their spot. */
  fixed: { lines: number; gaps: number; spots: number };
  layerInfo: Map<string, LayerInfo>;
  /** The exact file Download STL saves: the drum standing on its end. */
  stl: ArrayBuffer;
  /** Filament for this build, and for the other build, in grams of PETG. */
  grams: number; otherGrams: number;
  /** The handle, which prints flat, and its axle, which prints standing up. Both are absent when the handle is off. */
  handle?: { stl: ArrayBuffer; axleStl: ArrayBuffer; size: [number, number, number] };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// layerToMask() renders one layer into a repeat cell sized for the band. arc is the band's
// length round its middle line and bandH its height along the surface, both in mm.
function layerToMask(L: Layer, arc: number, bandH: number, res: number, arts: Map<string, Art>): [MaskLayer, LayerInfo] | null {
  if (!L.visible) return null;
  // Lines are positioned against the whole band, so they ignore the layer's slice.
  const from = L.kind === 'lines' ? 0 : clamp(L.from, 0, 99), to = L.kind === 'lines' ? 100 : clamp(L.to, from + 1, 100);
  const sliceH = (bandH * (to - from)) / 100;
  let tile, repeats, rows;
  if (L.kind === 'lines') {
    repeats = Math.max(1, Math.round(arc / linePeriod(L.lines))); rows = 1;
    tile = makeLinesTile(L.lines, arc / repeats, sliceH, res);
  } else {
    const art = L.ref && arts.get(refKey(L.ref));
    if (!art) return null; // still loading
    const image = { threshold: L.threshold, invert: L.invert, smooth: L.smooth };
    if (L.ref!.texture) {
      // A seamless pattern repeats at its own size, rounded so whole repeats fit the slice and the circumference.
      rows = Math.max(1, Math.round(sliceH / Math.max(1, L.patternSize)));
      repeats = Math.max(1, Math.round(arc / ((sliceH / rows) * art.aspect)));
      tile = renderTile({ textures: [0], placements: [] }, [{ scale: 1, art }], arc / repeats, sliceH / rows, res, image, false);
    } else {
      repeats = Math.max(1, Math.round(L.repeats)); rows = Math.max(1, Math.round(L.rows));
      const cw = arc / repeats, ch = sliceH / rows, scatter = L.arrange === 'scatter';
      const [plan] = planCells([{ texture: false, scale: L.size / 100, rotate: L.rotate }], scatter ? 'scatter' : 'together', cw, ch,
        { count: L.count, seed: L.seed, jitter: L.jitter });
      tile = renderTile(plan, [{ scale: L.size / 100, art }], cw, ch, res, image, scatter);
    }
  }
  const info = { repeats, rows, cellW: arc / repeats, cellH: sliceH / rows };
  return [{
    tile, repeats, rows, stagger: L.stagger, offsetU: L.offsetX / 100, offsetV: L.offsetY / 100,
    from: from / 100, to: to / 100, blend: L.blend, haloPx: L.halo / res,
    // Layers saved before thickening existed have no grow value.
    growPx: (L.grow ?? 0) / res,
  }, info];
}

/** Everything finishRoller() needs. It is plain data, so it can be posted to a Web Worker. */
export interface Prepared {
  /** The geometry's parameters. Functions can't cross to a worker, so each side rebuilds the geometry from these. */
  gp: BandParams;
  maskLayers: MaskLayer[];
  layerInfo: Map<string, LayerInfo>;
  band: Band;
  roller: RollerSize;
}

// prepareRoller() sizes the roller to the pot and renders each layer's repeat cell round one turn of it.
// The roller's diameter is the pot's divided by the turns per lap, so the pattern meets itself where you finish.
// A layer's repeats count round the pot like the stencil maker's, so each turn of the roller carries 1/laps of them.
// Rendering draws on canvases, so this half runs on the page.
export function prepareRoller(s: Settings, layers: Layer[], arts: Map<string, Art>): Prepared {
  const band = bandOnPiece(s.piece, { from: s.bandFrom, to: s.bandTo, above: 0, below: 0, ends: 0, toBase: false });
  const laps = Math.max(1, Math.round(s.laps)), length = band.slant + 2 * s.ends, taper = Math.abs(band.topD - band.botD);
  // The wall is sampled every half millimetre along the roller, plain ends included. inBand marks the patterned part.
  const n = Math.max(2, Math.ceil(length / 0.5)), wall = Array.from({ length: n + 1 }, (_, i) => wallAt(s.piece, band.start - s.ends + (length * i) / n));
  const inBand: [number, number] = [Math.round((s.ends / length) * n), Math.round(((s.ends + band.slant) / length) * n)];
  const side = isFlat(s.piece) ? -1 : 1, bowed = bow(wall, inBand, side);
  let roller: RollerSize;
  if (s.shape === 'pot') {
    // A shaped roller's mean radius across the band is the pot's mean radius over the turns per lap, so the pattern still meets itself.
    const fit = fitRoller(wall, inBand, laps, side), inside = fit.r.slice(inBand[0], inBand[1] + 1);
    const diameter = (2 * inside.reduce((a, v) => a + v, 0)) / inside.length;
    roller = { diameter, length, potD: diameter * laps, taper, bow: bowed, minD: 2 * Math.min(...fit.r), maxD: 2 * Math.max(...fit.r), axial: fit.t[n], outline: { t: fit.t, r: fit.r }, slip: fit.slip };
  } else {
    const potD = (band.topD + band.botD) / 2, diameter = potD / laps;
    roller = { diameter, length, potD, taper, bow: bowed, minD: diameter, maxD: diameter, axial: length, slip: 0 };
  }
  const gp: BandParams = { topD: roller.diameter, botD: roller.diameter, slant: band.slant, coverage: 1, frame: 0, res: s.res };
  const [arc, bandH] = geometry(gp).cellMm(1, 1);
  const maskLayers: MaskLayer[] = [], layerInfo = new Map<string, LayerInfo>();
  for (const L of layers) {
    const r = layerToMask({ ...L, repeats: Math.max(1, Math.round(L.repeats / laps)) }, arc, bandH, s.res, arts);
    if (r) { maskLayers.push(r[0]); layerInfo.set(L.id, { ...r[1], repeats: r[1].repeats * laps }); }
  }
  return { gp, maskLayers, layerInfo, band, roller };
}

// finishRoller() builds the pattern, raises it into a drum, and checks it. It touches no DOM,
// so it can run in a Web Worker and keep the page responsive while you type.
export function finishRoller(s: Settings, { gp, maskLayers, layerInfo, band, roller }: Prepared): RollerResult {
  // The pattern is laid out at the roller's mean diameter, so on a shaped roller it comes out narrower at the thinnest
  // part. The print check allows for that by asking for wider lines and gaps everywhere.
  // ponytail: that is stricter than the wide parts need. Scale each row by its own diameter if it ever rejects too much.
  const tight = roller.diameter / roller.minD;
  const g = geometry(gp), mask = buildMask(g, maskLayers), n = mask.w * mask.h, linePx = (s.minPlastic / s.res) * tight, gapPx = (s.minHole / s.res) * tight;
  const drawn = new Uint8Array(n);
  for (let k = 0; k < n; k++) drawn[k] = mask.inside[k] && !mask.solid[k] ? 1 : 0;
  const at = (f: { u: number; v: number }) => ({ x: f.u * mask.w, y: f.v * mask.h });
  const { relief, ...fixed } = fixRelief(drawn, mask.w, mask.h, {
    linePx, gapPx, lines: s.fixLines, gaps: s.fixGaps,
    lineByPx: (s.fixLinesBy || s.minPlastic) / s.res, gapByPx: (s.fixGapsBy || s.minHole) / s.res,
    spots: s.spotFixes.map((f) => ({ kind: f.kind, ...at(f), action: f.action, byPx: f.by / s.res })),
  });
  // The flat view shows the fixed relief, which is what prints.
  let raised = 0, inside = 0;
  for (let k = 0; k < n; k++) {
    if (!mask.inside[k]) continue;
    inside++; raised += relief[k];
    mask.solid[k] = relief[k] ? 0 : 1;
  }
  // Spots the user chose to leave stay as drawn, and they drop out of the print check's counts.
  const left = (kind: 'line' | 'gap') => s.spotFixes.filter((f) => f.kind === kind && f.action === 'leave').map(at);
  const thinRelief = dropSpots(thinOnRoller(relief, mask.w, mask.h, linePx, 0).mask, mask.w, mask.h, left('line'));
  const thinGaps = dropSpots(thinOnRoller(relief.map((v) => 1 - v), mask.w, mask.h, gapPx, 1).mask, mask.w, mask.h, left('gap'));

  const spec: RollerSpec = { diameter: roller.diameter, length: roller.length, depth: s.depth, repeats: 1, rim: s.ends, bore: s.bore, cell: s.cell, mirror: s.mirror, outline: roller.outline };
  const map = heightmapFromBits(relief, mask.w, mask.h, s.soften / s.res);
  const parts = drumParts(map, spec, s.build), stl = toSTL(mergeMeshes(parts));
  // The other build's estimate uses a coarse mesh, which is quick and close enough for grams.
  const other: DrumBuild = { ...s.build, kind: s.build.kind === 'hollow' ? 'solid' : 'hollow' }, coarse = { ...spec, cell: Math.max(spec.cell, 1.5) };

  // The handle needs the roller's axle hole, and it must fit the bed lying flat.
  let handle: RollerResult['handle'], handleState: 'off' | 'ok' | 'no-bore' | 'too-big' = 'off';
  if (s.handle && s.bore <= 0) handleState = 'no-bore';
  else if (s.handle) {
    const h = handleParts({ rollerLength: roller.axial, rollerDiameter: roller.maxD, bore: s.bore, grip: s.grip }), fork = mergeMeshes(h.fork);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < fork.positions.length; k++) { lo[k % 3] = Math.min(lo[k % 3], fork.positions[k]); hi[k % 3] = Math.max(hi[k % 3], fork.positions[k]); }
    const size: [number, number, number] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    handle = { stl: toSTL(fork), axleStl: toSTL(h.axle), size };
    handleState = packPlate([[size[0], size[1]]], s.bedW, s.bedD, 0, BED_MARGIN) ? 'ok' : 'too-big';
  }

  const checks = rollerChecks({
    diameter: roller.maxD, length: roller.axial, bedW: s.bedW, bedD: s.bedD, bedH: s.bedH, potD: roller.potD, taper: roller.taper,
    relief: inside ? raised / inside : 0, thinReliefSpots: thinRelief.spots, thinGapSpots: thinGaps.spots, minPlastic: s.minPlastic, minHole: s.minHole,
    use: s.use, depth: s.depth, boreWall: roller.minD / 2 - s.depth - s.bore / 2, solidFallback: s.build.kind === 'hollow' && parts.length === 1,
    handle: handleState, shaped: !!roller.outline, bow: roller.bow, slip: roller.slip,
  });
  return {
    g, gp, mask, band, roller, thinRelief: thinRelief.mask, thinGaps: thinGaps.mask, checks, fixed, layerInfo, stl, handle,
    grams: filamentGrams(parts, spec, s.build), otherGrams: filamentGrams(drumParts(map, coarse, other), coarse, other),
  };
}

// computeRoller() turns the settings and the loaded layers into a printable roller, all on one thread.
export const computeRoller = (s: Settings, layers: Layer[], arts: Map<string, Art>): RollerResult =>
  finishRoller(s, prepareRoller(s, layers, arts));
