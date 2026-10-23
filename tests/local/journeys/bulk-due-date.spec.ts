import { test, expect } from '@playwright/test'

// GitHub #148 (2026-10-22): the My Tasks bulk bar offered only "Snooze +1d".
// Nick: "why can't it be the typical popup for changing time with the calendar
// and shortcuts we use elsewhere". The bar now opens the shared
// InlineDatePicker; its +7d adds up across clicks for every selected task.
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }


test('bulk Due date opens the shared picker and +7d adds up on every selected task', async ({ page }) => {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': 'ingra107@umn.edu' })
  const writes: Array<{ url: string; body: Record<string, unknown> }> = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/tasks\/[^/]+$/.test(new URL(r.url()).pathname)) {
      writes.push({ url: r.url(), body: JSON.parse(r.postData() ?? '{}') })
    }
  })
  await page.goto('/portal/my-tasks?view=table')
  // Shift-click selects (Rule 71); the row checkbox is "Mark done".
  const titles = [page.getByRole('button', { name: 'Circulate agenda', exact: true }), page.getByRole('button', { name: 'Review K99 eligibility', exact: true })]
  await expect(titles[1]).toBeVisible({ timeout: 20_000 })
  for (const t of titles) await t.click({ modifiers: ['Shift'] })
  await expect(page.getByText('2 selected')).toBeVisible()
  await expect(page.getByRole('button', { name: /Snooze \+1d/ })).toHaveCount(0)

  await page.locator('.bulk-date-host').getByRole('button').click()
  const picker = page.getByRole('dialog', { name: 'Choose a date' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: '+7d' }).click()
  await picker.getByRole('button', { name: '+7d' }).click()
  // The selection and the picker stay open between clicks.
  await expect(picker).toBeVisible()
  await expect(page.getByText('2 selected')).toBeVisible()

  await expect.poll(() => writes.length).toBeGreaterThanOrEqual(4)
  // Two clicks x two tasks. Each click writes one date to both tasks, and the
  // second click's date is 7 days after the first's.
  const byUrl = new Map<string, string[]>()
  for (const w of writes) byUrl.set(w.url, [...(byUrl.get(w.url) ?? []), String(w.body.due_date)])
  expect(byUrl.size).toBe(2)
  const [a, b] = [...byUrl.values()]
  expect(a).toEqual(b)
  expect(a).toHaveLength(2)
  const gap = (Date.parse(a[1]) - Date.parse(a[0])) / 86_400_000
  expect(gap).toBe(7)
  await page.screenshot({ path: 'test-results/bulk-due-date.png' })
})

test('Deadlines bulk bar: Due date opens the shared picker (not +1 day), +7d adds up', async ({ page }) => {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': 'ingra107@umn.edu' })
  const writes: Array<{ url: string; due: unknown }> = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/tasks\/[^/]+$/.test(new URL(r.url()).pathname)) {
      writes.push({ url: r.url(), due: JSON.parse(r.postData() ?? '{}').due_date })
    }
  })
  await page.goto('/portal/deadlines')
  const rows = page.getByRole('row')
  await expect(rows.nth(2)).toBeVisible({ timeout: 20_000 })
  await rows.nth(1).getByRole('cell').nth(1).getByRole('button').first().click({ modifiers: ['Shift'] })
  await expect(page.getByText(/1 selected/)).toBeVisible()
  await expect(page.getByText('+1 day')).toHaveCount(0)
  await page.locator('.bulk-date-host').getByRole('button').click()
  const picker = page.getByRole('dialog', { name: 'Choose a date' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: '+7d', exact: true }).click()
  await picker.getByRole('button', { name: '+7d', exact: true }).click()
  await expect(page.getByText(/1 selected/)).toBeVisible()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[0].url).toBe(writes[1].url)
  expect((Date.parse(String(writes[1].due)) - Date.parse(String(writes[0].due))) / 86_400_000).toBe(7)
  await page.screenshot({ path: 'test-results/deadlines-bulk-due.png' })
})
