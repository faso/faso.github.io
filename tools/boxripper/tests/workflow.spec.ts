import { test, expect, type Page } from '@playwright/test';
import * as h from './helpers';

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('boxripper', 1);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const request = db.transaction('snapshot').objectStore('snapshot').get('current');
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      db.close();
    }
  });
}

test('workflow: upload is keyboard accessible and invalid images report an error', async ({
  page,
}) => {
  await h.gotoFresh(page);
  await expect(page.locator('#export-btn')).toBeDisabled();
  await page.locator('#dropzone').focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (
    await chooser
  ).setFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.locator('#upload-status')).toContainText('could not open this image');
  await expect(page.locator('#export-btn')).toBeDisabled();
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await expect(page.locator('#export-btn')).toBeEnabled();
  await expect(page.locator('#face-count')).toHaveText('1 / 6 textured');
});

test('workflow: changing source photos resets coordinates; reselection preserves edits', async ({
  page,
}) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  const handle = page.getByRole('button', {
    name: 'Top left corner',
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  expect((await snapshot(page)).project.faces.front.points[0][0]).toBe(100);
  await page.locator('#photo-select .thumb').first().click();
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  expect((await snapshot(page)).project.faces.front.points[0][0]).toBe(100);
  const portrait = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f0a070';
    ctx.fillRect(0, 0, 240, 600);
    return canvas.toDataURL();
  });
  await h.uploadPhoto(page, portrait);
  await page.locator('#photo-select .thumb').nth(1).click();
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  expect((await snapshot(page)).project.faces.front.points).toEqual([
    [36, 90],
    [204, 90],
    [204, 510],
    [36, 510],
  ]);
  await expect(page.locator('#texture-size')).toHaveText('77 × 192 px');
});

test('workflow: mobile picker stays inside the page and releases old editors on resize', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  for (const face of ['left', 'right', 'back'] as const) await h.captureFace(page, face);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.picker-wrap').scrollIntoViewIfNeeded();
  await expect(page.locator('.corner-handle')).toHaveCount(4);
  const picker = await page.locator('.picker-overlay').boundingBox();
  expect(picker!.x).toBeGreaterThanOrEqual(0);
  expect(picker!.x + picker!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const topLeft = page.getByRole('button', {
    name: 'Top left corner',
    exact: true,
  });
  await topLeft.focus();
  await page.keyboard.press('ArrowRight');
  await expect(topLeft).toBeFocused();
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  expect((await snapshot(page)).project.faces.back.points[0][0]).toBe(91);
  expect(errors).toEqual([]);
});

test('workflow: new project cancels a pending save and stays empty after reload', async ({
  page,
}) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await page.locator('#save-name').fill('old-project');
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#reset-btn').click();
  await expect(page.locator('#save-state')).toHaveText('New project');
  await page.waitForTimeout(650); // beyond the canceled save debounce
  expect(await snapshot(page)).toBeUndefined();
  await page.reload();
  await expect(page.locator('#face-count')).toHaveText('0 / 6 textured');
  await expect(page.locator('#photo-strip .thumb')).toHaveCount(0);
  await expect(page.locator('#save-name')).toBeEmpty();
  await expect(page.locator('#export-btn')).toBeDisabled();
});

test('workflow: texture rotation affects estimated proportions and model names persist', async ({
  page,
}) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await page.locator('#rotate-cw').click();
  await page.locator('#recompute-btn').click();
  await expect(page.locator('#dim-w-val')).toHaveText('0.75');
  await page.locator('#save-name').fill('street-box');
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.locator('#save-name')).toHaveValue('street-box');
  const download = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  expect((await download).suggestedFilename()).toBe('street-box.glb');
});

test('workflow: public editor works offline without server controls or requests', async ({
  page, context,
}) => {
  const requests: string[] = [];
  await h.gotoFresh(page);
  await expect(page.locator('#save-server-btn')).toHaveCount(0);
  await expect(page.locator('a[href*="boxmap"]')).toHaveCount(0);
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await context.setOffline(true);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await expect(page.locator('#export-btn')).toBeEnabled();
  await page.locator('#save-name').fill('offline-box');
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  const download = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  expect((await download).suggestedFilename()).toBe('offline-box.glb');
  expect(requests).toEqual([]);
});

test('workflow: crossed corners keep the last usable texture and reset recovers the selection', async ({
  page,
}) => {
  await h.gotoFresh(page);
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  const handle = page.getByRole('button', { name: 'Top left corner', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await page.locator('.picker-overlay').boundingBox())!;
  const before = await page
    .locator('#face-preview')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.95);
  await page.mouse.up();
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  expect(
    await page.locator('#face-preview').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(before);
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.locator('#reset-corners').click();
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  expect((await snapshot(page)).project.faces.front.points).toEqual([
    [90, 67.5],
    [510, 67.5],
    [510, 382.5],
    [90, 382.5],
  ]);
});

test('workflow: unavailable browser storage reports failure while editing and download still work', async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.goto('/boxripper/');
  await expect(page.locator('#save-state')).toHaveText('Browser storage unavailable');
  await h.uploadPhoto(page, await h.makePhotoDataUrl(page, 0, 'A'));
  await expect(page.locator('#save-state')).toHaveText('Not saved · storage unavailable');
  await expect(page.locator('#export-btn')).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  expect((await download).suggestedFilename()).toBe('boxripper.glb');
});
