import data from './data/pattern-monster.json';
import { svgDataUrl, type DesignRef, type SearchPage } from './types';

// Pattern Monster's 330 seamless patterns (MIT) are vendored by scripts/vendor-pattern-monster.mjs.
interface PmPattern { slug: string; title: string; mode: string; width: number; height: number; stroke?: number; tags: string[]; layers: string[] }
const patterns = data as PmPattern[];
const bySlug = new Map(patterns.map((p) => [p.slug, p]));

// patternMonsterSvg() draws every colour layer in black, so the union of the layers becomes paint.
export function patternMonsterSvg(slug: string): string {
  const p = bySlug.get(slug);
  if (!p) throw new Error(`Unknown Pattern Monster pattern ${slug}`);
  const style = p.mode === 'fill'
    ? 'fill="#000" stroke="none"'
    : `fill="none" stroke="#000" stroke-width="${Math.max(1, (p.stroke ?? 2) / 2)}" stroke-linecap="square" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}"><g ${style}>${p.layers.join('')}</g></svg>`;
}

export function searchPatternMonster(query: string): SearchPage {
  const q = query.trim().toLowerCase();
  const hits = patterns.filter((p) => !q || p.title.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)));
  return {
    items: hits.map((p): DesignRef => ({
      source: 'patternmonster',
      id: p.slug,
      title: p.title,
      thumb: svgDataUrl(patternMonsterSvg(p.slug)),
      data: p.slug,
      texture: true,
      credit: { source: 'Pattern Monster', license: 'MIT', url: `https://pattern.monster/${p.slug}/` },
    })),
  };
}
