/**
 * Capture-interactions — real-time capture of the Hub's signature
 * interactions for Claude Design (and demo videos).
 *
 * Each test drives a specific flow and produces:
 *   - A WebM video of the entire test (auto-recorded via config).
 *   - 2-4 PNG keyframes taken at the hero moments of the flow.
 *
 * Output goes to `review/interactions-<YYYYMMDDTHHMM>/`:
 *   - `<01-slug>-a-before.png`, `-b-during.png`, `-c-after.png`
 *   - `<01-slug>.webm`  (copied from test-results/ by the afterEach hook)
 *   - `INDEX.md`  (generated on first test)
 *
 * Unlike `capture-for-design.spec.ts`, this spec does NOT set
 * `reducedMotion: 'reduce'` — we WANT the easing + transitions so the
 * videos show the real feel.
 *
 * Run: `npx playwright test --config=playwright.config.interactions-capture.ts`
 *
 * Run one: add `--grep "^01"` to the command.
 *
 * Seed: the spec assumes the live prod has ≥1 task, ≥1 project, ≥1
 * comment. Works against prod as-is since Nick's queue always has
 * rows. For a clean demo, pre-create a `test_delete_demo` task with
 * a predictable title + reset after.
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { P } from './helpers/paths'
import { injectFakeAuth } from './helpers/capture-auth'

// CF Access gates prod `/portal/*` — use CAPTURE_BASE_URL to point at an
// ungated preview deploy.
const BASE = process.env.CAPTURE_BASE_URL ?? 'https://mn-ccore-lab.pages.dev'

const TS = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, '')
  .slice(0, 13)

// Set CAPTURE_BUNDLE=<dirname> to write into a shared bundle dir
// (e.g. the regen script puts videos into <bundle>/videos/).
const OUT_DIR = process.env.CAPTURE_BUNDLE
  ? path.join('review', process.env.CAPTURE_BUNDLE, 'videos')
  : path.join('review', `interactions-${TS}`)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

/** Write a keyframe with consistent naming. Pass the test id + phase. */
async function frame(page: Page, id: string, phase: string) {
  await page.screenshot({
    path: path.join(OUT_DIR, `${id}-${phase}.png`),
    fullPage: false,
  })
}

test.beforeEach(async ({ context }) => {
  await injectFakeAuth(context, BASE)
})

/** Copy the Playwright-recorded video next to the keyframes with the
 *  test id as its name, so the whole flow is easy to find. */
