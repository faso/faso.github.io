import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('dither: every mode + algorithm keeps the texture non-blank', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  for (const algo of ['floyd', 'atkinson', 'none']) {
    await h.selectOption(page, 'dither-algo', algo);
    await page.waitForTimeout(250);
    const s = await h.faceTexStates(page);
    expect(s.front.blank, `palette/${algo}`).toBe(false);
  }

  await h.selectOption(page, 'dither-mode', 'bw');
  await page.waitForTimeout(250);
  for (const algo of ['floyd', 'atkinson', 'none']) {
    await h.selectOption(page, 'dither-algo', algo);
    await page.waitForTimeout(250);
    const s = await h.faceTexStates(page);
    expect(s.front.blank, `bw/${algo}`).toBe(false);
  }
});

test('dither: palette-size control only shows in palette mode', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  await h.selectOption(page, 'dither-mode', 'palette');
  await expect(page.locator('#palette-size-row')).toBeVisible();
  await h.selectOption(page, 'dither-mode', 'bw');
  await expect(page.locator('#palette-size-row')).toBeHidden();
});

test('dither: extreme palette sizes (2 and 32) both render', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  await h.selectOption(page, 'dither-mode', 'palette');
  for (const n of [2, 32]) {
    await h.setRange(page, 'palette-size', n);
    await page.waitForTimeout(250);
    const s = await h.faceTexStates(page);
    expect(s.front.blank, `palette ${n}`).toBe(false);
  }
});
