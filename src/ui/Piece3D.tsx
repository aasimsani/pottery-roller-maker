import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { pieceProfile, surfaceLength, TEX_PAD } from '../core/piece';
import type { RollerResult } from '../pipeline';
import { cssRgb } from '../render/preview';
import type { Settings } from '../state';
import { frameObject, useOrbitScene } from './scene';

export type PieceMode = 'painted' | 'roller' | 'print';

interface Props { s: Settings; result: RollerResult; className?: string; label: string }

// paintTexture() shows what the roller leaves on the piece. Texture columns run once round the
// circumference, and rows run up the whole outer surface from base to rim, with TEX_PAD rows of plain
// clay at each end. One turn of the roller covers 1/laps of the way round, so the pattern repeats laps times.
// A texture shows as darker clay in the grooves, and underglaze shows in the paint colour.
function paintTexture(s: Settings, { g, mask, band }: RollerResult): HTMLCanvasElement {
  const S = surfaceLength(s.piece), meanD = s.piece.profile.reduce((a, p) => a + p.d, 0) / s.piece.profile.length;
  const W = 2048, H = Math.max(64, Math.min(2048, Math.round((W * S) / (Math.PI * meanD) / (1 - 2 * TEX_PAD))));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(W, H), d = img.data;
  const clay = cssRgb('--clay'), laps = Math.max(1, Math.round(s.laps));
  const paint: typeof clay = s.use === 'underglaze' ? cssRgb(s.paintColor) : [clay[0] * 0.72, clay[1] * 0.7, clay[2] * 0.68];
  for (let y = 0; y < H; y++) {
    // Canvas row 0 is the texture's top (v = 1), which is the rim.
    const t = (1 - (y + 0.5) / H - TEX_PAD) / (1 - 2 * TEX_PAD), sb = t * S - band.start; // mm up from the band's bottom edge
    for (let x = 0; x < W; x++) {
      let col = clay;
      if (t >= 0 && t <= 1) {
        const turn = (x + 0.5) / W; // 0→1 round the piece, starting at the front
        // The clay shows the roller's mirror image, so a roller without Mirror leaves the pattern reversed.
        const span = (turn * laps) % 1, frac = s.mirror ? span : 1 - span;
        const k = g.toPixel(sb, frac);
        if (k >= 0 && mask.inside[k] && !mask.solid[k]) col = paint;
      }
      const o = (y * W + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// buildMesh() revolves the piece's profile into a lathe mesh. Its UVs come from the profile,
// so u runs round the circumference and v follows the surface from base to rim.
function buildMesh(s: Settings, texture: THREE.Texture) {
  const { points, flat } = pieceProfile(s.piece);
  const segments = 256;
  const geo = new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p.r, p.z)), segments);
  const uv = geo.attributes.uv;
  // LatheGeometry lays vertices out segment by segment, with one vertex per profile point.
  for (let i = 0; i <= segments; i++) for (let j = 0; j < points.length; j++) uv.setXY(i * points.length + j, i / segments, points[j].v);
  uv.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  return { mesh: new THREE.Mesh(geo, mat), flat };
}

/** An orbitable 3D view of the piece. Drag to rotate, scroll to zoom, right-drag to pan. */
export default function Piece3D({ s, result, className, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useOrbitScene(host);
  const view = useRef<{ scene?: object; mesh?: THREE.Mesh; fitKey?: string }>({});

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const texture = new THREE.CanvasTexture(paintTexture(s, result));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = t.renderer.capabilities.getMaxAnisotropy();
    const { mesh, flat } = buildMesh(s, texture);
    const v = view.current;
    // A new scene (React can mount twice in development) starts empty and unframed.
    if (v.scene !== t) { v.scene = t; v.mesh = undefined; v.fitKey = undefined; }
    if (v.mesh) {
      t.scene.remove(v.mesh);
      v.mesh.geometry.dispose();
      const m = v.mesh.material as THREE.MeshStandardMaterial;
      m.map?.dispose(); m.dispose();
    }
    t.scene.add(mesh);
    v.mesh = mesh;

    // Re-frame the camera only when the piece's shape changes, so a paint tweak keeps your view.
    const fitKey = JSON.stringify(s.piece.profile);
    if (v.fitKey !== fitKey) {
      v.fitKey = fitKey;
      frameObject(t, mesh, flat ? new THREE.Vector3(0, 1.1, 1) : new THREE.Vector3(0, 0.35, 1));
    }
  }, [s.piece, s.paintColor, s.use, s.laps, s.mirror, result, three]); // only what the texture and the mesh read, so unrelated settings don't rebuild them

  return <div ref={host} className={className} role="img" aria-label={label} />;
}
