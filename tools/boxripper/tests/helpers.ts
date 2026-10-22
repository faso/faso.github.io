import { Page } from '@playwright/test';

export const FACE_IDX: Record<string, number> = {
  front: 0,
  back: 1,
  left: 2,
  right: 3,
  top: 4,
  bottom: 5,
};
export const FACE_ORDER = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;

/** Open the app with a clean IndexedDB so each test starts from scratch. */
export async function gotoFresh(page: Page) {
  await page.goto('/boxripper/');
  await page.evaluate(() => indexedDB.deleteDatabase('boxripper'));
  await page.reload();
  await page.waitForSelector('#dropzone');
}

/** A striped photo with a big letter, distinct per hue. Returns a data URL. */
export async function makePhotoDataUrl(page: Page, hue: number, text: string): Promise<string> {
  return page.evaluate(
    ({ hue, text }) => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 450;
      const x = c.getContext('2d')!;
      for (let i = 0; i < 10; i++) {
        x.fillStyle = `hsl(${(hue + i * 18) % 360},70%,50%)`;
        x.fillRect(i * 60, 0, 60, 450);
      }
      x.fillStyle = '#fff';
      x.font = 'bold 120px sans-serif';
      x.fillText(text, 80, 260);
      return c.toDataURL('image/png');
    },
    { hue, text },
  );
}

/** A photo with a solid top half and bottom half (for orientation checks). */
export async function makeTopBottomPhoto(
  page: Page,
  topHex: string,
  bottomHex: string,
): Promise<string> {
  return page.evaluate(
    ({ topHex, bottomHex }) => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 450;
      const x = c.getContext('2d')!;
      x.fillStyle = topHex;
      x.fillRect(0, 0, 600, 225);
      x.fillStyle = bottomHex;
      x.fillRect(0, 225, 600, 225);
      return c.toDataURL('image/png');
    },
    { topHex, bottomHex },
  );
}

export async function uploadPhoto(page: Page, dataUrl: string) {
  await page.evaluate(async (d) => {
    const blob = await (await fetch(d)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'p.png', { type: 'image/png' }));
    const input = document.getElementById('file-input') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, dataUrl);
  await page.waitForTimeout(150);
}

/** Select a face, choose a source photo, let the warp+dither settle. */
export async function captureFace(page: Page, face: keyof typeof FACE_IDX, photoIndex = 0) {
  await page.locator('.face-card').nth(FACE_IDX[face]).click();
  await page.waitForTimeout(120);
  await page.locator('#photo-select .thumb').nth(photoIndex).click();
  await page.waitForTimeout(450);
}

export interface FaceTexState {
  present: boolean;
  w?: number;
  h?: number;
  blank?: boolean;
}

/**
 * Read every face's current texture state from its card thumbnail. Crucially
 * this does NOT click a card (clicking a captured card re-mounts the picker and
 * regenerates that one face), so it reflects the real batch-regenerated state.
 */
export async function faceTexStates(page: Page): Promise<Record<string, FaceTexState>> {
  return page.evaluate(async () => {
    const N = ['front', 'back', 'left', 'right', 'top', 'bottom'];
    const out: Record<string, any> = {};
    const cards = [...document.querySelectorAll('.face-card')];
    for (let i = 0; i < cards.length; i++) {
      const bg = (cards[i].querySelector('.face-thumb') as HTMLElement).style.backgroundImage;
      if (!bg || bg === 'none') {
        out[N[i]] = { present: false };
        continue;
      }
      const url = bg.slice(bg.indexOf('(') + 1, bg.lastIndexOf(')')).replace(/^["']|["']$/g, '');
      out[N[i]] = await new Promise((res) => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement('canvas');
          c.width = im.width;
          c.height = im.height;
          const g = c.getContext('2d')!;
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let nz = 0;
          for (let k = 0; k < d.length; k += 4) if (d[k] || d[k + 1] || d[k + 2]) nz++;
          res({ present: true, w: im.width, h: im.height, blank: nz < (d.length / 4) * 0.02 });
        };
        im.onerror = () => res({ present: false });
        im.src = url;
      });
    }
    return out;
  });
}

/** Mean RGB of the top 30% and bottom 30% of the active face preview canvas. */
export async function previewRegionColors(page: Page) {
  return page.evaluate(() => {
    const c = document.getElementById('face-preview') as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const read = (y0: number, y1: number) => {
      const d = g.getImageData(0, y0, c.width, Math.max(1, y1 - y0)).data;
      let r = 0,
        gg = 0,
        b = 0,
        n = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        gg += d[i + 1];
        b += d[i + 2];
        n++;
      }
      return [r / n, gg / n, b / n];
    };
    return {
      w: c.width,
      h: c.height,
      top: read(0, Math.floor(c.height * 0.3)),
      bottom: read(Math.floor(c.height * 0.7), c.height),
    };
  });
}

export async function setRange(page: Page, id: string, value: number) {
  await page.evaluate(
    ({ id, value }) => {
      const s = document.getElementById(id) as HTMLInputElement;
      s.value = String(value);
      s.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { id, value },
  );
}

export async function selectOption(page: Page, id: string, value: string) {
  await page.selectOption('#' + id, value);
}

/** Fraction of the 3D viewer canvas that differs from the dark background. */
export async function viewerLitFraction(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.getElementById('viewer') as HTMLCanvasElement;
    const t = document.createElement('canvas');
    t.width = c.width;
    t.height = c.height;
    t.getContext('2d')!.drawImage(c, 0, 0);
    const d = t.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    const tot = c.width * c.height;
    for (let i = 0; i < d.length; i += 4) {
      const dr = Math.abs(d[i] - 23);
      const dg = Math.abs(d[i + 1] - 25);
      const db = Math.abs(d[i + 2] - 31);
      if (dr + dg + db > 50) lit++;
    }
    return lit / tot;
  });
}
