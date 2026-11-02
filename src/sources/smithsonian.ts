import type { DesignRef, SearchPage } from './types';

// Smithsonian Open Access releases millions of images as CC0. The API needs a free
// api.data.gov key. DEMO_KEY works without signing up, but it allows only a few searches per hour.
// Docs: https://edan.si.edu/openaccess/apidocs/
const API = 'https://api.si.edu/openaccess/api/v1.0/search';
const PAGE = 30;
export const SMITHSONIAN_KEY_URL = 'https://api.data.gov/signup/';

/** Asks the image service for a max-pixel rendering. Some image URLs already carry an ?id= query. */
export const siImageUrl = (url: string, max: number) => `${url}${url.includes('?') ? '&' : '?'}max=${max}`;

interface SiMedia { type?: string; content?: string; usage?: { access?: string } }
interface SiRow {
  id: string;
  title: string;
  content?: {
    descriptiveNonRepeating?: { record_link?: string; data_source?: string; online_media?: { media?: SiMedia[] } };
    freetext?: { name?: { content?: string }[] };
  };
}
interface SiSearch { response?: { rows?: SiRow[]; rowCount?: number } }

export function parseSmithsonian(json: SiSearch, start: number, pageSize: number): SearchPage {
  const rows = json.response?.rows ?? [];
  const items: DesignRef[] = [];
  for (const r of rows) {
    const d = r.content?.descriptiveNonRepeating;
    const media = d?.online_media?.media?.find((m) => m.type === 'Images' && m.usage?.access === 'CC0' && m.content);
    if (!media?.content) continue;
    items.push({
      source: 'smithsonian',
      id: r.id,
      title: r.title,
      thumb: siImageUrl(media.content, 240),
      data: media.content,
      credit: {
        source: `Smithsonian · ${d?.data_source ?? 'Open Access'}`,
        author: r.content?.freetext?.name?.[0]?.content,
        license: 'CC0',
        url: d?.record_link,
      },
    });
  }
  const more = rows.length === pageSize && start + pageSize < (json.response?.rowCount ?? 0);
  return { items, next: more ? String(start + pageSize) : undefined };
}

export async function searchSmithsonian(query: string, cursor: string | undefined, apiKey: string): Promise<SearchPage> {
  const start = Number(cursor ?? 0);
  const q = `${query} AND online_media_type:Images`;
  const res = await fetch(`${API}?q=${encodeURIComponent(q)}&start=${start}&rows=${PAGE}&api_key=${encodeURIComponent(apiKey || 'DEMO_KEY')}`);
  if (res.status === 429) throw new Error('Smithsonian rate limit reached. Add your own free API key to search more.');
  if (!res.ok) throw new Error(`Smithsonian search failed (${res.status})`);
  return parseSmithsonian(await res.json(), start, PAGE);
}
