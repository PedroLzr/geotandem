import { test, expect, type Page } from '@playwright/test';
async function enter(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Your explorer name').fill(name);
  await page.getByRole('button', { name: 'Enter the lobby' }).click();
  await expect(
    page.getByRole('heading', { name: 'Join an open table, or start a journey of your own.' }),
  ).toBeVisible();
}
async function answerOne(page: Page) {
  const first = page.locator('.answer').first();
  await expect(first).toBeEnabled();
  const identity = await page.locator('.question-top').getAttribute('data-question-id');
  await first.click();
  await expect(page.locator('.question-footer')).toContainText(/CORRECT|INCORRECT/);
  await expect(page.locator(`[data-question-id="${identity}"]`)).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('two independent browsers complete all phases, reconnect, show results and start a fresh rematch', async ({
  browser,
}) => {
  const aContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const bContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  const errors: string[] = [];
  for (const page of [a, b]) {
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  await enter(a, 'Atlas Alex');
  await enter(b, 'Sierra Sam');
  await a.screenshot({ path: 'artifacts/lobby-desktop.png', fullPage: true });
  await a.getByRole('button', { name: 'Create Game', exact: true }).click();
  await b.getByRole('button', { name: 'Join game' }).first().click();
  await expect(a.getByRole('button', { name: 'Start expedition' })).toBeEnabled();
  await a.screenshot({ path: 'artifacts/room-desktop.png', fullPage: true });
  await a.getByRole('button', { name: 'Start expedition' }).click();
  await expect(a.locator('.answer')).toHaveCount(6);
  await expect(b.locator('.answer')).toHaveCount(6);
  expect(await a.locator('.answer').allTextContents()).toEqual(
    await b.locator('.answer').allTextContents(),
  );
  expect(await a.locator('.question-visual img').getAttribute('src')).toEqual(
    await b.locator('.question-visual img').getAttribute('src'),
  );
  await a.screenshot({ path: 'artifacts/game-desktop.png', fullPage: true });
  await b.screenshot({ path: 'artifacts/game-mobile.png', fullPage: true });
  await noOverflow(b);
  const beforeRefresh = await b.locator('.question-prompt').innerText();
  await b.reload();
  await expect(b.locator('.question-prompt')).toHaveText(beforeRefresh);
  // Alex finishes first while Sam remains active; both keep their own question clocks.
  for (let i = 0; i < 10; i++) await answerOne(a);
  await expect(a.getByText('Waiting for opponent…')).toBeVisible();
  await expect(a.getByRole('heading', { name: 'Next Phase: Flags' })).toBeVisible();
  // Sam may have timed out on the first question while Alex finishes.
  while (
    (await b.locator('.phase-track-item.active').innerText()).includes('Country Shapes') &&
    (await b.locator('.question-top').isVisible())
  )
    await answerOne(b);
  for (const phase of ['Flags', 'Capitals']) {
    await expect(a.locator('.phase-track-item.active')).toContainText(phase);
    await expect(b.locator('.phase-track-item.active')).toContainText(phase);
    await expect(b.locator('.answer').first()).toBeEnabled();
    await b.setViewportSize({ width: 320, height: 760 });
    await noOverflow(b);
    await b.screenshot({ path: `artifacts/${phase.toLowerCase()}-320.png`, fullPage: true });
    for (let i = 0; i < 10; i++) await Promise.all([answerOne(a), answerOne(b)]);
  }
  await expect(a.getByText('GEOTANDEM · MATCH COMPLETE')).toBeVisible();
  await expect(b.getByText('GEOTANDEM · MATCH COMPLETE')).toBeVisible();
  await expect(a.locator('.result-card')).toHaveCount(2);
  expect(await a.locator('.result-stats').allTextContents()).toEqual(
    await b.locator('.result-stats').allTextContents(),
  );
  await expect(a.getByText('Avg. response time', { exact: true })).toHaveCount(2);
  await a.screenshot({ path: 'artifacts/results-desktop.png', fullPage: true });
  await b.screenshot({ path: 'artifacts/results-mobile.png', fullPage: true });
  await noOverflow(b);
  await a.getByRole('button', { name: 'Play Again', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Waiting for opponent…' })).toBeDisabled();
  await b.getByRole('button', { name: 'Play Again', exact: true }).click();
  await expect(a.locator('.phase-track-item.active')).toContainText('Country Shapes');
  await expect(a.locator('.answer')).toHaveCount(6);
  await a.getByRole('button', { name: 'Leave Room', exact: true }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Leave Room', exact: true }).click();
  await expect(
    a.getByRole('heading', { name: 'Join an open table, or start a journey of your own.' }),
  ).toBeVisible();
  await expect(b.getByRole('heading', { name: 'This expedition has ended.' })).toBeVisible();
  expect(errors).toEqual([]);
  await aContext.close();
  await bContext.close();
});
test('welcome fits 320px and keyboard navigation works', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 760 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A whole world. One worthy rival.' }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/welcome-320.png', fullPage: true });
  await page.getByLabel('Your explorer name').fill('Map Reader');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Join an open table, or start a journey of your own.' }),
  ).toBeVisible();
  await noOverflow(page);
  await context.close();
});
