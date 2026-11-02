import type { Settings } from './state';
import type { RollerResult } from './pipeline';

/** The file name for this roller's exports, without an extension. */
export const exportName = (s: Settings, r: RollerResult) =>
  `roller_${s.piece.name.replace(/\W+/g, '-').toLowerCase()}_${Math.round(r.roller.diameter)}x${Math.round(r.roller.length)}mm`;
