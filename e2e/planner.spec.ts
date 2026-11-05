import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'zivilschutz';

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('button', { name: 'Abmelden' })).toBeVisible();
}

/** First block whose aria-label starts with the given title. */
const block = (page: Page, title: string) => page.locator(`[data-block-id][aria-label^="${title},"]`).first();

async function dragBy(page: Page, title: string, dx: number, dy: number) {
  const box = (await block(page, title).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(20, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test('Kp Kdt drags a block and the new time persists', async ({ page }) => {
  await login(page, 'kpkdt@demo.ch');
  await page.goto('/wk/1');
  await expect(block(page, 'Detailausbildung 1')).toBeVisible();
  await page.screenshot({ path: 'e2e/.tmp/planner-kpkdt.png' });

  const before = await block(page, 'Detailausbildung 1').getAttribute('aria-label');
  expect(before).toContain('09:45 bis 12:00');
  const patch = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/blocks/'));
  await dragBy(page, 'Detailausbildung 1', 0, 36); // 1.2 px/min → +30 min
  expect((await patch).status()).toBe(200);

  await page.reload();
  await expect(block(page, 'Detailausbildung 1')).toHaveAttribute('aria-label', /10:15 bis 12:30/);
});

test('Zfhr can only move blocks of the own Zug', async ({ page }) => {
  await login(page, 'zfhr1@demo.ch');
  await page.goto('/wk/1');
  const label = 'Detailausbildung 2'; // first one belongs to Pi Z 2
  const before = await block(page, label).getAttribute('aria-label');
  let patched = false;
  page.on('request', (r) => {
    if (r.method() === 'PATCH') patched = true;
  });
  await dragBy(page, label, 0, 60);
  await page.waitForTimeout(500);
  expect(patched).toBe(false);
  expect(await block(page, label).getAttribute('aria-label')).toBe(before);
});

test('Kader sees a read-only programme', async ({ page }) => {
  await login(page, 'kader@demo.ch');
  await page.goto('/wk/1');
  await expect(page.getByRole('button', { name: '+ Block' })).toHaveCount(0);
  await expect(page.getByText('Programm für Pi Z 1')).toBeVisible();
  await page.screenshot({ path: 'e2e/.tmp/planner-kader.png', fullPage: true });
});

test('Bat approves a submitted Arbeitsprogramm', async ({ page }) => {
  await login(page, 'bat@demo.ch');
  await page.getByRole('link', { name: 'Prüfen →' }).click();
  await page.getByRole('button', { name: 'Freigeben' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Freigeben' }).click();
  await expect(page.getByText('Freigegeben', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'e2e/.tmp/bat-approved.png' });
});
