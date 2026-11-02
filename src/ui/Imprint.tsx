import { useEffect, useRef } from 'react';
import { heightAt, type Heightmap, type RollerSpec } from '../core/roller';

export type Use = 'texture' | 'underglaze';
const TURNS = 1.5, PX = 900;

// Imprint draws what one and a half turns leave on clay. A texture shows as grooves lit from the left, and
// underglaze shows as paint where the raised tops touch. Dashed lines mark where each turn starts.
// The clay shows the roller's mirror image, so it samples the roller with mirror flipped.
export function Imprint({ map, spec, use }: { map: Heightmap; spec: RollerSpec; use: Use }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, travel = TURNS * Math.PI * spec.diameter, scale = PX / travel;
    const W = PX, H = Math.max(8, Math.round(spec.length * scale));
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!, img = ctx.createImageData(W, H), flip = { ...spec, mirror: !spec.mirror };
    const R = spec.diameter / 2, row = new Float32Array(W);
    for (let y = 0; y < H; y++) {
      const z = spec.length - (y + 0.5) / scale;
      for (let x = 0; x < W; x++) row[x] = heightAt(map, flip, (x + 0.5) / scale / R, z);
      for (let x = 0; x < W; x++) {
        const d = row[x], k = (y * W + x) * 4;
        if (use === 'underglaze') {
          // Paint lands where the tops are near full height. The ramp softens the edge a little, as a real print does.
          const p = Math.min(1, Math.max(0, (d - 0.6) / 0.3));
          img.data[k] = 222 - 180 * p; img.data[k + 1] = 204 - 150 * p; img.data[k + 2] = 178 - 92 * p;
        } else {
          const g = (row[Math.min(W - 1, x + 1)] - row[Math.max(0, x - 1)]) * 90;
          img.data[k] = 214 - 60 * d + g; img.data[k + 1] = 190 - 58 * d + g; img.data[k + 2] = 160 - 52 * d + g;
        }
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(40,30,20,.7)';
    for (let s = Math.PI * spec.diameter; s < travel; s += Math.PI * spec.diameter) {
      ctx.beginPath(); ctx.moveTo(s * scale, 0); ctx.lineTo(s * scale, H); ctx.stroke();
    }
  }, [map, spec, use]);
  return <canvas className="imprint" ref={ref} aria-label="Preview of the impression in clay over one and a half turns" />;
}
