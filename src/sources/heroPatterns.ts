import * as hero from 'hero-patterns';
import { svgDataUrl, type DesignRef, type SearchPage } from './types';

// Hero Patterns by Steve Schoger (CC BY 4.0), packaged by the hero-patterns npm module (MIT).
// Each export is a function that returns url('data:image/svg+xml,…').
const fns = hero as unknown as Record<string, (color: string, opacity: number) => string>;
const names = Object.keys(fns).filter((k) => typeof fns[k] === 'function').sort();

const title = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export function heroPatternSvg(name: string): string {
  const css = fns[name]('#000', 1);
  return decodeURIComponent(css.slice(css.indexOf('data:image/svg+xml,') + 'data:image/svg+xml,'.length, css.lastIndexOf("')")));
}

export function searchHeroPatterns(query: string): SearchPage {
  const q = query.trim().toLowerCase();
  return {
    items: names.filter((n) => !q || title(n).toLowerCase().includes(q)).map((n): DesignRef => ({
      source: 'hero',
      id: n,
      title: title(n),
      thumb: svgDataUrl(heroPatternSvg(n)),
      data: n,
      texture: true,
      credit: { source: 'Hero Patterns', author: 'Steve Schoger', license: 'CC BY 4.0', url: 'https://heropatterns.com/' },
    })),
  };
}
