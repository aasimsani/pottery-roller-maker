import { geometry, type BandParams, type Geometry } from './core/geometry';
import { buildMask, countPieces, type Mask, type MaskLayer } from './core/mask';
import { planCells } from './core/layout';
import { linePeriod, makeLinesTile } from './core/lines';
import { bandOnPiece, type Band } from './core/piece';
import { thinFeatures } from './core/thin';
import { drumParts, filamentGrams, heightmapFromBits, mergeMeshes, toSTL, type DrumBuild, type RollerSpec } from './core/roller';
import { rollerChecks, type Check } from './checks';
import { renderTile } from './render/tile';
import { refKey, type Art } from './render/art';
import type { Layer } from './layers';
import type { Settings } from './state';

/** How a layer actually repeats once sized to the band. Textures and lines pick their own counts. */
export interface LayerInfo { repeats: number; rows: number; cellW: number; cellH: number }

/** The roller's size, and the pot it was sized for, in mm. */
export interface RollerSize { diameter: number; length: number; potD: number; taper: number }

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
  layerInfo: Map<string, LayerInfo>;
  /** The exact file Download STL saves: the drum standing on its end. */
  stl: ArrayBuffer;
  /** Filament for this build, and for the other build, in grams of PETG. */
  grams: number; otherGrams: number;
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
  const laps = Math.max(1, Math.round(s.laps)), potD = (band.topD + band.botD) / 2, diameter = potD / laps;
  const roller = { diameter, length: band.slant + 2 * s.ends, potD, taper: Math.abs(band.topD - band.botD) };
  const gp: BandParams = { topD: diameter, botD: diameter, slant: band.slant, coverage: 1, frame: 0, res: s.res };
  const [arc, bandH] = geometry(gp).cellMm(1, 1);
  const maskLayers: MaskLayer[] = [], layerInfo = new Map<string, LayerInfo>();
  for (const L of layers) {
    const r = layerToMask({ ...L, repeats: Math.max(1, Math.round(L.repeats / laps)) }, arc, bandH, s.res, arts);
    if (r) { maskLayers.push(r[0]); layerInfo.set(L.id, { ...r[1], repeats: r[1].repeats * laps }); }
  }
  return { gp, maskLayers, layerInfo, band, roller };
}

// thinWrapped() runs thinFeatures() on a pattern that wraps left to right. It pads each side with
// columns from the other side, so a line that crosses the seam isn't mistaken for a thin stub.
function thinWrapped(bits: Uint8Array, w: number, h: number, minPx: number): { mask: Uint8Array; spots: number } {
  const pad = Math.min(w, Math.ceil(minPx) + 2), W = w + 2 * pad, wide = new Uint8Array(W * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) wide[y * W + x] = bits[y * w + (((x - pad) % w) + w) % w];
  const t = thinFeatures(wide, W, h, minPx, 2 * minPx * minPx).mask, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = t[y * W + x + pad];
  return { mask, spots: countPieces(mask, w, h) };
}

// finishRoller() builds the pattern, raises it into a drum, and checks it. It touches no DOM,
// so it can run in a Web Worker and keep the page responsive while you type.
export function finishRoller(s: Settings, { gp, maskLayers, layerInfo, band, roller }: Prepared): RollerResult {
  const g = geometry(gp), mask = buildMask(g, maskLayers), n = mask.w * mask.h;
  const relief = new Uint8Array(n), gaps = new Uint8Array(n);
  let raised = 0, inside = 0;
  for (let k = 0; k < n; k++) {
    if (!mask.inside[k]) continue;
    inside++;
    if (mask.solid[k]) gaps[k] = 1; else { relief[k] = 1; raised++; }
  }
  const thinRelief = thinWrapped(relief, mask.w, mask.h, s.minPlastic / s.res);
  const thinGaps = thinWrapped(gaps, mask.w, mask.h, s.minHole / s.res);

  const spec: RollerSpec = { diameter: roller.diameter, length: roller.length, depth: s.depth, repeats: 1, rim: s.ends, bore: s.bore, cell: s.cell, mirror: s.mirror };
  const map = heightmapFromBits(relief, mask.w, mask.h, s.soften / s.res);
  const parts = drumParts(map, spec, s.build), stl = toSTL(mergeMeshes(parts));
  // The other build's estimate uses a coarse mesh, which is quick and close enough for grams.
  const other: DrumBuild = { ...s.build, kind: s.build.kind === 'hollow' ? 'solid' : 'hollow' }, coarse = { ...spec, cell: Math.max(spec.cell, 1.5) };

  const checks = rollerChecks({
    diameter: roller.diameter, length: roller.length, bedW: s.bedW, bedD: s.bedD, bedH: s.bedH, potD: roller.potD, taper: roller.taper,
    relief: inside ? raised / inside : 0, thinReliefSpots: thinRelief.spots, thinGapSpots: thinGaps.spots, minPlastic: s.minPlastic, minHole: s.minHole,
    use: s.use, depth: s.depth, boreWall: roller.diameter / 2 - s.depth - s.bore / 2, solidFallback: s.build.kind === 'hollow' && parts.length === 1,
  });
  return {
    g, gp, mask, band, roller, thinRelief: thinRelief.mask, thinGaps: thinGaps.mask, checks, layerInfo, stl,
    grams: filamentGrams(parts, spec, s.build), otherGrams: filamentGrams(drumParts(map, coarse, other), coarse, other),
  };
}

// computeRoller() turns the settings and the loaded layers into a printable roller, all on one thread.
export const computeRoller = (s: Settings, layers: Layer[], arts: Map<string, Art>): RollerResult =>
  finishRoller(s, prepareRoller(s, layers, arts));
