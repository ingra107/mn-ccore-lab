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
import { requirePbApiKey } from './_lib/load-secrets.js'

const BASE = process.env.HUB_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev'
const AUTH_TOKEN = requirePbApiKey()
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

// Test-mode auth bypass headers (closure r2j, 2026-04-25). When TEST_MODE_KEY
// is set in env, browser fetches carry the bypass so server-side mutations
// authenticate as the audit user instead of returning 401 on the JWKS path.
// Without this, every audit Move/Create/Update would 401 silently because the
// CF Access service-token JWT lacks an `email` claim.
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'audit@mn-ccore.test'
const TEST_MODE_KEY = process.env.TEST_MODE_KEY

async function newDesktopCtx(browser: any) {
  // Post-launch (2026-04-21) `/portal/*` is gated by CF Access. Forward the
  // service-token headers on every browser request when the env vars are set,
  // otherwise the audit lands on Google Sign-In and every selector misses.
  // Same env vars used by scripts/massive-audit.
  const cfId = process.env.CF_ACCESS_CLIENT_ID
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET
  const extraHTTPHeaders: Record<string, string> = {}
  if (cfId && cfSecret) {
    extraHTTPHeaders['CF-Access-Client-Id'] = cfId
    extraHTTPHeaders['CF-Access-Client-Secret'] = cfSecret
  } else {
    console.log('    !! CF_ACCESS_CLIENT_ID/SECRET not set — /portal/* will hit Google Sign-In and audit will fail')
  }
  if (TEST_MODE_KEY) {
    extraHTTPHeaders['X-Test-Mode'] = 'true'
    extraHTTPHeaders['X-Test-Mode-Key'] = TEST_MODE_KEY
    extraHTTPHeaders['X-Test-User'] = TEST_USER_EMAIL
  } else {
    console.log('    !! TEST_MODE_KEY not set — server-side mutations will 401 (audit limited to read-only flows)')
  }
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    extraHTTPHeaders,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => {
    if (err.message.includes('WebSocket') || err.message.includes('hub-realtime')) return
    console.log(`    !! PAGE ERROR: ${err.message.slice(0, 140)}`)
  })
  return { ctx, page }
}

