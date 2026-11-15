import { expect, it } from 'vitest';
import { makeHandlers, type TabApi } from './tab';
import { DEFAULTS } from '../state';
import type { RollerResult } from '../pipeline';

// fakeApp() rebuilds the way the App does when a design layer is added: one build while the art loads,
// then a second build once it has loaded. Each build takes 100 ms.
function fakeApp() {
  let gen = 0, renderedGen = 0, loading = 0, grams = 1;
  const result = () => ({ roller: { diameter: 40, length: 70, potD: 80, taper: 0 }, grams, otherGrams: grams, checks: [], fixed: { lines: 0, gaps: 0 }, layerInfo: new Map() }) as unknown as RollerResult;
  const build = (g: number, next: number) => setTimeout(() => { renderedGen = g; grams = next; }, 100);
  const api: TabApi = {
    get: () => ({ s: DEFAULTS, layers: [], result: result(), updating: renderedGen !== gen, error: '', loading, renderedGen }),
    gen: () => gen,
    commit: () => {
      const first = ++gen; loading = 1; build(first, 2);
      setTimeout(() => { const second = ++gen; loading = 0; build(second, 3); }, 150);
    },
    download: () => {},
    baseName: () => 'roller',
  };
  return api;
}

it("waits for the build that includes the new design's art before it replies", async () => {
  const h = makeHandlers(fakeApp());
  const reply = (await h.apply({ ops: [{ op: 'settings', patch: { depth: 2 } }] } as never)) as { grams: number };
  expect(reply.grams).toBe(3);
});

it("leaves a shaped roller's outline out of replies, because it is hundreds of numbers Claude never reads", async () => {
  const api = fakeApp(), get = api.get;
  api.get = () => { const g = get(); return { ...g, result: { ...g.result!, roller: { ...g.result!.roller, minD: 38, maxD: 42, outline: { t: [0, 1], r: [19, 21] } } } as never }; };
  const state = (await makeHandlers(api).getState({} as never)) as { summary: { roller: Record<string, unknown> } };
  expect(state.summary.roller.minD).toBe(38);
  expect(state.summary.roller).not.toHaveProperty('outline');
});
