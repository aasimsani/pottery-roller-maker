import { useState } from 'react';
import { nozzleSettings, type Settings } from '../state';
import { usePersistent } from '../state';
import { widestD } from '../scale';
import { BED_MARGIN } from '../checks';
import type { RollerResult } from '../pipeline';
import type { DrumBuild } from '../core/roller';
import { diameterAt, surfaceLength, type Piece } from '../core/piece';
import { CheckField, NumberField, Section, SelectField } from './fields';

type Set = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

// Presets come with a sensible paint band, in mm along the surface from the base.
const PRESETS: { piece: Piece; band: [number, number] }[] = [
  { piece: { name: 'Straight mug', profile: [{ z: 0, d: 80 }, { z: 95, d: 80 }] }, band: [15, 80] },
  { piece: { name: 'Flared mug', profile: [{ z: 0, d: 78 }, { z: 95, d: 86 }] }, band: [20, 70] },
  { piece: { name: 'Vase shoulder (narrows up)', profile: [{ z: 0, d: 120 }, { z: 50, d: 90 }] }, band: [5, 45] },
  { piece: { name: 'Bowl, outside wall', profile: [{ z: 0, d: 90 }, { z: 60, d: 160 }] }, band: [10, 60] },
  { piece: { name: 'Plate rim (flat ring)', profile: [{ z: 0, d: 180 }, { z: 8, d: 260 }] }, band: [0, 40.8] },
];

const round1 = (v: number) => Math.round(v * 10) / 10;

function PieceEditor({ s, set, onPhoto, onScale }: { s: Settings; set: Set; onPhoto: () => void; onScale: (k: number) => void }) {
  const [saved, setSaved] = usePersistent<Piece[]>('pieces', []);
  const widest = widestD(s.piece), [target, setTarget] = useState<number | null>(null);
  const piece = s.piece, p = piece.profile, S = surfaceLength(piece);
  const rim = p[p.length - 1];
  const same = (a: Piece) => a.name === piece.name && JSON.stringify(a.profile) === JSON.stringify(p);
  const current = PRESETS.find((x) => same(x.piece)) ? `preset:${piece.name}` : saved.find(same) ? `saved:${piece.name}` : '';

  const setProfile = (profile: Piece['profile']) => set('piece', { ...piece, profile: [...profile].sort((a, b) => a.z - b.z) });
  const choose = (key: string) => {
    const kind = key.slice(0, key.indexOf(':')), name = key.slice(key.indexOf(':') + 1);
    const preset = kind === 'preset' ? PRESETS.find((x) => x.piece.name === name) : undefined;
    const next = preset?.piece ?? (kind === 'saved' ? saved.find((x) => x.name === name) : undefined);
    if (!next) return;
    set('piece', next);
    const len = surfaceLength(next);
    // A saved piece keeps the band where it was, trimmed to fit the piece.
    const [from, to] = preset ? preset.band : [Math.min(s.bandFrom, len - 1), Math.min(s.bandTo, len)];
    set('bandFrom', from); set('bandTo', to);
  };
  const middle = p.slice(1, -1);

  return (
    <Section title="Piece">
      <SelectField label="Piece" value={current} onChange={choose} options={[
        ['', current ? '—' : `${piece.name} (edited)`],
        ...PRESETS.map((x): [string, string] => [`preset:${x.piece.name}`, x.piece.name]),
        ...saved.map((x): [string, string] => [`saved:${x.name}`, `★ ${x.name}`]),
      ]} />
      <label>Name <input type="text" value={piece.name} onChange={(e) => set('piece', { ...piece, name: e.target.value })} /></label>
      <div className="row-actions">
        <button className="secondary small" onClick={() => setSaved((ps) => [...ps.filter((x) => x.name !== piece.name), piece])}>Save to my pieces</button>
        {saved.some((x) => x.name === piece.name) && (
          <button className="secondary small" onClick={() => setSaved((ps) => ps.filter((x) => x.name !== piece.name))}>Delete</button>
        )}
        <button className="secondary small" onClick={onPhoto}>From a photo (experimental)</button>
      </div>

      <NumberField label="Base Ø" unit="mm" value={p[0].d} min={1} step={0.5} onChange={(v) => setProfile([{ ...p[0], d: v }, ...p.slice(1)])} />
      <NumberField label="Rim Ø" unit="mm" value={rim.d} min={1} step={0.5} onChange={(v) => setProfile([...p.slice(0, -1), { ...rim, d: v }])} />
      <NumberField label="Height" unit="mm" value={rim.z} min={1} step={0.5}
        onChange={(v) => setProfile([...p.slice(0, -1).filter((q, i) => i === 0 || q.z < v), { ...rim, z: v }])} />
      {middle.map((q, i) => (
        <div className="mid-point" key={i}>
          <NumberField label="At height" unit="mm" value={q.z} min={0.5} step={0.5} onChange={(v) => setProfile(p.map((x) => (x === q ? { ...x, z: Math.min(v, rim.z - 0.5) } : x)))} />
          <NumberField label="Ø" unit="mm" value={q.d} min={1} step={0.5} onChange={(v) => setProfile(p.map((x) => (x === q ? { ...x, d: v } : x)))} />
          <button className="icon" aria-label="Remove this measurement" onClick={() => setProfile(p.filter((x) => x !== q))}>×</button>
        </div>
      ))}
      <div className="row-actions">
        <button className="secondary small" onClick={() => {
          // The new measurement starts halfway up, at the diameter the straight line would give there.
          setProfile([...p, { z: round1(rim.z / 2), d: round1(diameterAt(piece, S / 2)) }]);
        }}>+ Measurement in between</button>
      </div>
      <NumberField label="Scale to widest Ø" unit="mm" value={target ?? widest} min={10} step={1} onChange={setTarget} />
      {target !== null && target !== widest && (
        <div className="row-actions">
          <button className="secondary small" onClick={() => { onScale(target / widest); setTarget(null); }}>
            Scale piece and design to {Math.round((target / widest) * 100)}%
          </button>
          <button className="secondary small" onClick={() => setTarget(null)}>Cancel</button>
        </div>
      )}
      <p className="hint">
        Measure the outside at the stage you'll paint. A tape round the piece gives circumference, and circumference ÷ 3.14 = Ø.
        Add measurements in between for bellied or waisted shapes. The surface runs {S.toFixed(1)} mm from base to rim.
        Scaling grows the band, the motifs, and the lines with the piece. Margins and thickness keep their values.
      </p>
    </Section>
  );
}

