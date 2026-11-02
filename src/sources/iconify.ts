import { svgDataUrl, type DesignRef, type SearchPage } from './types';

// Iconify serves 300k+ open-source icons from 200+ sets. It needs no API key and allows
// cross-origin requests. Docs: https://iconify.design/docs/api/
// Its per-icon SVG endpoint rate-limits quickly (HTTP 429), and a page of thumbnails would
// cost one request per icon. So the app asks for each page's shapes in one batch request per
// icon set and builds every SVG locally.
const API = 'https://api.iconify.design';
const PAGE = 64;

interface IconData { body: string; width?: number; height?: number; left?: number; top?: number }
/** Iconify's icon-set JSON, as returned by /{prefix}.json?icons=a,b,c */
export interface IconSetData {
  prefix: string;
  width?: number; height?: number; left?: number; top?: number;
  icons: Record<string, IconData>;
  aliases?: Record<string, { parent: string; width?: number; height?: number }>;
}

interface IconifyCollection {
  name: string;
  author?: { name?: string; url?: string };
  license?: { title?: string; spdx?: string; url?: string };
  tags?: string[];
}
interface IconifySearch { icons: string[]; collections?: Record<string, IconifyCollection> }

// Line-art icons stencil poorly, because their thin strokes become thin plastic or fragile holes.
const LINE_NAME = /(^|-)(outline|outlined|line|linear|thin|light|duotone|stroke|broken)(-|$)/;

// iconSvg() renders one icon from its set's JSON as a black SVG of the given pixel height.
// Icon bodies paint with currentColor, so color="#000" on the root makes them black.
// ponytail: an alias takes its parent's shape and size overrides but ignores flip/rotate
// transforms, which are rare in icon search results.
export function iconSvg(set: IconSetData, name: string, height = 64): string | null {
  const alias = set.aliases?.[name];
  const icon = set.icons[alias ? alias.parent : name];
  if (!icon) return null;
  const w = alias?.width ?? icon.width ?? set.width ?? 16, h = alias?.height ?? icon.height ?? set.height ?? 16;
  const left = icon.left ?? set.left ?? 0, top = icon.top ?? set.top ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round((height * w) / h)}" height="${height}" viewBox="${left} ${top} ${w} ${h}" color="#000">${icon.body}</svg>`;
}

export function parseIconify(
  json: IconifySearch,
  sets: Record<string, IconSetData>,
  { solidOnly, start, pageSize }: { solidOnly: boolean; start: number; pageSize: number },
): SearchPage {
  const meta = json.collections ?? {};
  const items: DesignRef[] = [];
  for (const id of json.icons) {
    const [prefix, name] = id.split(':');
    const set = meta[prefix];
    if (solidOnly && (LINE_NAME.test(name) || set?.tags?.includes('Uses Stroke'))) continue;
    const data = sets[prefix] && iconSvg(sets[prefix], name, 1024);
    if (!data) continue;
    items.push({
      source: 'iconify',
      id,
      title: name.replace(/-/g, ' '),
      thumb: svgDataUrl(iconSvg(sets[prefix], name, 96)!),
      // The full SVG is kept in the mix, so a saved design never needs Iconify again.
      data,
      credit: {
        source: `Iconify · ${set?.name ?? prefix}`,
        author: set?.author?.name,
        license: set?.license?.title ?? set?.license?.spdx ?? 'see icon set',
        url: set?.license?.url ?? set?.author?.url,
      },
    });
  }
  return { items, next: json.icons.length === pageSize ? String(start + pageSize) : undefined };
}

const RATE_LIMITED = 'Iconify is limiting requests right now. Wait a few minutes and search again.';

async function fetchSets(names: string[]): Promise<Record<string, IconSetData>> {
  const byPrefix = new Map<string, string[]>();
  for (const id of names) {
    const [prefix, name] = id.split(':');
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  const sets: Record<string, IconSetData> = {};
  let limited = false;
  await Promise.all([...byPrefix].map(async ([prefix, icons]) => {
    const res = await fetch(`${API}/${prefix}.json?icons=${icons.map(encodeURIComponent).join(',')}`).catch(() => null);
    if (res?.ok) sets[prefix] = await res.json();
    else limited ||= !res || res.status === 429;
  }));
  if (limited && !Object.keys(sets).length) throw new Error(RATE_LIMITED);
  return sets;
}

export async function searchIconify(query: string, cursor: string | undefined, solidOnly: boolean): Promise<SearchPage> {
  const start = Number(cursor ?? 0);
  // Iconify treats limit as the end index and start as the offset into it.
  const res = await fetch(`${API}/search?query=${encodeURIComponent(query)}&palette=false&start=${start}&limit=${start + PAGE}`).catch(() => null);
  if (!res || res.status === 429) throw new Error(RATE_LIMITED);
  if (!res.ok) throw new Error(`Iconify search failed (${res.status})`);
  const json: IconifySearch = await res.json();
  return parseIconify(json, await fetchSets(json.icons), { solidOnly, start, pageSize: PAGE });
}

/** Returns a 1024 px black SVG for an icon id such as "mdi:flower". Mixes saved before SVGs were stored use this. */
export async function fetchIconSvg(id: string): Promise<string> {
  const svg = iconSvg((await fetchSets([id]))[id.split(':')[0]] ?? { prefix: '', icons: {} }, id.split(':')[1], 1024);
  if (!svg) throw new Error(`Icon ${id} not found`);
  return svg;
}

/** Shrinks a stored icon SVG to a 96 px thumbnail by rescaling its root width and height. */
export function iconSvgThumb(svg: string): string {
  const [, w, h] = svg.match(/^<svg[^>]* width="([\d.]+)" height="([\d.]+)"/) ?? [];
  return w && h ? svg.replace(`width="${w}" height="${h}"`, `width="${Math.round((96 * Number(w)) / Number(h))}" height="96"`) : svg;
}
