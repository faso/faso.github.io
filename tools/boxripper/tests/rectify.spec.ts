import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('rectify: capturing a face produces a non-blank texture', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);
  const s = await h.faceTexStates(page);
  expect(s.front.present).toBe(true);
  expect(s.front.blank).toBe(false);
});

test('rectify: output is not vertically flipped (top stays top)', async ({ page }) => {
  await h.gotoFresh(page);
  // Top half red, bottom half blue.
  await h.uploadPhoto(page, await h.makeTopBottomPhoto(page, '#e02020', '#2030e0'));
  await h.captureFace(page, 'front', 0);
  const col = await h.previewRegionColors(page);
  // Top region should be red-dominant, bottom region blue-dominant.
  expect(col.top[0]).toBeGreaterThan(col.top[2] + 20);
  expect(col.bottom[2]).toBeGreaterThan(col.bottom[0] + 20);
});

test('rectify: default corners give roughly the source aspect ratio', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A')); // 600x450 → 4:3
  await h.captureFace(page, 'front', 0);
  const s = await h.faceTexStates(page);
  const aspect = s.front.w! / s.front.h!;
  expect(aspect).toBeGreaterThan(1.15);
  expect(aspect).toBeLessThan(1.5);
});
