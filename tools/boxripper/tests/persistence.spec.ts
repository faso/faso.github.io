import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('persistence: captured faces and photos survive a reload', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 120, 'B'));
  await h.captureFace(page, 'front', 0);
  await h.captureFace(page, 'left', 1);
  await page.waitForTimeout(500); // autosave debounce

  await page.reload();
  await page.waitForSelector('#dropzone');
  await page.waitForTimeout(500); // restore + regen

  await expect(page.locator('#photo-strip .thumb')).toHaveCount(2);
  const s = await h.faceTexStates(page);
  expect(s.front.blank).toBe(false);
  expect(s.left.blank).toBe(false);
});

test('persistence: Reset clears everything', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  await page.waitForTimeout(300);

  page.on('dialog', (d) => d.accept());
  await page.locator('#reset-btn').click();
  await page.waitForTimeout(300);

  await expect(page.locator('#photo-strip .thumb')).toHaveCount(0);
  const s = await h.faceTexStates(page);
  expect(s.front.present).toBe(false);
});
