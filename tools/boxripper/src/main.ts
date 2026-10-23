// boxripper — photo → low-poly textured box.
//
// Flow: upload photos → for each visible face mark 4 corners (or duplicate the
// opposite side) → faces are perspective-rectified and dithered → wrapped onto a
// cuboid → spin/zoom and export .glb. Everything is client-side and autosaved.

import './style.css';
import { CornerPicker } from './picker';
import { Warper, quadAspect, isValidQuad, type Pt } from './rectify';
import { applyDither, mirrorCanvas, cloneCanvas, rotateCanvas } from './dither';
import { BoxViewer } from './viewer';
import {
  FACE_KEYS,
  FACE_LABELS,
  defaultProject,
  emptyFace,
  type FaceKey,
  type Project,
} from './types';
import { loadSnapshot, saveSnapshot, clearSnapshot, type Snapshot } from './store';
import { wouldCreateCopyCycle } from './faces';
import { createExamplePhoto, EXAMPLE_FACES } from './example';

interface Photo {
  id: string;
  dataUrl: string;
  name: string;
  img: HTMLImageElement;
}

// --- State ---
let photos: Photo[] = [];
let project: Project = defaultProject();
let activeFace: FaceKey | null = 'front';
let projectEpoch = 0;
let modelBusy = false;
const textures: Record<FaceKey, HTMLCanvasElement | null> = {
  front: null,
  back: null,
  left: null,
  right: null,
  top: null,
  bottom: null,
};

let picker: CornerPicker | null = null;
let viewer: BoxViewer;

// Offscreen WebGL warp target + a 2D canvas to read its pixels for dithering.
const glCanvas = document.createElement('canvas');
let genWarper: Warper | null = null;
const rectCanvas = document.createElement('canvas');

let photoSeq = 0;

// --- DOM ---
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dropzone = $<HTMLButtonElement>('dropzone');
const fileInput = $<HTMLInputElement>('file-input');
const photoStrip = $<HTMLDivElement>('photo-strip');
const faceCards = $<HTMLDivElement>('face-cards');
const editor = $<HTMLDivElement>('editor');
const editorTitle = $<HTMLHeadingElement>('editor-title');
const copySource = $<HTMLSelectElement>('copy-source');
const mirrorRow = $<HTMLLabelElement>('mirror-row');
const mirrorToggle = $<HTMLInputElement>('mirror-toggle');
const captureUi = $<HTMLDivElement>('capture-ui');
const photoSelect = $<HTMLDivElement>('photo-select');
const pickerArea = $<HTMLDivElement>('picker-area');
const facePreview = $<HTMLCanvasElement>('face-preview');
const rotateVal = $<HTMLSpanElement>('rotate-val');
const status = $<HTMLSpanElement>('status');
const saveState = $<HTMLSpanElement>('save-state');

// --- Persistence ---
let saveTimer: number | undefined;
let saveQueue = Promise.resolve();
let saveVersion = 0;
let dirty = false;
function autosave() {
  dirty = true;
  saveVersion++;
  saveState.textContent = 'Unsaved changes';
  saveState.dataset.state = 'pending';
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSave, 500);
}
function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  const version = saveVersion;
  const snap: Snapshot = {
    photos: photos.map(({ id, dataUrl, name }) => ({ id, dataUrl, name })),
    project: structuredClone(project),
    modelName: $<HTMLInputElement>('save-name').value,
  };
  saveState.textContent = 'Saving…';
  saveQueue = saveQueue
    .then(() => saveSnapshot(snap))
    .then(
      () => {
        if (version === saveVersion) {
          saveState.textContent = 'Saved in this browser';
          saveState.dataset.state = 'saved';
        }
      },
      () => {
        if (version === saveVersion) {
          dirty = true;
          saveState.textContent = 'Not saved · storage unavailable';
          saveState.dataset.state = 'error';
        }
      },
    );
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('pagehide', flushSave);

function setStatus(msg: string) {
  status.textContent = msg;
}

// --- Texture generation ---

function findPhoto(id: string | null): Photo | undefined {
  return id ? photos.find((p) => p.id === id) : undefined;
}

