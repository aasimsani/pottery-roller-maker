import { useEffect, useRef, useState } from 'react';
import { autoTolerance, profileFromMask, segment, type TracedProfile } from '../core/photo';
import type { Piece } from '../core/piece';
import { NumberField, RangeField } from './fields';
import { useDialog } from './dialog';

const MAX_W = 640, MAX_H = 520;

/** Builds a piece's profile from a side-on photo. This feature is experimental. */
export function PhotoPiece({ onUse, onClose }: { onUse: (piece: Piece) => void; onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // null means automatic: Otsu's method on colour distance from the background.
  const [tol, setTol] = useState<number | null>(null);
  const [usedTol, setUsedTol] = useState(60);
  const [height, setHeight] = useState(95);
  const [name, setName] = useState('Photo piece');
  const [traced, setTraced] = useState<TracedProfile | null>(null);
  const [error, setError] = useState('');
  const view = useRef<HTMLCanvasElement>(null);

  const load = (file?: File | null) => {
    if (!file?.type.startsWith('image/')) return;
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = URL.createObjectURL(file);
  };

  const dialog = useRef<HTMLDivElement>(null);
  useDialog(dialog, true, onClose);

  // Trace the photo whenever it or the settings change, and draw the result over it.
  useEffect(() => {
    const cv = view.current;
    if (!img || !cv) return;
    const k = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const w = (cv.width = Math.round(img.naturalWidth * k)), h = (cv.height = Math.round(img.naturalHeight * k));
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0, w, h);
    const photo = c.getImageData(0, 0, w, h);
    const t0 = tol ?? autoTolerance(photo.data, w, h);
    setUsedTol(t0);
    const mask = segment(photo.data, w, h, t0);
    try {
      const t = profileFromMask(mask, w, h, height, 12);
      setTraced(t); setError('');
      // Tint the detected piece, then mark the centre line and each measured diameter.
      const d = photo.data;
      for (let p = 0; p < w * h; p++) if (mask[p]) { d[p * 4] = d[p * 4] * 0.5 + 40; d[p * 4 + 1] = d[p * 4 + 1] * 0.5 + 100; d[p * 4 + 2] = d[p * 4 + 2] * 0.5 + 110; }
      c.putImageData(photo, 0, 0);
      c.strokeStyle = '#e39a1d'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(t.axis, t.top); c.lineTo(t.axis, t.bottom); c.stroke();
      const scale = height / (t.bottom - t.top + 1);
      for (const q of t.profile) {
        const y = t.bottom - q.z / scale, r = q.d / 2 / scale;
        c.beginPath(); c.moveTo(t.axis - r, y); c.lineTo(t.axis + r, y); c.stroke();
      }
    } catch (e) {
      setTraced(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [img, tol, height]);

  const base = traced?.profile[0], rim = traced?.profile.at(-1);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-body photo" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="photo-title" tabIndex={-1}>
        <div className="modal-head">
          <h2 id="photo-title">Piece from a photo <span className="tag">experimental</span></h2>
          <span className="hint">Traces the outline and measures it row by row. Check the numbers before you print.</span>
          <button className="secondary small" onClick={onClose}>Close</button>
        </div>
        <div className="photo-grid">
          <div
            className="photo-view"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}
          >
            {img ? <canvas ref={view} role="img" aria-label={traced ? `Photo with the traced outline: base ${traced.profile[0].d} mm, rim ${traced.profile.at(-1)!.d} mm across` : 'Photo of the piece'} /> : (
              <label className="drop">
                Drop a photo here or <u>choose one</u>. On a phone this opens the camera.
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            )}
          </div>
          <div className="photo-side">
            <ul className="tips-list">
              <li>Stand the piece on a plain background that contrasts with it, such as white paper behind a dark pot.</li>
              <li>Shoot from 1–2 m away with the camera level with the middle of the piece, and zoom in. That keeps perspective from widening the rim.</li>
              <li>Turn the handle to one side. The tracer measures from the centre line and ignores the handle.</li>
            </ul>
            <NumberField label="Real height" unit="mm" value={height} min={5} step={0.5} onChange={setHeight} />
            <RangeField label={`Background tolerance${tol === null ? ' (auto)' : ''}`} value={usedTol} min={10} max={250} onChange={setTol}
              action={<button type="button" className="secondary small" title="Pick the tolerance that best separates the piece from the background and its shadow" onClick={() => setTol(null)}>Auto</button>} />
            <label>Name <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
            {error && <p className="warn">{error}</p>}
            {base && rim && <p className="ok">Base Ø {base.d} mm, rim Ø {rim.d} mm, {traced!.profile.length} measurements.</p>}
            <div className="row-actions">
              {img && <button className="secondary" onClick={() => { setImg(null); setTraced(null); }}>Another photo</button>}
              <button disabled={!traced} onClick={() => traced && onUse({ name, profile: traced.profile })}>Use this shape</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
