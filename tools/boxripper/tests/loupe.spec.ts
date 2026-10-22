import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('loupe: magnifier floats fixed in the top-right while dragging a corner', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  const box = (await page.locator('.picker-overlay').boundingBox())!;
  // The default TL handle sits at 15% inset in display space.
  const hx = box.x + 0.15 * box.width;
  const hy = box.y + 0.15 * box.height;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 20, hy + 16, { steps: 4 });

  const loupe = await page.evaluate(() => {
    const l = document.querySelector('.picker-loupe') as HTMLElement;
    const cs = getComputedStyle(l);
    const r = l.getBoundingClientRect();
    return {
      display: cs.display,
      position: cs.position,
      top: Math.round(r.top),
      rightGap: Math.round(window.innerWidth - r.right),
    };
  });
  await page.mouse.up();

  expect(loupe.display).toBe('block');
  expect(loupe.position).toBe('fixed');
  expect(loupe.top).toBeLessThan(40);
  expect(loupe.rightGap).toBeLessThan(40);
});
