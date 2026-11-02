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

export function makeHandlers(api: TabApi): Record<string, Handler> {
  const summary = () => {
    const { s, layers, result: r, error } = api.get();
    return {
      ...(error ? { error } : {}),
      roller: r?.roller, grams: r && Math.round(r.grams), otherBuildGrams: r && Math.round(r.otherGrams), build: s.build.kind,
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
  const view = async ({ which = 'both', mode }: { which?: 'flat' | '3d' | 'both'; mode?: PieceMode }) => {
    const images: { name: string; dataUrl: string }[] = [];
    if (which !== '3d') { const f = flatImage(); if (f) images.push({ name: 'Roller, unrolled (raised relief in the accent colour)', dataUrl: f }); }
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
  const resolve = (o: Record<string, unknown>): Op => {
    if (o.op === 'addDesign') {
      const ref = found.get(`${o.source}:${o.id}`) ?? (o.source === 'builtin' ? builtinRef(String(o.id)) : undefined);
      if (!ref) throw new OpError(`Search with search_library first, so the tab knows the design ${o.source}:${o.id}.`);
      return { op: 'addLayer', kind: 'design', ref };
    }
    if (o.op === 'addImage') {
      const url = String(o.url ?? ''), name = String(o.name ?? 'Image');
      if (!/^(https:|data:image\/)/.test(url)) throw new OpError('An image URL must start with https: or data:image/.');
      return { op: 'addLayer', kind: 'design', ref: { source: 'upload', id: `${name}-${Date.now()}`, title: name, thumb: url, data: url, credit: { source: 'Your image', license: 'your own' } } };
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
    view: async (p: { which?: 'flat' | '3d' | 'both'; mode?: PieceMode }) => view(p),
    apply: async ({ ops, view: wantView }: { ops: Record<string, unknown>[]; view?: boolean }) => {
      const { s, layers, result } = api.get();
      return commitAndWait(applyOps({ settings: s, layers }, ops.map(resolve), { checks: result?.checks ?? [] }), wantView);
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
      else if (format === '3mf') blob = new Blob([(await plate3mf([{ name, stl: result.stl.slice(0) }], s.bedW, s.bedD)) as BlobPart], { type: 'model/3mf' });
      else blob = await new Promise<Blob>((ok, fail) => flatCanvas()?.toBlob((b) => (b ? ok(b) : fail(new Error('No flat preview.')))) ?? fail(new Error('No flat preview.')));
      api.download(blob, `${name}.${format}`);
      return { file: `${name}.${format}`, bytes: blob.size, savedTo: 'the browser\'s downloads folder' };
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
