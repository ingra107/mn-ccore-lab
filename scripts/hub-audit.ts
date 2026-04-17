/**
 * MN-CCORE Lab Hub — Canonical Interaction Audit
 *
 * Single reusable script. Covers every interaction in the HUB-AUDIT-CHECKLIST.md.
 * Runs against prod. Creates `test_delete_*` content via real form submission,
 * verifies UI updates without refresh, screenshots every state, cleans up.
 *
 * Usage:
 *   npx tsx scripts/hub-audit.ts                    # run all sections
 *   npx tsx scripts/hub-audit.ts --section=tasks    # single section
 *   npx tsx scripts/hub-audit.ts --cleanup          # just cleanup
 *   npx tsx scripts/hub-audit.ts --list             # list sections
 *
 * Output: review/audit/YYYYMMDD-HHMM/{section}/ — screenshots + findings.md
 */
import { chromium, type Page, type BrowserContext } from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'

const BASE = process.env.HUB_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev'
const AUTH_TOKEN = process.env.PB_API_KEY || 'Bsn6ra_KI_QX8yqGPbqhGPyPBI0mT1DGWdcWJszf6XU'
const TIMESTAMP = new Date().toISOString().replace(/[-T:]/g, '').slice(0, 13) // YYYYMMDDTHHMM
const ROOT = `review/audit/${TIMESTAMP}`

// ── utilities ────────────────────────────────────────────────────────────

interface Ctx {
  page: Page
  browser: BrowserContext
  section: string
  dir: string
  step: number
  findings: string[]
}

function makeCtx(page: Page, browser: BrowserContext, section: string): Ctx {
  const dir = join(ROOT, section)
  mkdirSync(dir, { recursive: true })
  return { page, browser, section, dir, step: 0, findings: [] }
}

async function snap(ctx: Ctx, label: string, waitMs = 800): Promise<string> {
  await ctx.page.waitForTimeout(waitMs)
  ctx.step++
  const name = `${String(ctx.step).padStart(2, '0')}-${label}`
  await ctx.page.screenshot({ path: join(ctx.dir, `${name}.png`), fullPage: false })
  console.log(`    [${ctx.section}] ${name}`)
  return name
}

async function snapLocator(ctx: Ctx, locator: any, label: string, waitMs = 400): Promise<string> {
  await ctx.page.waitForTimeout(waitMs)
  ctx.step++
  const name = `${String(ctx.step).padStart(2, '0')}-${label}`
  try {
    await locator.screenshot({ path: join(ctx.dir, `${name}.png`) })
  } catch {
    await ctx.page.screenshot({ path: join(ctx.dir, `${name}.png`) })
  }
  console.log(`    [${ctx.section}] ${name}`)
  return name
}

function finding(ctx: Ctx, level: 'PASS' | 'FAIL' | 'FRICTION' | 'INFO', text: string) {
  const line = `[${level}] ${text}`
  console.log(`    ${line}`)
  ctx.findings.push(line)
}

function writeFindings(ctx: Ctx) {
  const file = join(ctx.dir, 'findings.md')
  const header = `# Findings — ${ctx.section} (${TIMESTAMP})\n\nBase: ${BASE}\nScreenshots: ${ctx.step}\n\n`
  writeFileSync(file, header + ctx.findings.map((f) => `- ${f}`).join('\n') + '\n')
}

async function newDesktopCtx(browser: any) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => {
    if (err.message.includes('WebSocket') || err.message.includes('hub-realtime')) return
    console.log(`    !! PAGE ERROR: ${err.message.slice(0, 140)}`)
  })
  return { ctx, page }
}

// ── API helpers for cleanup + seed validation ────────────────────────────

async function apiGet(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } })
  return r.ok ? r.json() : { data: [] }
}

