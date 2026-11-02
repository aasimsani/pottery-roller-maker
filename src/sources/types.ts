export const svgDataUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

export type SourceId = 'builtin' | 'iconify' | 'commons' | 'smithsonian' | 'patternmonster' | 'hero' | 'upload';

export interface Credit {
  /** Where the design came from, e.g. "Iconify · Game Icons". */
  source: string;
  author?: string;
  license: string;
  url?: string;
}

/** A design the user can add to the mix. Every field is plain data, so a saved mix survives reloads. */
export interface DesignRef {
  source: SourceId;
  id: string;
  title: string;
  thumb: string;
  credit: Credit;
  /** A repeating texture fills the whole cell, while a motif is placed inside it. */
  texture?: boolean;
  /** Source-specific data that loadArt() needs, such as a full-size image URL. */
  data?: string;
}

export interface SearchPage {
  items: DesignRef[];
  /** Cursor for the next page, or undefined when there are no more results. */
  next?: string;
}
