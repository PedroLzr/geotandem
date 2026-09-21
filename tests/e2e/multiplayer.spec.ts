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
test('Play solo starts directly, completes four phases, reconnects and replays without an opponent', async ({
  page,
}, testInfo) => {
  await enter(page, 'Solo explorer');
  for (const width of [1440, 540, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await expect(page.getByRole('button', { name: 'Create duel', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create arena' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play solo' })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('solo-lobby-320.png'), fullPage: true });
  await page.getByRole('button', { name: 'Play solo' }).click();
  await expect(page.locator('header').getByRole('button', { name: 'Leave game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start expedition' })).toHaveCount(0);
  await expect(page.locator('.scoreboard h2')).toHaveText('Your progress');
  await expect(page.locator('.score-player')).toHaveCount(1);
  await expect(page.locator('.answer')).toHaveCount(6);
  const firstId = await page.locator('.question-top').getAttribute('data-question-id');
  await page.reload();
  await expect(page.locator('.question-top')).toHaveAttribute('data-question-id', firstId!);
  for (const phase of ['Country Shapes', 'Flags', 'Capitals']) {
    await expect(page.locator('.phase-track-item.active')).toContainText(phase);
    for (let i = 0; i < 10; i++) await answerOne(page);
  }
  await expect(page.locator('.phase-track-item.active')).toContainText('Location');
  for (let i = 0; i < 10; i++) {
    await expect(page.locator('.location-round')).toBeVisible();
    const id = await page.locator('.location-round').getAttribute('data-question-id');
    await page.getByRole('application').focus();
    await page.keyboard.press('ArrowRight');
    if (i === 0) {
      await page.reload();
      await expect(page.locator('.location-marker.own')).toHaveCount(1);
    }
    await page.getByRole('button', { name: 'Confirm location' }).click();
    await expect(page.locator('.location-reveal')).toBeVisible();
    await expect(page.locator('.location-marker.rival')).toHaveCount(0);
    await expect(page.locator('.location-marker.own.incorrect circle')).toHaveCSS(
      'fill',
      'rgb(196, 61, 61)',
    );
    if (i === 0) {
      await noOverflow(page);
      await page.screenshot({ path: testInfo.outputPath('solo-location-320.png'), fullPage: true });
    }
    await expect(page.locator(`[data-question-id="${id}"]`)).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'Your expedition is complete.' })).toBeVisible();
  await expect(page.locator('.result-card')).toHaveCount(1);
  await expect(page.locator('.phase-results')).toContainText('Location');
  await expect(page.locator('.result-big')).toContainText('/ 40 correct');
  await expect(page.getByText('SOLO EXPLORER', { exact: true })).toBeVisible();
  await expect(page.getByText('DRAW', { exact: true })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('solo-results-320.png'), fullPage: true });
  await page.getByRole('button', { name: 'Play Again', exact: true }).click();
  await expect(page.locator('.answer')).toHaveCount(6);
  await expect(page.locator('.question-top')).not.toHaveAttribute('data-question-id', firstId!);
  await page.locator('header').getByRole('button', { name: 'Leave game' }).click();
  await expect(page.getByRole('dialog')).toContainText('Your solo game will end.');
  await page.getByRole('dialog').getByRole('button', { name: 'Leave game' }).click();
  await expect(page.getByRole('button', { name: 'Play solo' })).toBeVisible();
});
test('two independent browsers complete all phases, reconnect, show results and start a fresh rematch', async ({
  browser,
}) => {
  test.setTimeout(210_000);
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
  await a.getByRole('button', { name: 'Create duel', exact: true }).click();
  await expect(a.locator('header').getByRole('button', { name: 'Leave lobby' })).toBeVisible();
  await b.getByRole('button', { name: 'Join game' }).first().click();
  await expect(a.getByRole('button', { name: 'Start expedition' })).toBeEnabled();
  await a.screenshot({ path: 'artifacts/room-desktop.png', fullPage: true });
  await a.getByRole('button', { name: 'Start expedition' }).click();
  await expect(a.locator('header').getByRole('button', { name: 'Leave game' })).toBeVisible();
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
  await expect(a.locator('.phase-track-item.active')).toContainText('Location');
  await expect(a.locator('.location-round')).toBeVisible();
  await expect(b.locator('.location-round')).toBeVisible();
  for (let i = 0; i < 10; i++) {
    const id = await a.locator('.location-round').getAttribute('data-question-id');
    await expect(b.locator('.location-round')).toHaveAttribute('data-question-id', id!);
    await expect(a.locator('.location-country-reveal')).toHaveCount(0);
    for (const page of [a, b]) {
      await page.getByRole('application').focus();
      await page.keyboard.press('ArrowRight');
    }
    await a.getByRole('button', { name: 'Confirm location' }).click();
    await expect(a.getByText('Waiting for your rival…')).toBeVisible();
    await expect(b.locator('.location-marker.rival')).toHaveCount(0);
    if (i === 0) {
      // Reload restores the saved draft. The server auto-confirms it at 15 seconds.
      await b.reload();
      await expect(b.locator('.location-marker.own')).toHaveCount(1);
      await noOverflow(b);
      await b.screenshot({ path: 'test-results/location-mobile-question.png', fullPage: true });
    } else await b.getByRole('button', { name: 'Confirm location' }).click();
    await expect(a.locator('.location-reveal')).toBeVisible({ timeout: 17000 });
    await expect(b.locator('.location-country-reveal')).toHaveCount(1);
    await expect(b.locator('.location-marker.rival')).toHaveCount(1);
    if (i === 0) {
      await a.screenshot({ path: 'test-results/location-desktop-reveal.png', fullPage: true });
      await b.getByRole('button', { name: 'Zoom to highlighted country' }).click();
      await b.screenshot({ path: 'test-results/location-mobile-reveal.png', fullPage: true });
    }
    await expect(a.locator(`[data-question-id="${id}"]`)).toHaveCount(0, { timeout: 7000 });
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
  await a.getByRole('button', { name: 'Leave game', exact: true }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Leave game', exact: true }).click();
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
test('leaving a lobby keeps the guest, while Exit clears the guest and survives reload', async ({
  page,
}) => {
  await enter(page, 'Map Reader');
  const exit = page.locator('header').getByRole('button', { name: 'Exit', exact: true });
  await expect(exit).toBeVisible();
  await page.getByRole('button', { name: 'Create duel', exact: true }).click();
  await page.locator('header').getByRole('button', { name: 'Leave lobby' }).click();
  await expect(exit).toBeVisible();
  await expect(page.locator('.guest-chip')).toContainText('Map Reader');
  expect(await page.evaluate(() => sessionStorage.getItem('geotandem.guest'))).not.toBeNull();
  await exit.click();
  await expect(page.getByLabel('Your explorer name')).toHaveValue('');
  await expect(page.locator('.guest-chip')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('geotandem.guest'))).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Your explorer name')).toHaveValue('');
  await enter(page, 'Fresh explorer');
  await expect(page.locator('.guest-chip')).toContainText('Fresh explorer');
});
