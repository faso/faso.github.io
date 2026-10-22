// Texture cruncher: take a rectified face canvas and dither it to a small palette
// (or 1-bit black/white) for a low-poly look. Adaptive palettes come from a
// median-cut over the face's own colors so they suit each photo.

import type { DitherSettings } from './types';

type RGB = [number, number, number];

// Error-diffusion kernels: [dx, dy, weight]. Atkinson spreads only 6/8 of the
// error (note divisor 8 with weights summing to 6) for its characteristic look.
const KERNELS: Record<'floyd' | 'atkinson', { div: number; offs: [number, number, number][] }> = {
  floyd: {
    div: 16,
    offs: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  atkinson: {
    div: 8,
    offs: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
};

/** Dither a canvas in place-ish, returning a new canvas of the same size. */
export function applyDither(src: HTMLCanvasElement, settings: DitherSettings): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d')!;
  const imageData = sctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const palette: RGB[] =
    settings.mode === 'bw'
      ? [
          [0, 0, 0],
          [255, 255, 255],
        ]
      : medianCut(sampleColors(data), Math.max(2, settings.paletteSize));

  const bw = settings.mode === 'bw';
  if (settings.algorithm === 'none') {
    quantizeNoDither(data, palette, bw);
  } else {
    diffuse(data, w, h, palette, KERNELS[settings.algorithm], bw);
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.putImageData(imageData, 0, 0);
  return out;
}

/** Independent copy of a canvas, so duplicated faces don't alias one texture. */
export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  out.getContext('2d')!.drawImage(src, 0, 0);
  return out;
}

/** Rotate a canvas by `q` clockwise quarter-turns (0-3). q=0 returns src as-is. */
export function rotateCanvas(src: HTMLCanvasElement, q: number): HTMLCanvasElement {
  q = ((q % 4) + 4) % 4;
  if (q === 0) return src;
  const swap = q === 1 || q === 3;
  const out = document.createElement('canvas');
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // keep the dither crisp
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((q * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** Mirror a canvas horizontally (for duplicated/unseen faces). */
export function mirrorCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return out;
}

function lum(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Nearest palette color. In bw mode, compare on luminance so it reads as tone. */
function nearest(palette: RGB[], r: number, g: number, b: number, bw: boolean): RGB {
  let best = palette[0];
  let bestD = Infinity;
  if (bw) {
    const l = lum(r, g, b);
    for (const p of palette) {
      const d = Math.abs(lum(p[0], p[1], p[2]) - l);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
  for (const p of palette) {
    const dr = p[0] - r;
    const dg = p[1] - g;
    const db = p[2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function quantizeNoDither(data: Uint8ClampedArray, palette: RGB[], bw: boolean) {
  for (let i = 0; i < data.length; i += 4) {
    const c = nearest(palette, data[i], data[i + 1], data[i + 2], bw);
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  }
}

function diffuse(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  palette: RGB[],
  kernel: { div: number; offs: [number, number, number][] },
  bw: boolean,
) {
  // Float working buffers so accumulated error isn't clamped between pixels.
  const n = w * h;
  const fr = new Float32Array(n);
  const fg = new Float32Array(n);
  const fb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    fr[i] = data[i * 4];
    fg[i] = data[i * 4 + 1];
    fb[i] = data[i * 4 + 2];
  }

  for (let y = 0; y < h; y++) {
    // Serpentine scanning reduces directional artifacts.
    const reverse = (y & 1) === 1;
    const xStart = reverse ? w - 1 : 0;
    const xEnd = reverse ? -1 : w;
    const xStep = reverse ? -1 : 1;
    for (let x = xStart; x !== xEnd; x += xStep) {
      const i = y * w + x;
      const oldR = fr[i];
      const oldG = fg[i];
      const oldB = fb[i];
      const c = nearest(palette, oldR, oldG, oldB, bw);
      fr[i] = c[0];
      fg[i] = c[1];
      fb[i] = c[2];
      const er = oldR - c[0];
      const eg = oldG - c[1];
      const eb = oldB - c[2];
      for (const [dx, dy, wgt] of kernel.offs) {
        const nx = x + (reverse ? -dx : dx);
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const j = ny * w + nx;
        const f = wgt / kernel.div;
        fr[j] += er * f;
        fg[j] += eg * f;
        fb[j] += eb * f;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    data[i * 4] = fr[i];
    data[i * 4 + 1] = fg[i];
    data[i * 4 + 2] = fb[i];
    data[i * 4 + 3] = 255;
  }
}

/** Sample up to ~16k opaque pixels as RGB triples for palette extraction. */
function sampleColors(data: Uint8ClampedArray): RGB[] {
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / 16000));
  const out: RGB[] = [];
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (data[i + 3] < 8) continue; // skip the warp's black border
    out.push([data[i], data[i + 1], data[i + 2]]);
  }
  return out.length ? out : [[0, 0, 0]];
}

/**
 * Median-cut color quantization: repeatedly split the color box with the widest
 * channel range at its median until `count` boxes remain, then average each.
 */
function medianCut(pixels: RGB[], count: number): RGB[] {
  let boxes: RGB[][] = [pixels];
  while (boxes.length < count) {
    let bi = -1;
    let bestRange = -1;
    let bestCh = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255;
        let mx = 0;
        for (const p of b) {
          if (p[ch] < mn) mn = p[ch];
          if (p[ch] > mx) mx = p[ch];
        }
        const r = mx - mn;
        if (r > bestRange) {
          bestRange = r;
          bi = i;
          bestCh = ch;
        }
      }
    }
    if (bi < 0) break; // every box is a single color
    const b = boxes[bi];
    b.sort((p, q) => p[bestCh] - q[bestCh]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b): RGB => {
    let r = 0;
    let g = 0;
    let bl = 0;
    for (const p of b) {
      r += p[0];
      g += p[1];
      bl += p[2];
    }
    const n = b.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
}
