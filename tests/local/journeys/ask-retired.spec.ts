import { test, expect } from '@playwright/test'

// Ask the Lab was retired 2026-10-23. An old link (either form) lands on
// Today, and the retired endpoints are gone.
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' }

for (const path of ['/portal/ask', '/ask']) {
  test(`${path} lands on Today`, async ({ page }) => {
    await page.setExtraHTTPHeaders(HEADERS)
    await page.goto(path)
    await expect(page).toHaveURL(/\/portal\/dashboard/, { timeout: 20_000 })
    await expect(page.getByText('Ask the Lab')).toHaveCount(0)
  })
}

test('the /api/questions routes are gone', async ({ request }) => {
  const res = await request.get('http://localhost:8787/api/questions', { headers: HEADERS })
  expect(res.status()).toBe(404)
})
