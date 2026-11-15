import type { Settings } from './state';
import type { RollerResult } from './pipeline';
import type { PlatePart } from './core/plate';

/** The file name for this roller's exports, without an extension. */
export const exportName = (s: Settings, r: RollerResult) =>
  `roller_${s.piece.name.replace(/\W+/g, '-').toLowerCase()}_${Math.round(r.roller.diameter)}x${Math.round(r.roller.length)}mm`;

/** The inside support's three parts, named for the slicer. Each STL is a copy, because a download gives its buffer away. */
export const supportPlateParts = (name: string, r: RollerResult): PlatePart[] => (r.support ? [
  { name: `${name}_support-roller`, stl: r.support.stl.slice(0) }, { name: `${name}_support-frame`, stl: r.support.frameStl.slice(0) },
  { name: `${name}_support-axle`, stl: r.support.axleStl.slice(0) }] : []);

/** Every part the result prints: the roller, then the handle and its axle, then the inside support. */
export const plateParts = (name: string, r: RollerResult): PlatePart[] => [{ name, stl: r.stl.slice(0) },
  ...(r.handle ? [{ name: `${name}_handle`, stl: r.handle.stl.slice(0) }, { name: `${name}_axle`, stl: r.handle.axleStl.slice(0) }] : []),
  ...supportPlateParts(name, r)];
