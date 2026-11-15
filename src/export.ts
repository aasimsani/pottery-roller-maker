import type { Settings } from './state';
import type { RollerResult } from './pipeline';
import type { PlatePart } from './core/plate';

/** The file name for this roller's exports, without an extension. */
export const exportName = (s: Settings, r: RollerResult) =>
  `roller_${s.piece.name.replace(/\W+/g, '-').toLowerCase()}_${Math.round(r.roller.diameter)}x${Math.round(r.roller.length)}mm`;

/** The caliper's smooth roller, yoke, slider, axles and two spare pins, named for the slicer. Each STL is a copy, because a download gives its buffer away. */
export const supportPlateParts = (name: string, r: RollerResult): PlatePart[] => {
  const x = r.support;
  if (!x) return [];
  return [
    { name: `${name}_support-roller`, stl: x.stl.slice(0) }, { name: `${name}_yoke`, stl: x.yokeStl.slice(0) }, { name: `${name}_slider`, stl: x.sliderStl.slice(0) },
    { name: `${name}_axle-outer`, stl: x.outerAxleStl.slice(0) }, { name: `${name}_axle-inner`, stl: x.innerAxleStl.slice(0) },
    { name: `${name}_pin-1`, stl: x.pinStl.slice(0) }, { name: `${name}_pin-2`, stl: x.pinStl.slice(0) },
  ];
};

/** Every part the result prints: the roller, then the handle and its axle, then the inside support. */
export const plateParts = (name: string, r: RollerResult): PlatePart[] => [{ name, stl: r.stl.slice(0) },
  ...(r.handle ? [{ name: `${name}_handle`, stl: r.handle.stl.slice(0) }, { name: `${name}_axle`, stl: r.handle.axleStl.slice(0) }] : []),
  ...supportPlateParts(name, r)];
