/**
 * Dogfood Round 2 — Naming system + interactions untested in Round 1.
 *
 * Scope per april-21-launch-readiness.md Session 4:
 *   • Public team page (formal tier live)
 *   • MemberPage detail header (formal tier)
 *   • Inline priority / assignee / due-date change + undo
 *   • Subtask create + toggle
 *   • Board / StandUp / Timeline view switches
 *   • Project create modal (Ctrl+Enter submit)
 *   • Ideas + Decisions N-key + Ctrl+Enter submit
 *   • Dark / light theme toggle name-display parity
 *   • Mobile viewport name-tier readability
 *
 * Every action screenshots every state. Console pageerrors surface to the
 * findings list. `test_delete_` prefix on any created rows for trivial cleanup.
 *
 * Run: npx tsx scripts/dogfood-round2.ts
 */
import { chromium, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'https://mn-ccore-lab.pages.dev'
const OUT = 'review/dogfood-round2'
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

async function expectText(page: Page, needle: string, context: string) {
  const found = await page.locator('body').textContent()
  if (found?.includes(needle)) {
    log(`  ✓ ${context}: "${needle}" present`)
  } else {
    log(`  ✗ ${context}: "${needle}" NOT FOUND`)
  }
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
  // ACTION 1: Public team page — formal tier check
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 1: Public team page formal tier ===')
  await page.goto(`${BASE}/team`, { waitUntil: 'networkidle' })
  await snap(page, 'team-dark', 1500)
  for (const needle of [
    'Nicholas Ingraham, MD',
    'Nathan Mesfin, MD',
    'Daniel Shyu, MD',
    'Katherine Pendleton, MD',
    'Robert Adams Dudley',
    'Jeffrey Chipman, MD',
  ]) {
    await expectText(page, needle, 'team/formal')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 2: Light mode parity
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 2: Light mode formal tier parity ===')
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.setItem('mn-ccore-theme', 'light')
  })
  await snap(page, 'team-light', 800)
  await expectText(page, 'Nicholas Ingraham, MD', 'team-light/formal')
  // restore dark
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
    localStorage.setItem('mn-ccore-theme', 'dark')
  })

  // ────────────────────────────────────────────────────────────
  // ACTION 3: MemberPage detail header
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 3: MemberPage formal tier ===')
  await page.goto(`${BASE}/team/nick`, { waitUntil: 'networkidle' })
  await snap(page, 'memberpage-nick', 1500)
  await expectText(page, 'Nicholas Ingraham, MD', 'memberpage/formal')
  await page.goto(`${BASE}/team/dudley`, { waitUntil: 'networkidle' })
  await snap(page, 'memberpage-dudley', 1500)
  await expectText(page, 'Robert Adams Dudley', 'memberpage/formal')

  // ────────────────────────────────────────────────────────────
  // ACTION 4: Inline priority change + undo
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 4: Inline priority change + undo ===')
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await snap(page, 'mytasks-initial', 1500)
  const priorityCell = page.locator('[data-testid^="task-priority-"]').first()
  if (await priorityCell.count()) {
    await priorityCell.click()
    await snap(page, 'priority-dropdown-open', 400)
    // Pick "urgent" via role=option if visible
    const option = page.getByRole('option', { name: /urgent/i }).first()
    if (await option.count()) {
      await option.click()
      await snap(page, 'priority-changed-urgent', 600)
      const undoBtn = page.getByRole('button', { name: /undo/i }).first()
      if (await undoBtn.count()) {
        log('  ✓ undo toast visible after priority change')
        await undoBtn.click()
        await snap(page, 'priority-undo-clicked', 600)
      } else {
        log('  ✗ undo toast MISSING after priority change')
      }
    } else {
      log('  ✗ priority dropdown did not expose role=option "urgent"')
    }
  } else {
    log('  ✗ no task-priority-* cells present — skipping priority flow')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 5: Inline assignee change — tier rendering
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 5: Inline assignee picker — tier rendering ===')
  const assigneeCell = page.locator('[data-testid^="task-assignee-"]').first()
  if (await assigneeCell.count()) {
    await assigneeCell.click()
    await snap(page, 'assignee-dropdown-open', 500)
    // capture rendered options — this reveals what tier the picker uses
    const optionText = await page.locator('[role="option"]').allTextContents()
    log(`  picker shows ${optionText.length} options (first 3): ${optionText.slice(0, 3).join(' | ')}`)
    await page.keyboard.press('Escape')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 6: Inline due date change
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 6: Inline due date change ===')
  const dueCell = page.locator('[data-testid^="task-due-date-"]').first()
  if (await dueCell.count()) {
    await dueCell.click()
    await snap(page, 'datepicker-open', 500)
    const today = page.getByRole('button', { name: /^Today$/ }).first()
    if (await today.count()) {
      await today.click()
      await snap(page, 'datepicker-today-clicked', 600)
    } else {
      log('  ✗ InlineDatePicker missing "Today" preset')
    }
    await page.keyboard.press('Escape')
  } else {
    log('  ✗ no task-due-date-* cells present')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 7: Create Task modal — Ctrl+Enter submit
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 7: Ctrl+Enter on CreateTaskModal ===')
  const newBtn = page.locator('button').filter({ hasText: /New Task/ }).first()
  if (await newBtn.count()) {
    await newBtn.click()
    await snap(page, 'createtask-modal-open', 400)
    await page.locator('[data-testid="task-title-input"]').fill('test_delete_round2 ctrl+enter')
    await page.locator('#task-assignee').selectOption('nick')
    await snap(page, 'createtask-filled', 300)
    // Ctrl+Enter (handler in CreateTaskModal useEffect keydown)
    await page.keyboard.press('Control+Enter')
    await snap(page, 'createtask-ctrl-enter-submitted', 1500)
    const stillOpen = await page.locator('[aria-label="Create new task"]').count()
    if (stillOpen === 0) {
      log('  ✓ Ctrl+Enter closed CreateTaskModal (submit fired)')
    } else {
      log('  ✗ Ctrl+Enter did NOT submit CreateTaskModal (modal still open)')
      await page.keyboard.press('Escape')
    }
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 8: Board view switch
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 8: Task view switches (board / standup / timeline) ===')
  for (const viewLabel of ['Board', 'Stand-up', 'Timeline']) {
    const toggle = page.getByRole('button', { name: new RegExp(`^${viewLabel}$`, 'i') }).first()
    if (await toggle.count()) {
      await toggle.click()
      await snap(page, `view-${viewLabel.toLowerCase().replace(/[^a-z]/g, '')}`, 800)
    } else {
      log(`  ✗ view toggle "${viewLabel}" not found`)
    }
  }
  // back to Grid
  const gridToggle = page.getByRole('button', { name: /^Grid$/ }).first()
  if (await gridToggle.count()) await gridToggle.click()

  // ────────────────────────────────────────────────────────────
  // ACTION 9: Ideas — N key + Ctrl+Enter
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 9: Ideas N-key + Ctrl+Enter ===')
  await page.goto(`${BASE}/ideas`, { waitUntil: 'networkidle' })
  await snap(page, 'ideas-page', 1200)
  await page.keyboard.press('n')
  await snap(page, 'ideas-create-modal', 400)
  const titleInput = page.locator('input[placeholder*="title" i], input[name="title"]').first()
  if (await titleInput.count()) {
    await titleInput.fill('test_delete_round2 ctrl+enter idea')
    await snap(page, 'ideas-filled', 200)
    await page.keyboard.press('Control+Enter')
    await snap(page, 'ideas-ctrl-enter', 1500)
    // verify modal closed
    const stillOpen = await page.locator('input[placeholder*="title" i], input[name="title"]').count()
    log(stillOpen === 0 ? '  ✓ Ctrl+Enter submitted Ideas modal' : '  ~ Ideas modal still present (may still be valid)')
  } else {
    log('  ✗ ideas create modal title input not found after N-key')
    await page.keyboard.press('Escape')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 10: Decisions — N key + Ctrl+Enter
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 10: Decisions N-key + Ctrl+Enter ===')
  await page.goto(`${BASE}/decisions`, { waitUntil: 'networkidle' })
  await snap(page, 'decisions-page', 1200)
  await page.keyboard.press('n')
  await snap(page, 'decisions-create-modal', 400)
  const decTitle = page.locator('input[placeholder*="decision" i], input[placeholder*="title" i]').first()
  if (await decTitle.count()) {
    await decTitle.fill('test_delete_round2 ctrl+enter decision')
    await snap(page, 'decisions-filled', 200)
    await page.keyboard.press('Control+Enter')
    await snap(page, 'decisions-ctrl-enter', 1500)
  } else {
    log('  ✗ decisions create modal not found after N-key')
    await page.keyboard.press('Escape')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 11: Projects — create modal Ctrl+Enter
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 11: Projects create modal Ctrl+Enter ===')
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' })
  await snap(page, 'projects-page', 1200)
  const newProjBtn = page.locator('button').filter({ hasText: /New Project/i }).first()
  if (await newProjBtn.count()) {
    await newProjBtn.click()
    await snap(page, 'projects-create-modal', 400)
    const projTitle = page.locator('input[name="title"], input[placeholder*="title" i]').first()
    if (await projTitle.count()) {
      await projTitle.fill('test_delete_round2 ctrl+enter project')
      await page.keyboard.press('Control+Enter')
      await snap(page, 'projects-ctrl-enter', 1500)
    }
  } else {
    log('  ~ No "New Project" button on /projects — likely admin-only')
  }

  // ────────────────────────────────────────────────────────────
  // ACTION 12: Mobile viewport — readability
  // ────────────────────────────────────────────────────────────
  log('\n=== ACTION 12: Mobile viewport (iPhone 13) ===')
  await ctx.close()
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 2,
  })
  const mPage = await mobileCtx.newPage()
  mPage.on('pageerror', (err) => {
    if (!err.message.includes('WebSocket') && !err.message.includes('hub-realtime'))
      log(`  !! MOBILE PAGE ERROR: ${err.message.slice(0, 160)}`)
  })

  await mPage.goto(`${BASE}/team`, { waitUntil: 'networkidle' })
  await mPage.waitForTimeout(2000)
  stepNum++
  await mPage.screenshot({ path: `${OUT}/${String(stepNum).padStart(2, '0')}-team-mobile.png` })
  log('  captured /team mobile')

  await mPage.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await mPage.waitForTimeout(2000)
  stepNum++
  await mPage.screenshot({ path: `${OUT}/${String(stepNum).padStart(2, '0')}-mytasks-mobile.png` })
  log('  captured /my-tasks mobile')

  await mPage.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await mPage.waitForTimeout(2000)
  stepNum++
  await mPage.screenshot({ path: `${OUT}/${String(stepNum).padStart(2, '0')}-dashboard-mobile.png` })
  log('  captured /dashboard mobile')

  await browser.close()

  writeFileSync(`${OUT}/findings.txt`, findings.join('\n'))
  console.log(`\n\n======= ROUND 2 DONE — ${stepNum} screenshots + ${findings.length} findings =======`)
  console.log(`Findings: ${OUT}/findings.txt`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
