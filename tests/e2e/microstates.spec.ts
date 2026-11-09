import { test, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { geoCentroid } from 'd3-geo';
import type { Feature, Polygon } from 'geojson';
import world from '../../data/location-map.json' with { type: 'json' };

test('a microstate can be zoomed, selected, scored and revealed at a readable size', async ({
  page,
}, testInfo) => {
  const fixture = resolve('test-results/microstates-server.mjs');
  await build({
    entryPoints: ['backend/server.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: fixture,
  });
  const { createApp } = (await import(
    pathToFileURL(fixture).href
  )) as typeof import('../../backend/server');
  const server = createApp();
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(server.http.address() as AddressInfo).port}`);
    await page.getByLabel('Your explorer name').fill('Micro explorer');
    await page.getByRole('button', { name: 'Enter the lobby' }).click();
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await expect.poll(() => server.engine.rooms.size).toBe(1);
    const room = [...server.engine.rooms.values()][0];
    room.phase = 3;
    room.questions[3][0].country = 'VA';
    room.questions[3][0].prompt = 'Locate Vatican City';
    await expect(page.getByRole('heading', { name: 'Locate Vatican City' })).toBeVisible();
    const point = geoCentroid(world.features.find((f) => f.id === '336') as Feature<Polygon>);
    const map = page.getByRole('application');
    const screenPoint = () =>
      map
        .locator(':scope > g')
        .first()
        .evaluate((group: SVGGElement, point) => {
          const screen = new DOMPoint(
            500 + (point[0] / 360) * 1000,
            300 - (point[1] / 360) * 1000,
          ).matrixTransform(group.getScreenCTM()!);
          return { x: screen.x, y: screen.y };
        }, point);
    // Re-aim at the territory as it becomes visible: wheel coordinates are rounded
    // to CSS pixels by the browser, so an initial world-scale point is imprecise.
    for (let i = 0; i < 17; i++) {
      const target = await screenPoint();
      const before = await map.locator(':scope > g').first().getAttribute('transform');
      await page.mouse.move(target.x, target.y);
      await page.mouse.wheel(0, -100);
      await expect
        .poll(() => map.locator(':scope > g').first().getAttribute('transform'))
        .not.toBe(before);
    }
    await expect
      .poll(() => map.locator(':scope > g').first().getAttribute('transform'))
      .toMatch(/scale\((?:[1-9]\d{3,})/);
    const target = await screenPoint();
    await page.mouse.click(target.x, target.y);
    await page.getByRole('button', { name: 'Confirm location' }).click();
    await expect(page.locator('.location-reveal strong')).toHaveText('✓ CORRECT');
    const bounds = await page.locator('.location-country-reveal').boundingBox();
    expect(Math.max(bounds!.width, bounds!.height)).toBeGreaterThan(100);
    expect(room.locationReveal!.countryId).toBe('336');
    await page.screenshot({ path: testInfo.outputPath('vatican-location.png'), fullPage: true });
  } finally {
    await server.close();
  }
});
