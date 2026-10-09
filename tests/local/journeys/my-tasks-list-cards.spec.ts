import { test, expect, type Page } from '@playwright/test'

// Tasks List is the Today card (Nick 2026-10-09); the old dense table is the
// Table view. This journey drives both in a real browser against the local
// Miniflare seed (Nick has ~24 tasks there): List cursor, select, range select,
// expand, Enter, the done box with undo, and Table sort + x-select.
// Run: npm run test:journeys:one -- tests/local/journeys/my-tasks-list-cards.spec.ts
const HEADERS = {
  'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
  'X-Test-User': 'ingra107@umn.edu',
}

async function open(page: Page, query = '') {
  await page.setExtraHTTPHeaders(HEADERS)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/portal/my-tasks${query}`)
  return errors
}

const cursorIndex = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.tk-lrow')].findIndex((r) => r.getAttribute('data-cursor') === 'true'))

test.describe('My Tasks List cards', () => {
  test('cursor, select, range select, expand, Enter, done box', async ({ page }) => {
    const errors = await open(page)
    await page.waitForSelector('.tk-lrow .tk-tc', { timeout: 20_000 })
    expect(await page.locator('.tk-lrow .tk-tc').count()).toBeGreaterThan(5)
    // No drag-to-plan target exists here, so no grip.
    await expect(page.locator('.tk-lrow .tk-grip')).toHaveCount(0)

    await page.locator('body').click({ position: { x: 700, y: 120 } })
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    expect(await cursorIndex(page)).toBe(2)
    await page.keyboard.press('k')
    expect(await cursorIndex(page)).toBe(1)

    // x selects the cursor row; the bulk bar counts it.
    await page.keyboard.press('x')
    await expect(page.locator('.tk-lrow[data-selected=true]')).toHaveCount(1)
    await expect(page.getByText('1 selected')).toBeVisible()

    // Shift-click selects a range and does NOT expand the card.
    await page.locator('.tk-lrow').nth(4).click({ modifiers: ['Shift'], position: { x: 300, y: 20 } })
    await expect(page.locator('.tk-lrow[data-selected=true]')).toHaveCount(4)
    await expect(page.locator('.tk-tc.tk-exp')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.tk-lrow[data-selected=true]')).toHaveCount(0)

    // e opens the full editor for the cursor row.
    await page.keyboard.press('e')
    await expect(page.getByText('Overview', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Overview', { exact: true })).toHaveCount(0)

    // Click expands in place, a second click collapses.
    const hdr = page.locator('.tk-lrow .tk-tch').nth(1)
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

    // Done box completes (the card leaves the hide-completed list), Undo restores it.
    // The list is virtualized, so assert on the task id, not on a row count.
    const id = await page.locator('.tk-lrow .tk-tc').first().getAttribute('data-task-id')
    expect(id).toBeTruthy()
    const card = page.locator(`.tk-tc[data-task-id="${id}"]`)
    await card.locator('.tk-ck').click()
    await expect(page.getByText('Task completed')).toBeVisible()
    await expect(card).toHaveCount(0)
    await page.getByRole('button', { name: /undo/i }).first().click()
    await expect(card).toHaveCount(1)

    expect(errors).toEqual([])
  })

  test('Table view sorts by header and x selects', async ({ page }) => {
    const errors = await open(page, '?view=table')
    await page.waitForSelector('.list-view-row', { timeout: 20_000 })
    const head = page.getByRole('columnheader', { name: 'Priority' })
    await page.getByRole('button', { name: 'Priority' }).click()
    await expect(head).toHaveAttribute('aria-sort', 'ascending')
    // Urgent sorts first when ascending.
    await expect(page.locator('.list-view-row').first()).toContainText(/urgent/i)
    await page.getByRole('button', { name: 'Priority' }).click()
    await expect(head).toHaveAttribute('aria-sort', 'descending')
    await page.getByRole('button', { name: 'Priority' }).click()
    await expect(head).toHaveAttribute('aria-sort', 'none')

    await page.locator('body').click({ position: { x: 700, y: 120 } })
    await page.keyboard.press('x')
    await expect(page.getByText('1 selected')).toBeVisible()
    expect(errors).toEqual([])
  })
})
