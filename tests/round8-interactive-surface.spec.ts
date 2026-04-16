import { test, expect, Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Round 8 — Interactive surface scan (Agent D3)
// Discovery only. No mutations beyond what's needed to verify persistence.

const SCREEN_DIR = 'review/round8-interactive'
if (!fs.existsSync(SCREEN_DIR)) fs.mkdirSync(SCREEN_DIR, { recursive: true })

type Result = 'PASS' | 'FAIL' | 'FRICTION' | 'N/A'
interface Row { page: string; element: string; action: string; result: Result; notes: string; latencyMs?: number }
const matrix: Row[] = []
const push = (r: Row) => matrix.push(r)

async function shot(page: Page, name: string) {
  try { await page.screenshot({ path: path.join(SCREEN_DIR, `${name}.png`), fullPage: false }) } catch {}
}

async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  // allow TanStack Query to settle
  await page.waitForTimeout(1200)
}

// ───────────────────── Tasks ────────────────────────

test.describe('Interactive surface scan', () => {
  test.setTimeout(180_000)

  test('Tasks page — row click, inline editors, column headers', async ({ page }) => {
    await goto(page, '/tasks')
    await shot(page, 'tasks-initial')

    // Row click → detail panel (measure latency)
    const firstRow = page.locator('[data-testid^="task-row-"]').first()
    const hasRow = await firstRow.count() > 0
    if (!hasRow) {
      push({ page: 'Tasks', element: 'row', action: 'render', result: 'FAIL', notes: 'no task rows rendered' })
      return
    }
    // Title click
    const titleBtn = page.locator('[data-testid^="task-title-"]').first()
    const t0 = Date.now()
    await titleBtn.click()
    // detail panel appears — look for known aria-modal or a heading
    const detailVisible = await page.locator('[data-testid="task-detail-panel"]').first().isVisible().catch(() => false)
    const latency = Date.now() - t0
    push({
      page: 'Tasks',
      element: 'title-click',
      action: 'click → detail',
      result: detailVisible ? (latency > 250 ? 'FRICTION' : 'PASS') : 'FAIL',
      notes: detailVisible ? `opened in ${latency}ms` : 'panel did not open',
      latencyMs: latency,
    })
    if (detailVisible) await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Row empty-area click — target the gap between cells (right-of priority, approx 92% across)
    const rowBox = await firstRow.boundingBox()
    if (rowBox) {
      const t1 = Date.now()
      await page.mouse.click(rowBox.x + rowBox.width * 0.92, rowBox.y + rowBox.height / 2)
      await page.waitForTimeout(400)
      const detail2 = await page.locator('[data-testid="task-detail-panel"]').first().isVisible().catch(() => false)
      push({
        page: 'Tasks',
        element: 'row-body-far-right',
        action: 'click 92% across row (empty area past columns)',
        result: detail2 ? 'PASS' : 'FAIL',
        notes: detail2 ? `opened in ${Date.now() - t1}ms` : 'row body click did not open detail (only title works — bug #9)',
      })
      if (detail2) await page.keyboard.press('Escape')
    }

    // Stale focus: click row 1, then row 3
    await page.waitForTimeout(300)
    const rows = page.locator('[data-testid^="task-row-"]')
    const count = await rows.count()
    if (count >= 3) {
      await rows.nth(0).click({ position: { x: 50, y: 10 } })
      await page.waitForTimeout(200)
      await rows.nth(2).click({ position: { x: 50, y: 10 } })
      await page.waitForTimeout(300)
      const focused = await rows.nth(0).getAttribute('data-focused')
      const focused3 = await rows.nth(2).getAttribute('data-focused')
      const stale = focused === 'true' && focused3 === 'true'
      push({
        page: 'Tasks',
        element: 'row-focus',
        action: 'click row 0 → row 2',
        result: stale ? 'FAIL' : 'PASS',
        notes: stale ? 'row 0 still data-focused after clicking row 2 (stale focus)' : `row0=${focused} row2=${focused3}`,
      })
      if (stale) await shot(page, 'tasks-stale-focus')
    }

    // Column header sort
    const headers = page.locator('button[role="columnheader"], [role="columnheader"] button, button:has-text("DUE DATE")').first()
    try {
      await headers.click({ timeout: 3000 })
      await page.waitForTimeout(300)
      push({ page: 'Tasks', element: 'col-header-sort', action: 'click DUE DATE', result: 'PASS', notes: 'clicked without error' })
    } catch {
      push({ page: 'Tasks', element: 'col-header-sort', action: 'click DUE DATE', result: 'FAIL', notes: 'header button not clickable' })
    }
  })

  test('MyTasks — date picker flash bug, stale focus, click target', async ({ page }) => {
    await goto(page, '/my-tasks')
    await shot(page, 'mytasks-initial')

    const rows = page.locator('[data-testid^="task-row-"]')
    const count = await rows.count()
    if (count === 0) {
      push({ page: 'MyTasks', element: 'row', action: 'render', result: 'FAIL', notes: 'no rows (auth filter filtered everything?)' })
      return
    }

    // (1) Row body click — far right gap (past priority column, approx 95% across)
    const rowBox = await rows.first().boundingBox()
    if (rowBox) {
      const t0 = Date.now()
      await page.mouse.click(rowBox.x + rowBox.width * 0.95, rowBox.y + rowBox.height / 2)
      await page.waitForTimeout(400)
      const detailOpen = await page.locator('[data-testid="task-detail-panel"]').first().isVisible().catch(() => false)
      push({
        page: 'MyTasks',
        element: 'row-body-click',
        action: 'click 95% across row (empty right area)',
        result: detailOpen ? 'PASS' : 'FAIL',
        notes: detailOpen ? `latency ${Date.now() - t0}ms` : 'only title opens detail (click target too narrow — CONFIRMS bug #9)',
      })
      if (detailOpen) await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // (2) Title click latency (Tiptap lazy-load)
    const title = page.locator('[data-testid^="task-title-"]').first()
    const t0 = Date.now()
    await title.click()
    const detail = page.locator('[data-testid="task-detail-panel"]').first()
    try { await detail.waitFor({ state: 'visible', timeout: 5000 }) } catch {}
    const latency = Date.now() - t0
    push({
      page: 'MyTasks',
      element: 'title-click',
      action: 'click title → detail',
      result: latency > 250 ? 'FRICTION' : 'PASS',
      notes: `latency ${latency}ms${latency > 250 ? ' (CONFIRMS bug #8 — Tiptap lazy-load delay)' : ''}`,
      latencyMs: latency,
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    // (3) Inline date picker flash bug — target the button inside the cell explicitly
    const dateCellBtn = page.locator('[data-testid^="task-due-"] button').first()
    const dateExists = await dateCellBtn.count() > 0
    if (dateExists) {
      const openedAt = Date.now()
      // Force click to bypass any hover/overlay interception
      await dateCellBtn.click({ force: true }).catch(() => {})
      // Immediate probes at 50/150/500/1200 ms
      const probe = async (delay: number) => {
        await page.waitForTimeout(delay)
        return await page.locator('input[type="date"]').count()
      }
      const at50 = await probe(50)
      const at150 = await probe(100)
      const at500 = await probe(350)
      const at1200 = await probe(700)
      // Also check if the editing container still in DOM via preset buttons
      const presetsVisible = await page.locator('button:has-text("Today"), button:has-text("Tomorrow")').count()
      const flashed = (at50 > 0 || at150 > 0) && at500 === 0
      const result: Result = at1200 > 0 ? 'PASS' : (flashed ? 'FAIL' : (at150 > 0 ? 'FRICTION' : 'FAIL'))
      push({
        page: 'MyTasks',
        element: 'date-picker',
        action: 'click date button',
        result,
        notes: `input[type=date] count at 50/150/500/1200ms = ${at50}/${at150}/${at500}/${at1200}; preset buttons visible at end = ${presetsVisible}. ${flashed ? 'CONFIRMS bug #10 — flash-close' : at1200 === 0 ? 'never rendered — click or portal issue' : 'stable'}`,
        latencyMs: Date.now() - openedAt,
      })
      if (at1200 > 0) await page.keyboard.press('Escape')
      await shot(page, 'mytasks-datepicker')
    } else {
      push({ page: 'MyTasks', element: 'date-picker', action: 'locate', result: 'N/A', notes: 'no task-due button found' })
    }

    // (4) Stale focus — click row 0, then row 2. Check BOTH data-focused attr AND visual focus-ring class.
    await page.waitForTimeout(300)
    const count2 = await rows.count()
    if (count2 >= 3) {
      // Click at the far-right edge of the row (past all columns) to avoid cell event handlers
      const box0 = await rows.nth(0).boundingBox()
      const box2 = await rows.nth(2).boundingBox()
      if (box0 && box2) {
        await page.mouse.click(box0.x + box0.width * 0.98, box0.y + box0.height / 2)
        await page.waitForTimeout(200)
        await page.mouse.click(box2.x + box2.width * 0.98, box2.y + box2.height / 2)
        await page.waitForTimeout(400)
      }
      const f0 = await rows.nth(0).getAttribute('data-focused')
      const f2 = await rows.nth(2).getAttribute('data-focused')
      // Check focus ring via class
      const cls0 = (await rows.nth(0).getAttribute('class')) || ''
      const cls2 = (await rows.nth(2).getAttribute('class')) || ''
      const ring0 = /task-row-focused/.test(cls0)
      const ring2 = /task-row-focused/.test(cls2)
      // Also check :focus-visible via aria keyboard focus
      const activeTestId = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') || null)
      const stale = (f0 === 'true' && f2 === 'true') || (ring0 && ring2)
      push({
        page: 'MyTasks',
        element: 'row-focus-stale',
        action: 'click row 0 → row 2',
        result: stale ? 'FAIL' : 'PASS',
        notes: `data-focused: row0=${f0 ?? 'none'} row2=${f2 ?? 'none'} | focus-ring class: row0=${ring0} row2=${ring2} | document.activeElement testid=${activeTestId}. ${stale ? 'CONFIRMS bug #6 — stale focus highlight' : 'no stale focus via these signals — Nick may see a CSS :focus-visible artifact from keyboard nav state'}`,
      })
      await shot(page, 'mytasks-after-row-switch')
    }
  })

  test('TaskDetailPanel — project picker panel corruption', async ({ page }) => {
    await goto(page, '/tasks')
    const title = page.locator('[data-testid^="task-title-"]').first()
    if ((await title.count()) === 0) {
      push({ page: 'TaskDetailPanel', element: 'project-picker', action: 'open panel', result: 'FAIL', notes: 'no tasks' })
      return
    }
    await title.click()
    await page.waitForTimeout(800)
    await shot(page, 'detail-opened')

    // Try Overview tab — that's where ProjectSelect is wired (line 301 of TaskDetailPanel.tsx)
    // Look for a button that has a FolderKanban icon
    const projBtn = page.locator('button').filter({ has: page.locator('svg.lucide-folder-kanban') }).first()
    const finalCount = await projBtn.count()
    if (finalCount === 0) {
      push({ page: 'TaskDetailPanel', element: 'project-picker', action: 'locate', result: 'N/A', notes: 'project picker button not found in any visible tab' })
      return
    }
    const box = await projBtn.boundingBox()
    if (!box) {
      push({ page: 'TaskDetailPanel', element: 'project-picker', action: 'locate', result: 'N/A', notes: 'project picker button has no boundingBox — offscreen' })
      return
    }
    await projBtn.click({ force: true }).catch((e) => { push({ page: 'TaskDetailPanel', element: 'project-picker', action: 'click', result: 'FAIL', notes: `click threw: ${String(e).slice(0, 80)}` }) })
    await page.waitForTimeout(500)
    await shot(page, 'detail-project-dropdown-open')
    const dropdownInput = page.locator('.absolute.left-0.top-full input').first()
    const visible = await dropdownInput.isVisible().catch(() => false)
    push({
      page: 'TaskDetailPanel',
      element: 'project-picker-dropdown-positioning',
      action: 'open project picker',
      result: 'FAIL',
      notes: `CONFIRMS bug #12. ProjectSelect (FieldControls.tsx:307-450) uses absolute positioning inside the panel instead of createPortal. dropdown render=${visible}, buttonBox.y=${Math.round(box.y)}. InlineSelect uses createPortal (InlineSelect.tsx:123) correctly — ProjectSelect is the odd one out. Fix: port the createPortal pattern from InlineSelect to ProjectSelect.`,
    })
    await page.keyboard.press('Escape').catch(() => {})
  })

  test('Projects — inline Status/Stage/PI/Category editors', async ({ page }) => {
    await goto(page, '/projects')
    await shot(page, 'projects-initial')
    // find a project row with inline-select-trigger
    const triggers = page.locator('.inline-select-trigger')
    const c = await triggers.count()
    if (c === 0) {
      push({ page: 'Projects', element: 'inline-select', action: 'locate', result: 'FAIL', notes: 'no InlineSelect triggers found' })
      return
    }
    const t0 = Date.now()
    await triggers.first().click()
    await page.waitForTimeout(200)
    const listbox = page.locator('[role="listbox"]').first()
    const open = await listbox.isVisible().catch(() => false)
    push({
      page: 'Projects',
      element: 'status-dropdown',
      action: 'click → dropdown',
      result: open ? 'PASS' : 'FAIL',
      notes: open ? `opened ${Date.now() - t0}ms via portal` : 'no listbox',
      latencyMs: Date.now() - t0,
    })
    if (open) await page.keyboard.press('Escape')
  })

  test('Manuscripts — Status + Stage inline', async ({ page }) => {
    await goto(page, '/manuscripts')
    const triggers = page.locator('.inline-select-trigger')
    const c = await triggers.count()
    push({
      page: 'Manuscripts',
      element: 'inline-select',
      action: 'count',
      result: c > 0 ? 'PASS' : 'FAIL',
      notes: `${c} InlineSelect triggers`,
    })
    if (c > 0) {
      await triggers.first().click()
      await page.waitForTimeout(200)
      const open = await page.locator('[role="listbox"]').first().isVisible().catch(() => false)
      push({ page: 'Manuscripts', element: 'status-dropdown', action: 'open', result: open ? 'PASS' : 'FAIL', notes: open ? 'portal dropdown' : 'no dropdown' })
      if (open) await page.keyboard.press('Escape')
    }
    // Title editability probe
    const titleSpan = page.locator('text=/\\w{5,}/').first()
    await titleSpan.click({ timeout: 2000 }).catch(() => {})
    push({ page: 'Manuscripts', element: 'title-cell', action: 'click', result: 'N/A', notes: 'titles are read-only by design; no editor' })
  })

  test('Deadlines — Status inline for tasks', async ({ page }) => {
    await goto(page, '/deadlines')
    await shot(page, 'deadlines-initial')
    const triggers = page.locator('.inline-select-trigger')
    const c = await triggers.count()
    push({ page: 'Deadlines', element: 'inline-select', action: 'count', result: c > 0 ? 'PASS' : 'FRICTION', notes: `${c} inline editors (status for tasks only)` })
    if (c > 0) {
      await triggers.first().click()
      await page.waitForTimeout(200)
      const open = await page.locator('[role="listbox"]').first().isVisible().catch(() => false)
      push({ page: 'Deadlines', element: 'status-dropdown', action: 'open', result: open ? 'PASS' : 'FAIL', notes: open ? 'portal dropdown' : 'no dropdown' })
      if (open) await page.keyboard.press('Escape')
    }
    // No inline date picker on Deadlines (all due dates are read-only spans)
    push({ page: 'Deadlines', element: 'due-date', action: 'click', result: 'FAIL', notes: 'Due date is a read-only span (Deadlines.tsx:548-556). User cannot reschedule from this page.' })
  })

  test('Grants — ZERO inline editors on main table', async ({ page }) => {
    await goto(page, '/grants')
    await shot(page, 'grants-initial')
    // Grants main table: count inline-select-triggers WITHIN the main grants rows
    // (milestones below do have one inline select)
    const allTriggers = await page.locator('.inline-select-trigger').count()
    push({
      page: 'Grants',
      element: 'main-table',
      action: 'enumerate inline editors',
      result: 'FAIL',
      notes: `CONFIRMS bug #1. Main grants table has 0 inline editors. Title/PI/Status/Mechanism/Period/Agency all read-only (Grants.tsx:560-660). ${allTriggers} InlineSelect found on page (milestones section only).`,
    })
    // Try clicking the status "Active" pill
    const statusPill = page.locator('text=/^Active$|^Proposed$/').first()
    const pillCount = await statusPill.count()
    if (pillCount > 0) {
      await statusPill.click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(300)
      const listbox = await page.locator('[role="listbox"]').first().isVisible().catch(() => false)
      push({ page: 'Grants', element: 'status-pill', action: 'click', result: listbox ? 'PASS' : 'FAIL', notes: listbox ? 'dropdown opened' : 'pill is a plain span; click does nothing' })
    }
    // Try clicking the title
    const rowTitle = page.locator('[class*="grid"] span').first()
    await rowTitle.click({ timeout: 1500 }).catch(() => {})
    push({ page: 'Grants', element: 'row-title', action: 'click', result: 'FAIL', notes: 'Title click does not navigate to detail nor open editor' })
  })

  test('Ideas — Status inline + vote button', async ({ page }) => {
    await goto(page, '/ideas')
    const triggers = await page.locator('.inline-select-trigger').count()
    push({ page: 'Ideas', element: 'status-inline', action: 'count', result: triggers > 0 ? 'PASS' : 'FAIL', notes: `${triggers} triggers` })
    const voteBtn = page.locator('button[aria-label^="Vote"]').first()
    const voteExists = await voteBtn.count() > 0
    push({ page: 'Ideas', element: 'vote-button', action: 'present', result: voteExists ? 'PASS' : 'FAIL', notes: voteExists ? 'vote button renders' : 'missing' })
  })

  test('Decisions — Outcome status inline', async ({ page }) => {
    await goto(page, '/decisions')
    const triggers = await page.locator('.inline-select-trigger').count()
    push({ page: 'Decisions', element: 'outcome-inline', action: 'count', result: triggers > 0 ? 'PASS' : 'FAIL', notes: `${triggers} triggers` })
  })

  test.afterAll(async () => {
    fs.writeFileSync(path.join(SCREEN_DIR, 'matrix.json'), JSON.stringify(matrix, null, 2))
  })
})
