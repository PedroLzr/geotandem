import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Your explorer name').fill(name);
  await page.getByRole('button', { name: 'Enter the lobby' }).click();
  await expect(page.getByRole('button', { name: 'Play solo' })).toBeVisible();
}

async function createRoom(page: Page) {
  await enter(page, 'Host');
  await page.getByRole('button', { name: 'Create duel', exact: true }).click();
  const heading = page.locator('.waiting-room-heading > .eyebrow');
  await expect(heading).toContainText('ROOM');
  return (await heading.innerText()).replace('ROOM ', '');
}

test('copies a clean invitation and a new mobile guest joins directly', async ({
  page,
  browser,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text: string) => sessionStorage.setItem('copied-link', text) },
      configurable: true,
    });
  });
  const roomId = await createRoom(page);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('button', { name: 'Invite a friend' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`invitation-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Invite a friend' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const link = await page.evaluate(() => sessionStorage.getItem('copied-link'));
  expect(link).toBe(`${new URL(page.url()).origin}/?room=${roomId}`);
  const guestContext = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const guest = await guestContext.newPage();
    await guest.goto(link!);
    await guest.getByLabel('Your explorer name').fill('Invited friend');
    await guest.getByRole('button', { name: 'Join your friend' }).tap();
    await expect(guest.locator('.waiting-room')).toContainText('Host');
    await expect(guest.locator('.waiting-room')).toContainText('Invited friend');
    await expect(page.getByRole('button', { name: 'Start expedition' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Invite a friend' })).toHaveCount(0);
    expect(new URL(guest.url()).searchParams.has('room')).toBe(false);
    await guest.getByRole('button', { name: 'Leave lobby' }).click();
    await expect(guest.getByRole('button', { name: 'Play solo' })).toBeVisible();
    await guest.goto(link!);
    await expect(guest.locator('.waiting-room')).toContainText('Host');
  } finally {
    await guestContext.close();
  }
});

test('uses native sharing and cancelling keeps the room unchanged', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        sessionStorage.setItem('shared-link', data.url!);
        throw new DOMException('Cancelled', 'AbortError');
      },
    });
  });
  const roomId = await createRoom(page);
  await page.getByRole('button', { name: 'Invite a friend' }).click();
  await expect(page.getByRole('button', { name: 'Invite a friend' })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('shared-link'))).toBe(
    `${new URL(page.url()).origin}/?room=${roomId}`,
  );
  await expect(page.getByLabel('Copy this invitation link')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('offers a selectable link if sharing and clipboard are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  const roomId = await createRoom(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'Invite a friend' }).click();
  const input = page.getByLabel('Copy this invitation link');
  await expect(input).toHaveValue(`${new URL(page.url()).origin}/?room=${roomId}`);
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!),
  ).toBe((await input.inputValue()).length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('unavailable and invalid invitations leave the lobby usable', async ({ page }) => {
  await enter(page, 'Explorer');
  await page.goto('/?room=000000');
  await expect(page.getByRole('alert')).toContainText('This room is no longer available');
  await expect(page.getByRole('button', { name: 'Play solo' })).toBeEnabled();
  await page.goto('/?room=invalid');
  await expect(page.getByRole('alert')).toContainText('This invitation link is invalid');
  await expect(page.getByRole('button', { name: 'Play solo' })).toBeEnabled();
});

test('an invitation never removes a player from their current room', async ({ page }) => {
  const roomId = await createRoom(page);
  await page.goto('/?room=000000');
  await expect(page.getByRole('alert')).toContainText('Leave your current room first');
  await expect(page.locator('.waiting-room-heading')).toContainText(roomId);
});
