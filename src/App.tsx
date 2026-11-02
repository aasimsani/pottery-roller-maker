import { useEffect, useMemo, useRef, useState } from 'react';
import { initialLayers, settingsFrom, usePersistent, type Settings } from './state';
import { newDesignLayer, type Layer } from './layers';
import { finishRoller, prepareRoller, type RollerResult } from './pipeline';
import { geometry } from './core/geometry';
import type { WorkerReply, WorkerRequest } from './roller.worker';
import { artHistogram, loadArt, refKey, type Art } from './render/art';
import { otsuThreshold } from './core/threshold';
import { exportName } from './export';
import { svgDataUrl, type DesignRef } from './sources/types';
import { fetchIconSvg, iconSvgThumb } from './sources/iconify';
import { Controls } from './ui/Controls';
import { Library } from './ui/Library';
import { LayersPanel } from './ui/LayersPanel';
import { Preview } from './ui/Preview';
import { PhotoPiece } from './ui/PhotoPiece';
import { surfaceLength, type Piece } from './core/piece';
import { scaleDesign } from './scale';
import { PlatePanel } from './ui/PlatePanel';
import { Drawer } from './ui/Drawer';
import type { PlatePart } from './core/plate';

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export function App() {
  const [saved, setSettings] = usePersistent<Record<string, unknown> | null>('roller.settings', null);
  const s = useMemo(() => settingsFrom(saved), [saved]); // fills in defaults and converts older saves
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((prev) => ({ ...settingsFrom(prev), [key]: value }));
  const [layers, setLayers] = usePersistent<Layer[]>('roller.layers', initialLayers);
  const refs = useMemo(() => layers.flatMap((l) => (l.ref ? [l.ref] : [])), [layers]);
  const [arts, setArts] = useState(new Map<string, Art>());
  const [artErrors, setArtErrors] = useState(new Map<string, string>());
  const [result, setResult] = useState<RollerResult | null>(null);
  const [updating, setUpdating] = useState(false);
  const worker = useRef<Worker | null>(null), job = useRef(0);
  const [error, setError] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // ponytail: the plate lives in memory, because a shell STL can be several MB and localStorage holds about 5 MB.
  const [plate, setPlate] = useState<PlatePart[]>([]);

  // Load every layer's design. loadArt() caches, so re-renders don't refetch.
  useEffect(() => {
    for (const ref of refs) {
      const key = refKey(ref);
      if (arts.has(key)) continue;
      loadArt(ref)
        .then((art) => setArts((m) => new Map(m).set(key, art)))
        .catch((e) => setArtErrors((m) => new Map(m).set(key, e instanceof Error ? e.message : String(e))));
    }
  }, [refs, arts]);

  // Mixes saved before icons stored their SVG point at Iconify's rate-limited image URLs.
  // This converts each such icon once, so its thumbnail and art come from the stored SVG.
  useEffect(() => {
    for (const ref of refs) {
      if (ref.source !== 'iconify' || ref.data?.startsWith('<svg')) continue;
      fetchIconSvg(ref.data ?? ref.id).then((svg) => setLayers((ls) => ls.map((l) => (l.ref?.id === ref.id && l.ref.source === 'iconify'
        ? { ...l, ref: { ...l.ref, data: svg, thumb: svgDataUrl(iconSvgThumb(svg)) } } : l)))).catch(() => { /* retried on next load */ });
    }
  }, []); // once, on load

  const loading = refs.filter((ref) => !arts.has(refKey(ref)) && !artErrors.has(refKey(ref))).length;

  // The heavy half of the pipeline runs in a worker, so the page stays responsive on fine meshes.
  // Only the newest job's reply is kept, because settings can change while one is running.
  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const w = new Worker(new URL('./roller.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (data.id !== job.current) return;
      setUpdating(false);
      if ('error' in data) { setError(data.error); return; }
      setResult({ ...data.result, g: geometry(data.result.gp) });
      setError('');
    };
    worker.current = w;
    return () => { w.terminate(); worker.current = null; };
  }, []);

  // Rebuild after a short pause, so typing in a field doesn't start a rebuild on every key.
  useEffect(() => {
    const p = s.piece.profile;
    if (p.length < 2 || p.some((q) => !(q.d > 0) || !Number.isFinite(q.z)) || !(p[p.length - 1].z > p[0].z)) {
      setError('Check the piece measurements. Every diameter must be above 0, and the rim must be higher than the base.');
      return;
    }
    const t = setTimeout(() => {
      try {
        const prepared = prepareRoller(s, layers, arts), id = ++job.current;
        setUpdating(true);
        if (worker.current) {
          const msg: WorkerRequest = { id, s, prepared };
          worker.current.postMessage(msg, prepared.maskLayers.map((l) => l.tile.paint.buffer as ArrayBuffer));
        } else {
          setResult(finishRoller(s, prepared)); setUpdating(false); setError('');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 150);
    return () => clearTimeout(t);
  }, [s, layers, arts]);

  // Auto threshold applies Otsu's cutoff for the histogram of one layer's design.
  const autoThreshold = (id: string) => {
    const ref = layers.find((l) => l.id === id)?.ref, art = ref && arts.get(refKey(ref));
    if (art) setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, threshold: Math.min(254, Math.max(1, otsuThreshold(artHistogram([art])))) } : l)));
  };

  // A design from the library becomes the new top layer.
  const addDesign = (ref: DesignRef) => setLayers((ls) => [...ls, newDesignLayer(ref)]);
  const inMix = useMemo(() => new Set(refs.map(refKey)), [refs]);
  const baseName = result ? exportName(s, result) : 'roller';

  // The worker hands the STL over, so each download and plate part gets its own copy.
  const onStl = () => { if (result) download(new Blob([result.stl.slice(0)], { type: 'model/stl' }), `${baseName}.stl`); };
  const onAddToPlate = () => { if (result) setPlate((p) => [...p, { name: baseName, stl: result.stl.slice(0) }]); };
  // A traced piece gets a band over its middle 80%, ready to adjust.
  const usePhotoPiece = (piece: Piece) => {
    const S = surfaceLength(piece);
    set('piece', piece); set('bandFrom', Math.round(S * 0.1)); set('bandTo', Math.round(S * 0.9));
    setPhotoOpen(false);
  };
  const onScale = (k: number) => {
    const [ns, nl] = scaleDesign(s, layers, k);
    setSettings({ ...ns }); setLayers(nl);
  };
  const onPng = (cv: HTMLCanvasElement) => cv.toBlob((b) => b && download(b, `${baseName}.png`));

  return (
    <>
      <header>
        <h1>Pottery Roller Maker</h1>
        <p>Printable texture and underglaze rollers, sized to your pot.</p>
      </header>
      <div className="app">
        <Controls s={s} set={set} result={result} onPhoto={() => setPhotoOpen(true)} onScale={onScale} />
        <main>
          <Preview s={s} result={result} error={error} loading={loading} updating={updating} onPaint={(c) => set('paintColor', c)} onStl={onStl} onAddToPlate={onAddToPlate} onPng={onPng} />
          <PlatePanel plate={plate} bedW={s.bedW} bedD={s.bedD} onRemove={(i) => setPlate((p) => p.filter((_, k) => k !== i))}
            onClear={() => setPlate([])} onDownload={(zip, name) => download(new Blob([zip as BlobPart], { type: 'model/3mf' }), name)} />
          <LayersPanel layers={layers} setLayers={setLayers} info={result?.layerInfo ?? new Map()} errors={artErrors} onAutoThreshold={autoThreshold} onAddDesign={() => setLibraryOpen(true)} />
        </main>
      </div>
      {libraryOpen && <Drawer labelledBy="library-title" onClose={() => setLibraryOpen(false)}><Library inMix={inMix} onAdd={addDesign} /></Drawer>}
      {photoOpen && <PhotoPiece onUse={usePhotoPiece} onClose={() => setPhotoOpen(false)} />}
    </>
  );
}