/** Rectify + dither a captured face into its texture canvas. */
function generatePrimary(key: FaceKey) {
  const f = project.faces[key];
  const photo = findPhoto(f.photoId);
  if (!photo || !f.points || !isValidQuad(f.points)) {
    textures[key] = null;
    return;
  }
  if (!genWarper) genWarper = new Warper(glCanvas);
  genWarper.setImage(photo.img);

  const aspect = quadAspect(f.points);
  const L = project.dither.downscale;
  let ow: number;
  let oh: number;
  if (aspect >= 1) {
    ow = L;
    oh = Math.max(1, Math.round(L / aspect));
  } else {
    oh = L;
    ow = Math.max(1, Math.round(L * aspect));
  }
  genWarper.render(f.points, ow, oh);

  // Pull the GL result into a 2D canvas (via readPixels, not drawImage — see
  // Warper.readPixels), then dither.
  rectCanvas.width = ow;
  rectCanvas.height = oh;
  rectCanvas.getContext('2d')!.putImageData(genWarper.readPixels(), 0, 0);
  textures[key] = rotateCanvas(applyDither(rectCanvas, project.dither), f.rotate || 0);
}

/** Resolve a duplicated face from its source (optionally mirrored, then rotated). */
function regenerateCopy(key: FaceKey) {
  const f = project.faces[key];
  const src = f.copyFrom ? textures[f.copyFrom] : null;
  if (!src) {
    textures[key] = null;
    return;
  }
  const base = f.mirror ? mirrorCanvas(src) : cloneCanvas(src);
  textures[key] = rotateCanvas(base, f.rotate || 0);
}

/** Resolve dependencies before their copies, regardless of face order. */
function refreshCopies() {
  const done = new Set<FaceKey>();
  const visiting = new Set<FaceKey>();
  function resolve(key: FaceKey): HTMLCanvasElement | null {
    if (done.has(key)) return textures[key];
    if (visiting.has(key)) return null; // tolerate cycles in old saved projects
    visiting.add(key);
    const source = project.faces[key].copyFrom;
    if (source) {
      if (resolve(source)) regenerateCopy(key);
      else textures[key] = null;
    }
    visiting.delete(key);
    done.add(key);
    return textures[key];
  }
  for (const key of FACE_KEYS) resolve(key);
}

function regenerate(key: FaceKey) {
  if (!project.faces[key].copyFrom) generatePrimary(key);
  refreshCopies();
  updateViewer();
  if (activeFace) drawPreview();
}

function regenerateAll() {
  for (const k of FACE_KEYS) if (!project.faces[k].copyFrom) generatePrimary(k);
  refreshCopies();
  updateViewer();
  if (activeFace) drawPreview();
}

function updateViewer() {
  viewer.update(textures, project.dims);
  renderFaceCards();
  updateModelActions();
}

// rAF-throttle heavy regen during dragging / slider scrubbing.
const pendingFaces = new Set<FaceKey>();
let regenScheduled = false;
function scheduleRegen(key: FaceKey) {
  pendingFaces.add(key);
  if (regenScheduled) return;
  regenScheduled = true;
  requestAnimationFrame(() => {
    regenScheduled = false;
    if (!pendingFaces.size) return;
    for (const face of pendingFaces) if (!project.faces[face].copyFrom) generatePrimary(face);
    pendingFaces.clear();
    refreshCopies();
    updateViewer();
    drawPreview();
  });
  autosave();
}
let regenAllScheduled = false;
function scheduleRegenAll() {
  if (regenAllScheduled) return;
  regenAllScheduled = true;
  const epoch = projectEpoch;
  autosave();
  requestAnimationFrame(() => {
    regenAllScheduled = false;
    if (epoch === projectEpoch) regenerateAll();
  });
}

// --- Photos ---

async function uploadFiles(files: File[]) {
  const epoch = projectEpoch;
  const messages: string[] = [];
  let added = 0;
  const feedback = $('upload-status');
  feedback.textContent = 'Reading photos…';
  for (const file of files) {
    try {
      if (!file.type.startsWith('image/')) throw new Error('choose an image file');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('could not read the file'));
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('could not open this image; try JPG, PNG or WebP'));
        image.src = dataUrl;
      });
      if (epoch !== projectEpoch) return;
      photos.push({ id: `p${photoSeq++}`, name: file.name, dataUrl, img });
      added++;
    } catch (error) {
      messages.push(`${file.name}: ${(error as Error).message}.`);
    }
    if (epoch !== projectEpoch) return;
  }
  renderPhotoStrip();
  if (
    activeFace &&
    !project.faces[activeFace].photoId &&
    !project.faces[activeFace].copyFrom &&
    photos.length
  ) {
    project.faces[activeFace].photoId = photos[0].id;
  }
  buildEditor();
  if (added) autosave();
  feedback.textContent = messages.length
    ? messages.join(' ')
    : `${added} photo${added === 1 ? '' : 's'} added. Trace one face at a time.`;
}

