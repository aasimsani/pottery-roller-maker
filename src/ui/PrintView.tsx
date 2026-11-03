import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { frameObject, useOrbitScene } from './scene';
import { packPlate } from '../core/plate';
import { cssRgb } from '../render/preview';

/** A theme colour token as a three.js colour. */
const tokenColor = (name: string) => { const [r, g, b] = cssRgb(name); return new THREE.Color(r / 255, g / 255, b / 255); };

interface Props { stl: ArrayBuffer; bedW: number; bedD: number; className?: string; label: string; lying?: boolean; extras?: ArrayBuffer[] }

// stlGeometry() reads a binary STL into a three.js geometry, keeping its flat face normals.
function stlGeometry(stl: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(stl), n = dv.getUint32(80, true);
  const pos = new Float32Array(n * 9), nor = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) {
      pos[t * 9 + v * 3 + k] = dv.getFloat32(o + 12 + v * 12 + k * 4, true);
      nor[t * 9 + v * 3 + k] = dv.getFloat32(o + k * 4, true);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}

/** Shows the exact print file on the printer bed, as the slicer will place it. lying shows the part alone on its side, the way you hold a roller.
 *  extras are more parts for the same plate, such as the handle and the axle, laid out the way the 3MF places them. */
export default function PrintView({ stl, bedW, bedD, className, label, lying, extras }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useOrbitScene(host);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    // The STL is z-up and three.js is y-up, so the whole print turns −90° about x.
    const print = new THREE.Group();
    print.rotation.x = -Math.PI / 2;
    if (lying) print.rotation.set(0, Math.PI / 2, 0);

    const geos = [stl, ...(lying ? [] : extras ?? [])].map(stlGeometry);
    geos.forEach((g) => g.computeBoundingBox());
    // Several parts go where plate3mf() puts them. packPlate() measures from the bed's front-left corner, and this bed is centred on the origin.
    const at = geos.length > 1 ? packPlate(geos.map((g) => [g.boundingBox!.max.x - g.boundingBox!.min.x, g.boundingBox!.max.y - g.boundingBox!.min.y]), bedW, bedD, 10) : null;
    const material = new THREE.MeshStandardMaterial({ color: tokenColor(lying ? '--plastic' : '--print-plastic'), roughness: 0.55, side: THREE.DoubleSide });
    const shown = at ? geos : geos.slice(0, 1);
    shown.forEach((geo, i) => {
      const box = geo.boundingBox!;
      if (at) geo.translate(-box.min.x + at[i][0] - bedW / 2, -box.min.y + at[i][1] - bedD / 2, -box.min.z);
      else {
        // Centre the part on the bed, standing on it, the way Bambu Studio places an import.
        geo.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
        if (lying) geo.translate(0, 0, -(box.max.z - box.min.z) / 2);
      }
      print.add(new THREE.Mesh(geo, material));
    });
    const plastic = print.children[0] as THREE.Mesh;

    const bed = new THREE.Mesh(new THREE.PlaneGeometry(bedW, bedD), new THREE.MeshStandardMaterial({ color: tokenColor('--print-bed'), roughness: 0.9 }));
    bed.position.z = -0.05;
    if (!lying) print.add(bed);
    const grid = new THREE.GridHelper(Math.max(bedW, bedD), Math.round(Math.max(bedW, bedD) / 10), tokenColor('--print-grid'), tokenColor('--print-grid'));
    grid.rotation.x = Math.PI / 2;
    if (!lying) print.add(grid);

    t.scene.add(print);
    frameObject(t, at ? print : plastic, lying ? new THREE.Vector3(0.25, 0.5, 1) : new THREE.Vector3(0.4, 0.9, 1));
    return () => {
      t.scene.remove(print);
      geos.forEach((g) => g.dispose());
      material.dispose();
      bed.geometry.dispose(); (bed.material as THREE.Material).dispose();
      grid.dispose();
    };
  }, [stl, bedW, bedD, lying, extras, three]);

  return <div ref={host} className={className} role="img" aria-label={label} />;
}
