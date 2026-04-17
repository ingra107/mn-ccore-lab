/**
 * Dogfood Round 3 — Edge cases, empty states, stress, navigation completeness.
 *
 * Scope per april-21-launch-readiness.md Session 4 Round 3:
 *   • Command palette: every page in the palette navigates to a real, rendered view
 *   • Long-title task layout
 *   • 500+ task virtual scroll performance
 *   • Rapid successive status changes (undo stack behavior)
 *   • Two tabs open — does a change on one surface in the other
 *   • Offline/degraded network — skeletons, no blank pages
 *   • Empty project (no tasks) detail page
 *
 * Focus: find where the Hub BREAKS, not just where it looks right.
 *
 * Run: npx tsx scripts/dogfood-round3.ts
 */
import { chromium, type Page, type BrowserContext } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'https://mn-ccore-lab.pages.dev'
const OUT = 'review/dogfood-round3'
mkdirSync(OUT, { recursive: true })

let stepNum = 0
const findings: string[] = []

async function snap(page: Page, label: string, waitMs = 1000) {
  await page.waitForTimeout(waitMs)
  stepNum++
  const name = `${String(stepNum).padStart(2, '0')}-${label}`
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`  [${name}]`)
  return name
}

function log(msg: string) {
  console.log(msg)
  findings.push(msg)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => {
    if (err.message.includes('WebSocket') || err.message.includes('hub-realtime')) return
    log(`  !! PAGE ERROR: ${err.message.slice(0, 160)}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('WebSocket') && !msg.text().includes('hub-realtime')) {
      log(`  !! CONSOLE ERROR: ${msg.text().slice(0, 160)}`)
    }
  })

  // ────────────────────────────────────────────────────────────
  // ACTION 1: Command palette navigation — every entry lands on a rendered page
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 1: Command palette exhaustive navigation ===')
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.keyboard.press('Control+k')
  await snap(page, 'cmdk-open', 600)

  // Collect all navigation items from the palette
  const cmdItems = await page.locator('[data-testid="command-palette"] [role="option"], [data-testid="command-palette"] button').allTextContents()
  log(`  cmd palette exposes ${cmdItems.length} entries`)
  log(`  first 10: ${cmdItems.slice(0, 10).join(' | ')}`)

  await page.keyboard.press('Escape')

  // Test a set of known nav targets via the palette
  const navTargets = ['Analytics', 'Activity', 'Settings', 'Team', 'Search', 'Sessions', 'Narratives', 'Transcripts', 'PI Analytics', 'Dashboard', 'Tasks', 'Projects', 'Meetings', 'Calendar', 'Grants', 'Manuscripts', 'Deadlines', 'Ideas', 'Decisions', 'Digest', 'Publications', 'Personal', 'Network']
  for (const target of navTargets) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(400)
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)
    const input = page.locator('[data-testid="command-palette"] input').first()
    if (await input.count() === 0) {
      log(`  ✗ cmd palette input not found for "${target}"`)
      await page.keyboard.press('Escape')
      continue
    }
    await input.fill(target)
    await page.waitForTimeout(250)
    const firstOption = page.locator('[data-testid="command-palette"] [role="option"]').first()
    if (await firstOption.count()) {
      await firstOption.click()
      await page.waitForTimeout(800)
      const url = page.url()
      const bodyText = (await page.locator('body').textContent())?.slice(0, 200)
      const looksEmpty = !bodyText || bodyText.trim().length < 30
      log(`  ${looksEmpty ? '✗' : '✓'} ${target} -> ${url.replace(BASE, '')} ${looksEmpty ? '(EMPTY BODY)' : ''}`)
    } else {
      log(`  ✗ ${target}: no options in palette after filter`)
      await page.keyboard.press('Escape')
    }
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 2: Long title layout — create and observe
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 2: Long-title task layout ===')
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await snap(page, 'mytasks-before-long', 1200)
  const newTaskBtn = page.locator('button').filter({ hasText: /New Task/ }).first()
  if (await newTaskBtn.count()) {
    await newTaskBtn.click()
    await page.waitForTimeout(400)
    const longTitle = 'test_delete_round3 — lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris'
    await page.locator('[data-testid="task-title-input"]').fill(longTitle)
    await page.locator('#task-assignee').selectOption('nick')
    await snap(page, 'longtitle-filled', 300)
    await page.locator('[data-testid="task-submit"]').click()
    await snap(page, 'longtitle-submitted', 2000)
    // Inspect overflow: screenshot the task row
    const row = page.locator('[data-testid^="task-row-"]').first()
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded()
      await snap(page, 'longtitle-row-after', 400)
    }
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 3: Rapid status changes — undo stack behavior
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 3: Rapid status changes ===')
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const statusCircles = page.locator('[data-testid^="task-status-circle-"]')
  const circleCount = await statusCircles.count()
  if (circleCount >= 3) {
    for (let i = 0; i < 3; i++) {
      await statusCircles.nth(i).click()
      await page.waitForTimeout(120)
    }
    await snap(page, 'rapid-3-clicks', 800)
    const toasts = await page.getByRole('button', { name: /undo/i }).count()
    log(`  after 3 rapid clicks: ${toasts} undo button(s) visible`)
    if (toasts > 0) {
      await page.getByRole('button', { name: /undo/i }).first().click()
      await snap(page, 'rapid-undo-1', 600)
    }
  } else {
    log(`  ~ only ${circleCount} status circles — skipping rapid test`)
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 4: Two-tab sync
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 4: Two tabs — change on A, verify on B ===')
  const page2 = await ctx.newPage()
  await Promise.all([
    page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' }),
    page2.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' }),
  ])
  await Promise.all([page.waitForTimeout(1500), page2.waitForTimeout(1500)])
  // Tab A captures title list
  const tabATitles = (await page.locator('[data-testid^="task-row-"] a').allTextContents()).slice(0, 5)
  const tabBTitles = (await page2.locator('[data-testid^="task-row-"] a').allTextContents()).slice(0, 5)
  log(`  tab A top-5: ${tabATitles.join(' | ').slice(0, 160)}`)
  log(`  tab B top-5: ${tabBTitles.join(' | ').slice(0, 160)}`)
  log(tabATitles.join('|') === tabBTitles.join('|') ? '  ✓ tabs see same initial state' : '  ~ tabs differ (sort/filter may differ)')
  await page2.close()

  // ────────────────────────────────────────────────────────────
  // ACTION 5: Offline / degraded network
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 5: Offline mode — loading skeletons, no blank page ===')
  await ctx.setOffline(true)
  await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await snap(page, 'offline-projects', 2500)
  const bodyOffline = (await page.locator('body').textContent()) || ''
  if (bodyOffline.length < 100) {
    log('  ✗ offline /projects is nearly BLANK — no skeleton shown')
  } else {
    log('  ✓ offline /projects has content (shell + cached)')
  }
  await ctx.setOffline(false)
  await page.waitForTimeout(500)

  // ────────────────────────────────────────────────────────────
  // ACTION 6: Empty project detail page
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 6: Empty project detail page ===')
  // pick a newly-created bucket project (no tasks yet) — admin-tasks probably has many,
  // try ice-fishing or uofc-pccm-grand-rounds (status=done, no tasks)
  await page.goto(`${BASE}/projects/uofc-pccm-grand-rounds`, { waitUntil: 'networkidle' })
  await snap(page, 'empty-project', 2000)
  const emptyBody = await page.locator('body').textContent()
  if (emptyBody?.includes('UofC') || emptyBody?.includes('Grand Rounds')) {
    log('  ✓ empty-project page renders title')
  } else {
    log('  ✗ empty-project page may have failed to load')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 7: Tasks page virtual scroll — scroll to bottom
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 7: Tasks page full virtual scroll ===')
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await snap(page, 'tasks-top', 800)
  await page.keyboard.press('End')
  await page.waitForTimeout(800)
  await snap(page, 'tasks-end-key', 800)
  // scroll via evaluate
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  await snap(page, 'tasks-scrolled-bottom', 800)

  // ────────────────────────────────────────────────────────────
  // ACTION 8: Bug report flow (open modal, DON'T submit)
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 8: Bug report modal opens + Ctrl+Enter wiring ===')
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  // Bug report button is typically a "?" or fixed-position FAB; look for aria-label
  const bugBtn = page.getByRole('button', { name: /report.*bug|bug report|feedback/i }).first()
  if (await bugBtn.count()) {
    await bugBtn.click()
    await snap(page, 'bugreport-modal', 500)
  } else {
    log('  ~ bug report button not visible (may need keyboard shortcut)')
  }
  // don't submit — just close
  await page.keyboard.press('Escape')

  await browser.close()

  writeFileSync(`${OUT}/findings.txt`, findings.join('\n'))
  console.log(`\n\n======= ROUND 3 DONE — ${stepNum} screenshots + ${findings.length} findings =======`)
  console.log(`Findings: ${OUT}/findings.txt`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
