import { DEFAULTS, type Settings } from '../state';
import { newDesignLayer, newLinesLayer, type Layer } from '../layers';
import type { Check } from '../checks';
import type { DesignRef } from '../sources/types';

/** Everything Claude can change, in one value. Layers run bottom first, so index 0 is the bottom layer. */
export interface DesignState { settings: Settings; layers: Layer[] }

export type Op =
  | { op: 'settings'; patch: Record<string, unknown> }
  | { op: 'addLayer'; kind: 'lines' }
  | { op: 'addLayer'; kind: 'design'; ref: DesignRef }
  | { op: 'updateLayer'; id: string; patch: Record<string, unknown> }
  | { op: 'removeLayer'; id: string }
  | { op: 'moveLayer'; id: string; to: number }
  | { op: 'fix'; key: string; value: string }
  | { op: 'spotFix'; fix: Record<string, unknown> }
  | { op: 'removeSpotFix'; index: number };

export class OpError extends Error {}

// Fields whose strings must be one of a few values. The type check alone would let a typo through.
const ENUMS: Record<string, string[]> = {
  use: ['texture', 'underglaze'], fixLines: ['off', 'thicken', 'remove'], fixGaps: ['off', 'fill', 'widen'],
  'build.kind': ['hollow', 'solid'], blend: ['paint', 'cut'], arrange: ['grid', 'scatter'],
  'lines.style': ['solid', 'dashed', 'dotted', 'wavy'],
};
// A layer's id and kind belong to the layer, so a patch can't change them.
const { id: _id, kind: _kind, ...LAYER_SHAPE } = newLinesLayer();

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// closest() finds the known name a typo most likely meant, within 3 edits.
function closest(word: string, names: string[]): string | undefined {
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const best = names.map((n) => [n, dist(word.toLowerCase(), n.toLowerCase())] as const).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= 3 ? best[0] : undefined;
}

// merge() checks a patch against the shape of the defaults and folds it into base. Objects merge key by key,
// so a partial patch keeps the fields it doesn't name. Arrays and plain values replace what was there.
function merge(base: unknown, patch: unknown, shape: unknown, name: string): unknown {
  if (isObject(shape)) {
    if (!isObject(patch)) throw new OpError(`${name || 'The patch'} must be an object.`);
    const out: Record<string, unknown> = { ...(isObject(base) ? base : {}) };
    for (const [k, v] of Object.entries(patch)) {
      const full = name ? `${name}.${k}` : k;
      if (!(k in shape)) {
        const guess = closest(k, Object.keys(shape));
        throw new OpError(`Unknown setting: ${full}.${guess ? ` Did you mean ${name ? `${name}.` : ''}${guess}?` : ''}`);
      }
      out[k] = merge(isObject(base) ? base[k] : undefined, v, shape[k], full);
    }
    return out;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(patch)) throw new OpError(`${name} must be a list.`);
    return patch;
  }
  if (typeof shape === 'number' && !(typeof patch === 'number' && Number.isFinite(patch))) throw new OpError(`${name} must be a number.`);
  if (typeof patch !== typeof shape) throw new OpError(`${name} must be a ${typeof shape}.`);
  const allowed = ENUMS[name.replace(/^lines\./, 'lines.')];
  if (allowed && !allowed.includes(patch as string)) throw new OpError(`${name} must be one of ${allowed.join(', ')}.`);
  return patch;
}

const find = (layers: Layer[], id: string) => {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) throw new OpError(`No layer has the id ${id}. Call get_state to see the layers.`);
  return i;
};

// applyOps() applies a batch of changes to a copy of the design. It never touches the state it was given,
// so when any change in the batch is bad, it throws and the design stays exactly as it was.
export function applyOps(state: DesignState, ops: Op[], ctx: { checks: Check[] }): DesignState {
  let settings = state.settings, layers = state.layers;
  for (const o of ops) {
    switch (o.op) {
      case 'settings': settings = merge(settings, o.patch, DEFAULTS, '') as Settings; break;
      case 'addLayer': layers = [...layers, o.kind === 'design' ? newDesignLayer(o.ref) : newLinesLayer()]; break;
      case 'updateLayer': {
        const i = find(layers, o.id);
        layers = layers.map((l, k) => (k === i ? (merge(l, o.patch, LAYER_SHAPE, '') as Layer) : l));
        break;
      }
      case 'removeLayer': { const i = find(layers, o.id); layers = layers.filter((_, k) => k !== i); break; }
      case 'moveLayer': {
        const i = find(layers, o.id), rest = layers.filter((_, k) => k !== i), to = Math.max(0, Math.min(rest.length, Math.round(o.to)));
        layers = [...rest.slice(0, to), layers[i], ...rest.slice(to)];
        break;
      }
      case 'fix': {
        const offered = ctx.checks.some((c) => c.fixes?.some((f) => f.key === o.key && f.value === o.value));
        if (!offered) throw new OpError(`The print check doesn't offer ${o.key} = ${o.value} right now. Call get_state to see the fixes on offer.`);
        settings = { ...settings, [o.key]: o.value };
        break;
      }
      case 'spotFix': {
        const f = o.fix ?? {}, kind = f.kind, action = f.action, u = Number(f.u), v = Number(f.v), by = Number(f.by ?? 0);
        const actions = kind === 'line' ? ['thicken', 'remove', 'leave'] : kind === 'gap' ? ['widen', 'fill', 'leave'] : null;
        if (!actions) throw new OpError('A spot fix needs kind "line" or "gap".');
        if (!actions.includes(String(action))) throw new OpError(`A ${kind} spot fix's action must be one of ${actions.join(', ')}.`);
        if (!(u >= 0 && u <= 1) || !(v >= 0 && v <= 1)) throw new OpError('A spot fix needs u and v between 0 and 1, as shares across and down the pattern.');
        if (!(by >= 0 && by <= 10)) throw new OpError('A spot fix\'s by must be between 0 and 10 mm.');
        settings = { ...settings, spotFixes: [...settings.spotFixes, { kind, u, v, action, by } as Settings['spotFixes'][number]] };
        break;
      }
      case 'removeSpotFix': {
        const i = Math.round(Number(o.index));
        if (!(i >= 0 && i < settings.spotFixes.length)) throw new OpError(`No spot fix has the index ${o.index}. There are ${settings.spotFixes.length}, numbered from 0.`);
        settings = { ...settings, spotFixes: settings.spotFixes.filter((_, k) => k !== i) };
        break;
      }
      default: throw new OpError(`Unknown change: ${(o as { op: string }).op}.`);
    }
  }
  return { settings, layers };
}
