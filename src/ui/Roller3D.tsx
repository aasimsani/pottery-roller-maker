import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Mesh } from '../core/roller';
import { frameObject, useOrbitScene } from './scene';

const material = new THREE.MeshStandardMaterial({ color: 0x5c9a9d, roughness: 0.55, flatShading: true });

// Roller3D shows the drum lying on its side, the way you hold it. The camera reframes only when the size changes a lot.
export function Roller3D({ mesh, length, diameter }: { mesh: Mesh; length: number; diameter: number }) {
  const host = useRef<HTMLDivElement>(null);
  const three = useOrbitScene(host);
  const framedFor = useRef('');
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.translate(0, 0, -length / 2);
    const m = new THREE.Mesh(g, material);
    m.rotation.y = Math.PI / 2;
    t.scene.add(m);
    const key = `${Math.round(Math.log2(length) * 4)}:${Math.round(Math.log2(diameter) * 4)}`;
    if (framedFor.current !== key) { frameObject(t, m, new THREE.Vector3(0.25, 0.5, 1)); framedFor.current = key; }
    return () => { t.scene.remove(m); g.dispose(); };
  }, [mesh, length, diameter, three]);
  return <div className="roller3d" ref={host} aria-label="3D view of the roller. Drag to turn it, scroll to zoom." />;
}
