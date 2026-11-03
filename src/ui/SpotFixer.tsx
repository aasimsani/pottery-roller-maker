import { useState } from 'react';
import { spotAt, type SpotAction } from '../core/fix';
import type { RollerResult } from '../pipeline';
import type { Settings, SpotFix } from '../state';

type Set = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

const ACTIONS: Record<SpotFix['kind'], [SpotAction, string][]> = {
  line: [['thicken', 'Thicken'], ['remove', 'Remove'], ['leave', 'Leave it']],
  gap: [['widen', 'Widen'], ['fill', 'Fill in'], ['leave', 'Leave it']],
};
const DONE: Record<SpotAction, string> = { thicken: 'Thickened', remove: 'Removed', widen: 'Widened', fill: 'Filled in', leave: 'Left' };
export const describeFix = (f: SpotFix) =>
  `${DONE[f.action]} ${f.kind === 'line' ? 'a thin raised line' : 'a narrow gap'}${f.action === 'thicken' || f.action === 'widen' ? ` by ${f.by} mm` : f.action === 'leave' ? ' as drawn' : ''}`;

// nearest() measures how far the closest pixel of a spot lies from the click, so a click between a thin line and a
// narrow gap picks the one it's nearer.
function nearest(px: number[] | null, w: number, x: number, y: number): number {
  if (!px) return Infinity;
  let d = Infinity;
  for (const k of px) d = Math.min(d, (k % w - x) ** 2 + (Math.floor(k / w) - y) ** 2);
  return d;
}

type Open = { kind: SpotFix['kind']; u: number; v: number } | { index: number };

/**
 * A click layer over the flat view. A click near a flagged spot opens a menu there, which fixes just that spot.
 * Each saved fix shows as a marker, and clicking a marker offers to undo it.
 */
export function SpotFixer({ r, s, set }: { r: RollerResult; s: Settings; set: Set }) {
  const [open, setOpen] = useState<Open | null>(null), [by, setBy] = useState(0), [miss, setMiss] = useState(false);
  const { w, h } = r.mask;

  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect(), u = (e.clientX - box.left) / box.width, v = (e.clientY - box.top) / box.height;
    const x = u * w, y = v * h;
    const line = nearest(spotAt(r.thinRelief, w, h, x, y), w, x, y), gap = nearest(spotAt(r.thinGaps, w, h, x, y), w, x, y);
    if (line === Infinity && gap === Infinity) { setOpen(null); setMiss(true); return; }
    const kind = line <= gap ? 'line' : 'gap';
    setMiss(false);
    setBy(kind === 'line' ? s.minPlastic : s.minHole);
    setOpen({ kind, u, v });
  };
  const apply = (action: SpotAction) => {
    if (!open || 'index' in open) return;
    set('spotFixes', [...s.spotFixes, { kind: open.kind, u: open.u, v: open.v, action, by: action === 'thicken' || action === 'widen' ? by : 0 }]);
    setOpen(null);
  };
  const at = open && ('index' in open ? s.spotFixes[open.index] : open);
  // The menu stays inside the view, so a spot near an edge still shows all of it.
  const place = (u: number, v: number) => ({ left: `${Math.min(80, Math.max(20, u * 100))}%`, top: `${v * 100}%` });

  return (
    <>
      <div className="spot-hit" onClick={click} aria-label="Click a flagged spot to fix just that one" />
      {s.spotFixes.map((f, i) => (
        <button key={i} className="spot-marker" style={{ left: `${f.u * 100}%`, top: `${f.v * 100}%` }} title={describeFix(f)}
          aria-label={`${describeFix(f)}. Click to undo.`} onClick={() => { setMiss(false); setOpen({ index: i }); }} />
      ))}
      {at && (
        <div className="spot-menu" role="dialog" aria-label="Fix this spot" style={place(at.u, at.v)}>
          <button className="icon spot-close" aria-label="Close" onClick={() => setOpen(null)}>×</button>
          {'index' in open! ? (
            <>
              <p><b>{describeFix(s.spotFixes[open.index])}</b></p>
              <button className="secondary small" onClick={() => { set('spotFixes', s.spotFixes.filter((_, k) => k !== open.index)); setOpen(null); }}>Undo this fix</button>
            </>
          ) : (
            <>
              <p><b>{open!.kind === 'line' ? 'Thin raised line' : 'Narrow gap'}</b>
                <span className="hint"> narrower than {open!.kind === 'line' ? s.minPlastic : s.minHole} mm</span></p>
              <label className="spot-by">By
                <span className="u" data-u="mm"><input type="number" min={0.1} max={5} step={0.1} value={by} onChange={(e) => setBy(Math.max(0.1, e.target.valueAsNumber || 0.1))} /></span>
              </label>
              <div className="row-actions">
                {ACTIONS[open!.kind].map(([a, label]) => <button key={a} className={a === 'leave' ? 'secondary small' : 'small'} onClick={() => apply(a)}>{label}</button>)}
              </div>
              <p className="hint">{open!.kind === 'line' ? 'Thicken adds the amount to the line\'s width. Remove drops the line.' : 'Widen adds the amount to the gap\'s width. Fill in joins the parts either side.'} Leave it keeps the spot as drawn and stops the warning.</p>
            </>
          )}
        </div>
      )}
      {miss && <p className="spot-miss hint" role="status">No flagged spot there. Click on a red or purple mark.</p>}
    </>
  );
}
