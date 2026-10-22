import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('proportions: recompute derives W/D from captured face aspects', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A')); // 4:3
  await h.captureFace(page, 'front', 0);
  await h.captureFace(page, 'left', 0);

  await page.locator('#recompute-btn').click();
  await page.waitForTimeout(300);

  const w = await page.locator('#dim-w').inputValue();
  const hgt = await page.locator('#dim-h').inputValue();
  const d = await page.locator('#dim-d').inputValue();
  // Front 4:3 → width ≈ 1.33 at height 1.
  expect(parseFloat(w)).toBeGreaterThan(1.15);
  expect(parseFloat(hgt)).toBe(1);
  expect(parseFloat(d)).toBeGreaterThan(1.15);
});

test('proportions: manual slider updates the readout', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  await h.setRange(page, 'dim-w', 2.5);
  await expect(page.locator('#dim-w-val')).toHaveText('2.50');
});
