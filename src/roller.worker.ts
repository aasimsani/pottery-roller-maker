import { finishRoller, type Prepared, type RollerResult } from './pipeline';
import type { Settings } from './state';

// The roller worker runs finishRoller() off the page, so typing never waits on a rebuild.
// The geometry holds functions, which can't be posted back, so the page rebuilds it from result.gp.
export type WorkerResult = Omit<RollerResult, 'g'>;
export interface WorkerRequest { id: number; s: Settings; prepared: Prepared }
export type WorkerReply = { id: number; result: WorkerResult } | { id: number; error: string };

const ctx = self as unknown as { postMessage(m: WorkerReply, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

ctx.onmessage = ({ data: { id, s, prepared } }) => {
  try {
    const { g: _g, ...result } = finishRoller(s, prepared);
    // Hand the big arrays back without copying them.
    const arrays = [result.mask.solid, result.mask.inside, result.mask.frame, result.thinRelief, result.thinGaps];
    ctx.postMessage({ id, result }, [...arrays.map((a) => a.buffer as ArrayBuffer), result.stl, ...(result.handle ? [result.handle.stl, result.handle.axleStl] : [])]);
  } catch (e) {
    ctx.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
