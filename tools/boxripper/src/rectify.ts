// Perspective rectification: take 4 points marking a quad in a source image and
// warp the enclosed region into a clean axis-aligned rectangle.
//
// Approach: solve the 3x3 homography that maps the OUTPUT unit square back into
// the source image (an inverse warp — every output pixel pulls one source sample,
// so there are no holes), then evaluate that homography per-fragment on the GPU.

export type Pt = [number, number];

/** Order of the 4 corner points everywhere in the app. */
export const CORNER_ORDER = ['TL', 'TR', 'BR', 'BL'] as const;

/**
 * Solve the homography mapping the four `dst` points to the four `src` points.
 * Returns the 3x3 matrix in row-major order (9 numbers, H[8] normalised to 1).
 *
 * Each correspondence (dx,dy)->(sx,sy) contributes two rows to an 8x8 linear
 * system in the unknowns [h00 h01 h02 h10 h11 h12 h20 h21] (with h22 fixed = 1).
 */
export function solveHomography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = dst[i];
    const [sx, sy] = src[i];
    A.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx]);
    b.push(sx);
    A.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy]);
    b.push(sy);
  }
  const h = solveLinear(A, b); // 8 unknowns
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Gaussian elimination with partial pivoting. Solves A x = b for an NxN system. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix.
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot: find the row with the largest magnitude in this column.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col];
    if (Math.abs(pv) < 1e-12) throw new Error('degenerate homography (collinear points?)');
    // Eliminate this column from all other rows.
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / pv;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Only finite, convex, non-collapsed quads have a usable perspective warp. */
export function isValidQuad(points: Pt[]): boolean {
  if (
    points.length !== 4 ||
    points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
  )
    return false;
  const crosses = points.map((a, i) => {
    const b = points[(i + 1) % 4];
    const c = points[(i + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  });
  return crosses.every((v) => v > 1) || crosses.every((v) => v < -1);
}

/**
 * Estimate the true aspect ratio (width / height) of the marked quad from the
 * average lengths of its opposing edges. Good enough for a stylised result and
 * avoids a full focal-length recovery.
 */
export function quadAspect(p: Pt[]): number {
  const [tl, tr, br, bl] = p;
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const w = (d(tl, tr) + d(bl, br)) / 2;
  const h = (d(tl, bl) + d(tr, br)) / 2;
  return h < 1e-6 ? 1 : w / h;
}

const VERT_SRC = `
attribute vec2 aPos;   // clip-space position
attribute vec2 aUv;    // 0..1, (0,0) = top-left of output
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec3 uHr0;   // rows of the dst-unit-square -> src-normalised homography
uniform vec3 uHr1;
uniform vec3 uHr2;
void main() {
  vec3 p = vec3(vUv, 1.0);
  float w = dot(uHr2, p);
  vec2 src = vec2(dot(uHr0, p), dot(uHr1, p)) / w;
  if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    gl_FragColor = texture2D(uTex, src);
  }
}`;

/**
 * Owns a WebGL context bound to a single output canvas. Upload a source image
 * once with `setImage`, then call `render(points, outW, outH)` to draw the
 * rectified rectangle. Cheap enough to call on every drag frame.
 */
export class Warper {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private imgW = 1;
  private imgH = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    this.prog = buildProgram(gl, VERT_SRC, FRAG_SRC);
    gl.useProgram(this.prog);

    // Full-output quad. uv (0,0) sits at the top-left of the output canvas so it
    // lines up with the TL corner the user places.
    const verts = new Float32Array([
      // aPos      aUv
      -1, 1, 0, 0, 1, 1, 1, 0, 1, -1, 1, 1, -1, 1, 0, 0, 1, -1, 1, 1, -1, -1, 0, 1,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, 'aPos');
    const aUv = gl.getAttribLocation(this.prog, 'aUv');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    for (const u of ['uTex', 'uHr0', 'uHr1', 'uHr2']) {
      this.loc[u] = gl.getUniformLocation(this.prog, u);
    }

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  setImage(img: HTMLImageElement | HTMLCanvasElement) {
    const gl = this.gl;
    this.imgW = 'naturalWidth' in img ? img.naturalWidth : img.width;
    this.imgH = 'naturalHeight' in img ? img.naturalHeight : img.height;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // No FLIP_Y: row 0 of an uploaded image is its top, so normalised src.y = 0
    // maps to the top of the photo — matching how we place the TL corner.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  /** `points` are the TL,TR,BR,BL corners in source-image pixel coordinates. */
  render(points: Pt[], outW: number, outH: number) {
    const gl = this.gl;
    this.canvas.width = outW;
    this.canvas.height = outH;

    // Normalise src points into texture space (0..1).
    const srcN: Pt[] = points.map(([x, y]) => [x / this.imgW, y / this.imgH]);
    const dst: Pt[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const H = solveHomography(srcN, dst);

    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform3f(this.loc.uHr0, H[0], H[1], H[2]);
    gl.uniform3f(this.loc.uHr1, H[3], H[4], H[5]);
    gl.uniform3f(this.loc.uHr2, H[6], H[7], H[8]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Read the last render back as top-down ImageData. Uses gl.readPixels rather
   * than drawImage(glCanvas): readback from a WebGL canvas via drawImage is
   * synchronous-but-driver-dependent and can intermittently yield black frames
   * (especially when several warps run back-to-back in one tick, e.g. a full
   * regen after a resolution change). readPixels reads the framebuffer directly.
   */
  readPixels(): ImageData {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const buf = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // readPixels origin is bottom-left, so flip rows into a top-down ImageData.
    const out = new ImageData(w, h);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * rowBytes;
      out.data.set(buf.subarray(src, src + rowBytes), y * rowBytes);
    }
    return out;
  }
}

function buildProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader compile: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}
