import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface OrbitScene { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls }

// useOrbitScene() sets up a lit three.js scene with orbit controls inside host, sized to it,
// and tears it all down on unmount. Drag rotates, scroll zooms, and right-drag pans.
export function useOrbitScene(host: RefObject<HTMLDivElement | null>): RefObject<OrbitScene | null> {
  const three = useRef<OrbitScene>(null);
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(150, 260, 220);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    three.current = { renderer, scene, camera, controls };
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, [host]);
  return three;
}

/** Points the camera at object from direction dir, close enough that it fills the view. */
export function frameObject(t: OrbitScene, object: THREE.Object3D, dir: THREE.Vector3) {
  const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(t.camera.fov / 2))) * 1.05;
  t.controls.target.copy(sphere.center);
  t.camera.position.copy(sphere.center).addScaledVector(dir.clone().normalize(), dist);
  t.controls.update();
}
