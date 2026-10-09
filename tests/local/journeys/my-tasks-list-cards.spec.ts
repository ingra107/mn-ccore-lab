import { test, expect, type Page } from '@playwright/test'

// Tasks List is the Today card (Nick 2026-10-09); the old dense table is the
// Table view. This journey drives both in a real browser against the local
// Miniflare stack. It does not depend on the seed: it creates its own tasks
// (known id, status and priority), narrows the page to them with ?q=, acts on
// them by id, and soft-deletes them in afterEach, so every write is gone at the
// end. Done -> Undo is asserted as a status round trip for an in_progress, a
// waiting_external and a todo task (Undo used to put everything back as todo).
// Run: npm run test:journeys:one -- tests/local/journeys/my-tasks-list-cards.spec.ts
const HEADERS = {
  'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
  'X-Test-User': 'ingra107@umn.edu',
}

type Made = { id: string; title: string; status: string; priority: string }
let stamp = ''
let made: Made[] = []

async function create(page: Page, label: string, status: string, priority: string): Promise<Made> {
  const title = `JT${stamp} ${label}`
  const res = await page.request.post('/api/tasks', {
    headers: HEADERS,
    data: { title, description: title, assignee: 'nick-ingraham', status, priority },
  })
  expect(res.status(), await res.text()).toBe(201)
  const id = ((await res.json()) as { data: { id: string } }).data.id
  const t = { id, title, status, priority }
  made.push(t)
  return t
}

async function statusOf(page: Page, id: string): Promise<string | undefined> {
  const res = await page.request.get('/api/tasks', { headers: HEADERS })
  const rows = ((await res.json()) as { data: Array<{ id: string; status: string }> }).data
  return rows.find((r) => r.id === id)?.status
}

async function open(page: Page, query: string) {
  await page.setExtraHTTPHeaders(HEADERS)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/portal/my-tasks?q=JT${stamp}${query}`)
  return errors
}

const cursorIndex = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.tk-lrow')].findIndex((r) => r.getAttribute('data-cursor') === 'true'))

test.beforeEach(async ({ page }) => {
  stamp = String(Date.now())
  made = []
  await page.setExtraHTTPHeaders(HEADERS)
})

test.afterEach(async ({ page }) => {
  for (const t of made) {
    await page.request.post(`/api/tasks/${t.id}/delete`, { headers: HEADERS, data: {} })
  }
})

test.describe('My Tasks List cards', () => {
  test('cursor, select, expand, Enter, and the done box restores the prior status', async ({ page }) => {
    const prog = await create(page, 'in progress', 'in_progress', 'urgent')
    const wait = await create(page, 'waiting', 'waiting_external', 'high')
    const todo = await create(page, 'todo', 'todo', 'low')
    const errors = await open(page, '')
    await page.waitForSelector('.tk-lrow .tk-tc', { timeout: 20_000 })
    await expect(page.locator('.tk-lrow .tk-tc')).toHaveCount(3)
    // No drag-to-plan target exists here, so no grip.
    await expect(page.locator('.tk-lrow .tk-grip')).toHaveCount(0)
    // The urgent task carries the urgency rail; the others do not.
    await expect(page.locator(`.tk-tc[data-task-id="${prog.id}"]`)).toHaveClass(/tk-urg/)
    await expect(page.locator(`.tk-tc[data-task-id="${todo.id}"]`)).not.toHaveClass(/tk-urg/)

    await page.locator('body').click({ position: { x: 700, y: 120 } })
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    expect(await cursorIndex(page)).toBe(2)
    await page.keyboard.press('k')
    expect(await cursorIndex(page)).toBe(1)

    // x selects the cursor row; shift-click extends the range without expanding.
    await page.keyboard.press('x')
    await expect(page.locator('.tk-lrow[data-selected=true]')).toHaveCount(1)
    await expect(page.getByText('1 selected')).toBeVisible()
    await page.locator('.tk-lrow').nth(2).click({ modifiers: ['Shift'], position: { x: 300, y: 20 } })
    await expect(page.locator('.tk-lrow[data-selected=true]')).toHaveCount(2)
    await expect(page.locator('.tk-tc.tk-exp')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.tk-lrow[data-selected=true]')).toHaveCount(0)

    // e opens the full editor for the cursor row.
    await page.keyboard.press('e')
    await expect(page.getByText('Overview', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Overview', { exact: true })).toHaveCount(0)

    // Click expands in place, a second click collapses.
    const hdr = page.locator(`.tk-tc[data-task-id="${wait.id}"] .tk-tch`)
    await hdr.click({ position: { x: 300, y: 20 } })
    await expect(page.locator('.tk-tc.tk-exp')).toHaveCount(1)
    await hdr.click({ position: { x: 300, y: 20 } })
    await expect(page.locator('.tk-tc.tk-exp')).toHaveCount(0)

    // Enter on a focused card header expands it and does not also open the editor.
    await hdr.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.tk-tc.tk-exp')).toHaveCount(1)
    await expect(page.getByText('Overview', { exact: true })).toHaveCount(0)
    const overlap = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.tk-lrow')].map((r) => r.getBoundingClientRect())
      return rows.filter((r, i) => i > 0 && r.top < rows[i - 1].bottom - 1).length
    })
    expect(overlap).toBe(0)
    await page.keyboard.press('Enter')
    await expect(page.locator('.tk-tc.tk-exp')).toHaveCount(0)

    // Done -> Undo puts each task back with the status it had.
    for (const t of [prog, wait, todo]) {
      const card = page.locator(`.tk-tc[data-task-id="${t.id}"]`)
      await card.locator('.tk-ck').click()
      // The previous iteration's toast can still be on screen; the newest is last.
      await expect(page.getByText('Task completed').last()).toBeVisible()
      await expect(card).toHaveCount(0)
      expect(await statusOf(page, t.id)).toBe('done')
      await page.getByRole('button', { name: /undo/i }).last().click()
      await expect(card).toHaveCount(1)
      await expect.poll(() => statusOf(page, t.id)).toBe(t.status)
    }
    expect(errors).toEqual([])
  })

  test('Table view sorts by header (urgent first, blanks last) and x selects', async ({ page }) => {
    const urgent = await create(page, 'urgent', 'in_progress', 'urgent')
    const low = await create(page, 'low', 'todo', 'low')
    const errors = await open(page, '&view=table')
    await page.waitForSelector('.list-view-row', { timeout: 20_000 })
    const rows = page.locator('.list-view-row')
    await expect(rows).toHaveCount(2)
    const head = page.getByRole('columnheader', { name: 'Priority' })
    await page.getByRole('button', { name: 'Priority' }).click()
    await expect(head).toHaveAttribute('aria-sort', 'ascending')
    await expect(rows.first()).toContainText(urgent.title)
    await expect(rows.nth(1)).toContainText(low.title)
    await page.getByRole('button', { name: 'Priority' }).click()
    await expect(head).toHaveAttribute('aria-sort', 'descending')
    await expect(rows.first()).toContainText(low.title)
    await page.getByRole('button', { name: 'Priority' }).click()
    await expect(head).toHaveAttribute('aria-sort', 'none')

    await page.locator('body').click({ position: { x: 700, y: 120 } })
    await page.keyboard.press('x')
    await expect(page.getByText('1 selected')).toBeVisible()
    expect(errors).toEqual([])
  })
})
