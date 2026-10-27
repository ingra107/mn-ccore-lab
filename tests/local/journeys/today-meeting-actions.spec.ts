/**
 * A meeting's action rows live on its Today card (Nick 2026-10-12, mockup A:
 * "move a meeting's action rows onto the Today card, with a selection bar for
 * bulk actions").
 *
 *   node scripts/run-journey-spec.mjs --gate tests/local/journeys/today-meeting-actions.spec.ts
 *
 * One meeting dated today, four action items for Nick, each due today and
 * already on a project, which is how the debrief writer mints them. The journey
 * proves, on the real stack:
 *   - the rows show on the card, and each task shows ONCE on Today (the card
 *     holds them while open, the groups below get them back when it folds);
 *   - a row checks off in place;
 *   - two rows selected raise the bar; Date writes the same date to both through
 *     the batch route (asserted through the API), Assign and Project the same;
 *   - a card of freshly minted rows (dated, routed, Nick's) is NOT folded: only
 *     done, or handed to someone else, counts as handled; the header counts
 *     rows DONE and the viewer's own open rows (#155);
 *   - the card folds once every row is done or delegated;
 *   - the meeting card's own caret folds the rows too (#155).
 * Screenshots (light/dark x 1440/375) land in review/s76/ when S76_SHOTS=1.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s76'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = ymd(new Date())
const TOMORROW = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1))

interface Row { id: string; assignee: string; due_date: string | null; project_id: string | null; status: string; deleted_at?: string | null }

test.describe.configure({ mode: 'serial' })

let meetingId = ''
let meetingTitle = ''
let projectSlug = ''
let projectLabel = ''
let mintSlug = ''
const tasks: { id: string; title: string }[] = []

async function apiRows(page: Page): Promise<Record<string, Row>> {
  const res = await page.request.get(`/api/meetings/${meetingId}`, { headers: PI })
  const items = ((await res.json()) as { data: { action_items: Row[] } }).data.action_items
  return Object.fromEntries(items.map((r) => [r.id, r]))
}

function card(page: Page): Locator {
  return page.locator('.tk-mc', { hasText: meetingTitle })
}
const row = (page: Page, i: number) => card(page).locator(`[data-task-id="${tasks[i].id}"]`)

async function select(page: Page, ...idx: number[]) {
  for (const i of idx) {
    const r = row(page, i)
    await r.hover()
    await r.getByRole('checkbox', { name: 'Select action item' }).click()
  }
}

async function seed(page: Page, count = 4) {
  const stamp = Date.now()
  meetingTitle = `S76 Weekly meeting ${stamp}`
  const m = await page.request.post('/api/meetings', {
    headers: PI,
    data: { date: TODAY, title: meetingTitle, type: 'ad-hoc', attendees: ['nick-ingraham', 'casey-eddington'] },
  })
  expect(m.status()).toBeLessThan(300)
  meetingId = ((await m.json()) as { data: { id: string } }).data.id

  const projects = ((await (await page.request.get('/api/projects', { headers: PI })).json()) as { data: { slug: string; title: string; short_name?: string | null }[] }).data
  mintSlug = projects[0].slug
  const proj = projects[1] ?? projects[0]
  projectSlug = proj.slug
  projectLabel = proj.short_name?.trim() || proj.title

  const titles = ['Send the revised IRB amendment', 'Pull Q3 enrollment numbers', 'Draft the Figure 2 legend', 'Confirm the Thursday room',
    'Email the DSMB the interim summary', 'Update the sedation protocol appendix'].slice(0, count)
  for (const t of titles) {
    const title = `${t} ${stamp}`
    const r = await page.request.post('/api/tasks', {
      headers: PI,
      data: { title, description: title, assignee: 'nick-ingraham', meeting_id: meetingId, priority: 'medium', due_date: TODAY, project_id: mintSlug },
    })
    expect(r.status()).toBeLessThan(300)
    tasks.push({ id: ((await r.json()) as { data: { id: string } }).data.id, title })
  }
}

async function openToday(page: Page, theme = 'light') {
  await page.goto('/portal/dashboard', { waitUntil: 'load' })
  await page.evaluate((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
  await page.goto('/portal/dashboard', { waitUntil: 'load' })
  await expect(card(page)).toBeVisible({ timeout: 20_000 })
}

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

test.afterAll(async ({ request }) => {
  if (tasks.length) await request.post('/api/tasks/batch', { headers: PI, data: { action: 'delete', ids: tasks.map((t) => t.id) } })
})

test('rows on the card, once each, then triage them to a folded card', async ({ page }) => {
  await seed(page)
  const errors: string[] = []
  page.on('pageerror', (e) => { if (!/WebSocket|hub-realtime/.test(e.message)) errors.push(e.message) })
  await openToday(page)

  // 1. The rows show inside the meeting's card, none handled yet.
  const rows = card(page).locator('[data-task-id]')
  await expect(rows).toHaveCount(4, { timeout: 15_000 })
  const header = card(page).getByRole('button', { name: /Action items, \d+ of \d+ done/ })
  await expect(header).toHaveAttribute('aria-label', 'Action items, 0 of 4 done, 4 yours open')

  // 2. Each task shows once on Today. Due today for Nick, so the groups below
  //    would list them too; while the card holds them they are left out.
  for (const t of tasks) await expect(page.getByText(t.title, { exact: true })).toHaveCount(1)
  for (const t of tasks) await expect(card(page).getByText(t.title, { exact: true })).toHaveCount(1)
  //    Fold the card: the rows move to the groups, still once each.
  await header.click()
  await expect(card(page).locator('[data-task-id]')).toHaveCount(0)
  for (const t of tasks) {
    await expect(page.getByText(t.title, { exact: true })).toHaveCount(1)
    await expect(page.locator(`[data-task-id="${t.id}"]`)).toHaveCount(1)
  }
  //    Open it again: back on the card, gone from the groups.
  await header.click()
  await expect(card(page).locator('[data-task-id]')).toHaveCount(4)
  //    The meeting card's caret is the same collapse (#155): it folds the rows
  //    with the card, and opens them again.
  await card(page).locator('.meeting-row-header').click()
  await expect(card(page).locator('[data-task-id]')).toHaveCount(0)
  await card(page).locator('.meeting-row-header').click()
  await expect(card(page).locator('[data-task-id]')).toHaveCount(4)
  for (const t of tasks) await expect(page.getByText(t.title, { exact: true })).toHaveCount(1)

  // 3. Check one off in place.
  await row(page, 0).getByRole('button', { name: 'Mark done' }).click()
  await expect.poll(async () => (await apiRows(page))[tasks[0].id].status, { timeout: 10_000 }).toBe('done')
  await expect(header).toHaveAttribute('aria-label', 'Action items, 1 of 4 done, 3 yours open')

  // 4. Select two: the bar shows at the foot of THIS card. Date writes both.
  await select(page, 1, 2)
  const bar = card(page).getByTestId('meeting-action-bar')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('2 selected')
  for (const name of ['Assign', 'Project', 'Complete', 'Delete', 'Clear', 'Clear date']) {
    await expect(bar.getByText(name, { exact: true }).first()).toBeVisible()
  }
  await bar.getByRole('button', { name: 'Set a due date' }).click()
  await page.getByRole('dialog', { name: 'Choose a date' }).getByRole('button', { name: 'Tomorrow' }).click()
  await expect.poll(async () => {
    const r = await apiRows(page)
    return [r[tasks[1].id].due_date?.slice(0, 10), r[tasks[2].id].due_date?.slice(0, 10), r[tasks[3].id].due_date?.slice(0, 10)]
  }, { timeout: 10_000 }).toEqual([TOMORROW, TOMORROW, TODAY])
  await expect(bar).toHaveCount(0)

  //    Clear date takes the date off both.
  await select(page, 1, 2)
  await bar.getByRole('button', { name: 'Clear date' }).click()
  await expect.poll(async () => {
    const r = await apiRows(page)
    return [r[tasks[1].id].due_date, r[tasks[2].id].due_date, r[tasks[3].id].due_date?.slice(0, 10)]
  }, { timeout: 10_000 }).toEqual([null, null, TODAY])
  await expect(bar).toHaveCount(0)

  // 5. Route the same two to another project.
  await select(page, 1, 2)
  await bar.getByRole('combobox', { name: 'Move selected to project' }).click()
  // The picker lists a project with products as its "Project ~ Product" pairs
  // (no bare row), so match either form; both file the task on projectSlug.
  const label = projectLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await page.getByRole('option', { name: new RegExp(`^${label}( ~ .*)?$`) }).first().click()
  await expect.poll(async () => {
    const r = await apiRows(page)
    return [r[tasks[1].id].project_id, r[tasks[2].id].project_id, r[tasks[3].id].project_id]
  }, { timeout: 10_000 }).toEqual([projectSlug, projectSlug, mintSlug])
  // Dated, routed, Nick's: still his to do, so still not handled.
  await expect(header).toHaveAttribute('aria-label', 'Action items, 1 of 4 done, 3 yours open')

  // 6. Hand the same two to Casey: delegated rows are handled.
  await select(page, 1, 2)
  await bar.getByRole('combobox', { name: 'Assign selected to' }).click()
  await page.getByRole('option', { name: /Casey/ }).first().click()
  await expect.poll(async () => {
    const r = await apiRows(page)
    return [r[tasks[1].id].assignee, r[tasks[2].id].assignee, r[tasks[3].id].assignee]
  }, { timeout: 10_000 }).toEqual(['casey-eddington', 'casey-eddington', 'nick-ingraham'])
  await expect(bar).toHaveCount(0)
  await expect(header).toHaveAttribute('aria-label', 'Action items, 1 of 4 done, 1 yours open')

  // 7. The last row goes to Casey from its own owner picker. Every row is done or
  //    delegated, so the card folds to its count, even though it was opened by hand.
  await row(page, 3).getByRole('button', { name: /^Assignee:/ }).click()
  await page.getByRole('option', { name: /Casey/ }).first().click()
  await expect(header).toHaveAttribute('aria-label', 'Action items, 1 of 4 done', { timeout: 10_000 })
  await expect(card(page).getByTestId('meeting-actions-card')).toHaveAttribute('data-open', 'false')
  await expect(card(page).locator('[data-task-id]')).toHaveCount(0)
  await expect(card(page).getByText('1 of 4 done')).toBeVisible()
  // None of it is Nick's any more: no task title shows more than once on Today.
  for (const t of tasks) expect(await page.getByText(t.title, { exact: true }).count()).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('screenshots: light and dark, 1440 and 375', async ({ page }) => {
  test.skip(!process.env.S76_SHOTS, 'set S76_SHOTS=1 to capture review/s76/')
  test.setTimeout(240_000)
  // A fresh meeting: six rows (past the phone cap of four), one done, one dated
  // and routed, the rest open.
  tasks.length = 0
  await seed(page, 6)
  await page.request.post('/api/tasks/batch', { headers: PI, data: { action: 'complete', ids: [tasks[4].id] } })
  await page.request.post('/api/tasks/batch', { headers: PI, data: { action: 'due_date', ids: [tasks[3].id], value: TOMORROW } })
  await page.request.post(`/api/tasks/${tasks[3].id}`, { headers: PI, data: { project_id: projectSlug } })
  for (const theme of ['light', 'dark']) {
    for (const [name, w, h] of [['1440', 1440, 1100], ['375', 375, 1000]] as const) {
      await page.setViewportSize({ width: w, height: h })
      await openToday(page, theme)
      await expect(card(page).locator('[data-task-id]').first()).toBeVisible({ timeout: 15_000 })
      await card(page).evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await card(page).screenshot({ path: `${SHOTS}/card-rows-${theme}-${name}.png` })
      // Two selected: the bar at the foot of the card.
      await select(page, 0, 1)
      await expect(card(page).getByTestId('meeting-action-bar')).toBeVisible()
      await card(page).evaluate((el) => el.scrollIntoView({ block: 'end' }))
      await card(page).screenshot({ path: `${SHOTS}/card-selected-${theme}-${name}.png` })
      await page.screenshot({ path: `${SHOTS}/page-selected-${theme}-${name}.png` })
      await card(page).getByRole('button', { name: 'Clear selection' }).click()
    }
  }
  // Folded: everything handled.
  await page.request.post('/api/tasks/batch', { headers: PI, data: { action: 'complete', ids: tasks.map((t) => t.id) } })
  for (const theme of ['light', 'dark']) {
    for (const [name, w, h] of [['1440', 1440, 1100], ['375', 375, 1000]] as const) {
      await page.setViewportSize({ width: w, height: h })
      await openToday(page, theme)
      await expect(card(page).getByText('6 of 6 done')).toBeVisible({ timeout: 15_000 })
      await card(page).evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await card(page).screenshot({ path: `${SHOTS}/card-folded-${theme}-${name}.png` })
    }
  }
})