function photoButton(photo: Photo, selected: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'photo-button' + (selected ? ' selected' : '');
  button.type = 'button';
  button.title = photo.name;
  button.setAttribute('aria-label', `Use ${photo.name}`);
  button.setAttribute('aria-pressed', String(selected));
  const thumb = document.createElement('img');
  thumb.src = photo.dataUrl;
  thumb.className = 'thumb' + (selected ? ' selected' : '');
  thumb.alt = photo.name;
  button.append(thumb);
  button.onclick = onClick;
  return button;
}

function choosePhoto(id: string) {
  if (!activeFace) activeFace = 'front';
  const f = project.faces[activeFace];
  if (f.photoId !== id) {
    f.photoId = id;
    f.points = null; // points are in the previous image's pixel coordinates
  }
  f.copyFrom = null;
  buildEditor();
  regenerate(activeFace);
  autosave();
}

function renderPhotoStrip() {
  $('sample-row').hidden = photos.length > 0;
  photoStrip.replaceChildren(...photos.map((p) => photoButton(p, false, () => choosePhoto(p.id))));
  $('photo-count').textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
}

// --- Faces ---

const textureUrls = new WeakMap<HTMLCanvasElement, string>();
function renderFaceCards() {
  for (const [index, key] of FACE_KEYS.entries()) {
    const f = project.faces[key];
    let card = faceCards.children[index] as HTMLButtonElement | undefined;
    if (!card) {
      card = document.createElement('button');
      card.innerHTML =
        '<span class="face-thumb"></span><span class="face-name"></span><span class="face-state"></span>';
      card.onclick = () => setActiveFace(key);
      faceCards.append(card);
    }
    card.className = 'face-card' + (key === activeFace ? ' active' : '');
    card.setAttribute('aria-pressed', String(key === activeFace));
    const tex = textures[key];
    const thumb = card.querySelector<HTMLElement>('.face-thumb')!;
    thumb.classList.toggle('has-texture', !!tex);
    if (tex && !textureUrls.has(tex)) textureUrls.set(tex, tex.toDataURL());
    thumb.style.backgroundImage = tex ? `url(${textureUrls.get(tex)})` : '';
    const state = f.copyFrom
      ? `${tex ? '↳' : 'Awaiting'} ${FACE_LABELS[f.copyFrom]}`
      : tex
        ? 'Textured ✓'
        : key === 'bottom'
          ? 'Optional'
          : 'Add texture';
    card.querySelector('.face-name')!.textContent = FACE_LABELS[key];
    card.querySelector('.face-state')!.textContent = state;
    card.setAttribute('aria-label', `${FACE_LABELS[key]} · ${state}`);
  }
  $('face-count').textContent = `${FACE_KEYS.filter((k) => textures[k]).length} / 6 textured`;
}

function setActiveFace(key: FaceKey) {
  activeFace = key;
  renderFaceCards();
  buildEditor();
  // Keep the face selector and 3D preview in place while switching sides.
}

function buildEditor() {
  picker?.destroy();
  picker = null;
  pickerArea.replaceChildren();
  if (!activeFace) {
    editor.style.display = 'none';
    return;
  }
  const key = activeFace;
  const f = project.faces[key];
  editor.style.display = 'flex';
  editorTitle.textContent = FACE_LABELS[key];

  // Texture source: capture from a photo, or copy another face (annotated with
  // whether that face actually has a texture yet).
  copySource.innerHTML = '';
  copySource.append(new Option('Capture from photo', ''));
  for (const other of FACE_KEYS) {
    if (other === key) continue;
    const has = textures[other] != null;
    const cycle = wouldCreateCopyCycle(project, key, other);
    const option = new Option(
      `Copy ${FACE_LABELS[other]}${cycle ? ' (would loop)' : has ? '' : ' (empty)'}`,
      other,
    );
    option.disabled = cycle;
    copySource.append(option);
  }
  copySource.value = f.copyFrom ?? '';
  mirrorToggle.checked = f.mirror;
  mirrorRow.style.display = f.copyFrom ? 'flex' : 'none';
  captureUi.style.display = f.copyFrom ? 'none' : 'block';
  rotateVal.textContent = `${(f.rotate || 0) * 90}°`;

  if (!f.copyFrom) buildCaptureUi(key);
  drawPreview();
}

