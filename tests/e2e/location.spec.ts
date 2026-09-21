import { test, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('free map supports touch, zoom and pan without accidental guesses, then reveals the exact country', async ({
  browser,
}, testInfo) => {
  const fixture = resolve('test-results/location-server.mjs');
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
  const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true }),
  ]);
  try {
    const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [page, name] of [
      [a, 'Atlas'],
      [b, 'Sierra'],
    ] as const) {
      await page.goto(url);
      await page.getByLabel('Your explorer name').fill(name);
      await page.getByRole('button', { name: 'Enter the lobby' }).click();
    }
    await a.getByRole('button', { name: 'Create duel', exact: true }).click();
    await b.getByRole('button', { name: 'Join game' }).click();
    await a.getByRole('button', { name: 'Start expedition' }).click();
    // Test fixture jumps to the map phase; production has no phase-skipping endpoint.
    const room = [...server.engine.rooms.values()][0];
    room.phase = 3;
    room.questions[3][0].country = 'ES';
    room.questions[3][0].prompt = 'Locate Spain';
    await expect(a.getByRole('heading', { name: 'Locate Spain' })).toBeVisible();
    await expect(b.getByRole('application')).toBeVisible();
    await b.getByRole('button', { name: 'Zoom in' }).tap();
    const map = b.getByRole('application');
    const box = (await map.boundingBox())!;
    await b.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await b.mouse.down();
    await b.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 20, { steps: 4 });
    await b.mouse.up();
    await expect(b.locator('.location-marker')).toHaveCount(0);
    await b.getByRole('button', { name: 'Show whole world' }).tap();
    const click = await map.evaluate((svg: SVGSVGElement) => {
      const point = new DOMPoint(
        500 + (-3.7 / 360) * 1000,
        300 - (40.4 / 360) * 1000,
      ).matrixTransform(svg.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
    await b.touchscreen.tap(click.x, click.y);
    await expect(b.locator('.location-marker.own')).toHaveCount(1);
    const guest = [...server.engine.players.values()].find((p) => p.name === 'Sierra')!;
    await expect.poll(() => guest.locationDraft?.[0]).toBeCloseTo(-3.7, 1);
    await expect.poll(() => guest.locationDraft?.[1]).toBeCloseTo(40.4, 1);
    await b.screenshot({ path: testInfo.outputPath('map-mobile-draft.png'), fullPage: true });
    const hostMap = a.getByRole('application');
    const hostClick = await hostMap.evaluate((svg: SVGSVGElement) => {
      const point = new DOMPoint(
        500 + (-3.7 / 360) * 1000,
        300 - (40.4 / 360) * 1000,
      ).matrixTransform(svg.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
    await a.mouse.click(hostClick.x, hostClick.y);
    await a.getByRole('button', { name: 'Confirm location' }).click();
    await expect(b.locator('.location-country-reveal, .location-marker.rival')).toHaveCount(0);
    await b.getByRole('button', { name: 'Confirm location' }).tap();
    await expect(b.locator('.location-reveal')).toContainText('CORRECT');
    await expect(b.locator('.location-country-reveal')).toHaveCount(1);
    await expect(b.locator('.location-outcomes .own')).toContainText('✓ Correct');
    await expect(b.locator('.location-outcomes .rival')).toContainText('✓ Correct');
    await expect(b.locator('.location-reveal')).not.toContainText(' km');
    await expect(b.locator('.location-marker')).toHaveCount(2);
    await expect(b.locator('.location-marker.rival text')).toHaveText('A');
    await expect(a.locator('.location-marker.rival text')).toHaveText('S');
    await expect(b.locator('.location-marker.rival circle')).toHaveCSS('fill', 'rgb(37, 99, 235)');
    await expect(b.locator('.location-marker.own.correct circle')).toHaveCSS(
      'fill',
      'rgb(32, 92, 73)',
    );
    await a.screenshot({ path: testInfo.outputPath('map-desktop-reveal.png'), fullPage: true });
    await b.getByRole('button', { name: 'Zoom to highlighted country' }).tap();
    await b.screenshot({ path: testInfo.outputPath('map-mobile-country.png'), fullPage: true });
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(b.locator('.location-reveal')).toHaveCount(0);
    await expect(b.locator('.location-marker')).toHaveCount(0);
    await expect(b.getByRole('button', { name: 'Confirm location' })).toBeDisabled();
    room.questions[3][1].country = 'ES';
    room.questions[3][1].prompt = 'Locate Spain';
    for (const [page, lon, lat] of [
      [a, -9.14, 38.72],
      [b, -3.7, 40.4],
    ] as const) {
      const point = await page.getByRole('application').evaluate(
        (svg: SVGSVGElement, [lon, lat]) => {
          const p = new DOMPoint(
            500 + (lon / 360) * 1000,
            300 - (lat / 360) * 1000,
          ).matrixTransform(svg.getScreenCTM()!);
          return { x: p.x, y: p.y };
        },
        [lon, lat],
      );
      await page.mouse.click(point.x, point.y);
      await page.getByRole('button', { name: 'Confirm location' }).click();
    }
    await expect(b.locator('.location-outcomes .own')).toContainText('✓ Correct');
    await expect(b.locator('.location-outcomes .rival')).toContainText('✕ Incorrect');
    await expect(a.locator('.location-outcomes .own')).toContainText('✕ Incorrect');
    await expect(a.locator('.location-marker.own.incorrect circle')).toHaveCSS(
      'fill',
      'rgb(196, 61, 61)',
    );
    await expect(b.locator('.location-marker.rival circle')).toHaveCSS('fill', 'rgb(37, 99, 235)');
    await b.screenshot({
      path: testInfo.outputPath('map-mobile-mixed-results.png'),
      fullPage: true,
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await server.close();
  }
});
