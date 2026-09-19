import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assets from '../../data/assets.json' with { type: 'json' };
test('all 80 bundled flags render identically after removing country-coded SVG metadata', async ({
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
