import { test, expect, type Page } from '@playwright/test';

async function startSolo(page: Page) {
  await page.goto('/');
  await page.getByLabel('Your explorer name').fill('Explorer');
  await page.getByRole('button', { name: 'Enter the lobby' }).click();
  await page.getByRole('button', { name: 'Play solo' }).click();
  await expect(page.locator('.answer')).toHaveCount(6);
}

async function expectFreshQuestion(page: Page, previousId: string) {
  await expect(page.locator('.question-top')).not.toHaveAttribute('data-question-id', previousId);
  await expect(page.locator('.answer').first()).toBeEnabled();
  await expect(page.locator('.answer.correct, .answer.incorrect')).toHaveCount(0);
  await expect(page.locator('.question-footer')).toBeEmpty();
  for (const answer of await page.locator('.answer').all()) {
    await expect(answer).toHaveCSS('background-color', 'rgb(253, 253, 247)');
    await expect(answer).toHaveCSS('border-color', 'rgb(220, 225, 209)');
  }
}

test('a stationary mouse does not highlight the next answer until it moves', async ({ page }) => {
  await startSolo(page);
  const first = page.locator('.answer').first();
  await first.hover();
  await expect(first).toHaveCSS('background-color', 'rgb(237, 243, 229)');
  const previousId = (await page.locator('.question-top').getAttribute('data-question-id'))!;
  await first.click();
  await expect(page.locator('.question-footer')).toContainText(/CORRECT|INCORRECT/);
  await expectFreshQuestion(page, previousId);

  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2);
  await expect(first).toHaveCSS('background-color', 'rgb(237, 243, 229)');
  await page.mouse.move(0, 0);
  await expect(first).toHaveCSS('background-color', 'rgb(253, 253, 247)');
});

test('touch answers do not leave a sticky highlight on the next question', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await startSolo(page);
    const previousId = (await page.locator('.question-top').getAttribute('data-question-id'))!;
    await page.locator('.answer').first().tap();
    await expect(page.locator('.question-footer')).toContainText(/CORRECT|INCORRECT/);
    await expectFreshQuestion(page, previousId);
  } finally {
    await context.close();
  }
});

test('keyboard users can still see focus and submit an answer', async ({ page }) => {
  await startSolo(page);
  const first = page.locator('.answer').first();
  await first.focus();
  await page.keyboard.press('Tab');
  const second = page.locator('.answer').nth(1);
  await expect(second).toBeFocused();
  await expect(second).toHaveCSS('outline-style', 'solid');
  await expect(second).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Enter');
  await expect(page.locator('.question-footer')).toContainText(/CORRECT|INCORRECT/);
});
