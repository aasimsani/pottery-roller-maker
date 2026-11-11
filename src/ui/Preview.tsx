import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Settings } from '../state';
import type { RollerResult } from '../pipeline';
import { BED_MARGIN } from '../checks';
import { drawRoller } from '../render/preview';
import type { PieceMode } from './Piece3D';
import { useDialog } from './dialog';
import { registerViewMode } from '../mcp/viewMode';
import { describeFix, SpotFixer } from './SpotFixer';

// three.js is about 600 kB, so the 3D view loads after the rest of the page.
const Piece3D = lazy(() => import('./Piece3D'));
const PrintView = lazy(() => import('./PrintView'));

interface Props {
  s: Settings;
  result: RollerResult | null;
  error: string;
  loading: number;
  /** True while the worker rebuilds the roller. */
  updating: boolean;
  onStl: () => void;
  /** Downloads the roller with its handle and axle, on one 3MF plate. */
  onAll: () => void;
  /** Adds the exact STL that Download STL saves to the plate. */
  onAddToPlate: () => void;
  onPng: (canvas: HTMLCanvasElement) => void;
  onPaint: (color: string) => void;
  /** Turns on a repair the print check offers, or turns it off again with 'off'. */
  onFix: (key: 'fixLines' | 'fixGaps' | 'shape', value: string) => void;
  /** Sets any setting. The spot fixes and the fix amounts use it. */
  onSet: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

// describe() is the spoken summary of the roller, for the previews' text alternatives.
function describe(r: RollerResult, s: Settings): string {
  const errors = r.checks.filter((c) => c.level === 'error').length;
  return `A roller ${r.roller.diameter.toFixed(0)} mm across and ${r.roller.length.toFixed(0)} mm long for ${s.piece.name}, ${errors ? `${errors} print check error${errors > 1 ? 's' : ''}` : 'passing the print check'}.`;
}

export function Preview({ s, result, error, loading, updating, onStl, onAll, onAddToPlate, onPng, onPaint, onFix, onSet }: Props) {
  const flat = useRef<HTMLCanvasElement>(null), dialog = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<PieceMode>('painted');
  const [expanded, setExpanded] = useState(false);
  const [showProblems, setShowProblems] = useState(true);
  const [theme, setTheme] = useState(0);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)'), bump = () => setTheme((t) => t + 1);
    mq.addEventListener('change', bump);
    return () => mq.removeEventListener('change', bump);
  }, []);
  useDialog(dialog, expanded, () => setExpanded(false));
  useEffect(() => { registerViewMode(setMode); return () => registerViewMode(null); }, []);

  useEffect(() => {
    if (!result || !flat.current) return;
    drawRoller(flat.current, result.mask, showProblems ? { relief: result.thinRelief, gaps: result.thinGaps } : undefined);
  }, [result, showProblems, theme]);

  const r = result;
  const label = r ? describe(r, s) : '';
  const fits = !!r && !r.checks.some((c) => c.id === 'bed');
  // The print view rebuilds its scene when its parts change, so the list keeps one identity per result.
  const extras = useMemo(() => (r?.handle ? [r.handle.stl, r.handle.axleStl] : undefined), [r]);
  const view = (className: string) => (
    <Suspense fallback={<div className={`${className} loading`}>Loading 3D…</div>}>
      {mode === 'painted'
        ? <Piece3D s={s} result={r!} className={className} label={`3D view of ${s.piece.name} after rolling. ${label}`} />
        : mode === 'roller'
          ? <PrintView stl={r!.stl} bedW={s.bedW} bedD={s.bedD} lying className={className} label={`3D view of the roller. ${label}`} />
          : fits ? <PrintView stl={r!.stl} extras={extras} bedW={s.bedW} bedD={s.bedD} className={className} label={`Print file on the bed${r!.handle ? ', with the handle and the axle' : ''}: ${label}`} />
            : <div className={`${className} loading`}>No print file: it doesn't fit the bed.</div>}
    </Suspense>
  );
  const printInfo = mode === 'print' && r && fits && (
    <p className="hint">
      {(new DataView(r.stl).getUint32(80, true)).toLocaleString()} triangles, {(r.stl.byteLength / 1e6).toFixed(1)} MB, standing on a {s.bedW} × {s.bedD} mm bed.
    </p>
  );

  const modeToggle = (
    <div className="seg" role="group" aria-label="3D view">
      <button aria-pressed={mode === 'painted'} className={mode === 'painted' ? 'on' : ''} onClick={() => setMode('painted')}>On the pot</button>
      <button aria-pressed={mode === 'roller'} className={mode === 'roller' ? 'on' : ''} onClick={() => setMode('roller')}>Roller</button>
      <button aria-pressed={mode === 'print'} className={mode === 'print' ? 'on' : ''} onClick={() => setMode('print')} title="The exact STL that Download STL saves, on the printer bed">Print file</button>
    </div>
  );

  const errors = r ? r.checks.filter((c) => c.level === 'error').length : 0, warns = r ? r.checks.length - errors : 0;
  // Strict mode holds back the STL while the print check finds errors, with a deliberate override.
  const blocked = !!r && s.strict && errors > 0;

  return (
    <section className="panel preview" aria-labelledby="preview-title">
      <div className="previews">
        <div>
          <h2 id="preview-title">Roller, unrolled</h2>
          <div className="flat-wrap">
            <canvas ref={flat} className="flat" role="img" aria-label={label ? `Flat view of ${label}` : 'Roller preview'} />
            {r && <SpotFixer r={r} s={s} set={onSet} />}
          </div>
          {r && (
            <div className="legend">
              <span><i style={{ background: 'var(--plastic)' }} />raised relief</span>
              <span><i className="hole-swatch" />low base</span>
              {showProblems && r.thinRelief.some((v) => v === 1) && <span><i style={{ background: 'var(--island)' }} />raised line too thin</span>}
              {showProblems && r.thinGaps.some((v) => v === 1) && <span><i style={{ background: 'var(--thin-hole)' }} />gap too narrow</span>}
              {(r.thinRelief.some((v) => v === 1) || r.thinGaps.some((v) => v === 1)) && <span>Click a red or purple spot to fix just that one.</span>}
            </div>
          )}
        </div>
        <div>
          <div className="piece-head">
            <h2>On the piece</h2>
            <button className="secondary small" onClick={() => setExpanded(true)} disabled={!r}>Expand</button>
          </div>
          {r && view('piece3d')}
          <div className="view-row">
            {modeToggle}
            {s.use === 'underglaze' && <label className="swatch-field">Paint <input type="color" value={s.paintColor} onChange={(e) => onPaint(e.target.value)} /></label>}
          </div>
          {printInfo}
          <p className="hint">Drag to rotate, scroll to zoom.</p>
        </div>
      </div>

      <p className="spec" role="status">
        {error && <span className="warn">{error}</span>}
        {loading > 0 && <span>Loading {loading} design{loading > 1 ? 's' : ''}…</span>}
        {updating && <span className="updating">Updating…</span>}
        {r && (
          <>
            <span>Roller <b>Ø{r.roller.outline ? `${r.roller.minD.toFixed(1)}–${r.roller.maxD.toFixed(1)}` : r.roller.diameter.toFixed(1)} × {r.roller.axial.toFixed(1)} mm</b>, {Math.round(s.laps)} turn{Math.round(s.laps) > 1 ? 's' : ''} per lap</span>
            <span>{fits ? 'fits the bed standing up' : 'too big for the bed'}</span>
            <span>{s.depth} mm relief, about {Math.round(r.grams)} g PETG</span>
            {r.handle && <span>Handle <b>{r.handle.size[0].toFixed(0)} × {r.handle.size[1].toFixed(0)} mm</b>, prints flat</span>}
          </>
        )}
      </p>

      {r && (
        <>
          <div className="checks-head">
            <h2>Print check</h2>
            <span role="status" aria-live="polite" className={errors ? 'warn' : warns ? 'caution' : 'ok'}>
              {errors ? `${errors} error${errors > 1 ? 's' : ''}` : 'no errors'}{warns ? `, ${warns} warning${warns > 1 ? 's' : ''}` : ''}
            </span>
            <label className="check"><input type="checkbox" checked={showProblems} onChange={(e) => setShowProblems(e.target.checked)} /> Show problems on the roller</label>
          </div>
          <ul className="checks">
            {r.checks.length === 0 && <li className="pass"><span aria-hidden="true">✓</span>Ready to print: nothing thinner than {s.minPlastic} mm, and it stands on the bed with {BED_MARGIN} mm to spare.</li>}
            {r.checks.map((c) => (
              <li key={c.id} className={c.level}>
                <span aria-hidden="true">{c.level === 'error' ? '✕' : '⚠'}</span>
                <span>
                  <span className="visually-hidden">{c.level === 'error' ? 'Error: ' : 'Warning: '}</span>{c.message}
                  {c.fixes && <span className="row-actions">{c.fixes.map((f) => (
                    <button key={f.value} className="secondary small" onClick={() => onFix(f.key, f.value)}>{f.label}</button>
                  ))}</span>}
                </span>
              </li>
            ))}
            {s.shape === 'pot' && (
              <li className="note"><span aria-hidden="true">•</span>
                <span>Shaped the roller to the pot's wall, so it touches along the whole band.{' '}
                  <button className="secondary small" onClick={() => onFix('shape', 'straight')}>Undo</button></span></li>
            )}
            {s.fixLines !== 'off' && (
              <li className="note"><span aria-hidden="true">•</span>
                <span>{s.fixLines === 'thicken' ? 'Thickened' : 'Removed'} {r.fixed.lines} thin raised line{r.fixed.lines === 1 ? '' : 's'}
                  {s.fixLines === 'thicken' && <> by <input className="by" type="number" min={0.1} max={5} step={0.1} aria-label="Thicken by, in mm" value={s.fixLinesBy || s.minPlastic} onChange={(e) => onSet('fixLinesBy', e.target.valueAsNumber || 0)} /> mm</>}.{' '}
                  <button className="secondary small" onClick={() => onFix('fixLines', 'off')}>Undo</button></span></li>
            )}
            {s.fixGaps !== 'off' && (
              <li className="note"><span aria-hidden="true">•</span>
                <span>{s.fixGaps === 'fill' ? 'Filled in' : 'Widened'} {r.fixed.gaps} narrow gap{r.fixed.gaps === 1 ? '' : 's'}
                  {s.fixGaps === 'widen' && <> by <input className="by" type="number" min={0.1} max={5} step={0.1} aria-label="Widen by, in mm" value={s.fixGapsBy || s.minHole} onChange={(e) => onSet('fixGapsBy', e.target.valueAsNumber || 0)} /> mm</>}.{' '}
                  <button className="secondary small" onClick={() => onFix('fixGaps', 'off')}>Undo</button></span></li>
            )}
            {s.spotFixes.length > 0 && (
              <li className="note"><span aria-hidden="true">•</span>
                <span>{s.spotFixes.length} spot fix{s.spotFixes.length === 1 ? '' : 'es'}, {r.fixed.spots} on a flagged spot now: {s.spotFixes.map(describeFix).join('; ')}. Click a marker on the roller to undo one.{' '}
                  <button className="secondary small" onClick={() => onSet('spotFixes', [])}>Clear all</button></span></li>
            )}
          </ul>
        </>
      )}
      <div className="actions">
        <button onClick={onStl} disabled={!r || !fits || blocked} title={blocked ? 'Fix the print check errors first' : undefined}>Download STL</button>
        {blocked && fits && <button className="secondary" onClick={onStl}>Download anyway</button>}
        {r?.handle && <button className="secondary" onClick={onAll} disabled={!fits || blocked}>Download roller + handle (.3mf)</button>}
        <button className="secondary" onClick={onAddToPlate} disabled={!r || !fits || blocked}>{r?.handle ? 'Add roller + handle to plate' : 'Add to plate'}</button>
        <button className="secondary" onClick={() => flat.current && onPng(flat.current)} disabled={!r}>Download flat PNG</button>
      </div>

      {expanded && r && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setExpanded(false)}>
          <div className="modal-body" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="dialog-3d-title" tabIndex={-1}>
            <div className="modal-head">
              <h2 id="dialog-3d-title">On the piece</h2>
              {modeToggle}
              <span className="hint">Drag to rotate, scroll to zoom, right-drag to pan.</span>
              <button className="secondary small" onClick={() => setExpanded(false)}>Close</button>
            </div>
            {view('piece3d-large')}
            {printInfo}
          </div>
        </div>
      )}

      <details className="tips">
        <summary>Printing &amp; rolling tips</summary>
        <ul>
          <li><b>Print standing on its end</b>, exactly as exported, with supports off. The relief then prints as clean walls rather than steps.</li>
          <li><b>Hollow or solid:</b> the Print section shows the filament for both. A hollow drum has a 45° cone roof, so nothing bridges. For a solid drum, Lightning infill uses the least filament.</li>
          <li><b>Fine lines:</b> a 0.2 mm nozzle keeps them crisp. With a 0.4 mm nozzle, keep raised lines and gaps at least 0.8 mm wide.</li>
          <li><b>PETG or PLA:</b> both work. PLA strings less and gives crisper relief, and PETG takes knocks in the studio better.</li>
          <li><b>Handle:</b> turn on <b>Print a handle</b> under Handle, then use <b>Download roller + handle</b>. The handle prints flat, and the axle prints standing on its head. Push the axle through one arm, the roller and the other arm. An 8 mm dowel works instead of the printed axle.</li>
          <li><b>Curved or tapered pots:</b> set <b>Shape</b> to <b>shaped to the pot</b> under Roller. The roller's side then follows the wall, so it touches along the whole band. Hold the end that printed on the bed toward the pot's base.</li>
          <li><b>Texture:</b> roll soft, leather-firm clay. Dust the roller with cornstarch, or mist the clay, so it doesn't stick.</li>
          <li><b>Underglaze:</b> load the raised tops thinly with a sponge or brayer, then roll once onto leather-hard clay with light, even pressure.</li>
          <li><b>Round a pot:</b> start at a pencil mark and roll the set number of turns. The pattern meets itself at the mark. Pencil burns off in the kiln.</li>
          <li>A straight roller only rolls cleanly on a straight wall. On a tapered pot, roll a slab and build with it instead.</li>
        </ul>
      </details>
    </section>
  );
}
