// Interactive 4-corner picker. Shows a photo scaled to fit, draws 4 draggable
// handles (TL,TR,BR,BL) joined into a quad, and a magnifier loupe under the
// active handle for pixel-accurate placement on touch and desktop.

import { isValidQuad, type Pt } from './rectify';

const HANDLE_HIT = 22; // px (display space) within which a tap grabs a handle
const LOUPE_SIZE = 132; // px
const LOUPE_ZOOM = 3.5;
const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'];
const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
const HANDLE_COLORS = ['#7fb4ca', '#98bb6c', '#e6c384', '#d27e99'];

export class CornerPicker {
  private wrap: HTMLDivElement;
  private base: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private loupe: HTMLCanvasElement;
  private img: HTMLImageElement | null = null;
  private points: Pt[] = []; // image-pixel coordinates
  private scale = 1; // display px per image px
  private active = -1;
  private handles: HTMLButtonElement[] = [];
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    private onChange: (pts: Pt[]) => void,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'picker-wrap';
    this.base = document.createElement('canvas');
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'picker-overlay';
    this.loupe = document.createElement('canvas');
    this.loupe.className = 'picker-loupe';
    this.loupe.width = LOUPE_SIZE;
    this.loupe.height = LOUPE_SIZE;
    this.loupe.style.display = 'none';
    this.wrap.append(this.base, this.overlay, this.loupe);
    container.append(this.wrap);

    this.overlay.addEventListener('pointerdown', this.onDown);
    this.overlay.addEventListener('pointermove', this.onMove);
    this.overlay.addEventListener('pointerup', this.onUp);
    this.overlay.addEventListener('pointercancel', this.onUp);
    for (let i = 0; i < 4; i++) {
      const handle = document.createElement('button');
      handle.className = 'corner-handle';
      handle.textContent = CORNER_LABELS[i];
      handle.setAttribute('aria-label', `${CORNER_NAMES[i]} corner`);
      handle.title = `${CORNER_NAMES[i]} · Arrow keys to move, Shift for 10px`;
      handle.style.background = HANDLE_COLORS[i];
      handle.addEventListener('pointerdown', this.onDown);
      handle.addEventListener('pointermove', this.onMove);
      handle.addEventListener('pointerup', this.onUp);
      handle.addEventListener('pointercancel', this.onUp);
      handle.addEventListener('keydown', (event) => {
        const moves: Record<string, Pt> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        this.active = i;
        this.updatePoint(
          (this.points[i][0] + move[0] * amount) * this.scale,
          (this.points[i][1] + move[1] * amount) * this.scale,
        );
        this.active = -1;
      });
      handle.addEventListener('blur', () => {
        this.loupe.style.display = 'none';
      });
      this.handles.push(handle);
      this.wrap.append(handle);
    }
    this.resizeObserver = new ResizeObserver(() => this.relayout());
    this.resizeObserver.observe(container);
  }

  setImage(img: HTMLImageElement, initial?: Pt[]) {
    this.img = img;
    const validInitial =
      initial &&
      isValidQuad(initial) &&
      initial.every(
        ([x, y]) => x >= 0 && y >= 0 && x <= img.naturalWidth && y <= img.naturalHeight,
      );
    if (validInitial) {
      this.points = initial.map(([x, y]): Pt => [x, y]);
    } else {
      // Default corners inset 15% from the edges — the user just drags them out.
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      this.points = [
        [w * 0.15, h * 0.15],
        [w * 0.85, h * 0.15],
        [w * 0.85, h * 0.85],
        [w * 0.15, h * 0.85],
      ];
    }
    this.relayout();
    if (!validInitial) this.onChange(this.points.map(([x, y]) => [x, y]));
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.wrap.remove();
  }

  getPoints(): Pt[] {
    return this.points;
  }

  private relayout() {
    if (!this.img) return;
    const maxW = Math.max(1, (this.wrap.parentElement?.clientWidth || this.img.naturalWidth) - 30);
    const dispW = Math.min(
      this.img.naturalWidth,
      maxW,
      (480 * this.img.naturalWidth) / this.img.naturalHeight,
    );
    this.scale = dispW / this.img.naturalWidth;
    const dispH = Math.round(this.img.naturalHeight * this.scale);
    for (const c of [this.base, this.overlay]) {
      c.width = Math.round(dispW);
      c.height = dispH;
    }
    this.wrap.style.width = `${Math.round(dispW)}px`;
    this.wrap.style.height = `${dispH}px`;
    const ctx = this.base.getContext('2d')!;
    ctx.drawImage(this.img, 0, 0, this.base.width, this.base.height);
    this.draw();
  }

  private draw() {
    const ctx = this.overlay.getContext('2d')!;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const dp = this.points.map(([x, y]): Pt => [x * this.scale, y * this.scale]);

    // Quad outline.
    ctx.beginPath();
    ctx.moveTo(dp[0][0], dp[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(dp[i][0], dp[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(126,156,216,0.12)';
    ctx.fill();
    ctx.strokeStyle = '#7e9cd8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      this.handles[i].style.left = `${dp[i][0]}px`;
      this.handles[i].style.top = `${dp[i][1]}px`;
    }
  }

  private evtPos(e: PointerEvent): Pt {
    const r = this.overlay.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown = (e: PointerEvent) => {
    if (!this.img || e.button !== 0) return;
    const [dx, dy] = this.evtPos(e);
    let best = -1;
    let bestD = HANDLE_HIT;
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(
        dx - this.points[i][0] * this.scale,
        dy - this.points[i][1] * this.scale,
      );
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best === -1) return;
    this.active = best;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.updatePoint(dx, dy);
  };

  private onMove = (e: PointerEvent) => {
    if (this.active === -1) return;
    const [dx, dy] = this.evtPos(e);
    this.updatePoint(dx, dy);
  };

  private onUp = (e: PointerEvent) => {
    if (this.active === -1) return;
    this.active = -1;
    this.loupe.style.display = 'none';
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
    this.draw();
  };

  private updatePoint(dx: number, dy: number) {
    const ix = Math.max(0, Math.min(this.img!.naturalWidth, dx / this.scale));
    const iy = Math.max(0, Math.min(this.img!.naturalHeight, dy / this.scale));
    const next = this.points.map(([x, y]): Pt => [x, y]);
    next[this.active] = [ix, iy];
    // Crossing/collapsing edges produces a singular homography. Keep the last
    // usable selection while the pointer is outside the valid quadrilateral.
    if (!isValidQuad(next)) return;
    this.points = next;
    this.draw();
    this.drawLoupe(ix, iy);
    this.onChange(this.points);
  }

  private drawLoupe(ix: number, iy: number) {
    if (!this.img) return;
    const ctx = this.loupe.getContext('2d')!;
    const srcSpan = LOUPE_SIZE / LOUPE_ZOOM; // image px shown across the loupe
    ctx.fillStyle = '#16161d';
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.img,
      ix - srcSpan / 2,
      iy - srcSpan / 2,
      srcSpan,
      srcSpan,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE,
    );
    // Crosshair on the exact picked pixel.
    ctx.strokeStyle = '#e46876';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LOUPE_SIZE / 2, 0);
    ctx.lineTo(LOUPE_SIZE / 2, LOUPE_SIZE);
    ctx.moveTo(0, LOUPE_SIZE / 2);
    ctx.lineTo(LOUPE_SIZE, LOUPE_SIZE / 2);
    ctx.stroke();

    // Floats fixed in the top-right of the viewport (see CSS) so it stays in
    // view no matter how large the photo or how far it's scrolled.
    this.loupe.style.display = 'block';
  }
}
