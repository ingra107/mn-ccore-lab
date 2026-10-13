import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

// Wave 3 item 5 (option A): a task's status reads as a shape. The My Tasks
// Table shows one StatusGlyph per row (empty ring, half, dashed, center dot;
// Done is solid, but the open table hides done rows, so it is not asserted here), gray except the teal half of In Progress. Creates its own tasks and
// soft-deletes them. Screenshots: review/nl-status/ (gitignored).
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/nl-status'
const STATUSES = ['todo', 'in_progress', 'waiting_external', 'blocked', 'done'] as const
const SHAPE: Record<string, string> = { todo: 'sg-todo', in_progress: 'sg-half', waiting_external: 'sg-wait', blocked: 'sg-blk', done: 'sg-full' }

let stamp = ''
const ids: string[] = []

async function make(page: Page, status: string) {
  const res = await page.request.post('/api/tasks', {
    headers: HEADERS,
    data: { title: `SG${stamp} ${status}`, description: `SG${stamp} ${status}`, assignee: 'nick-ingraham', status, priority: 'medium' },
  })
  expect(res.status(), await res.text()).toBe(201)
  ids.push(((await res.json()) as { data: { id: string } }).data.id)
}

test.beforeEach(async ({ page }) => {
  stamp = String(Date.now())
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(HEADERS)
})
test.afterEach(async ({ page }) => {
  for (const id of ids.splice(0)) await page.request.post(`/api/tasks/${id}/delete`, { headers: HEADERS, data: {} })
})

for (const theme of ['light', 'dark'] as const) {
  for (const w of [1440, 375] as const) {
    test(`status glyph per row, ${theme} ${w}`, async ({ page }) => {
      for (const s of STATUSES) await make(page, s)
      await page.addInitScript((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
      await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 })
      await page.goto(`/portal/my-tasks?q=SG${stamp}&view=table`, { waitUntil: 'load' })
      await page.waitForSelector('.list-view-row', { timeout: 20_000 })
      if (w === 1440) {
        for (const s of STATUSES.filter((x) => x !== 'done')) {
          const row = page.locator('.list-view-row', { hasText: `SG${stamp} ${s}` })
          await expect(row.locator(`[data-col="status"] i.sg.${SHAPE[s]}`)).toHaveCount(1)
        }
      }
      await page.screenshot({ path: `${SHOTS}/table-${w}-${theme}.png` })
    })
  }
}