function buildCaptureUi(key: FaceKey) {
  const f = project.faces[key];
  photoSelect.replaceChildren();
  if (photos.length === 0) {
    const note = document.createElement('p');
    note.className = 'hint empty-editor';
    note.innerHTML =
      '<strong>Every box starts with a photo.</strong>Add one above or try the sample, then drag the four corners around a visible face.';
    photoSelect.append(note);
  } else {
    for (const p of photos)
      photoSelect.append(photoButton(p, p.id === f.photoId, () => choosePhoto(p.id)));
    if (!f.photoId) {
      const note = document.createElement('p');
      note.className = 'hint empty-editor';
      note.textContent = 'Choose a photo above, or copy a finished face using Texture source.';
      photoSelect.append(note);
    }
  }
  mountPicker(key);
}

function mountPicker(key: FaceKey) {
  const f = project.faces[key];
  picker?.destroy();
  pickerArea.replaceChildren();
  picker = null;
  const photo = findPhoto(f.photoId);
  $('picker-help').hidden = !photo;
  if (!photo) return;
  picker = new CornerPicker(pickerArea, (pts: Pt[]) => {
    project.faces[key].points = pts;
    scheduleRegen(key);
  });
  picker.setImage(photo.img, f.points ?? undefined);
}

function drawPreview() {
  if (!activeFace) return;
  const tex = textures[activeFace];
  $('texture-result').dataset.empty = String(!tex);
  $('texture-size').textContent = tex
    ? `${tex.width} × ${tex.height} px`
    : project.faces[activeFace].copyFrom
      ? 'Add a texture to the source face first'
      : 'Choose a photo to begin';
  $<HTMLButtonElement>('rotate-cw').disabled = !tex;
  $<HTMLButtonElement>('rotate-ccw').disabled = !tex;
  const f = project.faces[activeFace];
  $<HTMLButtonElement>('clear-face').disabled = !f.photoId && !f.copyFrom;
  const ctx = facePreview.getContext('2d')!;
  if (!tex) {
    facePreview.width = 160;
    facePreview.height = 120;
    ctx.clearRect(0, 0, facePreview.width, facePreview.height);
    return;
  }
  facePreview.width = tex.width;
  facePreview.height = tex.height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tex, 0, 0);
}

// --- Proportions ---

function aspectOf(key: FaceKey): number | null {
  const texture = textures[key];
  return texture ? texture.width / texture.height : null;
}

function computeDims() {
  const clamp = (v: number) => Math.max(0.1, Math.min(3, v));
  const frontA = aspectOf('front') ?? aspectOf('back');
  const sideA = aspectOf('left') ?? aspectOf('right');
  const h = 1;
  const w = frontA ? clamp(h * frontA) : project.dims.w;
  const d = sideA ? clamp(h * sideA) : project.dims.d;
  project.dims = { w: round2(w), h, d: round2(d) };
  syncDimInputs();
  updateViewer();
  autosave();
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function syncDimInputs() {
  $<HTMLInputElement>('dim-w').value = String(project.dims.w);
  $<HTMLInputElement>('dim-h').value = String(project.dims.h);
  $<HTMLInputElement>('dim-d').value = String(project.dims.d);
  $<HTMLSpanElement>('dim-w-val').textContent = project.dims.w.toFixed(2);
  $<HTMLSpanElement>('dim-h-val').textContent = project.dims.h.toFixed(2);
  $<HTMLSpanElement>('dim-d-val').textContent = project.dims.d.toFixed(2);
}

// --- Texture controls ---

function syncTextureInputs() {
  $<HTMLSelectElement>('dither-mode').value = project.dither.mode;
  $<HTMLInputElement>('palette-size').value = String(project.dither.paletteSize);
  $<HTMLSpanElement>('palette-size-val').textContent = String(project.dither.paletteSize);
  $<HTMLSelectElement>('dither-algo').value = project.dither.algorithm;
  $<HTMLInputElement>('downscale').value = String(project.dither.downscale);
  $<HTMLSpanElement>('downscale-val').textContent = `${project.dither.downscale}px`;
  $<HTMLDivElement>('palette-size-row').style.display =
    project.dither.mode === 'palette' ? 'flex' : 'none';
}

// --- Wiring ---

function wireUpload() {
  $('sample-btn').addEventListener('click', async () => {
    const button = $<HTMLButtonElement>('sample-btn');
    const epoch = projectEpoch;
    button.disabled = true;
    try {
      const file = await createExamplePhoto();
      if (epoch !== projectEpoch || photos.length) return;
      await uploadFiles([file]);
      if (epoch !== projectEpoch || photos.length !== 1) return;
      const photo = photos[0];
      if (photo.name !== file.name) return;
      for (const [face, points] of Object.entries(EXAMPLE_FACES)) {
        project.faces[face as FaceKey] = {
          ...emptyFace(), photoId: photo.id, points: points.map(([x, y]) => [x, y] as Pt),
        };
      }
      project.dims = { w: 0.87, h: 1, d: 0.55 };
      $<HTMLInputElement>('save-name').value = 'field-box';
      syncDimInputs();
      regenerateAll();
      buildEditor();
      viewer.resetView(project.dims);
      autosave();
      $('upload-status').textContent = 'Sample loaded · 3 editable faces.';
    } catch {
      $('upload-status').textContent = 'Could not open the sample. You can still add your own photos.';
    } finally {
      button.disabled = false;
    }
  });
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    void uploadFiles(Array.from(fileInput.files ?? []));
    fileInput.value = '';
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    void uploadFiles(Array.from(e.dataTransfer?.files ?? []));
  });
}