// Each use starts from its own depth and edge. An underglaze roller wants crisp, deep relief, so paint stays on the tops.
const USE_DEFAULTS = { texture: { depth: 1.2, soften: 0.3 }, underglaze: { depth: 2, soften: 0 } };

export function Controls({ s, set, result, onPhoto, onScale }: { s: Settings; set: Set; result: RollerResult | null; onPhoto: () => void; onScale: (k: number) => void }) {
  const S = surfaceLength(s.piece), b = s.build, setB = (patch: Partial<DrumBuild>) => set('build', { ...b, ...patch });
  const setNozzle = (n: number) => { for (const [k, v] of Object.entries(nozzleSettings(n))) set(k as keyof Settings, v as never); };
  const r = result?.roller, other = b.kind === 'hollow' ? `solid at ${Math.round(b.infill * 100)}% infill` : 'hollow';
  return (
    <aside className="panel controls" aria-label="Pot and roller settings">
      <PieceEditor s={s} set={set} onPhoto={onPhoto} onScale={onScale} />

      <Section title="Pattern band">
        <NumberField label="From (up from the base)" unit="mm" value={s.bandFrom} min={0} step={0.5} onChange={(v) => set('bandFrom', v)} />
        <NumberField label="To" unit="mm" value={s.bandTo} min={1} step={0.5} onChange={(v) => set('bandTo', v)} />
        <div className="row-actions">
          <button className="secondary small" onClick={() => { set('bandFrom', 0); set('bandTo', round1(S)); }}>Whole piece</button>
        </div>
        <p className="hint">Measured along the surface. The band sets the roller's patterned length, and layers fill it.</p>
      </Section>

      <Section title="Roller">
        <SelectField label="Use" value={s.use} onChange={(u) => { set('use', u); set('depth', USE_DEFAULTS[u].depth); set('soften', USE_DEFAULTS[u].soften); }}
          options={[['texture', 'press a texture'], ['underglaze', 'print underglaze']]} />
        <p className="hint">{s.use === 'texture'
          ? 'The raised relief presses grooves into soft clay. Soft edges help the roller lift off cleanly.'
          : 'The raised tops carry underglaze. Load them with a sponge or brayer, then roll onto leather-hard clay. Deep, crisp relief keeps paint off the low parts.'}</p>
        <NumberField label="Turns per lap of the pot" unit="×" value={s.laps} min={1} max={20} step={1} onChange={(v) => set('laps', Math.max(1, Math.round(v)))} />
        {r && <p className="hint">The roller is Ø{r.diameter.toFixed(1)} × {r.length.toFixed(1)} mm. It goes round a Ø{r.potD.toFixed(1)} mm pot in exactly {Math.round(s.laps)} turn{Math.round(s.laps) > 1 ? 's' : ''}, so the pattern meets itself where you finish.</p>}
        <NumberField label="Relief depth" unit="mm" value={s.depth} min={0.2} max={6} step={0.1} onChange={(v) => set('depth', v)} />
        <NumberField label="Soften edges" unit="mm" value={s.soften} min={0} max={3} step={0.1} onChange={(v) => set('soften', v)} />
        <NumberField label="Plain ends" unit="mm" value={s.ends} min={0} max={40} step={0.5} onChange={(v) => set('ends', v)} />
        <CheckField label="Mirror on the roller, so the clay reads the right way round" value={s.mirror} onChange={(v) => set('mirror', v)} />
        <NumberField label="Axle hole" unit="mm" value={s.bore} min={0} max={60} step={0.1} onChange={(v) => set('bore', v)} />
        <p className="hint">8.2 mm takes an 8 mm dowel or rod. Set 0 for no hole.</p>
      </Section>

      <Section title="Handle">
        <CheckField label="Print a handle and an axle with the roller" value={s.handle} onChange={(v) => set('handle', v)} />
        {s.handle && (
          <>
            <NumberField label="Grip length" unit="mm" value={s.grip} min={40} max={160} step={5} onChange={(v) => set('grip', v)} />
            <p className="hint">The handle prints flat, and the axle prints standing on its head. The axle is Ø{Math.max(0, s.bore - 0.4).toFixed(1)} mm, so the roller spins on it, and it pushes snugly into the handle's arms. A {Math.round(s.bore)} mm dowel works instead of the printed axle.</p>
            {result?.handle && <p className="hint">The handle is {result.handle.size[0].toFixed(0)} × {result.handle.size[1].toFixed(0)} × {result.handle.size[2].toFixed(0)} mm. <b>Download roller + handle</b> puts all three parts on one plate.</p>}
          </>
        )}
      </Section>

      <Section title="Print">
        <NumberField label="Nozzle" unit="mm" value={s.nozzle} min={0.1} max={1.2} step={0.05} onChange={setNozzle} />
        <div className="seg" role="group" aria-label="Common nozzles">
          {[0.2, 0.4, 0.6].map((n) => (
            <button key={n} className={s.nozzle === n ? 'on' : ''} aria-pressed={s.nozzle === n} onClick={() => setNozzle(n)}>{n} mm</button>
          ))}
        </div>
        <p className="hint">The roller prints standing on its end, so the nozzle sets the detail round the roller and the layer height sets it along the length.
          {' '}Use {s.nozzle <= 0.25 ? '0.08–0.12' : s.nozzle <= 0.45 ? '0.12–0.16' : '0.2–0.28'} mm layers. Raised lines and gaps need {nozzleSettings(s.nozzle).minPlastic} mm or more.
          {s.nozzle <= 0.25 ? ' A 0.2 mm nozzle prints about four times slower, so save it for fine patterns.' : ''}</p>
        <SelectField label="Inside" value={b.kind} onChange={(kind) => setB({ kind })}
          options={[['hollow', 'hollow, spokes at the ends'], ['solid', 'solid, sparse infill']]} />
        {b.kind === 'hollow' ? (
          <>
            <NumberField label="Wall under the relief" unit="mm" value={b.wall} min={1.2} max={20} step={0.2} onChange={(wall) => setB({ wall })} />
            <NumberField label="Spokes" unit="×" value={b.spokes} min={1} max={16} step={1} onChange={(v) => setB({ spokes: Math.round(v) })} />
            <NumberField label="Spoke thickness" unit="mm" value={b.spokeW} min={1.2} max={10} step={0.2} onChange={(spokeW) => setB({ spokeW })} />
            <NumberField label="Wall round the axle" unit="mm" value={b.hub} min={1.2} max={10} step={0.2} onChange={(hub) => setB({ hub })} />
            <NumberField label="Bottom plate thickness" unit="mm" value={b.plate} min={2} max={30} step={1} onChange={(plate) => setB({ plate })} />
            <p className="hint">The bottom has a plate of spokes round the axle, and the top has a 45° cone roof. It prints standing up with no supports, because every layer rests on the one below it.</p>
          </>
        ) : (
          <>
            <NumberField label="Infill" unit="%" value={Math.round(b.infill * 100)} min={0} max={100} step={5} onChange={(v) => setB({ infill: v / 100 })} />
            <p className="hint">Set the same sparse infill in Bambu Studio. For the least filament, pick Lightning infill, which only grows where the top needs holding up.</p>
          </>
        )}
        {result && <p className={`hint ${result.grams <= result.otherGrams ? 'ok' : 'caution'}`}>
          About {Math.round(result.grams)} g of PETG this way, or {Math.round(result.otherGrams)} g {other}.</p>}
      </Section>

      {/* Expert settings live one step away. The defaults suit a Bambu Lab P2S with a 0.4 mm nozzle. */}
      <details className="expert">
        <summary>Printer &amp; safety settings</summary>
        <Section title="Detail">
          <SelectField label="Pattern detail" value={s.res} onChange={(v) => set('res', v)}
            options={[[0.1, 'fine (0.1 mm)'], [0.15, 'normal (0.15 mm)'], [0.25, 'draft (0.25 mm)']]} />
          <SelectField label="Surface mesh" value={s.cell} onChange={(v) => set('cell', v)}
            options={[[0.25, 'fine (0.25 mm)'], [0.4, 'normal (0.4 mm)'], [0.8, 'draft (0.8 mm)']]} />
        </Section>

        <Section title="Print check">
          <NumberField label="Thinnest raised line" unit="mm" value={s.minPlastic} min={0.2} max={5} step={0.1} onChange={(v) => set('minPlastic', v)} />
          <NumberField label="Narrowest gap" unit="mm" value={s.minHole} min={0.2} max={5} step={0.1} onChange={(v) => set('minHole', v)} />
          <SelectField label="Thin raised lines" value={s.fixLines} onChange={(v) => set('fixLines', v)}
            options={[['off', 'leave them'], ['thicken', 'thicken them'], ['remove', 'remove them']]} />
          <SelectField label="Narrow gaps" value={s.fixGaps} onChange={(v) => set('fixGaps', v)}
            options={[['off', 'leave them'], ['fill', 'fill them in'], ['widen', 'widen them']]} />
          <CheckField label="Hold back the STL while the check finds errors" value={s.strict} onChange={(v) => set('strict', v)} />
          <p className="hint">Two nozzle widths is the practical minimum for both. Changing the nozzle under Print resets them, and the detail, to suit it.</p>
        </Section>

        <Section title="Printer">
          <NumberField label="Bed width" unit="mm" value={s.bedW} min={50} onChange={(v) => set('bedW', v)} />
          <NumberField label="Bed depth" unit="mm" value={s.bedD} min={50} onChange={(v) => set('bedD', v)} />
          <NumberField label="Build height" unit="mm" value={s.bedH} min={50} onChange={(v) => set('bedH', v)} />
          <p className="hint">
            Set for a Bambu Lab P2S (256 × 256 × 256 mm). The roller prints standing on its end, and the fit check keeps {BED_MARGIN} mm clear of each bed edge.
          </p>
        </Section>
      </details>
    </aside>
  );
}
