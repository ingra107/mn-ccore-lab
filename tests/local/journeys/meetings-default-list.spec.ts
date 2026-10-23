import { test, expect } from '@playwright/test'

// Nick 2026-10-23: "why are future meetings in here... the default should just
// be meetings that are filled in with information". The default list shows
// past meetings with content (newest first, opened by default), upcoming ones
// in a strip with Prep links, and empty past ones behind a toggle.
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' }

test('Meetings: upcoming strip, past-with-content list, empty behind a toggle', async ({ page, request }) => {
  await page.setExtraHTTPHeaders(HEADERS)
  // Seed: one future meeting and one empty past one, beside the seed's own.
  const ymd = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const tag = `_TEST_DELETE_mtg_${Date.now()}`
  for (const [title, date, notes] of [[`${tag} future`, ymd(9), ''], [`${tag} empty`, ymd(-3), ''], [`${tag} filled`, ymd(-1), 'We decided things.']]) {
    const r = await request.post('http://localhost:8787/api/meetings', { headers: HEADERS, data: { title, date, notes, type: 'ad-hoc' } })
    expect(r.ok(), `${title}: ${r.status()} ${await r.text()}`).toBe(true)
  }
  await page.goto('/portal/meetings')
  const strip = page.getByRole('region', { name: 'Upcoming meetings' })
  await expect(strip).toBeVisible({ timeout: 20_000 })
  // At most three show; '+N more' opens the rest.
  expect(await strip.locator('.tk-mup-r').count()).toBeLessThanOrEqual(3)
  const more = strip.getByRole('button', { name: /more$/ })
  if (await more.count()) await more.click()
  await expect(strip.getByText(`${tag} future`)).toBeVisible()
  await expect(strip.getByRole('link', { name: 'Prep' }).first()).toHaveAttribute('href', /\/portal\/meetings\/.+\/prep$/)
  const list = page.locator('.tk-mlist')
  await expect(list.locator('.tk-mlc', { hasText: `${tag} future` })).toHaveCount(0)
  await expect(list.locator('.tk-mlc', { hasText: `${tag} empty` })).toHaveCount(0)
  await expect(list.locator('.tk-mlc', { hasText: `${tag} filled` })).toHaveCount(1)
  // The page opens on the newest past meeting with content, never a future one.
  const firstCard = list.locator('.tk-mlc').first()
  await expect(firstCard).toHaveAttribute('aria-current', 'true')
  await expect(firstCard).not.toContainText(`${tag} future`)
  await page.screenshot({ path: 'test-results/meetings-default.png' })
  // The toggle brings the empty ones back.
  await page.getByRole('button', { name: /past meetings? with no notes/ }).click()
  await expect(list.locator('.tk-mlc', { hasText: `${tag} empty` })).toHaveCount(1)
  // Clicking an upcoming meeting opens it in the detail panel.
  await strip.getByText(`${tag} future`).click()
  await expect(page.locator('.meetings-detail-panel')).toContainText(`${tag} future`)
  // A search lists every match, future included.
  await page.getByPlaceholder('Search...').fill(tag)
  await expect(list.locator('.tk-mlc', { hasText: `${tag} future` })).toHaveCount(1)
  await page.screenshot({ path: 'test-results/meetings-search.png' })
})