function wireEditor() {
  $('reset-corners').addEventListener('click', () => {
    if (!activeFace) return;
    project.faces[activeFace].points = null;
    mountPicker(activeFace);
  });
  $('clear-face').addEventListener('click', () => {
    if (!activeFace) return;
    project.faces[activeFace] = emptyFace();
    buildEditor();
    regenerate(activeFace);
    autosave();
  });
  copySource.addEventListener('change', () => {
    if (!activeFace) return;
    const val = copySource.value;
    if (val && wouldCreateCopyCycle(project, activeFace, val as FaceKey)) {
      setStatus('That copy would create a loop. Choose another face.');
      buildEditor();
      return;
    }
    project.faces[activeFace].copyFrom = val === '' ? null : (val as FaceKey);
    buildEditor();
    regenerate(activeFace);
    autosave();
  });
  mirrorToggle.addEventListener('change', () => {
    if (!activeFace) return;
    project.faces[activeFace].mirror = mirrorToggle.checked;
    regenerate(activeFace);
    autosave();
  });
  const rotateBy = (delta: number) => {
    if (!activeFace) return;
    const f = project.faces[activeFace];
    f.rotate = ((((f.rotate || 0) + delta) % 4) + 4) % 4;
    rotateVal.textContent = `${f.rotate * 90}°`;
    regenerate(activeFace);
    autosave();
  };
  $<HTMLButtonElement>('rotate-cw').addEventListener('click', () => rotateBy(1));
  $<HTMLButtonElement>('rotate-ccw').addEventListener('click', () => rotateBy(-1));
}

function wireTextureControls() {
  $<HTMLSelectElement>('dither-mode').addEventListener('change', (e) => {
    project.dither.mode = (e.target as HTMLSelectElement).value as 'palette' | 'bw';
    syncTextureInputs();
    scheduleRegenAll();
  });
  $<HTMLInputElement>('palette-size').addEventListener('input', (e) => {
    project.dither.paletteSize = parseInt((e.target as HTMLInputElement).value, 10);
    $<HTMLSpanElement>('palette-size-val').textContent = String(project.dither.paletteSize);
    scheduleRegenAll();
  });
  $<HTMLSelectElement>('dither-algo').addEventListener('change', (e) => {
    project.dither.algorithm = (e.target as HTMLSelectElement).value as
      | 'floyd'
      | 'atkinson'
      | 'none';
    scheduleRegenAll();
  });
  $<HTMLInputElement>('downscale').addEventListener('input', (e) => {
    project.dither.downscale = parseInt((e.target as HTMLInputElement).value, 10);
    $<HTMLSpanElement>('downscale-val').textContent = `${project.dither.downscale}px`;
    scheduleRegenAll();
  });
}

function wireProportions() {
  const onDim = (which: 'w' | 'h' | 'd', el: HTMLInputElement, val: HTMLSpanElement) => {
    el.addEventListener('input', () => {
      project.dims[which] = parseFloat(el.value);
      val.textContent = project.dims[which].toFixed(2);
      updateViewer();
      autosave();
    });
  };
  onDim('w', $<HTMLInputElement>('dim-w'), $<HTMLSpanElement>('dim-w-val'));
  onDim('h', $<HTMLInputElement>('dim-h'), $<HTMLSpanElement>('dim-h-val'));
  onDim('d', $<HTMLInputElement>('dim-d'), $<HTMLSpanElement>('dim-d-val'));
  $<HTMLButtonElement>('recompute-btn').addEventListener('click', computeDims);
}

