/**
 * Targeted captures for round 2 Claude Design pass — Nick's specific asks:
 *
 *  A) Quick Add panel on Task Detail Overview tab (new this round).
 *  B) Teal focus outline on selected task row (Nick wants this assessed
 *     for removal — too much chrome).
 *  C) Inline-arrow ▾ surfaces — the InlineSelect dropdown indicator
 *     repeated across many cells. Audit candidate: hide unless hover.
 *
 * Output co-located with the design bundle:
 *   review/claude-design-2026-04-20-post-fixes/focus-XX-*.png
 */
import { test } from '@playwright/test'
import path from 'node:path'

const BASE = 'https://mn-ccore-lab.pages.dev'
const OUT = path.join('review', 'claude-design-2026-04-20-post-fixes')

test('focus-01-quick-add-overview → new Quick Add on Task Detail Overview', async ({ page }) => {
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  // Open the first task's detail panel by clicking its title.
  const firstTitle = page.locator('[data-testid^="task-row-"] [data-testid="task-title-cell"], [data-testid^="task-row-"]').first()
  await firstTitle.waitFor({ state: 'visible', timeout: 8000 })
  await firstTitle.click()
  await page.waitForTimeout(700)
  // Scroll the detail panel to the bottom so Quick Add is in view.
  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="task-detail-panel"], .task-detail-panel, aside') as HTMLElement | null
    if (panel) panel.scrollTop = panel.scrollHeight
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, 'focus-01-quick-add-overview-default.png'), fullPage: false })

  // Find the Quick Add textarea inside the panel by its rendered placeholder
  // text. The Comment placeholder starts with `e.g. "@emma`.
  const panel = page.locator('[data-testid="task-detail-panel"]')
  const textarea = panel.locator('textarea').last() // Quick Add is the bottom textarea on Overview
  await textarea.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await textarea.count()) {
    await textarea.scrollIntoViewIfNeeded()
    await textarea.fill('@emma sanity-check the propensity weights on cohort v3, then @hermes pull recent JAMA on this.')
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT, 'focus-01-quick-add-overview-typed-comment.png'), fullPage: false })

    // Switch to Note mode — pill button has visible text "note".
    const noteBtn = panel.getByRole('button', { name: /^note$/i }).first()
    if (await noteBtn.count()) {
      await noteBtn.click()
      await page.waitForTimeout(200)
      await textarea.fill('')
      await page.waitForTimeout(150)
      await page.screenshot({ path: path.join(OUT, 'focus-01-quick-add-overview-note-mode.png'), fullPage: false })
    }
  }
})

test('focus-02-task-row-focus-outline → teal outline on selected task row', async ({ page }) => {
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  // J key advances focus to first task — this triggers the teal outline.
  await page.keyboard.press('j')
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, 'focus-02-row-focus-outline-j-pressed.png'), fullPage: false })
  // Press a few more times so the outline progression is visible.
  await page.keyboard.press('j')
  await page.keyboard.press('j')
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, 'focus-02-row-focus-outline-multi-j.png'), fullPage: false })
  // Click a task title for the click-selected state.
  const row = page.locator('[data-testid^="task-row-"]').nth(2)
  if (await row.count()) {
    await row.click({ position: { x: 200, y: 12 } })
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, 'focus-02-row-focus-outline-clicked.png'), fullPage: false })
  }
})

test('focus-03-inline-arrow-density → audit inline ▾ chevrons', async ({ page }) => {
  // Tasks page: status / priority / assignee / due / project all carry
  // inline ▾ indicators. Capture the current density so Claude Design
  // can recommend hover-only or single-arrow patterns.
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'focus-03-inline-arrows-tasks.png'), fullPage: true })

  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'focus-03-inline-arrows-projects.png'), fullPage: false })

  await page.goto(`${BASE}/manuscripts`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'focus-03-inline-arrows-manuscripts.png'), fullPage: false })

  await page.goto(`${BASE}/decisions`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'focus-03-inline-arrows-decisions.png'), fullPage: false })
})
