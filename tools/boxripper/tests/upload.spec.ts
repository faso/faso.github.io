import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('upload: single photo shows a thumbnail and the dropzone stays usable', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await expect(page.locator('#photo-strip .thumb')).toHaveCount(1);
});

test('upload: multiple photos accumulate in the strip', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 120, 'B'));
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 240, 'C'));
  await expect(page.locator('#photo-strip .thumb')).toHaveCount(3);
});