function updateModelActions() {
  const count = FACE_KEYS.filter((k) => textures[k]).length;
  $<HTMLButtonElement>('export-btn').disabled = !count || modelBusy;
  $<HTMLButtonElement>('reset-btn').disabled = modelBusy;
  $('model-hint').textContent = !count
    ? 'Your textures will appear here. Add a photo or try the sample.'
    : count === 6
      ? 'All six faces are ready. Your box is ready to go.'
      : `${count} of 6 faces textured. Empty faces export as a solid color; the bottom is optional.`;
}

function wireModel() {
  $('reset-view').addEventListener('click', () => viewer.resetView(project.dims));
  $('save-name').addEventListener('input', autosave);
  $<HTMLButtonElement>('export-btn').addEventListener('click', async () => {
    modelBusy = true;
    updateModelActions();
    try {
      setStatus('Preparing your model…');
      const blob = await viewer.exportGLB();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const name =
        $<HTMLInputElement>('save-name')
          .value.trim()
          .replace(/[^a-zA-Z0-9_-]+/g, '-') || 'boxripper';
      a.download = `${name}.glb`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setStatus(`Downloaded ${a.download} · ${(blob.size / 1024).toFixed(0)} KB`);
    } catch (err) {
      setStatus('Export failed: ' + (err as Error).message);
    } finally {
      modelBusy = false;
      updateModelActions();
    }
  });

}

function wireReset() {
  $<HTMLButtonElement>('reset-btn').addEventListener('click', async () => {
    if (
      !confirm(
        'Start a new project? This clears the photos and faces saved in this browser. Download your model first if you want to keep it.',
      )
    )
      return;
    projectEpoch++;
    pendingFaces.clear();
    saveVersion++;
    clearTimeout(saveTimer);
    dirty = false;
    photos = [];
    project = defaultProject();
    activeFace = 'front';
    photoSeq = 0;
    for (const k of FACE_KEYS) textures[k] = null;
    $<HTMLInputElement>('save-name').value = '';
    $('upload-status').textContent = '';
    setStatus('');
    renderPhotoStrip();
    buildEditor();
    syncTextureInputs();
    syncDimInputs();
    regenerateAll();
    saveState.textContent = 'Clearing…';
    // Serialize with any in-flight writes; never let an old save resurrect a reset.
    const version = saveVersion;
    saveQueue = saveQueue.then(clearSnapshot).then(
      () => {
        if (version === saveVersion) {
          saveState.textContent = 'New project';
          saveState.dataset.state = '';
        }
      },
      () => {
        if (version === saveVersion) {
          saveState.textContent = 'Could not clear saved project';
          saveState.dataset.state = 'error';
        }
      },
    );
    await saveQueue;
  });
}

// --- Boot ---

async function boot() {
  document.querySelector('main')!.inert = true;
  $<HTMLButtonElement>('reset-btn').disabled = true;
  viewer = new BoxViewer($<HTMLCanvasElement>('viewer'));
  wireUpload();
  wireEditor();
  wireTextureControls();
  wireProportions();
  wireModel();
  wireReset();

  const snap = await loadSnapshot().catch(() => {
    saveState.textContent = 'Browser storage unavailable';
    saveState.dataset.state = 'error';
    return null;
  });
  if (snap) {
    project = snap.project;
    $<HTMLInputElement>('save-name').value = snap.modelName ?? '';
    // Backfill any face missing from an older saved project (e.g. bottom).
    for (const k of FACE_KEYS) project.faces[k] = { ...emptyFace(), ...project.faces[k] };
    photoSeq = 0;
    for (const sp of snap.photos) {
      // Preserve original ids so face.photoId references still resolve.
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          photos.push({
            id: sp.id,
            name: sp.name ?? `Photo ${photos.length + 1}`,
            dataUrl: sp.dataUrl,
            img,
          });
          const n = parseInt(sp.id.slice(1), 10);
          if (!isNaN(n) && n >= photoSeq) photoSeq = n + 1;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = sp.dataUrl;
      });
    }
    renderPhotoStrip();
    saveState.textContent = 'Previous project restored';
  }

  syncTextureInputs();
  syncDimInputs();
  regenerateAll();
  buildEditor();
  document.querySelector('main')!.inert = false;
}

boot().catch((err) => {
  document.querySelector('main')!.inert = false;
  saveState.textContent = 'Could not start';
  saveState.dataset.state = 'error';
  setStatus(`Could not open the editor: ${err.message}. Try reloading with WebGL enabled.`);
});