test.afterEach(async ({}, testInfo: TestInfo) => {
  for (const attach of testInfo.attachments) {
    if (attach.name === 'video' && attach.path) {
      const base = testInfo.title.split(' ')[0] // "01-status-change-undo ..."
      const dest = path.join(OUT_DIR, `${base}.webm`)
      try { fs.copyFileSync(attach.path, dest) } catch { /* best-effort */ }
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────
// Tier 1 — signature interactions
// ─────────────────────────────────────────────────────────────────────────

test('01-status-change-undo → inline status pill + undo toast', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await frame(page, '01-status-change-undo', 'a-before')
  // Click the status pill (role=combobox) in the first row
  const statusPill = firstRow.getByRole('combobox', { name: /^Status:/i }).first()
  await statusPill.click()
  await page.waitForTimeout(300)
  await frame(page, '01-status-change-undo', 'b-dropdown-open')
  // Pick a status that isn't the current one
  const option = page.getByRole('option').nth(1)
  await option.click()
  await page.waitForTimeout(400)
  await frame(page, '01-status-change-undo', 'c-after-change')
  // Undo toast should have animated in by now
  await page.waitForTimeout(800)
  await frame(page, '01-status-change-undo', 'd-undo-toast')
})

test('02-detail-panel-slide-in → click task row opens detail panel', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await frame(page, '02-detail-panel', 'a-list-only')
  const title = firstRow.locator('div').filter({ hasText: /\S/ }).first()
  await title.click({ force: true })
  const panel = page.locator('[data-testid="task-detail-panel"]')
  await expect(panel).toBeVisible()
  // Capture mid-transition (200ms ease-out defined in CSS).
  await page.waitForTimeout(120)
  await frame(page, '02-detail-panel', 'b-mid-slide')
  await page.waitForTimeout(400)
  await frame(page, '02-detail-panel', 'c-fully-open')
})

test('03-detail-panel-tabs → Overview → Notes → Comments → Activity → Details', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await firstRow.locator('div').filter({ hasText: /\S/ }).first().click({ force: true })
  const panel = page.locator('[data-testid="task-detail-panel"]')
  await expect(panel).toBeVisible()
  await page.waitForTimeout(400)
  await frame(page, '03-detail-tabs', 'a-overview')
  for (const tab of ['Notes', 'Comments', 'Activity', 'Details']) {
    await panel.getByRole('button', { name: new RegExp(`^${tab}$`) }).click().catch(() => {})
    await page.waitForTimeout(400)
    await frame(page, '03-detail-tabs', `${tab.toLowerCase()}`)
  }
})

test('04-swipe-to-dismiss → mobile touch gesture (Pixel 5 project only)', async ({ page, browserName }, testInfo) => {
  // Only meaningful under the mobile project — skip on desktop.
  if (testInfo.project.name !== 'mobile') test.skip()
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await firstRow.locator('div').filter({ hasText: /\S/ }).first().tap()
  const panel = page.locator('[data-testid="task-detail-panel"]')
  await expect(panel).toBeVisible()
  await page.waitForTimeout(400)
  await frame(page, '04-swipe-dismiss', 'a-panel-open')
  // Synthesize a rightward swipe from 40% → 100% of panel width.
  const box = await panel.boundingBox()
  if (!box) return
  const startX = box.x + box.width * 0.4
  const y = box.y + box.height * 0.5
  await page.mouse.move(startX, y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(startX + (box.width * 0.1 * i), y, { steps: 5 })
    if (i === 3) await frame(page, '04-swipe-dismiss', 'b-mid-drag')
    await page.waitForTimeout(40)
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
  await frame(page, '04-swipe-dismiss', 'c-dismissed')
})

test('05-hover-row-badges → hover reveals age + project badges', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await frame(page, '05-hover-badges', 'a-idle')
  await firstRow.hover()
  await page.waitForTimeout(300)
  await frame(page, '05-hover-badges', 'b-hover')
})

// ─────────────────────────────────────────────────────────────────────────
// Tier 2 — depth patterns
// ─────────────────────────────────────────────────────────────────────────

test('06-cmd-k-palette → fuzzy search + quick filters', async ({ page }) => {
  await page.goto(`${BASE}${P.dashboard}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  await frame(page, '06-cmd-k', 'a-opened')
  await page.keyboard.type('clif')
  await page.waitForTimeout(300)
  await frame(page, '06-cmd-k', 'b-fuzzy-search')
  await page.keyboard.press('Escape')
})

test('07-assignee-picker → inline dropdown with team', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await frame(page, '07-assignee-picker', 'a-idle')
  // Assignee cell has an <img> avatar — click the avatar to open picker.
  const avatar = firstRow.locator('img').first()
  await avatar.click().catch(async () => {
    // Fallback: click the cell region directly.
    await firstRow.locator('.task-row-assignee').first().click()
  })
  await page.waitForTimeout(400)
  await frame(page, '07-assignee-picker', 'b-dropdown-open')
  await page.keyboard.press('Escape')
})

test('08-date-picker → relative presets + calendar', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await frame(page, '08-date-picker', 'a-idle')
  // Due-date cell is column 4 in grid (per TaskGridView layout).
  const dueCell = firstRow.locator('.task-row-due, [data-col="due_date"]').first()
  await dueCell.click({ force: true }).catch(() => {})
  await page.waitForTimeout(400)
  await frame(page, '08-date-picker', 'b-open')
  await page.keyboard.press('Escape')
})

test('09-subtask-expand → inline expand + add', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await frame(page, '09-subtasks', 'a-collapsed')
  // Linear-style chevron at left of row; key shortcut → expands
  await firstRow.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(500)
  await frame(page, '09-subtasks', 'b-expanded')
  await page.keyboard.press('ArrowLeft')
})

test('10-board-drag → Kanban column drag', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}?view=board`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await frame(page, '10-board-drag', 'a-board-loaded')
  // Synthesize a drag from the first card in the first column to the
  // second column. Best-effort — @dnd-kit uses sensors that may require
  // pointer events rather than HTML5 drag.
  const firstCard = page.locator('[data-testid^="board-card-"]').first()
  if (!(await firstCard.isVisible().catch(() => false))) return
  const source = await firstCard.boundingBox()
  const targetColumn = page.locator('[data-testid^="board-column-"]').nth(1)
  const target = await targetColumn.boundingBox()
  if (!source || !target) return
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(200)
  await page.mouse.move(target.x + target.width / 2, target.y + 80, { steps: 12 })
  await frame(page, '10-board-drag', 'b-mid-drag')
  await page.mouse.up()
  await page.waitForTimeout(400)
  await frame(page, '10-board-drag', 'c-dropped')
})

test('11-hermes-mention → @hermes in comment gets gold badge', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  const firstRow = page.locator('[data-testid^="task-row-"]').first()
  await firstRow.waitFor({ state: 'visible' })
  await firstRow.locator('div').filter({ hasText: /\S/ }).first().click({ force: true })
  const panel = page.locator('[data-testid="task-detail-panel"]')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: /^Comments$/ }).click().catch(() => {})
  await page.waitForTimeout(400)
  await frame(page, '11-hermes', 'a-comments-tab')
  // Find the comment textarea and type @hermes.
  const textarea = panel.locator('textarea, [contenteditable="true"]').first()
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.fill('@hermes capture-interactions demo — ignore, please')
    await page.waitForTimeout(400)
    await frame(page, '11-hermes', 'b-typed-mention')
  }
  await page.keyboard.press('Escape')
})

