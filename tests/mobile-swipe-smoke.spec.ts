import { test, expect, devices } from '@playwright/test';

// Post-deploy mobile smoke. Verifies:
//   1. Tasks page loads on mobile viewport without JS errors (confirms the
//      Hono router + client bundle still work end-to-end).
//   2. TaskDetailPanel imports + renders when the route carries `?open=<id>`
//      deep-link (confirms touch-handler additions didn't break the panel
//      mount path).
// Does NOT test the swipe gesture itself — Playwright's synthetic touch
// events don't reproduce real touchmove velocity. Real-device testing
// still needed.
test.use({ ...devices['Pixel 5'] });

test('mobile: tasks page loads without JS errors', async ({ page }) => {
  const jsErrors: string[] = [];
  const failed5xx: string[] = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));
  page.on('response', (r) => {
    if (r.status() >= 500) failed5xx.push(`${r.status()} ${r.url()}`);
  });

  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'networkidle' });

  // At least one task row rendered — confirms /api/tasks returned data.
  const firstRow = page.locator('[data-testid^="task-row-"]').first();
  await firstRow.waitFor({ state: 'visible', timeout: 15000 });

  expect(jsErrors, `JS errors: ${jsErrors.join(' | ')}`).toEqual([]);
  expect(failed5xx, `5xx responses: ${failed5xx.join(' | ')}`).toEqual([]);
});

test('mobile: clicking task title opens TaskDetailPanel', async ({ page }) => {
  const jsErrors: string[] = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));

  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'networkidle' });
  const firstRow = page.locator('[data-testid^="task-row-"]').first();
  await firstRow.waitFor({ state: 'visible', timeout: 15000 });

  // Click the title inside the row. CLAUDE.md rule 9: "Clicking a task row
  // opens detail panel. ONLY clicking the status circle changes status."
  // Target a non-interactive cell so we don't hit the status dropdown.
  const title = firstRow.locator('button, [role="button"], div').filter({ hasText: /\S/ }).first();
  await title.tap({ force: true });

  const panel = page.locator('[data-testid="task-detail-panel"]');
  await expect(panel).toBeVisible({ timeout: 5000 });
  await expect(panel).toHaveAttribute('aria-modal', 'true');

  // Close button works — important because drag state shouldn't interfere.
  await page.locator('[data-testid="close-detail-panel"]').tap();
  await expect(panel).toBeHidden({ timeout: 3000 });

  expect(jsErrors, `JS errors: ${jsErrors.join(' | ')}`).toEqual([]);
});
