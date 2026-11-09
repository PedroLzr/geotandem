import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assets from '../../data/assets.json' with { type: 'json' };
test('all bundled flags render identically after removing country-coded SVG metadata', async ({
  page,
}) => {
  const pairs = Object.entries(assets).map(([code, asset]) => ({
    code,
    original: readFileSync(`node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`, 'utf8'),
    bundled: asset.flag,
  }));
  const failures = await page.evaluate(async (items) => {
    const pixels = (svg: string) =>
      new Promise<Uint8ClampedArray>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 120;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0, 160, 120);
          resolve(context.getImageData(0, 0, 160, 120).data);
        };
        image.onerror = () => reject(new Error('Flag SVG failed to render.'));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });
    const differences: string[] = [];
    for (const item of items) {
      const [before, after] = await Promise.all([pixels(item.original), pixels(item.bundled)]);
      if (before.some((value, index) => value !== after[index])) differences.push(item.code);
    }
    return differences;
  }, pairs);
  expect(failures).toEqual([]);
});

test('every country silhouette is visible, including dispersed islands and microstates', async ({
  page,
}) => {
  const invisible = await page.evaluate(async (items) => {
    const failures: string[] = [];
    for (const [code, asset] of Object.entries(items)) {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.shape)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 320;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, 480, 320);
      const pixels = context.getImageData(0, 0, 480, 320).data;
      let land = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        // Count land, not text labels or frames in enlarged-detail layouts.
        if (pixels[i] === 32 && pixels[i + 1] === 92 && pixels[i + 2] === 73 && pixels[i + 3] > 32)
          land++;
      }
      if (land < 300) failures.push(`${code}: ${land} land pixels`);
    }
    return failures;
  }, assets);
  expect(invisible).toEqual([]);
});
