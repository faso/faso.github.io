import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import * as h from './helpers';

test('viewer: the 3D box renders visible (non-background) pixels', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  await page.waitForTimeout(300);
  const lit = await h.viewerLitFraction(page);
  expect(lit).toBeGreaterThan(0.05);
});

test('export: produces a valid binary glTF (.glb) file', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  await page.waitForTimeout(300);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-btn').click(),
  ]);
  expect(download.suggestedFilename()).toBe('boxripper.glb');
  const path = await download.path();
  const buf = readFileSync(path!);
  // glb magic header is the ASCII "glTF".
  expect(buf.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(buf.length).toBeGreaterThan(1000); // has geometry + embedded texture
});
