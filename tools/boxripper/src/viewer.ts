// Interactive low-poly box viewer. Wraps the per-face textures onto a cuboid
// (including an optional bottom), keeps the dither crisp with NearestFilter,
// and exports the result as a .glb.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Dims, FaceKey } from './types';

// BoxGeometry material slots are ordered [+x, -x, +y, -y, +z, -z].
// We treat +z as Front, so the mapping to our face keys is:
const SLOT_FACE: FaceKey[] = ['right', 'left', 'top', 'bottom', 'front', 'back'];

export class BoxViewer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private textures: THREE.Texture[] = [];
  private needsRender = true;
  private lastDimsKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x17191f);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(2, 1.5, 2.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', () => {
      this.needsRender = true;
    });

    // Mostly-flat lighting so textures read true, with a touch of form.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(3, 5, 2);
    this.scene.add(dir);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  /** Rebuild the box with the given face textures and proportions. */
  update(faceCanvases: Record<FaceKey, HTMLCanvasElement | null>, dims: Dims) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      const materials = this.mesh.material;
      if (Array.isArray(materials)) materials.forEach((material) => material.dispose());
      else materials.dispose();
      this.mesh = null;
    }
    for (const t of this.textures) t.dispose();
    this.textures = [];

    const geo = new THREE.BoxGeometry(dims.w, dims.h, dims.d);
    const materials = SLOT_FACE.map((slot) => {
      const canvas = faceCanvases[slot];
      if (!canvas) {
        // Unset face (including an unused bottom) — neutral placeholder.
        return new THREE.MeshStandardMaterial({
          color: 0x76818b,
          roughness: 1,
          metalness: 0,
        });
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter; // keep the dither crunchy
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(tex);
      return new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 1,
        metalness: 0,
      });
    });

    this.mesh = new THREE.Mesh(geo, materials);
    this.scene.add(this.mesh);
    this.needsRender = true;

    // Only (re)frame the camera when the box proportions actually change —
    // otherwise texture-only updates (corner drags, dither tweaks) would fight
    // the user's orbit every frame.
    const dimsKey = `${dims.w}x${dims.h}x${dims.d}`;
    if (dimsKey !== this.lastDimsKey) {
      this.lastDimsKey = dimsKey;
      this.frameCamera(dims);
    }
  }

  resetView(dims: Dims) {
    this.resize();
    this.frameCamera(dims);
  }

  private frameCamera(dims: Dims) {
    const radius = Math.hypot(dims.w, dims.h, dims.d) / 2;
    const halfVertical = (this.camera.fov * Math.PI) / 360;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * this.camera.aspect);
    const dist = radius / Math.sin(Math.min(halfVertical, halfHorizontal));
    const dir = new THREE.Vector3(1, 0.7, 1.2).normalize();
    this.camera.position.copy(dir.multiplyScalar(dist * 1.1));
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private resize() {
    // Reconcile the drawing buffer with the canvas's laid-out CSS size. Called
    // every frame so a 0-size construction (before layout) self-corrects.
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.resize();
    this.controls.update();
    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  /** Export the current box as a binary glTF (.glb) blob with embedded textures. */
  exportGLB(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mesh) {
        reject(new Error('nothing to export yet'));
        return;
      }
      new GLTFExporter().parse(
        this.mesh,
        (result) => resolve(new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })),
        (err) => reject(err),
        { binary: true },
      );
    });
  }
}
