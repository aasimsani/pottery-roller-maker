import { useMemo, useState } from 'react';
import { packPlate, plate3mf, stlSize, type PlatePart } from '../core/plate';

/** The gap the plate leaves between rollers, in mm. */
const GAP = 10;

interface Props {
  plate: PlatePart[];
  onRemove: (index: number) => void;
  onClear: () => void;
  onDownload: (zip: Uint8Array, name: string) => void;
  bedW: number; bedD: number;
}

/** Lists the rollers added to the plate, and saves them as one 3MF file for the slicer. */
export function PlatePanel({ plate, onRemove, onClear, onDownload, bedW, bedD }: Props) {
  const [busy, setBusy] = useState(false);
  const sizes = useMemo(() => plate.map((p) => stlSize(p.stl)), [plate]);
  const fits = packPlate(sizes.map(([w, d]) => [w, d]), bedW, bedD, GAP) !== null;
  if (!plate.length) return null;

  const download = async () => {
    setBusy(true);
    try {
      const zip = await plate3mf(plate, bedW, bedD, GAP);
      if (zip) onDownload(zip, `plate_${plate.length}-rollers.3mf`);
    } finally { setBusy(false); }
  };

  return (
    <section className="panel plate" aria-labelledby="plate-title">
      <h2 id="plate-title">Plate <span className="hint">({plate.length} roller{plate.length > 1 ? 's' : ''})</span></h2>
      <ul className="plate-list">
        {plate.map((p, i) => (
          <li key={i}>
            <span>{p.name}</span>
            <span className="hint">{sizes[i][0].toFixed(0)} × {sizes[i][1].toFixed(0)} × {sizes[i][2].toFixed(1)} mm</span>
            <button className="icon" aria-label={`Remove ${p.name} from the plate`} onClick={() => onRemove(i)}>×</button>
          </li>
        ))}
      </ul>
      {!fits && <p className="warn">These rollers do not fit on one {bedW} × {bedD} mm plate. Remove one, and print it on its own plate.</p>}
      <div className="actions">
        <button onClick={download} disabled={!fits || busy}>{busy ? 'Building the plate…' : 'Download plate (.3mf)'}</button>
        <button className="secondary" onClick={onClear}>Clear the plate</button>
      </div>
      <p className="hint">
        The 3MF file opens in Bambu Studio with every roller already placed, {GAP} mm apart. It holds the shapes only, so pick
        the filament and the print settings in the slicer. The plate empties when you reload the page.
      </p>
    </section>
  );
}
