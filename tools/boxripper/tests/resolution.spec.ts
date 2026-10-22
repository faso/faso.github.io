import { test, expect } from '@playwright/test';
import * as h from './helpers';

// Regression guard for the report: "made three textures, then changed resolution
// and 2 turned black." Captures three faces from three different photos, then
// sweeps the resolution slider, and asserts every texture stays non-blank and
// keeps the right size.
test('resolution: three textures survive a resolution sweep', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'ONE'));
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 120, 'TWO'));
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 240, 'TRE'));

  await h.captureFace(page, 'front', 0);
  await h.captureFace(page, 'left', 1);
  await h.captureFace(page, 'right', 2);

  let s = await h.faceTexStates(page);
  for (const f of ['front', 'left', 'right']) {
    expect(s[f].present, `${f} present before`).toBe(true);
    expect(s[f].blank, `${f} blank before`).toBe(false);
  }

  // Sweep the resolution slider across several frames (mimics a drag).
  for (const v of [256, 320, 384, 448, 512, 320, 192]) {
    await h.setRange(page, 'downscale', v);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(500);

  s = await h.faceTexStates(page);
  for (const f of ['front', 'left', 'right']) {
    expect(s[f].present, `${f} present after`).toBe(true);
    expect(s[f].blank, `${f} blank after`).toBe(false);
  }
  // Longest edge should now match the final resolution (192).
  for (const f of ['front', 'left', 'right']) {
    expect(Math.max(s[f].w!, s[f].h!), `${f} size after`).toBe(192);
  }
});

test('resolution: a duplicated face also survives the sweep', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'ONE'));
  await h.captureFace(page, 'front', 0);
  // Back copies Front.
  await page.locator('.face-card').nth(h.FACE_IDX.back).click();
  await h.selectOption(page, 'copy-source', 'front');
  await page.waitForTimeout(300);

  for (const v of [320, 512, 192]) {
    await h.setRange(page, 'downscale', v);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);

  const s = await h.faceTexStates(page);
  expect(s.front.blank, 'front').toBe(false);
  expect(s.back.present, 'back present').toBe(true);
  expect(s.back.blank, 'back blank').toBe(false);
});
