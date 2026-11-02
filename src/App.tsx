import { useDeferredValue, useMemo, useState } from 'react';
import { otsuThreshold } from './core/threshold';
import { diameterForPot, heightmapFromImage, lengthForDiameter, rollerMesh, seamMismatch, toSTL, type RollerSpec } from './core/roller';
import { loadImage, lumHistogram, samplePattern, type Picture } from './ui/picture';
import { Roller3D } from './ui/Roller3D';
import { Imprint } from './ui/Imprint';

// The P2S prints the drum standing on its end, so both its length and its diameter must fit the 256 mm bed.
const BED = 256;
const mm = (v: number) => `${v.toFixed(1)} mm`;

function Num({ label, value, set, step = 1, min = 0, max, unit = 'mm', disabled }: {
  label: string; value: number; set: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; disabled?: boolean;
}) {
  return (
    <label>{label}
      <span className="field"><input type="number" value={Number(value.toFixed(2))} step={step} min={min} max={max} disabled={disabled}
        onChange={(e) => { const v = e.target.valueAsNumber; if (Number.isFinite(v)) set(v); }} />{unit}</span>
    </label>
  );
}

export function App() {
  const [pic, setPic] = useState<Picture>(samplePattern);
  const autoT = useMemo(() => otsuThreshold(lumHistogram(pic)), [pic]);
  const [manualT, setManualT] = useState<number | null>(null);
  const [invert, setInvert] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [soften, setSoften] = useState(0.2);
  const [diameter, setDiameter] = useState(60);
  const [freeLength, setFreeLength] = useState(100);
  const [lock, setLock] = useState(true);
  const [repeats, setRepeats] = useState(1);
  const [depth, setDepth] = useState(1.5);
  const [rim, setRim] = useState(4);
  const [bore, setBore] = useState(8.2);
  const [cell, setCell] = useState(0.4);
  const [potD, setPotD] = useState(120);
  const [laps, setLaps] = useState(2);

  const aspect = pic.w / pic.h, threshold = manualT ?? autoT;
  const length = lock ? lengthForDiameter(diameter, aspect, repeats, rim) : freeLength;
  const repeatW = (Math.PI * diameter) / repeats, patternH = length - 2 * rim;
  const mmPerPx = repeatW / pic.w;
  const map = useMemo(() => heightmapFromImage(pic.rgba, pic.w, pic.h, { threshold, invert, softenPx: soften / mmPerPx }),
    [pic, threshold, invert, soften, mmPerPx]);
  const spec = useMemo<RollerSpec>(() => ({ diameter, length, depth, repeats, rim, bore, cell, mirror }),
    [diameter, length, depth, repeats, rim, bore, cell, mirror]);
  const job = useDeferredValue(useMemo(() => ({ map, spec }), [map, spec]));
  const mesh = useMemo(() => rollerMesh(job.map, job.spec), [job]);

  const seam = seamMismatch(map), stretch = (repeatW / patternH) / aspect - 1, turnsOnPot = potD / diameter;
  const warnings = [
    length > BED || diameter > BED ? `The drum is ${mm(diameter)} × ${mm(length)}, and the bed is ${BED} mm. Make it smaller, or split it into rings.` : '',
    seam > 0.05 ? `The image's left and right edges don't match, so a seam shows once per pattern repeat. Use an image that tiles left to right.` : '',
    Math.abs(stretch) > 0.02 ? `The pattern is stretched ${Math.round(stretch * 100)}% around the roller. Tick "Keep the image's proportions" to fix it.` : '',
    bore > 0 && bore > diameter - 2 * depth - 6 ? 'The axle hole leaves less than 3 mm of wall. Make the hole smaller.' : '',
    patternH <= 0 ? 'The plain ends take up the whole length.' : '',
  ].filter(Boolean);

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
        <p>Turn a pattern into a texture roller sized for your pot.</p>
      </header>
      <div className="app">
        <aside className="controls">
          <fieldset>
            <legend>Pattern</legend>
            <label className="file">Image
              <input type="file" accept="image/*" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { setPic(await loadImage(f)); setManualT(null); }
              }} />
            </label>
            <p className="hint">{pic.name}, {pic.w} × {pic.h} px. Dark parts become raised relief, which presses grooves into the clay.</p>
            <label>Threshold
              <span className="field"><input type="range" min={1} max={254} value={threshold} onChange={(e) => setManualT(+e.target.value)} /></span>
            </label>
            <label className="check"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />Invert, so light parts are raised</label>
            <label className="check"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />Mirror on the roller, so the clay reads the right way round</label>
            <Num label="Soften edges" value={soften} set={setSoften} step={0.1} />
          </fieldset>
          <fieldset>
            <legend>Roller</legend>
            <Num label="Diameter at the tips" value={diameter} set={setDiameter} min={10} />
            <Num label="Pattern repeats per turn" value={repeats} set={(v) => setRepeats(Math.max(1, Math.round(v)))} min={1} unit="" />
            <label className="check"><input type="checkbox" checked={lock} onChange={(e) => { setLock(e.target.checked); setFreeLength(Math.round(length)); }} />Keep the image's proportions</label>
            <Num label="Length" value={length} set={setFreeLength} min={5} disabled={lock} />
            <Num label="Relief depth" value={depth} set={setDepth} step={0.1} min={0.2} />
            <Num label="Plain ends" value={rim} set={setRim} step={0.5} />
            <Num label="Axle hole" value={bore} set={setBore} step={0.1} />
            <p className="hint">8.2 mm takes an 8 mm dowel or rod. Set 0 for a solid drum.</p>
            <Num label="Mesh detail" value={cell} set={(v) => setCell(Math.max(0.15, v))} step={0.05} min={0.15} />
          </fieldset>
          <fieldset>
            <legend>Fit a pot</legend>
            <Num label="Pot diameter" value={potD} set={setPotD} min={10} />
            <Num label="Turns of the roller per lap" value={laps} set={(v) => setLaps(Math.max(1, Math.round(v)))} min={1} unit="" />
            <button type="button" className="secondary" onClick={() => setDiameter(diameterForPot(potD, laps))}>
              Use {mm(diameterForPot(potD, laps))} diameter
            </button>
            <p className="hint">This roller goes round a {mm(potD)} pot in {turnsOnPot.toFixed(2)} turns.
              {Math.abs(turnsOnPot - Math.round(turnsOnPot)) > 0.02 ? ' That isn’t a whole number, so the pattern won’t meet itself where you finish.' : ' The pattern meets itself where you finish.'}</p>
          </fieldset>
        </aside>
        <main>
          <section className="panel preview">
            <Roller3D mesh={mesh} length={job.spec.length} diameter={job.spec.diameter} />
            <dl className="facts">
              <div><dt>Size</dt><dd>Ø {mm(diameter)} × {mm(length)}</dd></div>
              <div><dt>One turn rolls</dt><dd>{mm(Math.PI * diameter)}</dd></div>
              <div><dt>Each repeat</dt><dd>{mm(repeatW)} × {mm(patternH)}</dd></div>
              <div><dt>Detail</dt><dd>{(mmPerPx * 1000).toFixed(0)} µm per pixel</dd></div>
              <div><dt>STL</dt><dd>{((84 + 50 * mesh.indices.length / 3) / 1e6).toFixed(1)} MB</dd></div>
            </dl>
            {warnings.length ? <ul className="warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              : <p className="ready">The roller fits the bed and is ready to print standing on its end.</p>}
            <button type="button" onClick={download} disabled={patternH <= 0}>Download roller (.stl)</button>
          </section>
          <section className="panel">
            <h2>In the clay</h2>
            <Imprint map={job.map} spec={job.spec} />
            <p className="hint">This shows one and a half turns. The dashed line marks where the roller starts its second turn.</p>
          </section>
        </main>
      </div>
    </>
  );
}