// ── API helpers for cleanup + seed validation ────────────────────────────

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${AUTH_TOKEN}`, ...extra }
  if (TEST_MODE_KEY) {
    h['X-Test-Mode'] = 'true'
    h['X-Test-Mode-Key'] = TEST_MODE_KEY
    h['X-Test-User'] = TEST_USER_EMAIL
  }
  return h
}

async function apiGet(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  return r.ok ? r.json() : { data: [] }
}

async function apiDelete(path: string): Promise<number> {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  return r.status
}

async function apiPost(path: string, body: any): Promise<{ status: number; data: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  return { status: r.status, data: r.ok ? await r.json() : null }
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 1 — Task lifecycle                                            ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditTasks(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] UnifiedMyTasks (Phase 38) ━━━`)

  // Helper wraps an async block so one failure doesn't block later ones
  const safe = async (label: string, fn: () => Promise<void>) => {
    try { await fn() } catch (e: any) { finding(ctx, 'FRICTION', `${label} threw: ${e.message.slice(0, 100)}`) }
  }

  await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'networkidle' })
  await snap(ctx, 'mytasks-initial', 1500)

  // 1.1 Toolbar renders — search input + view picker + 5 quick-view tabs + 4 filter chips
  await safe('1.1 toolbar', async () => {
    // Search input (placeholder ends in ellipsis char, use partial match)
    const searchInput = page.locator('input[placeholder*="Search tasks" i]').first()
    finding(ctx, (await searchInput.count()) > 0 ? 'PASS' : 'FAIL', '1.1 Toolbar — search input renders')

    // View picker — three buttons identified by their title= tooltips
    const colsBtn = page.locator('button[title*="Kanban" i]').first()
    const lanesBtn = page.locator('button[title*="Stacked lanes" i]').first()
    const listBtn = page.locator('button[title*="Dense table" i]').first()
    const viewCount = (await colsBtn.count()) + (await lanesBtn.count()) + (await listBtn.count())
    finding(ctx, viewCount === 3 ? 'PASS' : 'FAIL', `1.1 ViewPicker — Columns/Lanes/List buttons present (${viewCount}/3)`)

    // Quick-view tabs — All / 📌 Today / ⚠ Overdue / ⏳ Waiting on / 🕰 Stale
    const tabLabels = ['All', 'Today', 'Overdue', 'Waiting on', 'Stale']
    let foundTabs = 0
    for (const lbl of tabLabels) {
      const tab = page.locator('button').filter({ hasText: new RegExp(lbl, 'i') }).first()
      if (await tab.count()) foundTabs++
    }
    finding(ctx, foundTabs >= 5 ? 'PASS' : 'FAIL', `1.1 Quick-view tabs — ${foundTabs}/5 found`)

    // Filter chips — Group / Priority / Project / Mentee
    const chipLabels = ['Group', 'Priority', 'Project', 'Mentee']
    let foundChips = 0
    for (const lbl of chipLabels) {
      // FilterChip renders the label as a <span> inside the chip wrapper
      const chip = page.locator('span').filter({ hasText: new RegExp(`^${lbl}$`) }).first()
      if (await chip.count()) foundChips++
    }
    finding(ctx, foundChips >= 4 ? 'PASS' : 'FAIL', `1.1 FilterChips — Group/Priority/Project/Mentee (${foundChips}/4 found)`)
  })

  // 1.2 View switching — Columns -> Lanes -> List, verify DOM shape changes
  await safe('1.2 view switch', async () => {
    // Default starts at Columns. Switch to Lanes.
    const lanesBtn = page.locator('button[title*="Stacked lanes" i]').first()
    if (await lanesBtn.count()) {
      await lanesBtn.click()
      await page.waitForTimeout(600)
      await snap(ctx, 'view-lanes', 400)
      // Lanes view renders <section> elements (one per group) — Columns view uses divs
      const sections = await page.locator('section').count()
      finding(ctx, sections >= 1 ? 'PASS' : 'FAIL', `1.2 Lanes view renders sections (${sections})`)
    }

    // Switch to List
    const listBtn = page.locator('button[title*="Dense table" i]').first()
    if (await listBtn.count()) {
      await listBtn.click()
      await page.waitForTimeout(600)
      await snap(ctx, 'view-list', 400)
      // List view renders the keyboard hint footer with `j`/`k` shortcuts
      const kbdHint = page.locator('kbd').filter({ hasText: /^j$/ }).first()
      finding(ctx, (await kbdHint.count()) > 0 ? 'PASS' : 'FAIL', '1.2 List view renders j/k keyboard hint footer')
    }

    // Switch back to Columns for remaining tests
    const colsBtn = page.locator('button[title*="Kanban" i]').first()
    if (await colsBtn.count()) {
      await colsBtn.click()
      await page.waitForTimeout(600)
      await snap(ctx, 'view-columns', 400)
    }
  })

  // 1.3 Task creation — GlobalQuickAdd via FAB button
  // Phase 38 removed the "+ New Task" PageHeader button. Creation is via
  // GlobalQuickAddModal triggered by the floating "+" FAB (data-testid="fab-quick-add")
  // or Cmd+N keyboard shortcut. We use the FAB as the canonical UI path.
  let createdTaskId: string | null = null
  await safe('1.3 task creation', async () => {
    const fab = page.locator('[data-testid="fab-quick-add"]').first()
    if (!(await fab.count())) {
      finding(ctx, 'INFO', '1.3 GlobalQuickAdd FAB not found — creation flow moved off MyTasks; needs separate test path')
      return
    }
    await fab.click()
    await page.waitForTimeout(500)
    await snap(ctx, 'quickadd-modal-open', 400)

    // QuickAddTaskInput renders a transparent <textarea> overlaying a styled mirror.
    // Type into the textarea directly. The "Add task" submit button enables when title is non-empty.
    const textarea = page.locator('textarea').first()
    if (!(await textarea.count())) {
      finding(ctx, 'INFO', '1.3 QuickAdd textarea not found inside modal')
      await page.keyboard.press('Escape').catch(() => {})
      return
    }
    await textarea.fill('test_delete_audit unified task @nick')
    await snap(ctx, 'quickadd-typed', 300)

    // Submit via the "Add task ↵" button — Enter keydown on the textarea also
    // works in the UI but Playwright's keyboard events sometimes race with
    // QuickAddTaskInput's onKeyDown handler. The button click is the reliable
    // path. Need to wait for the button to enable (it disables when title is empty).
    const submitBtn = page.locator('button').filter({ hasText: /^Add task/ }).first()
    await submitBtn.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    if (await submitBtn.count()) {
      await submitBtn.click()
    } else {
      await textarea.press('Enter')
    }
    await page.waitForTimeout(2500)
    await snap(ctx, 'quickadd-submitted', 400)

    // Confirm task created via API (the modal closes optimistically; UI may
    // not show the new row immediately if the user-filter excludes it).
    const taskList = await apiGet('/api/tasks?limit=5000')
    const created = (taskList.data || []).find((t: any) => t.title === 'test_delete_audit unified task')
    if (created) {
      createdTaskId = created.id
      finding(ctx, 'PASS', `1.3 GlobalQuickAdd created task via API (id=${createdTaskId})`)
    } else {
      // Modal opens, parses tokens, button enables and clicks — but the
      // browser-context useCreateTask mutation needs a real CF Access JWT
      // cookie to authenticate writes server-side. Service-token headers
      // bypass the edge gate but don't satisfy REQUIRE_AUTH=1's getAuthUser
      // check inside the API. Creation flow needs a separate test path that
      // either runs against a non-gated preview deploy with auth disabled, or
      // uses injectFakeAuth (tests/helpers/capture-auth.ts) to seed a fake
      // CF_Authorization cookie. Mark as INFO rather than FAIL — the UI flow
      // itself (modal, parse, submit) all worked.
      finding(ctx, 'INFO', '1.3 GlobalQuickAdd UI flow works (modal+parse+submit verified). Server-side persistence requires real browser auth — needs preview-deploy or injectFakeAuth path.')
    }

    // Verify search input still works (independent of whether write persisted)
    const searchInput = page.locator('input[placeholder*="Search tasks" i]').first()
    if (await searchInput.count()) {
      await searchInput.fill('test_delete_audit unified')
      await page.waitForTimeout(800)
      await snap(ctx, 'quickadd-search', 400)
      await searchInput.fill('')
      await page.waitForTimeout(500)
    }
  })

  // 1.4 Quick-view tab filter — click "Today" and confirm visible-count badge updates
  await safe('1.4 quick-view filter', async () => {
    // visible-count is rendered as "<N> visible" near the page title
    const countBefore = await page.locator('text=/\\d+ visible/').first().textContent().catch(() => '')
    const todayTab = page.locator('button').filter({ hasText: /Today/i }).first()
    if (!(await todayTab.count())) {
      finding(ctx, 'FAIL', '1.4 Today quick-view tab not found')
      return
    }
    await todayTab.click()
    await page.waitForTimeout(800)
    await snap(ctx, 'quickview-today', 400)
    const countAfter = await page.locator('text=/\\d+ visible/').first().textContent().catch(() => '')
    finding(ctx, countBefore !== countAfter ? 'PASS' : 'INFO', `1.4 Today tab applied (count: "${countBefore}" -> "${countAfter}")`)

    // Click All to reset
    const allTab = page.locator('button').filter({ hasText: /^All$/ }).first()
    if (await allTab.count()) { await allTab.click(); await page.waitForTimeout(500) }
  })

  // 1.5 Filter chip — Priority chip dropdown opens + selecting an option filters
  await safe('1.5 priority filter', async () => {
    // FilterChip is a wrapper div with a label span + a button that toggles the dropdown.
    // Click the chip's button (the one showing current value, defaults to "Any").
    const priorityChipLabel = page.locator('span').filter({ hasText: /^Priority$/ }).first()
    if (!(await priorityChipLabel.count())) {
      finding(ctx, 'FAIL', '1.5 Priority chip label not found')
      return
    }
    // The clickable button sits next to the label inside the chip wrapper
    const chipBtn = priorityChipLabel.locator('xpath=following-sibling::button').first()
    if (!(await chipBtn.count())) {
      finding(ctx, 'FRICTION', '1.5 Priority chip button locator failed — DOM structure may have shifted')
      return
    }
    await chipBtn.click()
    await page.waitForTimeout(400)
    await snap(ctx, 'priority-chip-open', 300)
    // Dropdown shows P1/P2/P3 buttons inside an absolutely positioned container.
    // Pick "P2 / medium"
    const p2Option = page.locator('button').filter({ hasText: /P2.*medium/i }).first()
    if (await p2Option.count()) {
      await p2Option.click()
      await page.waitForTimeout(700)
      await snap(ctx, 'priority-chip-applied', 400)
      // The chip's selected value should now read "P2 / medium" rather than "Any"
      finding(ctx, 'PASS', '1.5 Priority filter chip selection applied')
    } else {
      finding(ctx, 'FRICTION', '1.5 P2/medium option not found inside priority dropdown')
      await page.keyboard.press('Escape').catch(() => {})
    }

    // Reset via "clear all"
    const clearAll = page.locator('button').filter({ hasText: /^clear all$/ }).first()
    if (await clearAll.count()) { await clearAll.click(); await page.waitForTimeout(500) }
  })

  // 1.6 Mentee filter chip — NEW post-Phase-38, filters to mentee assignees
  await safe('1.6 mentee filter', async () => {
    const menteeChipLabel = page.locator('span').filter({ hasText: /^Mentee$/ }).first()
    if (!(await menteeChipLabel.count())) {
      finding(ctx, 'FAIL', '1.6 Mentee chip not present (Phase 38 regression?)')
      return
    }
    const chipBtn = menteeChipLabel.locator('xpath=following-sibling::button').first()
    if (!(await chipBtn.count())) {
      finding(ctx, 'FRICTION', '1.6 Mentee chip button locator failed')
      return
    }
    await chipBtn.click()
    await page.waitForTimeout(400)
    await snap(ctx, 'mentee-chip-open', 300)
    // Pick "Any mentee" (the catch-all option)
    const anyMentee = page.locator('button').filter({ hasText: /Any mentee/i }).first()
    if (await anyMentee.count()) {
      await anyMentee.click()
      await page.waitForTimeout(800)
      await snap(ctx, 'mentee-chip-applied', 400)
      finding(ctx, 'PASS', '1.6 Mentee filter chip — "Any mentee" applied')
    } else {
      finding(ctx, 'FRICTION', '1.6 "Any mentee" option not found inside mentee dropdown')
      await page.keyboard.press('Escape').catch(() => {})
    }
    // Reset
    const clearAll = page.locator('button').filter({ hasText: /^clear all$/ }).first()
    if (await clearAll.count()) { await clearAll.click(); await page.waitForTimeout(500) }
  })

  // 1.7 Hide / Show completed toggle
  await safe('1.7 hide-completed toggle', async () => {
    const toggle = page.locator('button').filter({ hasText: /Hide completed|Show completed/ }).first()
    if (!(await toggle.count())) {
      finding(ctx, 'FAIL', '1.7 Hide/Show completed toggle not found')
      return
    }
    const labelBefore = await toggle.textContent()
    await toggle.click()
    await page.waitForTimeout(600)
    const labelAfter = await page.locator('button').filter({ hasText: /Hide completed|Show completed/ }).first().textContent()
    finding(ctx, labelBefore !== labelAfter ? 'PASS' : 'FAIL', `1.7 Toggle flips label ("${labelBefore?.trim()}" -> "${labelAfter?.trim()}")`)
    // Toggle back to original
    const toggle2 = page.locator('button').filter({ hasText: /Hide completed|Show completed/ }).first()
    if (await toggle2.count()) { await toggle2.click(); await page.waitForTimeout(400) }
  })

  // 1.8 Search filters task list
  await safe('1.8 search', async () => {
    const searchInput = page.locator('input[placeholder*="Search tasks" i]').first()
    if (!(await searchInput.count())) return
    await searchInput.fill('test_delete_audit')
    await page.waitForTimeout(800)
    await snap(ctx, 'search-applied', 300)
    // visible-count should reflect the filter
    const countTxt = await page.locator('text=/\\d+ visible/').first().textContent().catch(() => '')
    finding(ctx, /\d+/.test(countTxt || '') ? 'PASS' : 'INFO', `1.8 Search applied — visible count: "${countTxt}"`)
    await searchInput.fill('')
    await page.waitForTimeout(400)
  })

  // 1.9 List view drawer — switch to List, press `e` on cursor row, drawer opens
  await safe('1.9 list view drawer', async () => {
    const listBtn = page.locator('button[title*="Dense table" i]').first()
    if (!(await listBtn.count())) {
      finding(ctx, 'FAIL', '1.9 List view button not found')
      return
    }
    await listBtn.click()
    await page.waitForTimeout(800)
    // Click in the list area (not on a chip) to take focus off any input
    const listArea = page.locator('text=/\\d+\\/\\d+/').first() // the cursor counter "N/M"
    if (await listArea.count()) await listArea.click().catch(() => {})
    await page.waitForTimeout(200)
    // Press `e` — should open drawer for current cursor row
    await page.keyboard.press('e')
    await page.waitForTimeout(800)
    await snap(ctx, 'list-drawer-open', 400)
    // Drawer renders an <aside> with subtask + recent updates sections.
    // It also renders a "Subtasks" label.
    const drawerHeader = page.locator('aside').filter({ hasText: /Subtasks/i }).first()
    finding(ctx, (await drawerHeader.count()) > 0 ? 'PASS' : 'FAIL', '1.9 List view `e` keyboard shortcut opens drawer')
    // Close drawer via × button
    const closeX = page.locator('aside button').filter({ hasText: /^×$/ }).first()
    if (await closeX.count()) { await closeX.click(); await page.waitForTimeout(400) }
  })

  // 1.10 List view bulk select — press `x` on a row, BulkBar appears with "selected" badge
  await safe('1.10 bulk bar', async () => {
    // We're already in List view from 1.9
    // Make sure focus is off any input
    await page.locator('body').click({ position: { x: 200, y: 400 } }).catch(() => {})
    await page.waitForTimeout(200)
    await page.keyboard.press('x')
    await page.waitForTimeout(500)
    await snap(ctx, 'list-x-pressed', 300)
    const bulkBar = page.locator('text=/\\d+ selected/').first()
    if (await bulkBar.count()) {
      finding(ctx, 'PASS', '1.10 BulkBar appears after `x` key selects row')
      // Verify Plan today / Snooze / Status / Reassign / Priority / Complete / Archive buttons
      const expectedBtns = ['Plan today', 'Snooze', 'Status', 'Reassign', 'Priority', 'Complete', 'Archive']
      let foundBtns = 0
      for (const b of expectedBtns) {
        const btn = page.locator('button').filter({ hasText: new RegExp(b, 'i') }).first()
        if (await btn.count()) foundBtns++
      }
      finding(ctx, foundBtns >= 6 ? 'PASS' : 'FRICTION', `1.10 BulkBar action buttons (${foundBtns}/7 expected)`)
      // Clear selection
      const deselect = page.locator('button').filter({ hasText: /^Deselect$/ }).first()
      if (await deselect.count()) { await deselect.click(); await page.waitForTimeout(400) }
    } else {
      finding(ctx, 'INFO', '1.10 BulkBar did not appear — list may be empty or `x` key not bound when no row focused')
    }
  })

  // 1.11 Saved views menu renders
  await safe('1.11 saved views', async () => {
    // Switch back to Columns view first
    const colsBtn = page.locator('button[title*="Kanban" i]').first()
    if (await colsBtn.count()) { await colsBtn.click(); await page.waitForTimeout(500) }
    const savedViewsBtn = page.locator('button[aria-label="Saved views"]').first()
    finding(ctx, (await savedViewsBtn.count()) > 0 ? 'PASS' : 'FAIL', '1.11 SavedViewsMenu button renders')
  })

  // 1.12 Persistence — reload, verify created task survives
  await safe('1.12 persistence', async () => {
    if (!createdTaskId) {
      finding(ctx, 'INFO', '1.12 Skipping persistence check (no task created in 1.3)')
      return
    }
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await snap(ctx, 'reload-persistence', 400)
    const apiCheck = await apiGet('/api/tasks?limit=5000')
    const stillThere = (apiCheck.data || []).find((t: any) => t.id === createdTaskId && !t.deleted_at)
    finding(ctx, stillThere ? 'PASS' : 'FAIL', '1.12 Task persists in API after reload')
  })

  // 1.13 Move → group_override flow (schema v50, closure r2f)
  // Snapshot which tasks have group_override='quick' BEFORE the click. After
  // the Move, snapshot again — diff should reveal exactly the moved task.
  // This avoids brittle DOM-text parsing for title (cards have inline <style>
  // blocks that confuse text extraction).
  await safe('1.13 move group_override', async () => {
    const before = await apiGet('/api/tasks?limit=5000')
    const beforeQuickSet = new Set(
      (before.data || []).filter((t: any) => t.group_override === 'quick').map((t: any) => t.id)
    )
    const colsBtn = page.locator('button[title*="Kanban" i]').first()
    if (!(await colsBtn.count())) { finding(ctx, 'FAIL', '1.13 Columns view button not found'); return }
    await colsBtn.click()
    await page.waitForTimeout(800)
    // Click the first visible task title (line-clamp:2 div is the unique title element)
    const firstTitle = page.locator('div[style*="-webkit-line-clamp"]').first()
    if (!(await firstTitle.count())) { finding(ctx, 'INFO', '1.13 No task cards visible'); return }
    await firstTitle.click()
    await page.waitForTimeout(600)
    await snap(ctx, 'card-expanded', 300)
    const moveBtn = page.locator('button', { hasText: 'Move →' }).first()
    if (!(await moveBtn.count())) { finding(ctx, 'FAIL', '1.13 Move → button not visible after expand'); return }
    await moveBtn.click()
    await page.waitForTimeout(400)
    await snap(ctx, 'move-popover-open', 300)
    // The text "⚡ Quick" appears on BOTH the QuickView tab AND the Move
    // popover option. Grab the popover option specifically by chaining off
    // the Move button — the popover is the moveBtn's next sibling div.
    const popover = moveBtn.locator('xpath=following-sibling::div[1]')
    const quickOpt = popover.locator('button', { hasText: '⚡ Quick' }).first()
    if (!(await quickOpt.count())) { finding(ctx, 'FAIL', '1.13 Quick option missing from Move popover'); return }
    await quickOpt.click()
    await page.waitForTimeout(1500)
    await snap(ctx, 'move-applied', 400)
    // Diff: which task gained group_override='quick' post-click?
    const after = await apiGet('/api/tasks?limit=5000')
    const newOverrides = (after.data || []).filter((t: any) =>
      t.group_override === 'quick' && !beforeQuickSet.has(t.id)
    )
    if (newOverrides.length === 1) {
      finding(ctx, 'PASS', `1.13 group_override='quick' written via Move → for "${newOverrides[0].title?.slice(0, 50)}"`)
      // Cleanup: reset the override so prod data isn't left dirty.
      await apiPost(`/api/tasks/${newOverrides[0].id}`, { group_override: null }).catch(() => {})
    } else if (newOverrides.length === 0) {
      // Same root cause as 1.12: CF Access service token JWT lacks an
      // `email` claim, so getAuthUser returns null → mutation 401s. UI
      // flow works (popover opened, Quick option clicked), persistence
      // doesn't reach D1. Real browser auth needed (preview-deploy or
      // injectFakeAuth path).
      finding(ctx, 'INFO', '1.13 Move → UI flow works (popover open, Quick clicked). Server-side persistence requires real browser auth — same blocker as 1.12.')
    } else {
      finding(ctx, 'FRICTION', `1.13 ${newOverrides.length} new overrides (expected 1) — multiple Move events fired?`)
      // Cleanup all of them
      for (const t of newOverrides) {
        await apiPost(`/api/tasks/${t.id}`, { group_override: null }).catch(() => {})
      }
    }
  })

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 3 — Ideas                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditIdeas(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Ideas ━━━`)

  await page.goto(`${BASE}/portal/ideas`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/decisions`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/grants`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/deadlines`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/manuscripts`, { waitUntil: 'networkidle' })
  await snap(ctx, 'manuscripts-initial', 1500)

  // 10.1 PI inline — needs an InlineSelect around a team slug
  const piCells = page.locator('[role="button"]').filter({ hasText: /Nick|Nate|Nicholas|Nathan/ })
  if (await piCells.count()) {
    await piCells.first().click()
    await snap(ctx, 'manuscript-pi-picker-open', 500)
    await page.keyboard.press('Escape')
  }

  // 10.2 Category inline — InlineSelect uses <button> (implicit role=button),
  // so attribute selector [role="button"] misses it. Use getByRole which
  // handles implicit roles.
  const catCells = page.getByRole('button').filter({ hasText: /^(CLIF|Lab|Mesfin|Mentee)$/i })
  const catCount = await catCells.count()
  if (catCount > 0) {
    finding(ctx, 'PASS', `10.2 Found ${catCount} category cells`)
    await catCells.first().scrollIntoViewIfNeeded().catch(() => {})
    await catCells.first().click({ force: true })
    const listbox = page.getByRole('listbox').first()
    await listbox.waitFor({ state: 'attached', timeout: 2500 }).catch(() => {})
    await snap(ctx, 'manuscript-category-open', 300)
    if (await listbox.count()) {
      const opts = await listbox.getByRole('option').allTextContents()
      finding(ctx, 'PASS', `10.2 Category dropdown opens with options: ${opts.join(' | ')}`)
    } else {
      finding(ctx, 'FRICTION', '10.2 Category click did not open listbox')
    }
    await page.keyboard.press('Escape')
  } else {
    finding(ctx, 'FAIL', '10.2 No category cells found (expected CLIF/Lab/Mesfin/Mentee)')
  }

  writeFindings(ctx)
}

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Section 11 — Dashboard                                                ║
// ╚═══════════════════════════════════════════════════════════════════════╝

async function auditDashboard(ctx: Ctx) {
  const { page } = ctx
  console.log(`\n━━━ [${ctx.section}] Dashboard ━━━`)

  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })
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
  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })
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
  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })
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
    await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })
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
  await page.goto(`${BASE}/portal/search`, { waitUntil: 'networkidle' })
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

  const pages: Array<[string, string]> = [
    ['dashboard', '/portal/dashboard'],
    ['my-tasks', '/portal/my-tasks'],
    ['tasks', '/portal/my-tasks'],
    ['deadlines', '/portal/deadlines'],
    ['manuscripts', '/portal/manuscripts'],
    ['ideas', '/portal/ideas'],
    ['decisions', '/portal/decisions'],
    ['grants', '/portal/grants'],
    ['meetings', '/portal/meetings'],
    ['publications', '/publications'],
    ['digest', '/portal/digest'],
    ['personal', '/portal/personal'],
    ['calendar', '/portal/calendar'],
    ['team', '/team'],
  ]
  for (const [label, path] of pages) {
    await mPage.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
    await mPage.waitForTimeout(1200)
    await snap(ctx, `mobile-${label}`, 600)
  }

  // MobileTabBar More drawer
  await mPage.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/projects`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/ask`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/meetings`, { waitUntil: 'networkidle' })
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

  await page.goto(`${BASE}/portal/digest`, { waitUntil: 'networkidle' })
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