// ─────────────────────────────────────────────────────────────────────────
// Tier 3 — brand motion
// ─────────────────────────────────────────────────────────────────────────

test('12-pulse-kiosk → 20s scene rotation', async ({ page }) => {
  await page.goto(`${BASE}${P.pulse}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  for (let i = 0; i < 6; i++) {
    await frame(page, '12-pulse-kiosk', `scene-${i + 1}`)
    await page.waitForTimeout(3500)
  }
})

test('13-dashboard-drag-reorder → customize toggle + drag', async ({ page }) => {
  await page.goto(`${BASE}${P.dashboard}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await frame(page, '13-dashboard-drag', 'a-idle')
  // Toggle customize mode — accessible via a button labelled "Customize"
  // OR "Drag to reorder".
  const customize = page.getByRole('button', { name: /customize|drag to reorder/i }).first()
  await customize.click().catch(() => {})
  await page.waitForTimeout(400)
  await frame(page, '13-dashboard-drag', 'b-handles-visible')
  // Try to grab the first grid-item drag handle and move it.
  const handle = page.locator('.react-grid-item .grid-drag-handle, .react-grid-item [aria-label*="drag" i]').first()
  if (await handle.isVisible().catch(() => false)) {
    const box = await handle.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + 300, box.y + 50, { steps: 10 })
      await frame(page, '13-dashboard-drag', 'c-mid-drag')
      await page.mouse.up()
    }
  }
  await page.waitForTimeout(400)
  await frame(page, '13-dashboard-drag', 'd-after-drop')
})

test('14-keyboard-nav → J/K/Space/Enter on task list', async ({ page }) => {
  await page.goto(`${BASE}${P.myTasks}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await frame(page, '14-keyboard-nav', 'a-idle')
  await page.keyboard.press('j')
  await page.waitForTimeout(200)
  await frame(page, '14-keyboard-nav', 'b-after-j')
  await page.keyboard.press('j')
  await page.keyboard.press('j')
  await page.waitForTimeout(200)
  await frame(page, '14-keyboard-nav', 'c-after-3j')
  await page.keyboard.press(' ') // Space → peek
  await page.waitForTimeout(400)
  await frame(page, '14-keyboard-nav', 'd-peek')
  await page.keyboard.press('Escape')
})

test('15-quick-add-nlp → q opens quick-add for NLP token parsing', async ({ page }) => {
  // S11: quick-add shortcut is `q` (Cmd/Ctrl+N is browser-reserved).
  await page.goto(`${BASE}${P.dashboard}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.mouse.click(5, 5)
  await page.keyboard.press('q')
  await page.waitForTimeout(400)
  await frame(page, '15-quick-add', 'a-opened')
  await page.keyboard.type('@nick review CLIF draft p2 Friday')
  await page.waitForTimeout(800)
  await frame(page, '15-quick-add', 'b-tokens-parsed')
  await page.keyboard.press('Escape')
})
