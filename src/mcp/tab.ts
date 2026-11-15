import type { Settings } from '../state';
import type { Layer } from '../layers';
import type { RollerResult } from '../pipeline';
import type { PieceMode } from '../ui/Piece3D';
import type { DesignRef } from '../sources/types';
import { applyOps, OpError, type DesignState, type Op } from './ops';
import { builtinRef, searchBuiltin } from '../sources/builtin';
import { searchIconify } from '../sources/iconify';
import { capture3d } from '../ui/scene';
import { plate3mf } from '../core/plate';
import { setViewMode } from './viewMode';
import { shrinkImage } from '../render/shrink';
import { listSpots, thinOnRoller } from '../core/fix';
import { coverageGrid, printsMask, renderSight, type Region } from './sight';
import type { RollerBrief } from './prompts';
import type { Handler } from './bridge';

/** What the handlers need from the App. get() always returns the latest render's values. */
export interface TabApi {
  get(): { s: Settings; layers: Layer[]; result: RollerResult | null; updating: boolean; error: string; loading: number; renderedGen: number };
  /** The number of the latest change to the rebuild's inputs. */
  gen(): number;
  commit(next: DesignState): void;
  download(blob: Blob, name: string): void;
  baseName(): string;
}

type Show = 'drawn' | 'prints';
interface ViewArgs { which?: 'flat' | '3d' | 'both'; mode?: PieceMode; grid?: boolean; spots?: boolean; show?: Show; tiles?: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// shrink() copies a canvas at most max pixels across, so a preview costs Claude about 1,500 tokens.
function shrink(src: HTMLCanvasElement, max = 1200): string {
  const k = Math.min(1, max / Math.max(src.width, src.height, 1)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
const flatCanvas = () => document.querySelector<HTMLCanvasElement>('canvas.flat');

// A layer's design can carry a full image as a data URL, so state replies list the design by name only.
const trimLayer = ({ ref, ...l }: Layer) => ({ ...l, ...(ref ? { design: { source: ref.source, id: ref.id, title: ref.title, texture: !!ref.texture } } : {}) });

// ponytail: checkpoints live in the tab's memory and vanish on reload. Store them in IndexedDB if that ever bites.
const checkpoints = new Map<string, { state: DesignState; image?: string }>();
const found = new Map<string, DesignRef>();

// A shaped roller's outline is hundreds of numbers that Claude never reads, so replies leave it out.
const withoutOutline = ({ outline: _outline, ...roller }: RollerResult['roller']) => roller;

export function makeHandlers(api: TabApi): Record<string, Handler> {
  const summary = () => {
    const { s, layers, result: r, error } = api.get();
    return {
      ...(error ? { error } : {}),
      roller: r && withoutOutline(r.roller), grams: r && Math.round(r.grams), otherBuildGrams: r && Math.round(r.otherGrams), build: s.build.kind,
      checks: r?.checks ?? [], fixed: r?.fixed,
      layers: layers.map((l) => ({ id: l.id, name: l.name, kind: l.kind, visible: l.visible, repeatsRoundPot: r?.layerInfo.get(l.id)?.repeats })),
    };
  };

  // waitForRebuild() returns once the result on screen was built from every change since before, with no
  // design art still loading. A design layer rebuilds twice, first without its art and then with it, so the
  // loading check matters as much as the build number.
  const waitForRebuild = async (before: number) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 24_000) {
      await sleep(50);
      const { loading, renderedGen } = api.get(), now = api.gen();
      if (now > before && loading === 0 && renderedGen === now) return;
    }
  };

  const flatImage = () => { const c = flatCanvas(); return c ? shrink(c) : undefined; };

  const built = () => {
    const { s, result } = api.get();
    if (!result) throw new Error('The roller hasn\'t finished building yet.');
    return { s, r: result };
  };
  // spotsOf() lists the flagged spots in one order, largest first, so the numbers on every picture match list_spots.
  const spotsOf = (r: RollerResult, kind: 'line' | 'gap' | 'all' = 'all') => {
    const { w, h } = r.mask;
    return [...(kind !== 'gap' ? listSpots(r.thinRelief, w, h).map((p) => ({ kind: 'line' as const, ...p })) : []),
      ...(kind !== 'line' ? listSpots(r.thinGaps, w, h).map((p) => ({ kind: 'gap' as const, ...p })) : [])]
      .sort((a, b) => b.area - a.area).map((p, i) => ({ n: i + 1, ...p }));
  };
  // reliefOf() is the relief as it shows on screen, or, with "prints", as it reaches the pot. A thin line that doesn't
  // print drops out and a narrow gap fills in, even where a spot fix said to leave it, because leaving it doesn't make it print.
  const reliefOf = (s: Settings, r: RollerResult, show: Show) => {
    const { w, h, inside, solid } = r.mask, relief = solid.map((v, k) => (inside[k] && !v ? 1 : 0));
    if (show === 'drawn') return relief;
    return printsMask(relief, thinOnRoller(relief, w, h, s.minPlastic / s.res, 0).mask, thinOnRoller(relief.map((v) => 1 - v), w, h, s.minHole / s.res, 1).mask);
  };
  const sight = (region: Region, o: { show?: Show; grid?: boolean; spots?: boolean; maxPx: number }) => {
    const { s, r } = built(), show = o.show ?? 'drawn';
    return renderSight(r.mask, reliefOf(s, r, show), region, {
      maxPx: o.maxPx, grid: o.grid ?? true, spots: o.spots === false ? [] : spotsOf(r),
      problems: show === 'drawn' ? { lines: r.thinRelief, gaps: r.thinGaps } : undefined,
    }).toDataURL('image/png');
  };
  const SHOWN = { drawn: 'raised relief in the accent colour, thin lines red, narrow gaps purple', prints: 'what reaches the pot: thin lines dropped, narrow gaps filled' };

  const view = async ({ which = 'both', mode, grid, spots, show = 'drawn', tiles }: ViewArgs) => {
    const images: { name: string; dataUrl: string }[] = [];
    if (which !== '3d' && api.get().result) {
      const name = `Roller, unrolled (${SHOWN[show]})${grid === false ? '' : ', grid in shares u across and v down'}`;
      images.push({ name, dataUrl: sight({ u0: 0, v0: 0, u1: 1, v1: 1 }, { show, grid, spots, maxPx: 1200 }) });
      // Tiles split the pattern into four across at full detail, for when the whole view is too small to judge.
      if (tiles) for (let i = 0; i < 4; i++)
        images.push({ name: `Tile ${i + 1} of 4, u ${i / 4} to ${(i + 1) / 4}`, dataUrl: sight({ u0: i / 4, v0: 0, u1: (i + 1) / 4, v1: 1 }, { show, grid, spots, maxPx: 1200 }) });
    }
    if (which !== 'flat') {
      if (mode) { setViewMode(mode); await sleep(400); }
      let shot: HTMLCanvasElement | null = null;
      for (let i = 0; i < 40 && !(shot = capture3d()); i++) await sleep(100);
      if (shot) images.push({ name: `3D view${mode ? `, ${mode}` : ''}`, dataUrl: shrink(shot) });
    }
    if (!images.length) throw new Error('No preview is on screen yet. Wait for the roller to finish building, then call view again.');
    return { images };
  };

  // resolve() turns the bridge-only ops, which name a library design or an image, into layer ops.
  const resolve = async (o: Record<string, unknown>): Promise<Op> => {
    if (o.op === 'addDesign') {
      const ref = found.get(`${o.source}:${o.id}`) ?? (o.source === 'builtin' ? builtinRef(String(o.id)) : undefined);
      if (!ref) throw new OpError(`Search with search_library first, so the tab knows the design ${o.source}:${o.id}.`);
      return { op: 'addLayer', kind: 'design', ref };
    }
    if (o.op === 'addImage') {
      const url = String(o.url ?? ''), name = String(o.name ?? 'Image');
      if (!/^(https:|data:image\/)/.test(url)) throw new OpError('An image URL must start with https: or data:image/.');
      const { data, thumb } = await shrinkImage(url);
      return { op: 'addLayer', kind: 'design', ref: { source: 'upload', id: `${name}-${Date.now()}`, title: name, thumb, data, credit: { source: 'Your image', license: 'your own' } } };
    }
    return o as Op;
  };

  const commitAndWait = async (next: DesignState, wantView?: boolean) => {
    const before = api.gen();
    api.commit(next);
    await waitForRebuild(before);
    return { ...summary(), ...(wantView ? await view({ which: 'flat' }) : {}) };
  };

  return {
    getState: async () => {
      const { s, layers } = api.get();
      return { settings: s, layers: layers.map(trimLayer), summary: summary(), checkpoints: [...checkpoints.keys()] };
    },
    view: async (p: ViewArgs) => view(p),
    apply: async ({ ops, view: wantView }: { ops: Record<string, unknown>[]; view?: boolean }) => {
      const { s, layers, result } = api.get();
      return commitAndWait(applyOps({ settings: s, layers }, await Promise.all(ops.map(resolve)), { checks: result?.checks ?? [] }), wantView);
    },
    searchLibrary: async ({ source, query = '' }: { source: string; query?: string }) => {
      const page = source === 'builtin' ? searchBuiltin(query)
        : source === 'hero' ? (await import('../sources/heroPatterns')).searchHeroPatterns(query)
          : source === 'patternmonster' ? (await import('../sources/patternMonster')).searchPatternMonster(query)
            : await searchIconify(query || 'flower', undefined, true);
      for (const ref of page.items) found.set(`${ref.source}:${ref.id}`, ref);
      return { items: page.items.slice(0, 40).map((r) => ({ source: r.source, id: r.id, title: r.title, texture: !!r.texture })) };
    },
    checkpoint: async ({ name }: { name: string }) => {
      const { s, layers } = api.get();
      checkpoints.set(name, { state: { settings: s, layers }, image: flatImage() });
      return { saved: name, checkpoints: [...checkpoints.keys()] };
    },
    restore: async ({ name, view: wantView }: { name: string; view?: boolean }) => {
      const c = checkpoints.get(name);
      if (!c) throw new Error(`No checkpoint is called ${name}. Saved: ${[...checkpoints.keys()].join(', ') || 'none'}.`);
      return commitAndWait(c.state, wantView);
    },
    compare: async ({ a, b }: { a: string; b: string }) => {
      const pick = (n: string) => {
        const image = n === 'current' ? flatImage() : checkpoints.get(n)?.image;
        if (!image) throw new Error(`No preview for ${n}. Use a checkpoint name, or "current".`);
        return { name: n, dataUrl: image };
      };
      return { images: [pick(a), pick(b)] };
    },
    export: async ({ format }: { format: 'stl' | 'png' | '3mf' }) => {
      const { s, result } = api.get(), name = api.baseName();
      if (!result) throw new Error('The roller hasn\'t finished building yet.');
      let blob: Blob;
      if (format === 'stl') blob = new Blob([result.stl.slice(0)], { type: 'model/stl' });
      else if (format === '3mf') {
        // The plate carries the handle and the axle too, when the handle is on.
        const parts = [{ name, stl: result.stl.slice(0) }, ...(result.handle ? [{ name: `${name}_handle`, stl: result.handle.stl.slice(0) }, { name: `${name}_axle`, stl: result.handle.axleStl.slice(0) }] : [])];
        const zip = await plate3mf(parts, s.bedW, s.bedD);
        if (!zip) throw new Error('The roller and its handle don\'t fit on one plate. Shorten the grip, or export the STL.');
        blob = new Blob([zip as BlobPart], { type: 'model/3mf' });
      }
      else blob = await new Promise<Blob>((ok, fail) => flatCanvas()?.toBlob((b) => (b ? ok(b) : fail(new Error('No flat preview.')))) ?? fail(new Error('No flat preview.')));
      api.download(blob, `${name}.${format}`);
      return { file: `${name}.${format}`, bytes: blob.size, savedTo: 'the browser\'s downloads folder' };
    },
    // listSpots lists the spots the print check flags, largest first, with a point on each that fix_spot and view_spot take.
    listSpots: async ({ kind = 'all', limit = 50 }: { kind?: 'line' | 'gap' | 'all'; limit?: number }) => {
      const { r } = built(), { w, h, res } = r.mask, all = spotsOf(r), spots = kind === 'all' ? all : all.filter((p) => p.kind === kind);
      return {
        total: spots.length,
        spots: spots.slice(0, limit).map((p) => ({
          n: p.n, kind: p.kind, u: +((p.x + 0.5) / w).toFixed(4), v: +((p.y + 0.5) / h).toFixed(4),
          sizeMm: [+((p.maxX - p.minX + 1) * res).toFixed(1), +((p.maxY - p.minY + 1) * res).toFixed(1)], areaMm2: +(p.area * res * res).toFixed(2),
        })),
      };
    },
    // viewRegion draws any box of the pattern, in shares, at full detail with its own finer grid.
    viewRegion: async ({ u0, v0, u1, v1, show = 'drawn', grid, spots }: Region & { show?: Show; grid?: boolean; spots?: boolean }) => {
      if (!(u1 > u0 && v1 > v0)) throw new Error('A region needs u1 > u0 and v1 > v0.');
      return { images: [{ name: `Region u ${u0} to ${u1}, v ${v0} to ${v1} (${SHOWN[show]})`, dataUrl: sight({ u0, v0, u1, v1 }, { show, grid, spots, maxPx: 1000 }) }] };
    },
    // describeCoverage is the cheap look: text only, a few numbers per cell, no picture.
    describeCoverage: async ({ cols = 4, rows = 2, show = 'drawn' }: { cols?: number; rows?: number; show?: Show }) => {
      const { s, r } = built(), { w, h } = r.mask, spots = spotsOf(r);
      const g = coverageGrid(reliefOf(s, r, show), w, h, cols, rows, spots.map((p) => ({ u: (p.x + 0.5) / w, v: (p.y + 0.5) / h })));
      // Two small matrices read faster than a list of cells, and cost a fraction of the tokens.
      return {
        show, raisedPercent: g.raised, cellSize: { u: 1 / cols, v: 1 / rows },
        raisedPercentByCell: g.cells, spotsByCell: g.spots,
        spotsTotal: spots.length,
      };
    },
    // viewSpot crops the flat view round one point and scales it up with hard pixel edges, so a thin spot is easy to see.
    viewSpot: async ({ u, v, zoom = 4 }: { u: number; v: number; zoom?: number }) => {
      const c = flatCanvas();
      if (!c) throw new Error('No flat preview is on screen yet.');
      const cw = Math.max(40, Math.round(c.width / Math.max(1, zoom))), ch = Math.max(30, Math.round(cw * 0.6));
      const x0 = Math.min(c.width - cw, Math.max(0, Math.round(u * c.width - cw / 2))), y0 = Math.min(c.height - ch, Math.max(0, Math.round(v * c.height - ch / 2)));
      const out = document.createElement('canvas'), k = 800 / cw;
      out.width = 800; out.height = Math.round(ch * k);
      const g = out.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.arc((u * c.width - x0) * k, (v * c.height - y0) * k, 14, 0, 2 * Math.PI); g.stroke();
      return { images: [{ name: `Spot at u ${u}, v ${v}, ${zoom}× (the white ring marks the point)`, dataUrl: out.toDataURL('image/png') }] };
    },
    brief: async (): Promise<RollerBrief> => {
      const { s, result } = api.get();
      if (!result) throw new Error('The roller hasn\'t finished building yet.');
      return {
        diameter: result.roller.diameter, bandHeight: result.band.slant, repeatsPerTurn: 1, minLine: s.minPlastic,
        minGap: Math.max(s.minHole, s.use === 'underglaze' ? 1.5 * s.depth : s.depth), use: s.use,
      };
    },
  };
}
