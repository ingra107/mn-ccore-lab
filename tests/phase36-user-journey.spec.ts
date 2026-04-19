import { test, expect } from '@playwright/test';

const BASE = 'https://mn-ccore-lab.pages.dev';

// Phase 36 post-deploy desktop user journey. Walks the flow a typical
// PI does on a workday: dashboard → tasks → detail panel → projects →
// team → member page → meetings → personal. Each hop must render without
// JS errors or 5xx responses.
//
// Canary for: Hono routing + async-auth + lab_settings reads + isPi
// client hydration + directors-included-in-getAllMembers (2026-04-19
// audit fix). Keep `/team/nick` in the journey — that step catches the
// director-lookup regression class.
test('desktop user journey: dashboard → tasks → detail → projects → team → member', async ({ page }) => {
  const jsErrors: string[] = [];
  const failed5xx: string[] = [];
  page.on('pageerror', (err) => jsErrors.push(`[${page.url()}] ${err.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) failed5xx.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible();

  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
  const firstRow = page.locator('[data-testid^="task-row-"]').first();
  await firstRow.waitFor({ state: 'visible', timeout: 10000 });

  await firstRow.locator('div').filter({ hasText: /\S/ }).first().click({ force: true });
  const panel = page.locator('[data-testid="task-detail-panel"]');
  await expect(panel).toBeVisible({ timeout: 5000 });
  await page.locator('[data-testid="close-detail-panel"]').click();
  await expect(panel).toBeHidden({ timeout: 3000 });

  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible();

  await page.goto(`${BASE}/team`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible();

  // Director profile — MUST render the MemberPage, NOT redirect back to
  // /team. Phase 36b renamed the slug to `nick-ingraham` (preferred-last
  // format). /team/nick now redirects to /team because that slug is gone.
  await page.goto(`${BASE}/team/nick-ingraham`, { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/team\/nick-ingraham/);
  await expect(page.locator('body')).toContainText(/Nick Ingraham/i, { timeout: 10000 });

  await page.goto(`${BASE}/meetings`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible();

  await page.goto(`${BASE}/personal`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible();

  expect(jsErrors, `JS errors: ${jsErrors.join(' | ')}`).toEqual([]);
  expect(failed5xx, `5xx: ${failed5xx.join(' | ')}`).toEqual([]);
});
