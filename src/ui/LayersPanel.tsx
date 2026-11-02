import { useState } from 'react';
import type { Layer } from '../layers';
import { newLinesLayer } from '../layers';
import type { LayerInfo } from '../pipeline';
import { refKey } from '../render/art';
import { CheckField, NumberField, RangeField, SelectField } from './fields';

interface Props {
  layers: Layer[];
  setLayers: (fn: (prev: Layer[]) => Layer[]) => void;
  info: Map<string, LayerInfo>;
  errors: Map<string, string>;
  onAutoThreshold: (id: string) => void;
  /** Opens the design library. */
  onAddDesign: () => void;
}

const LINES_THUMB = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" fill="#fbf8f3"/><path d="M4 16h48M4 40h48" stroke="#2a2622" stroke-width="4"/></svg>')}`;

// LayersPanel lists layers top first, like a drawing app. The array itself runs bottom first,
// because that is the order buildMask() composites them in.
export function LayersPanel({ layers, setLayers, info, errors, onAutoThreshold, onAddDesign }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const update = (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const move = (id: string, dir: 1 | -1) => setLayers((ls) => {
    const i = ls.findIndex((l) => l.id === id), j = i + dir;
    if (j < 0 || j >= ls.length) return ls;
    const next = [...ls]; [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const credits = [...new Map(layers.flatMap((l) => (l.ref ? [[`${l.ref.credit.source}|${l.ref.credit.author}|${l.ref.credit.license}`, l.ref] as const] : []))).values()];

  return (
    <section className="panel mix">
      <div className="layers-head">
        <h2>Layers</h2>
        <span className="row-actions">
          <button className="small" onClick={onAddDesign}>+ Add design</button>
          <button className="secondary small" onClick={() => setLayers((ls) => [...ls, newLinesLayer()])}>+ Lines</button>
        </span>
      </div>
      <p className="hint">Each layer repeats on its own. Layers higher in the list paint on top. A design you add becomes the new top layer.</p>
      {layers.length === 0 && <p className="hint">No layers yet. Add a design or lines to start.</p>}
      <ul className="items">
        {[...layers].reverse().map((l, idx) => {
          const set = <K extends keyof Layer>(k: K) => (v: Layer[K]) => update(l.id, { [k]: v } as Partial<Layer>);
          const setLine = <K extends keyof Layer['lines']>(k: K) => (v: Layer['lines'][K]) => update(l.id, { lines: { ...l.lines, [k]: v } });
          const li = info.get(l.id), texture = !!l.ref?.texture, isOpen = open.has(l.id);
          const err = l.ref && errors.get(refKey(l.ref));
          return (
            <li key={l.id} className={l.visible ? '' : 'hidden-layer'}>
              <img src={l.kind === 'lines' ? LINES_THUMB : l.ref!.thumb} alt="" crossOrigin={l.ref && /^https?:/.test(l.ref.thumb) ? 'anonymous' : undefined} />
              <div className="item-body">
                <div className="item-title">
                  <span title={l.name}>{l.name}</span>
                  {texture && <em>pattern</em>}
                  <div className="seg tiny" role="group" aria-label="Blend">
                    <button className={l.blend === 'paint' ? 'on' : ''} onClick={() => set('blend')('paint')} title="Adds paint on top of the layers below">Paint</button>
                    <button className={l.blend === 'cut' ? 'on' : ''} onClick={() => set('blend')('cut')} title="Clears paint from the layers below, leaving plastic">Cut out</button>
                  </div>
                  <button className="icon" title={l.visible ? 'Hide layer' : 'Show layer'} aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`} onClick={() => set('visible')(!l.visible)}>{l.visible ? '◉' : '○'}</button>
                  <button className="icon" title="Move up" aria-label={`Move ${l.name} up`} disabled={idx === 0} onClick={() => move(l.id, 1)}>↑</button>
                  <button className="icon" title="Move down" aria-label={`Move ${l.name} down`} disabled={idx === layers.length - 1} onClick={() => move(l.id, -1)}>↓</button>
                  <button className="icon" title="Duplicate" aria-label={`Duplicate ${l.name}`} onClick={() => setLayers((ls) => { const i = ls.findIndex((x) => x.id === l.id); return [...ls.slice(0, i + 1), { ...l, id: crypto.randomUUID() }, ...ls.slice(i + 1)]; })}>⧉</button>
                  <button className="icon" title="Remove" aria-label={`Remove ${l.name}`} onClick={() => setLayers((ls) => ls.filter((x) => x.id !== l.id))}>×</button>
                </div>
                {err && <p className="warn">Couldn't load: {err}</p>}

                <div className="item-controls">
                  {l.kind === 'lines' ? (
                    <>
                      <label>Heights
                        <input type="text" defaultValue={l.lines.positions.join(', ')} title="Line centres in % of the band height from its top edge, separated by commas"
                          onBlur={(e) => setLine('positions')(e.target.value.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 100))} />
                      </label>
                      <NumberField label="Thickness" unit="mm" value={l.lines.thickness} min={0.4} max={20} step={0.1} onChange={setLine('thickness')} />
                      <SelectField label="Style" value={l.lines.style} onChange={setLine('style')}
                        options={[['solid', 'solid'], ['dashed', 'dashed'], ['dotted', 'dotted'], ['wavy', 'wavy']]} />
                    </>
                  ) : texture ? (
                    <NumberField label="Pattern size" unit="mm" value={l.patternSize} min={2} max={200} step={0.5} onChange={set('patternSize')} />
                  ) : (
                    <>
                      <NumberField label="Size" unit="%" value={l.size} min={5} max={100} onChange={set('size')} />
                      <NumberField label="Around" unit="×" value={l.repeats} min={1} max={80} onChange={set('repeats')} />
                      <NumberField label="Down" unit="×" value={l.rows} min={1} max={20} onChange={set('rows')} />
                    </>
                  )}
                </div>
                {li && <p className="hint">Repeats {li.repeats} × {li.rows}, each {li.cellW.toFixed(1)} × {li.cellH.toFixed(1)} mm</p>}

                <button className="link" onClick={() => toggle(l.id)} aria-expanded={isOpen}>{isOpen ? '▾' : '▸'} Advanced</button>
                {isOpen && (
                  <div className="advanced">
                    {l.kind === 'lines' ? (
                      <>
                        {l.lines.style === 'dashed' && <NumberField label="Dash length" unit="mm" value={l.lines.length} min={0.5} step={0.5} onChange={setLine('length')} />}
                        {l.lines.style === 'wavy' && <NumberField label="Wavelength" unit="mm" value={l.lines.length} min={1} step={0.5} onChange={setLine('length')} />}
                        {l.lines.style === 'wavy' && <NumberField label="Wave height" unit="mm" value={l.lines.amplitude} min={0} step={0.5} onChange={setLine('amplitude')} />}
                        {(l.lines.style === 'dashed' || l.lines.style === 'dotted') && <NumberField label="Gap" unit="mm" value={l.lines.gap} min={0.3} step={0.5} onChange={setLine('gap')} />}
                        <NumberField label="Offset around" unit="%" value={l.offsetX} min={-100} max={100} step={5} onChange={set('offsetX')} />
                      </>
                    ) : (
                      <>
                        <NumberField label="Slice from top" unit="%" value={l.from} min={0} max={99} onChange={set('from')} />
                        <NumberField label="Slice to" unit="%" value={l.to} min={1} max={100} onChange={set('to')} />
                        <NumberField label="Offset around" unit="%" value={l.offsetX} min={-100} max={100} step={5} onChange={set('offsetX')} />
                        <NumberField label="Offset down" unit="%" value={l.offsetY} min={-100} max={100} step={5} onChange={set('offsetY')} />
                        {!texture && <NumberField label="Rotate" unit="°" value={l.rotate} min={-180} max={180} step={15} onChange={set('rotate')} />}
                        {!texture && (
                          <SelectField label="Arrange" value={l.arrange} onChange={set('arrange')} options={[['grid', 'one per cell'], ['scatter', 'scatter']]} />
                        )}
                        {!texture && l.arrange === 'scatter' && (
                          <>
                            <NumberField label="Per cell" unit="pcs" value={l.count} min={1} max={60} onChange={set('count')} />
                            <NumberField label="Random size & tilt" unit="%" value={Math.round(l.jitter * 100)} min={0} max={100} step={5}
                              onChange={(v) => set('jitter')(Math.min(1, Math.max(0, v / 100)))} />
                            <div className="row-actions"><button className="secondary small" onClick={() => set('seed')(l.seed + 1)}>Shuffle</button></div>
                          </>
                        )}
                        <CheckField label="Half-drop (offset every other row by half a cell)" value={l.stagger} onChange={set('stagger')} />
                        <RangeField label="Threshold" value={l.threshold} min={1} max={254} onChange={set('threshold')}
                          action={<button type="button" className="secondary small" title="Pick the cutoff that best separates dark from light in this design (Otsu's method)" onClick={() => onAutoThreshold(l.id)}>Auto</button>} />
                        <NumberField label="Smooth edges" unit="mm" value={l.smooth} min={0} max={2} step={0.1} onChange={set('smooth')} />
                        <NumberField label="Thicken lines" unit="mm" value={l.grow ?? 0} min={0} max={5} step={0.1} onChange={set('grow')} />
                        <CheckField label="Invert (paint the light areas)" value={l.invert} onChange={set('invert')} />
                      </>
                    )}
                    {l.blend === 'paint' && (
                      <NumberField label="Clear margin" unit="mm" value={l.halo} min={0} max={20} step={0.5} onChange={set('halo')} />
                    )}
                    {l.blend === 'paint' && <p className="hint">Clear margin removes lower layers' paint around this layer's shapes, so they stand out cleanly.</p>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {credits.length > 0 && (
        <fieldset>
          <legend>Credits</legend>
          <ul className="credits">
            {credits.map((r) => (
              <li key={refKey(r)}>
                {r.credit.url ? <a href={r.credit.url} target="_blank" rel="noreferrer">{r.credit.source}</a> : r.credit.source}
                {r.credit.author && <> · {r.credit.author}</>} · {r.credit.license}
              </li>
            ))}
          </ul>
          <p className="hint">CC BY designs need this credit if you sell or publish the pieces.</p>
        </fieldset>
      )}
    </section>
  );
}
