import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('duplicate: copying a captured face gives the copy a texture', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  await page.locator('.face-card').nth(h.FACE_IDX.back).click();
  await h.selectOption(page, 'copy-source', 'front');
  await page.waitForTimeout(300);

  const s = await h.faceTexStates(page);
  expect(s.back.present).toBe(true);
  expect(s.back.blank).toBe(false);
});

test('duplicate: source dropdown annotates empty vs captured faces', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  await page.locator('.face-card').nth(h.FACE_IDX.back).click();
  await page.waitForTimeout(150);
  const opts = await page.locator('#copy-source option').allTextContents();
  expect(opts).toContain('Capture from photo');
  expect(opts).toContain('Copy Front');
  expect(opts.some((o) => o.includes('Left') && o.includes('(empty)'))).toBe(true);
});

test('duplicate: copying an empty face leaves the face blank (placeholder)', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  await page.locator('.face-card').nth(h.FACE_IDX.back).click();
  await h.selectOption(page, 'copy-source', 'left'); // left has no texture
  await page.waitForTimeout(300);

  const s = await h.faceTexStates(page);
  expect(s.back.present).toBe(false);
});

test('duplicate: mirror toggle keeps the copy non-blank', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'front', 0);

  await page.locator('.face-card').nth(h.FACE_IDX.back).click();
  await h.selectOption(page, 'copy-source', 'front');
  await page.waitForTimeout(200);
  await page.locator('#mirror-toggle').check();
  await page.waitForTimeout(300);

  const s = await h.faceTexStates(page);
  expect(s.back.blank).toBe(false);
});

test('duplicate: reverse-order chains follow edits, settings and reloads', async ({ page }) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await h.captureFace(page, 'top');
  await page.locator('.face-card').nth(h.FACE_IDX.left).click();
  await h.selectOption(page, 'copy-source', 'top');
  await page.locator('.face-card').nth(h.FACE_IDX.back).click();
  await h.selectOption(page, 'copy-source', 'left');
  await page.locator('.face-card').nth(h.FACE_IDX.top).click();
  await expect(page.locator('#copy-source option[value="back"]')).toBeDisabled();
  await expect(page.locator('#copy-source option[value="left"]')).toBeDisabled();
  await page.locator('#rotate-cw').click();
  await h.setRange(page, 'downscale', 256);
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  const before = await h.faceTexStates(page);
  expect(before.back).toEqual(before.top);
  expect(before.left).toEqual(before.top);
  expect(before.back.h).toBe(256);
  await page.reload();
  await expect(page.locator('#face-count')).toHaveText('4 / 6 textured');
  const after = await h.faceTexStates(page);
  expect(after.back).toEqual(before.back);
  await page.locator('.face-card').nth(h.FACE_IDX.top).click();
  await page.locator('#clear-face').click();
  const cleared = await h.faceTexStates(page);
  expect(cleared.top.present).toBe(false);
  expect(cleared.left.present).toBe(false);
  expect(cleared.back.present).toBe(false);
});
