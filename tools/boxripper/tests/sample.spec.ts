import { test, expect } from '@playwright/test';
import * as h from './helpers';

test('sample: three editable faces restore and export without network access', async ({ page, context }) => {
  await h.gotoFresh(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Try a sample box' }).click();
  await expect(page.locator('#face-count')).toHaveText('3 / 6 textured');
  await expect(page.locator('.corner-handle')).toHaveCount(4);
  await expect(page.locator('#sample-row')).toBeHidden();
  const faces = await h.faceTexStates(page);
  for (const face of ['front', 'right', 'top']) {
    expect(faces[face].present).toBe(true);
    expect(faces[face].blank).toBe(false);
  }
  await page.locator('.face-card').nth(h.FACE_IDX.back).click();
  await page.selectOption('#copy-source', 'front');
  await expect(page.locator('#face-count')).toHaveText('4 / 6 textured');
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  const download = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  expect((await download).suggestedFilename()).toBe('field-box.glb');
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#face-count')).toHaveText('4 / 6 textured');
  await expect(page.locator('#save-name')).toHaveValue('field-box');
});

test.describe('phone', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('sample: phone taps switch faces and the guide and section links remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await h.gotoFresh(page);
    await page.locator('.quick-guide summary').tap();
    await expect(page.locator('.quick-guide ol')).toBeVisible();
    await page.getByRole('button', { name: 'Try a sample box' }).tap();
    await expect(page.locator('#face-count')).toHaveText('3 / 6 textured');
    await page.locator('.face-card').nth(h.FACE_IDX.right).tap();
    await expect(page.locator('#editor-title')).toHaveText('Right');
    await expect(page.locator('#texture-result')).toBeVisible();
    await page.getByRole('link', { name: 'Preview & export' }).tap();
    await expect(page.locator('#model-heading')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
});
