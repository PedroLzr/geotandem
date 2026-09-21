import { test, expect, type Page } from '@playwright/test';

test('eight-player arena: invite, start, play every phase, rank and reopen; mobile stays compact', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      browser.newContext({
        viewport: { width: i === 0 ? 1440 : 390, height: 900 },
        ...(i === 1 ? { hasTouch: true, isMobile: true } : {}),
      }),
    ),
  );
  const pages: Page[] = [];
  const errors: string[] = [];
  try {
    for (const context of contexts) {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      pages.push(page);
    }
    const host = pages[0];
    await host.goto('/');
    await host.getByLabel('Your explorer name').fill('Atlas');
    await host.getByRole('button', { name: 'Enter the lobby' }).click();
    await host.getByRole('button', { name: 'Create arena' }).click();
    await expect(host.getByRole('button', { name: 'Start arena' })).toBeDisabled();
    const code = (await host.locator('.arena-heading .eyebrow').innerText()).replace('ARENA ', '');
    await Promise.all(
      pages.slice(1).map(async (page, i) => {
        await page.goto(`/?room=${code}`);
        await page
          .getByLabel('Your explorer name')
          .fill(i === 0 ? 'A very long explorer name' : `Explorer ${i + 2}`);
        await page.getByRole('button', { name: 'Join your friend' }).click();
        await expect(page.locator('.arena-waiting')).toBeVisible();
      }),
    );
    await expect(host.locator('.arena-roster li')).toHaveCount(8);
    await expect(host.getByRole('button', { name: 'Invite a friend' })).toHaveCount(0);
    await expect(host.getByRole('button', { name: 'Start arena' })).toBeEnabled();
    await expect(pages[1].getByRole('button', { name: 'Start arena' })).toHaveCount(0);
    for (const [page, name] of [
      [host, 'desktop'],
      [pages[1], 'mobile'],
    ] as const) {
      await page.screenshot({
        path: testInfo.outputPath(`arena-waiting-${name}.png`),
        fullPage: true,
      });
    }
    await host.getByRole('button', { name: 'Start arena' }).click();
    await Promise.all(pages.map((page) => expect(page.locator('.answer')).toHaveCount(6)));
    const firstId = await host.locator('.question-top').getAttribute('data-question-id');
    for (const page of pages)
      await expect(page.locator('.question-top')).toHaveAttribute('data-question-id', firstId!);
    await pages[1].setViewportSize({ width: 320, height: 900 });
    await expect(pages[1].locator('.arena-mobile-standings')).not.toHaveAttribute('open', '');
    await pages[1].locator('.arena-mobile-standings summary').tap();
    await expect(pages[1].locator('.arena-mobile-standings tbody tr')).toHaveCount(8);
    await pages[1].locator('.arena-mobile-standings summary').tap();
    await host.screenshot({ path: testInfo.outputPath('arena-game-desktop.png'), fullPage: true });
    await pages[1].screenshot({
      path: testInfo.outputPath('arena-game-mobile.png'),
      fullPage: true,
    });
    for (const page of [host, pages[1]])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    await pages[1].reload();
    await expect(pages[1].locator('.question-top')).toHaveAttribute('data-question-id', firstId!);
    // Each browser advances independently; all must finish before the next phase opens.
    await Promise.all(
      pages.map(async (page) => {
        for (let question = 0; question < 30; question++) {
          const answer = page.locator('.answer').first();
          await expect(answer).toBeEnabled();
          const id = await page.locator('.question-top').getAttribute('data-question-id');
          await answer.click();
          await expect(page.locator('.question-footer')).toContainText(/CORRECT|INCORRECT/);
          await expect(page.locator(`[data-question-id="${id}"]`)).toHaveCount(0);
        }
        await expect(page.locator('.arena-results')).toBeVisible();
      }),
    );
    await expect(host.locator('.arena-results tbody tr')).toHaveCount(8);
    await expect(pages[1].locator('.arena-own-row')).toHaveCount(1);
    await host.screenshot({
      path: testInfo.outputPath('arena-results-desktop.png'),
      fullPage: true,
    });
    await pages[1].screenshot({
      path: testInfo.outputPath('arena-results-mobile.png'),
      fullPage: true,
    });
    expect(await pages[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await host.getByRole('button', { name: 'Play again' }).click();
    await expect(host.locator('.arena-roster li')).toHaveCount(8);
    await expect(pages[1].locator('.arena-waiting')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
