import { useDeferredValue, useMemo, useState } from 'react';
import { otsuThreshold } from './core/threshold';
import {
  diameterForPot, drumParts, filamentGrams, heightmapFromImage, lengthForDiameter, mergeMeshes, seamMismatch, toSTL,
  type DrumBuild, type RollerSpec,
} from './core/roller';
import { loadImage, lumHistogram, samplePattern, type Picture } from './ui/picture';
import { CheckField, NumberField, RangeField, Section } from './ui/fields';
import { Roller3D } from './ui/Roller3D';
import { Imprint, type Use } from './ui/Imprint';

// The P2S prints the drum standing on its end, so both its length and its diameter must fit the 256 mm bed.
const BED = 256;
const mm = (v: number) => `${v.toFixed(1)} mm`;
const round = (v: number, d = 1) => Number(v.toFixed(d));
// Each use starts from its own depth and edge. An underglaze roller wants crisp, deep relief, so paint stays on the tops.
const USES: Record<Use, { depth: number; soften: number; label: string }> = {
  texture: { depth: 1.2, soften: 0.3, label: 'Press a texture' },
  underglaze: { depth: 2, soften: 0, label: 'Print underglaze' },
};

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => <button key={v} type="button" className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{text}</button>)}
    </div>
  );
}

export function App() {
  const [use, setUse] = useState<Use>('texture');
  const [pic, setPic] = useState<Picture>(samplePattern);
  const autoT = useMemo(() => otsuThreshold(lumHistogram(pic)), [pic]);
  const [manualT, setManualT] = useState<number | null>(null);
  const [invert, setInvert] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [soften, setSoften] = useState(USES.texture.soften);
  const [diameter, setDiameter] = useState(60);
  const [freeLength, setFreeLength] = useState(100);
  const [lock, setLock] = useState(true);
  const [repeats, setRepeats] = useState(1);
  const [depth, setDepth] = useState(USES.texture.depth);
  const [rim, setRim] = useState(4);
  const [bore, setBore] = useState(8.2);
  const [cell, setCell] = useState(0.4);
  const [potD, setPotD] = useState(120);
  const [laps, setLaps] = useState(2);
  const [build, setBuild] = useState<DrumBuild>({ kind: 'hollow', wall: 2, spokes: 6, spokeW: 3, hub: 3, plate: 6, infill: 0.15 });
  const setB = (patch: Partial<DrumBuild>) => setBuild((b) => ({ ...b, ...patch }));

  const aspect = pic.w / pic.h, threshold = manualT ?? autoT;
  const length = lock ? lengthForDiameter(diameter, aspect, repeats, rim) : freeLength;
  const repeatW = (Math.PI * diameter) / repeats, patternH = length - 2 * rim, mmPerPx = repeatW / pic.w;
  const map = useMemo(() => heightmapFromImage(pic.rgba, pic.w, pic.h, { threshold, invert, softenPx: soften / mmPerPx }),
    [pic, threshold, invert, soften, mmPerPx]);
  const spec = useMemo<RollerSpec>(() => ({ diameter, length, depth, repeats, rim, bore, cell, mirror }),
    [diameter, length, depth, repeats, rim, bore, cell, mirror]);
  const job = useDeferredValue(useMemo(() => ({ map, spec, build }), [map, spec, build]));
  const parts = useMemo(() => drumParts(job.map, job.spec, job.build), [job]);
  const mesh = useMemo(() => mergeMeshes(parts), [parts]);
  const grams = useMemo(() => filamentGrams(parts, job.spec, job.build), [parts, job]);
  // The other build's estimate uses a coarse mesh, which is quick and close enough for grams.
  const otherGrams = useMemo(() => {
    const other = { ...job.build, kind: job.build.kind === 'hollow' ? 'solid' : 'hollow' } as DrumBuild, coarse = { ...job.spec, cell: Math.max(job.spec.cell, 1.5) };
    return filamentGrams(drumParts(job.map, coarse, other), coarse, other);
  }, [job]);
  const updating = job.spec !== spec || job.map !== map || job.build !== build;

  const seam = seamMismatch(map), stretch = repeatW / patternH / aspect - 1, turnsOnPot = potD / diameter;
  const hollowFell = build.kind === 'hollow' && parts.length === 1;
  const checks: [string, string][] = [
    length > BED || diameter > BED ? ['warn', `The drum is ${mm(diameter)} × ${mm(length)}, and the bed is ${BED} mm. Make it smaller.`] : ['', ''],
    seam > 0.05 ? ['caution', "The image's left and right edges don't match, so a seam shows once per repeat. Use an image that tiles left to right."] : ['', ''],
    Math.abs(stretch) > 0.02 ? ['caution', `The pattern is stretched ${Math.round(stretch * 100)}% around the roller. Tick "Keep the image's proportions" to fix it.`] : ['', ''],
    bore > 0 && bore > diameter - 2 * depth - 6 ? ['warn', 'The axle hole leaves less than 3 mm of wall. Make the hole smaller.'] : ['', ''],
    hollowFell ? ['caution', 'The drum is too thin for spokes, so it prints solid. Use a thinner wall or a bigger diameter.'] : ['', ''],
    use === 'underglaze' && depth < 1.5 ? ['caution', 'Shallow relief lets underglaze reach the low parts. 1.5 mm or more keeps them clean.'] : ['', ''],
    patternH <= 0 ? ['warn', 'The plain ends take up the whole length. Make them shorter.'] : ['', ''],
  ].filter(([k]) => k) as [string, string][];
  const blocked = checks.some(([k]) => k === 'warn');

  function download() {
    const url = URL.createObjectURL(new Blob([toSTL(mesh)], { type: 'model/stl' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `roller_${Math.round(diameter)}x${Math.round(length)}mm.stl` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <header>
        <h1>Pottery Roller Maker</h1>
        <p>Printable texture and underglaze rollers, sized to the pot you want to roll.</p>
      </header>
      <div className="app">
        <aside className="panel controls" aria-label="Roller settings">
          <Section title="Use">
            <Seg label="What the roller does" value={use} options={[['texture', USES.texture.label], ['underglaze', USES.underglaze.label]]}
              onChange={(u) => { setUse(u); setDepth(USES[u].depth); setSoften(USES[u].soften); }} />
            <p className="hint">{use === 'texture'
              ? 'The raised relief presses grooves into soft clay. Soft edges help the roller lift off cleanly.'
              : 'The raised tops carry underglaze. Load them with a sponge or brayer, then roll onto leather-hard clay. Deep, crisp relief keeps paint off the low parts.'}</p>
          </Section>
          <Section title="Pattern">
            <label className="drop">Choose an image
              <input type="file" accept="image/*" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { setPic(await loadImage(f)); setManualT(null); }
              }} />
            </label>
            <p className="hint">{pic.name}, {pic.w} × {pic.h} px. Dark parts become raised relief.</p>
            <RangeField label="Threshold" value={threshold} min={1} max={254} onChange={setManualT}
              action={manualT !== null ? <button type="button" className="secondary small" onClick={() => setManualT(null)}>Auto</button> : undefined} />
            <CheckField label="Invert, so light parts are raised" value={invert} onChange={setInvert} />
            <CheckField label="Mirror on the roller, so the clay reads the right way round" value={mirror} onChange={setMirror} />
            <NumberField label="Soften edges" unit="mm" value={soften} min={0} max={3} step={0.1} onChange={setSoften} />
          </Section>
          <Section title="Roller">
            <NumberField label="Diameter at the tips" unit="mm" value={round(diameter)} min={10} max={BED} step={1} onChange={setDiameter} />
            <NumberField label="Repeats per turn" unit="×" value={repeats} min={1} max={24} step={1} onChange={(v) => setRepeats(Math.round(v))} />
            <CheckField label="Keep the image's proportions" value={lock} onChange={(v) => { setLock(v); setFreeLength(round(length)); }} />
            {lock ? <p className="hint">The length is {mm(length)}, set by the diameter and the image.</p>
              : <NumberField label="Length" unit="mm" value={round(freeLength)} min={5} max={BED} step={1} onChange={setFreeLength} />}
            <NumberField label="Relief depth" unit="mm" value={depth} min={0.2} max={6} step={0.1} onChange={setDepth} />
            <NumberField label="Plain ends" unit="mm" value={rim} min={0} max={40} step={0.5} onChange={setRim} />
            <NumberField label="Axle hole" unit="mm" value={bore} min={0} max={60} step={0.1} onChange={setBore} />
            <p className="hint">8.2 mm takes an 8 mm dowel or rod. Set 0 for no hole.</p>
          </Section>
          <Section title="Fit a pot">
            <NumberField label="Pot Ø" unit="mm" value={potD} min={10} max={1000} step={1} onChange={setPotD} />
            <NumberField label="Roller turns per lap" unit="×" value={laps} min={1} max={20} step={1} onChange={(v) => setLaps(Math.round(v))} />
            <div className="row-actions">
              <button type="button" className="secondary small" onClick={() => setDiameter(diameterForPot(potD, laps))}>Use Ø {mm(diameterForPot(potD, laps))}</button>
            </div>
            <p className={`hint ${Math.abs(turnsOnPot - Math.round(turnsOnPot)) > 0.02 ? 'caution' : 'ok'}`}>
              This roller goes round a Ø {mm(potD)} pot in {turnsOnPot.toFixed(2)} turns.
              {Math.abs(turnsOnPot - Math.round(turnsOnPot)) > 0.02 ? ' The pattern won’t meet itself where you finish.' : ' The pattern meets itself where you finish.'}</p>
          </Section>
          <Section title="Print">
            <Seg label="How the drum prints" value={build.kind} options={[['hollow', 'Hollow with spokes'], ['solid', 'Solid with infill']]} onChange={(kind) => setB({ kind })} />
            {build.kind === 'hollow' ? (
              <>
                <NumberField label="Wall under the relief" unit="mm" value={build.wall} min={1.2} max={20} step={0.2} onChange={(wall) => setB({ wall })} />
                <NumberField label="Spokes" unit="×" value={build.spokes} min={1} max={16} step={1} onChange={(v) => setB({ spokes: Math.round(v) })} />
                <NumberField label="Spoke thickness" unit="mm" value={build.spokeW} min={1.2} max={10} step={0.2} onChange={(spokeW) => setB({ spokeW })} />
                <NumberField label="Wall around the axle" unit="mm" value={build.hub} min={1.2} max={10} step={0.2} onChange={(hub) => setB({ hub })} />
                <NumberField label="End plate thickness" unit="mm" value={build.plate} min={2} max={30} step={1} onChange={(plate) => setB({ plate })} />
                <p className="hint">Each end has a plate of spokes round the axle, and the middle stays empty. The top plate's spokes bridge from the hub to the wall.</p>
              </>
            ) : (
              <>
                <RangeField label="Infill %" value={Math.round(build.infill * 100)} min={0} max={100} step={5} onChange={(v) => setB({ infill: v / 100 })} />
                <p className="hint">Set the same sparse infill in Bambu Studio. 10–15% gyroid is plenty for a roller.</p>
              </>
            )}
            <p className={`hint ${grams <= otherGrams ? 'ok' : 'caution'}`}>
              About {Math.round(grams)} g this way, or {Math.round(otherGrams)} g {build.kind === 'hollow' ? `solid at ${Math.round(build.infill * 100)}% infill` : 'hollow'}.
            </p>
            <NumberField label="Mesh detail" unit="mm" value={cell} min={0.15} max={2} step={0.05} onChange={setCell} />
          </Section>
        </aside>
        <main>
          <section className="panel preview" aria-labelledby="preview-title">
            <div className="piece-head"><h2 id="preview-title">Roller</h2></div>
            <Roller3D mesh={mesh} length={job.spec.length} diameter={job.spec.diameter} />
            <dl className="spec">
              <div><dt className="hint">Size</dt><dd>Ø {mm(diameter)} × {mm(length)}</dd></div>
              <div><dt className="hint">One turn rolls</dt><dd>{mm(Math.PI * diameter)}</dd></div>
              <div><dt className="hint">Each repeat</dt><dd>{mm(repeatW)} × {mm(patternH)}</dd></div>
              <div><dt className="hint">Filament</dt><dd className={updating ? 'updating' : ''}>about {Math.round(grams)} g PETG</dd></div>
              <div><dt className="hint">STL</dt><dd>{((84 + (50 * mesh.indices.length) / 3) / 1e6).toFixed(1)} MB</dd></div>
            </dl>
            {checks.length ? <ul className="checks">{checks.map(([k, t]) => <li key={t} className={k}>{t}</li>)}</ul>
              : <p className="ok">The roller fits the bed and is ready to print standing on its end.</p>}
            <div className="actions">
              <button type="button" onClick={download} disabled={blocked}>Download roller (.stl)</button>
            </div>
            <details className="tips">
              <summary>Printing &amp; rolling tips</summary>
              <ul>
                <li>Print the drum standing on its end, so the relief prints as clean walls rather than steps.</li>
                <li>A 0.2 mm nozzle keeps fine lines crisp. With a 0.4 mm nozzle, keep lines at least 0.8 mm wide.</li>
                <li>Dust the roller with cornstarch, or mist the clay, so the roller doesn't stick.</li>
                <li>Roll with even pressure, letting the plain ends ride on the clay to keep the depth even.</li>
              </ul>
            </details>
          </section>
          <section className="panel" aria-labelledby="clay-title">
            <h2 id="clay-title">In the clay</h2>
            <Imprint map={job.map} spec={job.spec} use={use} />
            <p className="hint">This shows one and a half turns. The dashed line marks where the second turn starts.</p>
          </section>
        </main>
      </div>
    </>
  );
}
