import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('rotate: 90° swaps the texture dimensions, 180° restores them', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  const base = (await h.faceTexStates(page)).front;
  expect(base.w).toBeGreaterThan(base.h!); // landscape source

  await page.locator('#rotate-cw').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#rotate-val')).toHaveText('90°');
  const r90 = (await h.faceTexStates(page)).front;
  expect(r90.w).toBe(base.h);
  expect(r90.h).toBe(base.w);

  await page.locator('#rotate-cw').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#rotate-val')).toHaveText('180°');
  const r180 = (await h.faceTexStates(page)).front;
  expect(r180.w).toBe(base.w);
  expect(r180.h).toBe(base.h);
});

test('rotate: counter-clockwise from 0 wraps to 270°', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  await page.locator('#rotate-ccw').click();
  await page.waitForTimeout(200);
  await expect(page.locator('#rotate-val')).toHaveText('270°');
});

test('rotate: rotation persists across reload', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  await page.locator('#rotate-cw').click();
  await page.waitForTimeout(900); // allow the 700ms autosave debounce to fire

  await page.reload();
  await page.waitForSelector('#dropzone');
  await page.locator('.face-card').nth(h.FACE_IDX.front).click();
  await page.waitForTimeout(300);
  await expect(page.locator('#rotate-val')).toHaveText('90°');
});
