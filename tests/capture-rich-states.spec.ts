/**
 * Rich-state captures for Claude Design — cover stuff that hero
 * captures + focus-asks miss:
 *
 *   • Network page multi-state (WebGL reagraph) — default, zoomed,
 *     post-drag, node-hover × 3.
 *   • 6 modal states — Create Task, Create Project, Create Idea,
 *     Create Decision, Command Palette, Shortcut Help.
 *   • Publications carousel — scrolled across 3 journal positions.
 *   • Dashboard customize mode — grid drag-handles visible.
 *
 * Every capture is best-effort: if a trigger fails we take a fallback
 * screenshot of whatever rendered + log a warning. Nothing blocks.
 */
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { P } from './helpers/paths'
import { injectFakeAuth } from './helpers/capture-auth'

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://mn-ccore-lab.pages.dev'
const TS = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, '')
  .slice(0, 13)
const OUT_DIR = path.join('review', process.env.CAPTURE_BUNDLE ?? `claude-design-${TS}`)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

test.beforeEach(async ({ context }) => {
  await injectFakeAuth(context, BASE)
})

// ─────────────────────────────────────────────────────────────────────
// Network — WebGL graph; default + zoom + drag + 3 node hovers.

test('network-states → 6 captures of the knowledge graph', async ({ page }) => {
  await page.goto(BASE + P.network, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000) // let three.js + reagraph settle

  const shot = (name: string) =>
    page.screenshot({ path: path.join(OUT_DIR, `rich-network-${name}.png`), fullPage: false })

  await shot('01-default')

  // Zoom in — reagraph supports wheel zoom on the canvas.
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(400)
    await shot('02-zoomed-in')

    // Drag — pan the graph.
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx - 200, cy + 100, { steps: 10 })
    await page.waitForTimeout(200)
    await shot('03-dragging')
    await page.mouse.up()
    await page.waitForTimeout(200)
    await shot('04-after-drag')

    // Hover three arbitrary canvas points to try to catch node tooltips.
    for (let i = 0; i < 3; i++) {
      const hx = box.x + box.width * (0.3 + i * 0.2)
      const hy = box.y + box.height * 0.5
      await page.mouse.move(hx, hy)
      await page.waitForTimeout(350)
      await shot(`05-hover-${i + 1}`)
    }
  }
})

// ─────────────────────────────────────────────────────────────────────
// Modals — trigger each, capture open state.

test('modal-create-task → Ctrl+N opens global quick-add', async ({ page }) => {
  await page.goto(BASE + P.dashboard, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+n')
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-modal-01-create-task.png'), fullPage: false })
  await page.keyboard.press('Escape')
})

test('modal-command-palette → Ctrl+K opens fuzzy search', async ({ page }) => {
  await page.goto(BASE + P.dashboard, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-modal-02-command-palette.png'), fullPage: false })
  await page.keyboard.press('Escape')
})

test('modal-shortcut-help → ? opens help overlay', async ({ page }) => {
  await page.goto(BASE + P.dashboard, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.keyboard.press('Shift+?')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-modal-03-shortcut-help.png'), fullPage: false })
  await page.keyboard.press('Escape')
})

test('modal-create-idea → N key on Ideas page', async ({ page }) => {
  await page.goto(BASE + P.ideas, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.keyboard.press('n')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-modal-04-create-idea.png'), fullPage: false })
  await page.keyboard.press('Escape')
})

test('modal-create-decision → N key on Decisions page', async ({ page }) => {
  await page.goto(BASE + P.decisions, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.keyboard.press('n')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-modal-05-create-decision.png'), fullPage: false })
  await page.keyboard.press('Escape')
})

test('modal-create-project → button click on Projects page', async ({ page }) => {
  await page.goto(BASE + P.projects, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  // Try common patterns — explicit create button by text.
  const btn = page.getByRole('button', { name: /new project|create project|add project/i }).first()
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-modal-06-create-project.png'), fullPage: false })
  await page.keyboard.press('Escape')
})

// ─────────────────────────────────────────────────────────────────────
// Publications carousel — scroll through 3 positions.

test('publications-carousel → 3 horizontal scroll positions', async ({ page }) => {
  await page.goto(BASE + P.publications, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-pubs-01-start.png'), fullPage: false })

  // Scroll the horizontal carousel rightward. Hub renders journal cover
  // cards in a scroll-snap row — common pattern is `.journal-carousel`
  // or `[data-scroll-x]`. Fall back to scrolling the viewport.
  await page.evaluate(() => {
    const row =
      document.querySelector('[data-scroll-x], .journal-carousel, .publications-carousel') as HTMLElement | null
    if (row) row.scrollLeft += 800
    else window.scrollBy(0, 400)
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-pubs-02-mid.png'), fullPage: false })

  await page.evaluate(() => {
    const row =
      document.querySelector('[data-scroll-x], .journal-carousel, .publications-carousel') as HTMLElement | null
    if (row) row.scrollLeft += 1600
    else window.scrollBy(0, 400)
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, 'rich-pubs-03-far.png'), fullPage: false })
})

// ─────────────────────────────────────────────────────────────────────
// Dashboard customize mode — drag handles visible.

test('dashboard-customize-mode → grid handles revealed', async ({ page }) => {
  await page.goto(BASE + P.dashboard, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const btn = page.getByRole('button', { name: /customize|drag to reorder/i }).first()
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({
    path: path.join(OUT_DIR, 'rich-dashboard-customize.png'),
    fullPage: true,
  })
})
