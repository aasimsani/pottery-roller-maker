import type { DesignRef, SearchPage } from './types';

// Wikimedia Commons hosts the Biodiversity Heritage Library's scanned illustrations, plus
// a large set of SVG clip art. Its API needs no key, and origin=* enables cross-origin calls.
const API = 'https://commons.wikimedia.org/w/api.php';
const PAGE = 30;

export type CommonsKind = 'art' | 'clipart';

interface CommonsPage {
  title: string;
  index?: number;
  imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
}
interface CommonsSearch { query?: { pages?: Record<string, CommonsPage> }; continue?: { gsroffset?: number } }

const stripTags = (html = '') => {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'") || undefined;
};

export function parseCommons(json: CommonsSearch): SearchPage {
  const pages = Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const items: DesignRef[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const meta = info.extmetadata ?? {};
    items.push({
      source: 'commons',
      id: p.title,
      title: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
      thumb: info.thumburl,
      data: p.title,
      credit: {
        source: 'Wikimedia Commons',
        author: stripTags(meta.Artist?.value),
        license: stripTags(meta.LicenseShortName?.value) ?? 'see file page',
        url: info.descriptionurl,
      },
    });
  }
  return { items, next: json.continue?.gsroffset !== undefined ? String(json.continue.gsroffset) : undefined };
}

export async function searchCommons(query: string, cursor: string | undefined, kind: CommonsKind, bhlOnly: boolean): Promise<SearchPage> {
  const terms = [query, kind === 'clipart' ? 'filetype:drawing' : 'filetype:bitmap', bhlOnly ? '"Biodiversity Heritage Library"' : ''];
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6',
    gsrsearch: terms.filter(Boolean).join(' '), gsrlimit: String(PAGE), gsroffset: cursor ?? '0',
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '240',
    iiextmetadatafilter: 'LicenseShortName|Artist',
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Wikimedia Commons search failed (${res.status})`);
  return parseCommons(await res.json());
}

/** Looks up a 1600 px rendering of a Commons file. SVG files come back rasterised as PNG. */
export async function commonsImageUrl(title: string): Promise<string> {
  const params = new URLSearchParams({ action: 'query', format: 'json', origin: '*', titles: title, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '1600' });
  const json: CommonsSearch = await (await fetch(`${API}?${params}`)).json();
  const info = Object.values(json.query?.pages ?? {})[0]?.imageinfo?.[0];
  const url = info?.thumburl ?? info?.url;
  if (!url) throw new Error(`No image found for ${title}`);
  return url;
}