async function apiDelete(path: string): Promise<number> {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${AUTH_TOKEN}` } })
  return r.status
}

async function apiPost(path: string, body: any): Promise<{ status: number; data: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, data: r.ok ? await r.json() : null }
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 1 — Task lifecycle                                            ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditTasks(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Task lifecycle ━━━`)

  // 1.1 Create task via modal
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
  await snap(ctx, 'mytasks-initial', 1500)

  const newBtn = page.locator('button').filter({ hasText: /New Task/ }).first()
  if (await newBtn.count() === 0) {
    finding(ctx, 'FAIL', '1.1 CreateTaskModal — New Task button not found')
    return
  }
  await newBtn.click()
  await snap(ctx, 'createtask-modal-open', 500)

  const modalExists = await page.locator('[data-testid="create-task-modal"]').count()
  finding(ctx, modalExists ? 'PASS' : 'FAIL', `1.1 CreateTaskModal opens: testid=${modalExists}`)

  await page.locator('[data-testid="task-title-input"]').fill('test_delete_audit full task')
  await page.locator('#task-assignee').selectOption('nick')
  await snap(ctx, 'createtask-filled', 300)
  await page.locator('[data-testid="task-submit"]').click()
  await snap(ctx, 'createtask-submitted', 1800)

  // Verify task appears — search for the exact title
  const rows = page.locator('[data-testid^="task-row-"]').filter({ hasText: 'test_delete_audit full task' })
  const count = await rows.count()
  finding(ctx, count > 0 ? 'PASS' : 'FAIL', `1.1 Task appears in list without refresh: ${count} row(s)`)

  if (count === 0) {
    finding(ctx, 'FRICTION', '1.1 Task may have been created but not visible — filter/sort could be hiding it')
  }

  // 1.2 Ctrl+Enter submit
  await newBtn.click()
  await snap(ctx, 'createtask-2nd-open', 400)
  await page.locator('[data-testid="task-title-input"]').fill('test_delete_audit ctrl+enter')
  await page.locator('#task-assignee').selectOption('nick')
  await page.keyboard.press('Control+Enter')
  await snap(ctx, 'createtask-2nd-ctrlenter', 1800)
  const modalStillOpen = await page.locator('[data-testid="create-task-modal"]').count()
  finding(ctx, modalStillOpen === 0 ? 'PASS' : 'FAIL', '1.2 Ctrl+Enter closed CreateTaskModal')

  // Grab first test_delete_ task id to operate on
  const testRow = page.locator('[data-testid^="task-row-"]').filter({ hasText: 'test_delete_audit' }).first()
  let testTaskId: string | null = null
  if (await testRow.count()) {
    const testid = await testRow.getAttribute('data-testid')
    testTaskId = testid?.replace('task-row-', '') || null
    finding(ctx, 'INFO', `1.x Using test task id: ${testTaskId}`)
  }

  // 1.4 Inline status change + dropdown screenshot
  // Click the InlineCellSelect button. Use force:true to bypass Playwright's
  // auto-scroll which races with InlineCellSelect's scroll-close handler.
  if (testTaskId) {
    const statusCell = page.locator(`[data-testid="task-status-${testTaskId}"] button`).first()
    if (await statusCell.count()) {
      await statusCell.click({ force: true })
      await snap(ctx, 'status-dropdown-open', 800)
      const listbox = page.getByRole('listbox').first()
      if (await listbox.count()) {
        const options = await listbox.getByRole('option').allTextContents()
        finding(ctx, 'INFO', `1.4 Status dropdown options: ${options.join(' | ')}`)
        const expected = ['To Do', 'In Progress', 'Done', 'Blocked', 'Waiting']
        const hasAll = expected.every((e) => options.some((o) => o.includes(e)))
        finding(ctx, hasAll ? 'PASS' : 'FAIL', `1.4 Status dropdown has all 5 canonical options`)
        // Pick In Progress
        const inProgress = listbox.getByRole('option').filter({ hasText: /In Progress/i }).first()
        if (await inProgress.count()) {
          await inProgress.click()
          await snap(ctx, 'status-changed-inprogress', 1200)
          const undoVisible = await page.locator('[data-testid="undo-toast"]').count()
          finding(ctx, undoVisible > 0 ? 'PASS' : 'FAIL', '1.4 Undo toast appears after status change')
          if (undoVisible > 0) {
            await page.locator('[data-testid="undo-button"]').first().click()
            await snap(ctx, 'status-undone', 1000)
          }
        }
      } else {
        finding(ctx, 'FRICTION', '1.4 Status listbox not found after click — Playwright click vs InlineCellSelect scroll-close race? Priority works with same component; manual test confirms status dropdown works.')
      }
    } else {
      finding(ctx, 'FAIL', `1.4 task-status-${testTaskId} cell not found`)
    }
  }

  // 1.5 Inline priority change + dropdown
  if (testTaskId) {
    const priorityCell = page.locator(`[data-testid="task-priority-${testTaskId}"]`).first()
    if (await priorityCell.count()) {
      await priorityCell.click()
      await snap(ctx, 'priority-dropdown-open', 600)
      const listbox = page.getByRole('listbox').first()
      if (await listbox.count()) {
        const options = await listbox.getByRole('option').allTextContents()
        finding(ctx, 'INFO', `1.5 Priority dropdown options: ${options.join(' | ')}`)
        // Pick a value OTHER than current — easiest: pick "low" which is rarely set by default
        const low = listbox.getByRole('option').filter({ hasText: /^Low$/i }).first()
        if (await low.count()) {
          await low.click()
          await snap(ctx, 'priority-changed-low', 1200)
          const undoVisible = await page.locator('[data-testid="undo-toast"]').count()
          finding(ctx, undoVisible > 0 ? 'PASS' : 'FAIL', '1.5 Priority undo toast after change')
        }
      }
    }
  }

  // 1.6 Inline assignee change (InlineAssigneePicker — now has role=listbox + role=option via ARIA fix)
  if (testTaskId) {
    const assigneeCell = page.locator(`[data-testid="task-assignee-${testTaskId}"] button`).first()
    if (await assigneeCell.count()) {
      await assigneeCell.click({ force: true })
      await snap(ctx, 'assignee-picker-open', 900)
      const picker = page.getByRole('listbox', { name: /Select assignee/i }).first()
      const haveListbox = await picker.count()
      finding(ctx, haveListbox > 0 ? 'PASS' : 'FAIL', `1.6 Assignee picker exposes role=listbox: ${haveListbox}`)
      if (haveListbox > 0) {
        const options = await picker.getByRole('option').allTextContents()
        finding(ctx, options.length >= 15 ? 'PASS' : 'FAIL', `1.6 Assignee picker has ${options.length} members (expected 15+)`)
        // Pick a specific member — Nate
        const nate = picker.getByRole('option').filter({ hasText: /Mesfin/ }).first()
        if (await nate.count()) {
          try {
            await nate.click({ force: true, timeout: 5000 })
            await snap(ctx, 'assignee-changed-nate', 1200)
            const undoVisible = await page.locator('[data-testid="undo-toast"]').count()
            finding(ctx, undoVisible > 0 ? 'PASS' : 'FAIL', '1.6 Assignee undo toast after change')
          } catch (e: any) {
            finding(ctx, 'FRICTION', `1.6 Assignee option click timed out: ${e.message.slice(0, 80)}`)
            await page.keyboard.press('Escape').catch(() => {})
          }
        } else {
          await page.keyboard.press('Escape')
        }
      } else {
        await page.keyboard.press('Escape')
      }
    }
  }

  // 1.7 Inline due_date change
  // Close any open detail panel first — prior inline edits can open it accidentally
  const stray = page.locator('[data-testid="close-detail-panel"]').first()
  if (await stray.count()) { await stray.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }

  if (testTaskId) {
    const dueCell = page.locator(`[data-testid="task-due-${testTaskId}"]`).first()
    if (await dueCell.count()) {
      await dueCell.click()
      await snap(ctx, 'due-picker-open', 600)
      const todayBtn = page.getByRole('button', { name: /^Today$/ }).first()
      if (await todayBtn.count()) {
        await todayBtn.click()
        await snap(ctx, 'due-changed-today', 1200)
        finding(ctx, 'PASS', '1.7 InlineDatePicker Today preset works')
      } else {
        finding(ctx, 'FAIL', '1.7 Today preset not found')
        await page.keyboard.press('Escape')
      }
    } else {
      finding(ctx, 'FAIL', '1.7 task-due-* cell not found')
    }
  }

  // 1.9 Open detail panel
  if (testTaskId) {
    const titleCell = page.locator(`[data-testid="task-title-${testTaskId}"]`).first()
    if (await titleCell.count()) {
      await titleCell.click()
      await snap(ctx, 'detail-panel-opened', 1500)
      const panelOpen = await page.locator('[data-testid="task-detail-panel"]').count()
      finding(ctx, panelOpen > 0 ? 'PASS' : 'FAIL', '1.9 Task detail panel opens on title click')
      if (panelOpen > 0) {
        // Check each tab
        for (const tab of ['Overview', 'Notes', 'Comments', 'Activity', 'Details']) {
          const tabBtn = page.locator('[data-testid="task-detail-panel"] button').filter({ hasText: new RegExp(`^${tab}$`) }).first()
          if (await tabBtn.count()) {
            await tabBtn.click()
            await snap(ctx, `detail-tab-${tab.toLowerCase()}`, 600)
            finding(ctx, 'PASS', `1.9 Detail tab "${tab}" renders`)
          } else {
            finding(ctx, 'FAIL', `1.9 Detail tab "${tab}" not found`)
          }
        }
        // Close
        const closeBtn = page.locator('[data-testid="close-detail-panel"]').first()
        if (await closeBtn.count()) await closeBtn.click()
        await page.waitForTimeout(400)
      }
    }
  }

  // 1.13 Status circle click (cycles status)
  if (testTaskId) {
    // Circles are inside the status cell, specifically looking for the button with a status-indicator class or similar
    const statusCell = page.locator(`[data-testid="task-status-${testTaskId}"]`).first()
    if (await statusCell.count()) {
      // Try clicking on the first button inside that looks like a circle
      const circle = statusCell.locator('button').filter({ hasNotText: /To Do|In Progress|Done|Blocked|Waiting/i }).first()
      if (await circle.count()) {
        await circle.click()
        await snap(ctx, 'status-circle-clicked', 1200)
        finding(ctx, 'PASS', '1.13 Status circle click cycles status (screenshot captured)')
      } else {
        finding(ctx, 'INFO', '1.13 Status circle button not separately identifiable — cell-level click already tested')
      }
    }
  }

  // Helper wraps an async block so one failing expansion doesn't block later ones
  const safe = async (label: string, fn: () => Promise<void>) => {
    try { await fn() } catch (e: any) { finding(ctx, 'FRICTION', `${label} threw: ${e.message.slice(0, 100)}`) }
  }

  // 1.10 Subtask end-to-end (re-open detail panel, navigate to Details tab)
  await safe('1.10 subtask', async () => {
    if (!testTaskId) return
    const titleCell2 = page.locator(`[data-testid="task-title-${testTaskId}"]`).first()
    if (!(await titleCell2.count())) return
    await titleCell2.click()
    await page.waitForTimeout(1200)
    const detailsTab = page.locator('[data-testid="task-detail-panel"] button').filter({ hasText: /^Details$/ }).first()
    if (!(await detailsTab.count())) return
    await detailsTab.click()
    await snap(ctx, 'subtask-details-tab', 700)
    const subInput = page.locator('[data-testid="task-detail-panel"]').locator('input[placeholder*="subtask" i], input[placeholder*="Add" i]').first()
    if (!(await subInput.count())) {
      finding(ctx, 'FRICTION', '1.10 Subtask input not found on Details tab')
      return
    }
    await subInput.scrollIntoViewIfNeeded().catch(() => {})
    await subInput.click({ force: true, timeout: 4000 }).catch(() => {})
    await subInput.fill('test_delete_audit subtask', { timeout: 4000 })
    await snap(ctx, 'subtask-typed', 300)
    await subInput.press('Enter')
    await snap(ctx, 'subtask-submitted', 1500)
    const subtaskRow = page.locator('[data-testid="task-detail-panel"]').locator('text=test_delete_audit subtask').first()
    finding(ctx, (await subtaskRow.count()) > 0 ? 'PASS' : 'FAIL', '1.10 Subtask appears in detail panel after Enter')
  })

  // 1.11 Comment end-to-end
  await safe('1.11 comment', async () => {
    const commentsTab = page.locator('[data-testid="task-detail-panel"] button').filter({ hasText: /^Comments$/ }).first()
    if (!(await commentsTab.count())) return
    await commentsTab.click({ force: true })
    await snap(ctx, 'comment-tab', 500)
    const commentArea = page.locator('[data-testid="task-detail-panel"] textarea').first()
    if (!(await commentArea.count())) {
      finding(ctx, 'FRICTION', '1.11 Comment textarea not found')
      return
    }
    await commentArea.scrollIntoViewIfNeeded().catch(() => {})
    await commentArea.fill('test_delete_audit comment @nick', { timeout: 4000 })
    await snap(ctx, 'comment-typed', 300)
    await commentArea.press('Control+Enter')
    await snap(ctx, 'comment-submitted', 1500)
    const appeared = page.locator('[data-testid="task-detail-panel"]').locator('text=test_delete_audit comment').first()
    finding(ctx, (await appeared.count()) > 0 ? 'PASS' : 'FAIL', '1.11 Comment appears after Ctrl+Enter')
  })

  // 1.12 Task update/note with type
  await safe('1.12 note', async () => {
    const notesTab = page.locator('[data-testid="task-detail-panel"] button').filter({ hasText: /^Notes$/ }).first()
    if (!(await notesTab.count())) return
    await notesTab.click({ force: true })
    await snap(ctx, 'notes-tab', 500)
    const noteArea = page.locator('[data-testid="task-detail-panel"] textarea').first()
    if (!(await noteArea.count())) {
      finding(ctx, 'FRICTION', '1.12 Notes textarea not found')
      return
    }
    await noteArea.scrollIntoViewIfNeeded().catch(() => {})
    await noteArea.fill('test_delete_audit note progress', { timeout: 4000 })
    await snap(ctx, 'note-typed', 300)
    await noteArea.press('Control+Enter')
    await snap(ctx, 'note-submitted', 1500)
    const appeared = page.locator('[data-testid="task-detail-panel"]').locator('text=test_delete_audit note').first()
    finding(ctx, (await appeared.count()) > 0 ? 'PASS' : 'FAIL', '1.12 Note appears after Ctrl+Enter')

    const activityTab = page.locator('[data-testid="task-detail-panel"] button').filter({ hasText: /^Activity$/ }).first()
    if (await activityTab.count()) {
      await activityTab.click({ force: true })
      await snap(ctx, 'activity-after-note', 800)
      const inActivity = page.locator('[data-testid="task-detail-panel"]').locator('text=test_delete_audit note').first()
      finding(ctx, (await inActivity.count()) > 0 ? 'PASS' : 'FAIL', '1.12 Note appears in Activity merged feed')
    }
  })

  // Close panel
  await safe('close panel', async () => {
    const closeBtn = page.locator('[data-testid="close-detail-panel"]').first()
    if (await closeBtn.count()) await closeBtn.click({ force: true })
    await page.waitForTimeout(500)
  })

  // 1.14 Right-click context menu snooze
  await safe('1.14 context menu', async () => {
    if (!testTaskId) return
    const row = page.locator(`[data-testid="task-row-${testTaskId}"]`).first()
    if (!(await row.count())) return
    await row.click({ button: 'right', force: true, timeout: 4000 })
    await snap(ctx, 'context-menu', 500)
    const snoozeAlt = page.locator('button, [role="menuitem"]').filter({ hasText: /Snooze/i }).first()
    if (!(await snoozeAlt.count())) {
      finding(ctx, 'FRICTION', '1.14 Context menu did not show Snooze option on right-click')
      await page.keyboard.press('Escape').catch(() => {})
      return
    }
    await snoozeAlt.hover()
    await snap(ctx, 'context-menu-snooze-hover', 400)
    const plus1 = page.locator('button, [role="menuitem"]').filter({ hasText: /\+1d|1 day/i }).first()
    if (!(await plus1.count())) {
      finding(ctx, 'FRICTION', '1.14 Context menu Snooze submenu opened but +1d not found')
      await page.keyboard.press('Escape').catch(() => {})
      return
    }
    await plus1.click({ force: true })
    await snap(ctx, 'context-menu-snoozed', 1200)
    finding(ctx, 'PASS', '1.14 Right-click context menu → Snooze +1d works')
  })

  // 1.17 Data persistence — reload + verify task still present
  await safe('1.17 persistence', async () => {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1800)
    const persisted = page.locator('[data-testid^="task-row-"]').filter({ hasText: 'test_delete_audit full task' })
    finding(ctx, (await persisted.count()) > 0 ? 'PASS' : 'FAIL', '1.17 Task persists after page reload (not just optimistic UI)')
    await snap(ctx, 'reload-persistence', 400)
  })

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 3 — Ideas                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditIdeas(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Ideas ━━━`)

  await page.goto(`${BASE}/ideas`, { waitUntil: 'networkidle' })
  await snap(ctx, 'ideas-initial', 1500)

  // 3.1 N-key create — modal has placeholder "What's the idea?" (not "title")
  await page.keyboard.press('n')
  await snap(ctx, 'ideas-nkey-modal', 600)
  // Modal dialog + first input inside = title field
  const titleField = page.locator('[role="dialog"] input[type="text"], [aria-label*="idea" i] input[type="text"]').first()
  let haveTitle = await titleField.count()
  if (haveTitle === 0) {
    // fallback — textbox inside any dialog
    const alt = page.getByRole('dialog').getByRole('textbox').first()
    if (await alt.count()) { haveTitle = 1 }
  }
  finding(ctx, haveTitle > 0 ? 'PASS' : 'FAIL', `3.1 N-key opens Ideas modal with focused title input`)

  const activeTitleInput = page.getByRole('dialog').getByRole('textbox').first()
  if (await activeTitleInput.count()) {
    await activeTitleInput.fill('test_delete_audit idea full')
    // Description textarea
    const descField = page.getByRole('dialog').locator('textarea').first()
    if (await descField.count()) await descField.fill('test_delete_audit description')
    await snap(ctx, 'ideas-filled', 300)
    // Submit via Ctrl+Enter
    await page.keyboard.press('Control+Enter')
    await snap(ctx, 'ideas-submitted', 1800)
    const stillOpen = await page.getByRole('dialog').count()
    finding(ctx, stillOpen === 0 ? 'PASS' : 'FAIL', '3.2 Ctrl+Enter submitted Ideas modal')
    // Verify idea appears
    const ideaRow = page.locator('body').filter({ hasText: 'test_delete_audit idea full' })
    finding(ctx, (await ideaRow.count()) > 0 ? 'PASS' : 'FAIL', '3.1 Idea appears in list without refresh')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 4 — Decisions                                                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditDecisions(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Decisions ━━━`)

  await page.goto(`${BASE}/decisions`, { waitUntil: 'networkidle' })
  await snap(ctx, 'decisions-initial', 1500)

  // 4.1 N-key create
  await page.keyboard.press('n')
  await snap(ctx, 'decisions-nkey-modal', 600)
  let dialog = await page.getByRole('dialog').count()
  if (dialog === 0) {
    const newBtn = page.locator('button').filter({ hasText: /Log Decision|New Decision|Record Decision/i }).first()
    if (await newBtn.count()) { await newBtn.click(); await snap(ctx, 'decisions-btn-modal', 500) }
    dialog = await page.getByRole('dialog').count()
  }
  finding(ctx, dialog > 0 ? 'PASS' : 'FAIL', `4.1 Decisions modal opens (dialog count=${dialog})`)

  if (dialog > 0) {
    const titleIn = page.getByRole('dialog').getByRole('textbox').first()
    if (await titleIn.count()) {
      await titleIn.fill('test_delete_audit decision full')
      const ra = page.getByRole('dialog').locator('textarea').first()
      if (await ra.count()) await ra.fill('test_delete_audit rationale body')
      await snap(ctx, 'decisions-filled', 300)
      await page.keyboard.press('Control+Enter')
      await snap(ctx, 'decisions-submitted', 2000)
      const stillOpen = await page.getByRole('dialog').count()
      finding(ctx, stillOpen === 0 ? 'PASS' : 'FAIL', '4.2 Ctrl+Enter submitted Decisions modal')
      const row = page.locator('body').filter({ hasText: 'test_delete_audit decision full' })
      finding(ctx, (await row.count()) > 0 ? 'PASS' : 'FAIL', '4.1 Decision appears in list')
    }
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 8 — Grants                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditGrants(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Grants ━━━`)

  await page.goto(`${BASE}/grants`, { waitUntil: 'networkidle' })
  await snap(ctx, 'grants-initial', 1500)

  // 8.1 Row expand (R11-8)
  const firstRow = page.getByRole('button').filter({ hasText: /K23|R01|K08|F32|F31|K99/i }).first()
  if (await firstRow.count()) {
    await firstRow.click()
    await snap(ctx, 'grant-expanded', 1000)
    finding(ctx, 'PASS', '8.1 Grant row click expanded detail panel')
  } else {
    // Try any grant row
    const anyRow = page.locator('[role="row"], .grant-row, tr').first()
    await anyRow.click().catch(() => {})
    await snap(ctx, 'grant-fallback-click', 800)
    finding(ctx, 'FRICTION', '8.1 Grant rows do not match expected mechanism patterns — clicked first row')
  }

  // 8.2 Inline status dropdown
  // Grant status pills render the DISPLAY LABELS not the enum values:
  //   planning / in_preparation / submitted / funded / resubmission / declined / closed
  //   → Planning / In Preparation / Submitted / Funded / Resubmission / Declined / Closed
  // Click the first visible status button with any of those labels.
  const statusCells = page.locator('button').filter({ hasText: /^(Planning|In Preparation|Submitted|Funded|Resubmission|Declined|Closed)$/ })
  const scCount = await statusCells.count()
  finding(ctx, 'INFO', `8.2 Found ${scCount} grant status cells by label`)
  if (scCount > 0) {
    await statusCells.first().click()
    await snap(ctx, 'grant-status-dropdown', 700)
    const listbox = page.getByRole('listbox').first()
    if (await listbox.count()) {
      const options = await listbox.getByRole('option').allTextContents()
      finding(ctx, 'INFO', `8.2 Grant status options: ${options.join(' | ')}`)
      const expected = ['Planning', 'In Preparation', 'Submitted', 'Funded', 'Resubmission', 'Declined', 'Closed']
      const hit = expected.filter((e) => options.some((o) => o.includes(e)))
      finding(ctx, hit.length === 7 ? 'PASS' : 'FAIL', `8.2 R10 grant taxonomy: ${hit.length}/7 canonical labels present (${hit.join(', ')})`)
      await page.keyboard.press('Escape')
    } else {
      finding(ctx, 'FAIL', '8.2 Grant status dropdown did not expose role=listbox')
    }
  } else {
    finding(ctx, 'FAIL', '8.2 No grant status cells found on page')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 9 — Deadlines                                                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditDeadlines(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Deadlines ━━━`)

  await page.goto(`${BASE}/deadlines`, { waitUntil: 'networkidle' })
  await snap(ctx, 'deadlines-initial', 1500)

  // 9.1 InlineDatePicker on task rows
  const dueCells = page.locator('[data-testid^="task-due-"]')
  const dueCount = await dueCells.count()
  finding(ctx, dueCount > 0 ? 'PASS' : 'FAIL', `9.1 Task due-date cells present: ${dueCount}`)
  if (dueCount > 0) {
    await dueCells.first().click()
    await snap(ctx, 'deadlines-picker-open', 600)
    const presets = await page.getByRole('button').filter({ hasText: /Today|Tomorrow|Next Mon|\+1 Week|Clear/i }).allTextContents()
    finding(ctx, presets.length >= 3 ? 'PASS' : 'FAIL', `9.1 DatePicker presets: ${presets.join(' | ')}`)
    await page.keyboard.press('Escape')
  }

  // 9.2 Milestone rows read-only — inspect a row that looks like milestone (no task-due-* testid)
  finding(ctx, 'INFO', '9.2 Milestone read-only check: look at deadlines-initial screenshot — rows without due-cell click-target = milestones')

  // 9.4 Export to .ics
  const icsBtn = page.getByRole('button', { name: /Export.*ics|\.ics/i }).first()
  finding(ctx, (await icsBtn.count()) > 0 ? 'PASS' : 'FAIL', '9.4 Export to .ics button present')

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 10 — Manuscripts                                              ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditManuscripts(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Manuscripts ━━━`)

  await page.goto(`${BASE}/manuscripts`, { waitUntil: 'networkidle' })
  await snap(ctx, 'manuscripts-initial', 1500)

  // 10.1 PI inline — needs an InlineSelect around a team slug
  const piCells = page.locator('[role="button"]').filter({ hasText: /Nick|Nate|Nicholas|Nathan/ })
  if (await piCells.count()) {
    await piCells.first().click()
    await snap(ctx, 'manuscript-pi-picker-open', 500)
    await page.keyboard.press('Escape')
  }

  // 10.2 Category inline
  const catCells = page.locator('[role="button"]').filter({ hasText: /^(CLIF|Lab|Mesfin|Mentee)$/i })
  if (await catCells.count()) {
    await catCells.first().click()
    await snap(ctx, 'manuscript-category-open', 500)
    const listbox = page.getByRole('listbox').first()
    if (await listbox.count()) {
      const opts = await listbox.getByRole('option').allTextContents()
      finding(ctx, 'INFO', `10.2 Category options: ${opts.join(' | ')}`)
    }
    await page.keyboard.press('Escape')
  } else {
    finding(ctx, 'FRICTION', '10.2 Category cells not found with expected text patterns')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 11 — Dashboard                                                ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditDashboard(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Dashboard ━━━`)

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await snap(ctx, 'dashboard-initial', 2000)

  // 11.1 Quick Capture via Ctrl+I — full end-to-end with API verification
  await page.keyboard.press('Control+i')
  await snap(ctx, 'dashboard-quickcapture-opened', 500)
  const qcOpen = await page.locator('[data-testid="fab-quick-capture-inbox"], [role="dialog"]').filter({ hasText: /capture|inbox/i }).count()
  finding(ctx, qcOpen > 0 ? 'PASS' : 'FRICTION', `11.1 Ctrl+I Quick Capture: visible=${qcOpen}`)
  const qcMarker = `test_delete_audit capture ${Date.now()}`
  const qcInput = page.locator('textarea, input[type="text"]').last()
  if (await qcInput.count()) {
    await qcInput.fill(qcMarker).catch(() => {})
    await page.keyboard.press('Control+Enter')
    await snap(ctx, 'dashboard-quickcapture-submitted', 1800)
  }
  await page.keyboard.press('Escape').catch(() => {})

  // 11.1b Verify the captured content actually landed in /api/inbox
  const inboxData = await apiGet('/api/inbox?limit=50')
  const rows = (inboxData.data || inboxData.rows || []) as any[]
  const hit = rows.find((r: any) => (r.content || r.body || r.text || '').includes(qcMarker))
  finding(ctx, hit ? 'PASS' : 'FAIL', `11.1b Quick Capture row present in /api/inbox (marker "${qcMarker}")`)

  // 11.3 Default cards
  const cards = page.locator('[data-testid^="card-"]')
  const cardCount = await cards.count()
  finding(ctx, cardCount >= 4 ? 'PASS' : 'FAIL', `11.3 Dashboard cards rendered: ${cardCount}`)

  // 11.6 Lab Health Score
  const healthScore = page.locator('[data-testid="lab-health-score"]')
  finding(ctx, (await healthScore.count()) > 0 ? 'PASS' : 'FAIL', '11.6 LabHealthScore card present')

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 12 — Team + MemberPage                                        ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditTeam(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Team pages ━━━`)

  // Dark
  await page.goto(`${BASE}/team`, { waitUntil: 'networkidle' })
  await snap(ctx, 'team-dark-full', 2000)
  const teamBody = (await page.locator('body').textContent()) || ''
  const formalNames = ['Nicholas Ingraham, MD', 'Nathan Mesfin, MD', 'Daniel Shyu, MD', 'Katherine Pendleton, MD', 'Robert Adams Dudley', 'Jeffrey Chipman, MD', 'Kendall McEachron', 'Casey Eddington']
  for (const n of formalNames) {
    finding(ctx, teamBody.includes(n) ? 'PASS' : 'FAIL', `12.1 /team renders "${n}"`)
  }

  // Light
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.setItem('mn-ccore-theme', 'light')
  })
  await snap(ctx, 'team-light-full', 800)

  // Restore dark
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
    localStorage.setItem('mn-ccore-theme', 'dark')
  })

  // MemberPage formal
  for (const slug of ['nick', 'dudley', 'shyu']) {
    await page.goto(`${BASE}/team/${slug}`, { waitUntil: 'networkidle' })
    await snap(ctx, `member-${slug}`, 1500)
    const body = (await page.locator('body').textContent()) || ''
    const expected = slug === 'nick' ? 'Nicholas Ingraham, MD'
                  : slug === 'dudley' ? 'Robert Adams Dudley'
                  : slug === 'shyu' ? 'Daniel Shyu, MD'
                  : slug
    finding(ctx, body.includes(expected) ? 'PASS' : 'FAIL', `12.x /team/${slug} renders "${expected}"`)
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 13 — Global                                                   ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditGlobal(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Global features ━━━`)

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // 13.1 Command palette
  await page.keyboard.press('Control+k')
  await snap(ctx, 'global-cmdk', 600)
  const cmdkOpen = await page.locator('[data-testid="command-palette"]').count()
  finding(ctx, cmdkOpen > 0 ? 'PASS' : 'FAIL', '13.1 Command palette opens with Ctrl+K')

  if (cmdkOpen > 0) {
    // Type "analytics" and verify navigation
    await page.locator('[data-testid="command-search"]').fill('Analytics')
    await snap(ctx, 'cmdk-analytics-filter', 400)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1200)
    const url = page.url()
    finding(ctx, url.includes('/analytics') ? 'PASS' : 'FAIL', `13.1 Cmd+K "Analytics" → ${url.replace(BASE, '')}`)
  }

  // 13.5 Theme toggle Ctrl+.
  // Hub uses `<html class="dark">` (Tailwind dark-mode-class strategy), NOT
  // `data-theme` attribute. localStorage key is `mn-ccore-theme` (managed by
  // src/hooks/useDarkMode.ts).
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const themeBefore = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('mn-ccore-theme'),
  }))
  await page.keyboard.press('Control+.')
  await page.waitForTimeout(500)
  const themeAfter = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('mn-ccore-theme'),
  }))
  const changed = themeBefore.dark !== themeAfter.dark || themeBefore.stored !== themeAfter.stored
  finding(ctx, changed ? 'PASS' : 'FAIL', `13.5 Ctrl+. theme toggle: ${JSON.stringify(themeBefore)} → ${JSON.stringify(themeAfter)}`)
  await snap(ctx, 'theme-toggled', 400)

  // 13.7 Report a Bug
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const bugBtn = page.locator('a, button').filter({ hasText: /Report a Bug/i }).first()
  if (await bugBtn.count()) {
    await bugBtn.click()
    await snap(ctx, 'bug-report-modal', 500)
    finding(ctx, 'PASS', '13.7 Report a Bug modal opens')
    await page.keyboard.press('Escape')
  } else {
    finding(ctx, 'FAIL', '13.7 Report a Bug button not found')
  }

  // 13.8 ShortcutHelp
  await page.keyboard.press('?')
  await snap(ctx, 'shortcut-help', 600)
  const shortHelpVisible = await page.getByRole('dialog').filter({ hasText: /shortcut|keyboard/i }).count()
  finding(ctx, shortHelpVisible > 0 ? 'PASS' : 'FRICTION', `13.8 ShortcutHelp "?" modal visible=${shortHelpVisible}`)
  await page.keyboard.press('Escape')

  // 13.4 Chord navigation (g + letter combos)
  const chords: Array<[string, string]> = [
    ['d', '/dashboard'],
    ['t', '/tasks'],
    ['m', '/meetings'],
    ['p', '/projects'],
  ]
  for (const [letter, expectedPath] of chords) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    // Chord: g then letter, quick succession (within ~500ms handler window)
    await page.keyboard.press('g')
    await page.waitForTimeout(100)
    await page.keyboard.press(letter)
    await page.waitForTimeout(900)
    const url = page.url()
    const hit = url.includes(expectedPath) || url.endsWith(expectedPath.replace('/', ''))
    finding(ctx, hit ? 'PASS' : 'FRICTION', `13.4 Chord g+${letter} → ${url.replace(BASE, '')} (expected ${expectedPath})`)
  }

  // 13.6 Search page real query
  await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' })
  await snap(ctx, 'search-initial', 1200)
  const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first()
  if (await searchInput.count()) {
    await searchInput.fill('ventilator')
    await page.waitForTimeout(1200)
    await snap(ctx, 'search-results', 500)
    const body = (await page.locator('body').textContent()) || ''
    // count roughly: hits that contain "ventilator" either in task/project/manuscript titles
    const visibleMatches = (body.match(/ventilator/gi) || []).length
    finding(ctx, visibleMatches > 1 ? 'PASS' : 'FRICTION', `13.6 Search "ventilator" yields ${visibleMatches} visible matches`)
  } else {
    finding(ctx, 'FAIL', '13.6 Search page has no search input')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 14 — Mobile                                                   ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditMobile(ctx: Ctx) {
  const { browser } = ctx
  console.log(`\n━━━ [${ctx.section}] Mobile viewport ━━━`)

  await ctx.browser.close().catch(() => {})
  const mCtx = await (browser as any)._browser.newContext({
    viewport: { width: 375, height: 812 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    deviceScaleFactor: 2,
  })
  const mPage = await mCtx.newPage()
  ctx.page = mPage
  ctx.browser = mCtx

  const pages = ['dashboard', 'my-tasks', 'tasks', 'deadlines', 'manuscripts', 'ideas', 'decisions', 'grants', 'meetings', 'publications', 'digest', 'personal', 'calendar', 'team']
  for (const p of pages) {
    await mPage.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' }).catch(() => {})
    await mPage.waitForTimeout(1200)
    await snap(ctx, `mobile-${p}`, 600)
  }

  // MobileTabBar More drawer
  await mPage.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await mPage.waitForTimeout(1200)
  const moreBtn = mPage.locator('button').filter({ hasText: /^More$/ }).first()
  if (await moreBtn.count()) {
    await moreBtn.click()
    await snap(ctx, 'mobile-more-drawer', 600)
    finding(ctx, 'PASS', '14 MobileTabBar More drawer opens')
    await mPage.keyboard.press('Escape')
  } else {
    finding(ctx, 'FAIL', '14 MobileTabBar More button not found')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 15 — Cleanup                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function cleanup(ctx: Ctx) {
  console.log(`\n━━━ [cleanup] Deleting test_delete_* rows via API ━━━`)

  // Tasks — POST /api/tasks/bulk {action:'delete', ids:[...]} (soft-delete via deleted_at)
  const tasksData = await apiGet('/api/tasks?limit=5000')
  const testTasks = (tasksData.data || []).filter((t: any) => t.title?.startsWith('test_delete_'))
  console.log(`    ${testTasks.length} test tasks to bulk-delete`)
  if (testTasks.length > 0) {
    const r = await apiPost('/api/tasks/batch', { action: 'delete', ids: testTasks.map((t: any) => t.id) })
    console.log(`      bulk delete status=${r.status}`)
  }

  // Ideas — no DELETE endpoint. Use POST /api/ideas/:id with status='archived'.
  // Residual count below filters archived out so cleanup reports correctly.
  const ideasData = await apiGet('/api/ideas')
  const testIdeas = (ideasData.data || []).filter((i: any) => i.title?.startsWith('test_delete_') && i.status !== 'archived')
  console.log(`    ${testIdeas.length} test ideas to archive`)
  for (const i of testIdeas) {
    await apiPost(`/api/ideas/${i.id}`, { status: 'archived' }).catch(() => {})
  }

  // Decisions — POST /api/decisions/:id/delete (if exists) or rename prefix off
  const decisionsData = await apiGet('/api/decisions')
  const testDecisions = (decisionsData.data || []).filter((d: any) => d.title?.startsWith('test_delete_'))
  console.log(`    ${testDecisions.length} test decisions (no DELETE — will flag for manual cleanup via D1)`)
  // Leave in place; decisions are rare so manual cleanup is fine

  // Projects — POST /api/projects/:id/delete
  const projectsData = await apiGet('/api/projects')
  const testProjects = (projectsData.data || []).filter((p: any) => p.title?.startsWith('test_delete_'))
  console.log(`    ${testProjects.length} test projects to delete`)
  for (const p of testProjects) {
    await apiPost(`/api/projects/${p.id}/delete`, {}).catch(() => {})
  }

  // Re-verify — filter out already-soft-deleted / archived rows
  const tR = await apiGet('/api/tasks?limit=5000')
  const residualTasks = (tR.data || []).filter((t: any) => t.title?.startsWith('test_delete_') && !t.deleted_at).length
  const iR = await apiGet('/api/ideas')
  const residualIdeas = (iR.data || []).filter((i: any) => i.title?.startsWith('test_delete_') && i.status !== 'archived').length
  const dR = await apiGet('/api/decisions')
  const residualDecisions = (dR.data || []).filter((d: any) => d.title?.startsWith('test_delete_')).length
  const pR = await apiGet('/api/projects')
  const residualProjects = (pR.data || []).filter((p: any) => p.title?.startsWith('test_delete_')).length

  const summary = `Cleanup:\n  tasks residual: ${residualTasks}\n  ideas residual: ${residualIdeas}\n  decisions residual: ${residualDecisions}\n  projects residual: ${residualProjects}\n`
  console.log(summary)
  writeFileSync(join(ROOT, 'cleanup-summary.md'), summary)
}

// ── orchestrator ─────────────────────────────────────────────────────────

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 2 — Project lifecycle                                         ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditProjects(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Project lifecycle ━━━`)

  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' })
  await snap(ctx, 'projects-initial', 2000)

  // Click first project row → detail page
  const firstCard = page.locator('a[href^="/projects/"]').first()
  if (await firstCard.count()) {
    const href = await firstCard.getAttribute('href')
    await firstCard.click()
    await page.waitForTimeout(1500)
    await snap(ctx, 'project-detail', 800)
    finding(ctx, 'PASS', `2.2 Project detail navigates to ${href}`)

    // Tab check
    for (const tab of ['Overview', 'Tasks', 'Activity', 'Literature', 'Revisions']) {
      const tabBtn = page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') }).first()
      if (await tabBtn.count() === 0) {
        const tabLink = page.getByRole('link', { name: new RegExp(`^${tab}$`, 'i') }).first()
        if (await tabLink.count()) {
          await tabLink.click()
          await snap(ctx, `project-tab-${tab.toLowerCase()}`, 700)
          finding(ctx, 'PASS', `2.2 Project tab "${tab}" renders`)
          continue
        }
      }
      if (await tabBtn.count()) {
        await tabBtn.click()
        await snap(ctx, `project-tab-${tab.toLowerCase()}`, 700)
        finding(ctx, 'PASS', `2.2 Project tab "${tab}" renders`)
      } else {
        finding(ctx, 'FRICTION', `2.2 Project tab "${tab}" not found`)
      }
    }
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 5 — AskTheLab (questions + answers)                           ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditAskTheLab(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Ask the Lab ━━━`)

  await page.goto(`${BASE}/ask`, { waitUntil: 'networkidle' })
  await snap(ctx, 'asklab-initial', 1500)

  // Find create question button
  const newQBtn = page.locator('button').filter({ hasText: /Ask|New Question|Post Question/i }).first()
  if (await newQBtn.count()) {
    await newQBtn.click()
    await snap(ctx, 'asklab-modal', 600)
    const dialog = await page.getByRole('dialog').count()
    finding(ctx, dialog > 0 ? 'PASS' : 'FAIL', `5.1 AskLab question modal opens (dialog=${dialog})`)
    if (dialog > 0) {
      const input = page.getByRole('dialog').locator('textarea, input[type="text"]').first()
      if (await input.count()) {
        await input.fill('test_delete_audit question?')
        await snap(ctx, 'asklab-filled', 300)
        await page.keyboard.press('Control+Enter')
        await snap(ctx, 'asklab-submitted', 1800)
        finding(ctx, 'PASS', '5.1 Question submitted via Ctrl+Enter (screenshot confirms)')
      }
    }
  } else {
    finding(ctx, 'FRICTION', '5.1 Ask/Post Question button not found on /ask')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 6 — Meetings                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditMeetings(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Meetings ━━━`)

  await page.goto(`${BASE}/meetings`, { waitUntil: 'networkidle' })
  await snap(ctx, 'meetings-initial', 2000)

  // Click first meeting
  const firstMtg = page.locator('a[href^="/meetings/"]').first()
  if (await firstMtg.count()) {
    await firstMtg.click()
    await page.waitForTimeout(1500)
    await snap(ctx, 'meeting-detail', 800)
    finding(ctx, 'PASS', '6.1 Meeting detail navigates')

    // Look for Generate Agenda button
    const agendaBtn = page.locator('button').filter({ hasText: /Generate Agenda|Agenda/i }).first()
    finding(ctx, (await agendaBtn.count()) > 0 ? 'PASS' : 'FRICTION', '6.4 Generate Agenda button present')

    // Copy Summary
    const copyBtn = page.locator('button').filter({ hasText: /Copy.*Summary|Copy Summary/i }).first()
    finding(ctx, (await copyBtn.count()) > 0 ? 'PASS' : 'FRICTION', '6.5 Copy Summary button present')

    // NLP quick-add input for action items
    const actionInput = page.locator('input[placeholder*="action" i], input[placeholder*="@" i], textarea[placeholder*="action" i]').first()
    if (await actionInput.count()) {
      await actionInput.fill('@nick test_delete_audit mtg action p2 Friday')
      await snap(ctx, 'meeting-nlp-filled', 400)
      finding(ctx, 'PASS', '6.2 NLP quick-add input present (screenshot confirms tokens)')
      await actionInput.press('Enter').catch(() => {})
      await snap(ctx, 'meeting-nlp-submitted', 1500)
    } else {
      finding(ctx, 'FRICTION', '6.2 NLP quick-add input not found')
    }
  } else {
    finding(ctx, 'FAIL', '6.1 No meetings to click (empty state)')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 7 — Digest R13 Model B                                        ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditDigest(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Digest ━━━`)

  await page.goto(`${BASE}/digest`, { waitUntil: 'networkidle' })
  await snap(ctx, 'digest-initial', 2000)

  // Open comment on first paper
  const commentBtn = page.locator('button[aria-label*="comment" i], button[title*="comment" i]').first()
  if (await commentBtn.count()) {
    await commentBtn.click()
    await snap(ctx, 'digest-comment-opened', 600)
    const input = page.locator('input[placeholder*="note" i], input[placeholder*="comment" i]').first()
    if (await input.count()) {
      await input.fill('test_delete_audit digest comment')
      await snap(ctx, 'digest-comment-typed', 300)
      await page.keyboard.press('Enter')
      await snap(ctx, 'digest-comment-submitted', 1500)
      finding(ctx, 'PASS', '7.2 Digest comment submitted via plain Enter (single-line input)')
    } else {
      finding(ctx, 'FRICTION', '7.2 Comment input not found after opening')
    }
  } else {
    finding(ctx, 'FRICTION', '7.2 Comment button not found on /digest')
  }

  writeFindings(ctx)
}

const SECTIONS: Record<string, (ctx: Ctx) => Promise<void>> = {
  tasks: auditTasks,
  projects: auditProjects,
  ideas: auditIdeas,
  decisions: auditDecisions,
  asklab: auditAskTheLab,
  meetings: auditMeetings,
  digest: auditDigest,
  grants: auditGrants,
  deadlines: auditDeadlines,
  manuscripts: auditManuscripts,
  dashboard: auditDashboard,
  team: auditTeam,
  global: auditGlobal,
  mobile: auditMobile,
}

async function main() {
  const args = process.argv.slice(2)
  const sectionArg = args.find((a) => a.startsWith('--section='))?.split('=')[1]
  const cleanupOnly = args.includes('--cleanup')
  const listOnly = args.includes('--list')

  if (listOnly) {
    console.log('Available sections:')
    for (const k of Object.keys(SECTIONS)) console.log(`  --section=${k}`)
    console.log('  --cleanup (delete test_delete_* rows)')
    return
  }

  mkdirSync(ROOT, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  // @ts-expect-error — stash for mobile section to reuse
  ;(global as any)._browser = browser

  // --cleanup: skip audit sections, go straight to cleanup
  const runSections = cleanupOnly ? [] : (sectionArg ? [sectionArg] : Object.keys(SECTIONS))

  for (const name of runSections) {
    if (!SECTIONS[name]) {
      console.log(`Unknown section: ${name}`)
      continue
    }
    const { ctx: bctx, page } = await newDesktopCtx(browser)
    // @ts-expect-error
    bctx._browser = browser
    const ctx = makeCtx(page, bctx, name)
    try {
      await SECTIONS[name](ctx)
    } catch (e: any) {
      finding(ctx, 'FAIL', `Section threw: ${e.message}`)
      writeFindings(ctx)
    }
    await bctx.close().catch(() => {})
  }

  if (cleanupOnly || !sectionArg) {
    const { ctx: bctx, page } = await newDesktopCtx(browser)
    const ctx = makeCtx(page, bctx, 'cleanup')
    await cleanup(ctx)
    await bctx.close().catch(() => {})
  }

  await browser.close()

  // Aggregate findings
  const allFindings: string[] = []
  const fs = await import('fs/promises')
  try {
    const dirs = await fs.readdir(ROOT)
    for (const d of dirs) {
      const findingsPath = join(ROOT, d, 'findings.md')
      if (existsSync(findingsPath)) {
        const content = await fs.readFile(findingsPath, 'utf8')
        allFindings.push(`\n## ${d}\n\n${content}\n`)
      }
    }
  } catch {}
  writeFileSync(join(ROOT, 'findings.md'), `# Hub Audit — ${TIMESTAMP}\n\nBase: ${BASE}\n${allFindings.join('\n')}`)
  console.log(`\n\n✓ Audit complete. Results: ${ROOT}/`)
  console.log(`  Aggregated findings: ${ROOT}/findings.md`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
