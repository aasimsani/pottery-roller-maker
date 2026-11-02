import { describe, expect, it } from 'vitest';
import { applyOps, type DesignState } from './ops';
import { DEFAULTS } from '../state';
import { newLinesLayer } from '../layers';
import type { Check } from '../checks';

const start = (): DesignState => ({ settings: { ...DEFAULTS }, layers: [{ ...newLinesLayer(), id: 'L1' }] });
const offered: Check[] = [{ id: 'thin-gaps', level: 'warn', message: '', fixes: [{ label: 'Fill them in', key: 'fixGaps', value: 'fill' }] }];
const ctx = { checks: offered };

describe('applyOps', () => {
  it('rejects an unknown setting and names the closest one', () => {
    expect(() => applyOps(start(), [{ op: 'settings', patch: { dept: 2 } }], ctx)).toThrow(/dept.*depth/);
  });
  it('rejects a setting of the wrong type', () => {
    expect(() => applyOps(start(), [{ op: 'settings', patch: { depth: '2' } }], ctx)).toThrow(/depth/);
  });
  it('keeps the build fields a nested patch does not name', () => {
    const s = applyOps(start(), [{ op: 'settings', patch: { build: { kind: 'solid' } } }], ctx).settings;
    expect(s.build).toEqual({ ...DEFAULTS.build, kind: 'solid' });
  });
  it('applies a whole batch, or leaves the design as it was when one change is bad', () => {
    const before = start();
    expect(() => applyOps(before, [{ op: 'settings', patch: { depth: 2 } }, { op: 'updateLayer', id: 'nope', patch: {} }], ctx)).toThrow(/nope/);
    expect(before.settings.depth).toBe(DEFAULTS.depth);
    const after = applyOps(before, [{ op: 'settings', patch: { depth: 2 } }, { op: 'updateLayer', id: 'L1', patch: { grow: 0.3 } }], ctx);
    expect([after.settings.depth, after.layers[0].grow]).toEqual([2, 0.3]);
  });
  it('checks layer fields too, including the nested lines', () => {
    expect(() => applyOps(start(), [{ op: 'updateLayer', id: 'L1', patch: { size: 'big' } }], ctx)).toThrow(/size/);
    const l = applyOps(start(), [{ op: 'updateLayer', id: 'L1', patch: { lines: { thickness: 3 } } }], ctx).layers[0];
    expect(l.lines).toEqual({ ...newLinesLayer().lines, thickness: 3 });
  });
  it('adds, moves and removes layers', () => {
    let s = applyOps(start(), [{ op: 'addLayer', kind: 'lines' }], ctx);
    expect(s.layers).toHaveLength(2);
    s = applyOps(s, [{ op: 'moveLayer', id: 'L1', to: 1 }], ctx);
    expect(s.layers[1].id).toBe('L1');
    expect(applyOps(s, [{ op: 'removeLayer', id: 'L1' }], ctx).layers.map((l) => l.id)).not.toContain('L1');
  });
  it('only presses fixes the print check offered', () => {
    expect(applyOps(start(), [{ op: 'fix', key: 'fixGaps', value: 'fill' }], ctx).settings.fixGaps).toBe('fill');
    expect(() => applyOps(start(), [{ op: 'fix', key: 'fixLines', value: 'thicken' }], ctx)).toThrow(/offer/);
  });
});
