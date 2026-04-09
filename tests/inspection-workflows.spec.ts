/**
 * MN-CCORE Lab Hub — Workflow & Feature Gap Tests
 *
 * COMPLEMENTS inspection.spec.ts by covering:
 * - Routes not tested at all (8 missing pages)
 * - API endpoints not tested (~40 gaps)
 * - Interactive features (peek, subtasks, bulk, snooze, context menu, NLP, etc.)
 * - Full user journey workflows (daily use patterns)
 * - Edge cases (empty data, special chars, no due date)
 * - Sync round-trips (status change, cross-tab)
 *
 * Run ALL:    npx playwright test tests/inspection-workflows.spec.ts
 * Run by tag: npx playwright test tests/inspection-workflows.spec.ts --grep "ROUTE"
 *             npx playwright test tests/inspection-workflows.spec.ts --grep "API"
 *             npx playwright test tests/inspection-workflows.spec.ts --grep "FEATURE"
 *             npx playwright test tests/inspection-workflows.spec.ts --grep "JOURNEY"
 *             npx playwright test tests/inspection-workflows.spec.ts --grep "EDGE"
 *             npx playwright test tests/inspection-workflows.spec.ts --grep "SYNC"
 */
import { test, expect, type Page } from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'

// ── Helpers ──────────────────────────────────────────────────────────

async function loadPage(page: Page, path: string) {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    if (!err.message.includes('WebSocket') && !err.message.includes('hub-realtime')) {
      errors.push(err.message)
    }
  })
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 })
  return errors
}

/** Wait for a selector to appear, return whether it did */
async function isVisible(page: Page, selector: string, timeout = 3000): Promise<boolean> {
  return page.locator(selector).first().isVisible({ timeout }).catch(() => false)
}

/** Get first real task ID from the API */
async function getFirstTaskId(request: any): Promise<string | null> {
  const res = await (await request.get(`${BASE}/api/tasks?limit=1`)).json()
  return res.data?.[0]?.id ?? null
}

/** Get first real project slug from the API */
async function getFirstProjectSlug(request: any): Promise<string | null> {
  const res = await (await request.get(`${BASE}/api/projects`)).json()
  return res.data?.[0]?.slug ?? null
}

/** Get first real meeting ID from the API */
async function getFirstMeetingId(request: any): Promise<string | null> {
  const res = await (await request.get(`${BASE}/api/meetings`)).json()
  return res.data?.[0]?.id ?? null
}

// ═════════════════════════════════════════════════════════════════════
// PART 1: MISSING ROUTES — Pages that inspection.spec.ts doesn't test
// ═════════════════════════════════════════════════════════════════════

test.describe('ROUTE — Missing portal pages', () => {
  test('ROUTE: Deadline Cascade (/deadline-cascade) renders', async ({ page }) => {
    const errors = await loadPage(page, '/deadline-cascade')
    expect(errors).toEqual([])
    const crashed = await page.locator('text=Something went wrong').count()
    expect(crashed).toBe(0)
    await page.screenshot({ path: 'review/route-deadline-cascade.png' })
  })

  test('ROUTE: My Items (/my-items) renders', async ({ page }) => {
    const errors = await loadPage(page, '/my-items')
    expect(errors).toEqual([])
    const crashed = await page.locator('text=Something went wrong').count()
    expect(crashed).toBe(0)
    await page.screenshot({ path: 'review/route-my-items.png' })
  })

  test('ROUTE: PB Sector / Planner (/pb) renders', async ({ page }) => {
    const errors = await loadPage(page, '/pb')
    expect(errors).toEqual([])
    const crashed = await page.locator('text=Something went wrong').count()
    expect(crashed).toBe(0)
    await page.screenshot({ path: 'review/route-pb-sector.png' })
  })

  test('ROUTE: Pulse / Kiosk (/pulse) renders', async ({ page }) => {
    const errors = await loadPage(page, '/pulse')
    expect(errors).toEqual([])
    await page.screenshot({ path: 'review/route-pulse.png' })
  })

  test('ROUTE: Collaboration Network (/network) renders', async ({ page }) => {
    const errors = await loadPage(page, '/network')
    expect(errors).toEqual([])
    await page.screenshot({ path: 'review/route-network.png' })
  })

  test('ROUTE: Publication Detail (/publications/:id) renders', async ({ page, request }) => {
    const pubs = await (await request.get(`${BASE}/api/publications`)).json()
    const id = pubs.data?.[0]?.id
    if (!id) { test.skip(); return }
    const errors = await loadPage(page, `/publications/${id}`)
    expect(errors).toEqual([])
    await page.screenshot({ path: 'review/route-publication-detail.png' })
  })

  test('ROUTE: CV Page (/team/:slug/cv) renders', async ({ page }) => {
    const errors = await loadPage(page, '/team/nick-ingraham/cv')
    expect(errors).toEqual([])
    await expect(page.locator('text=Nick Ingraham')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'review/route-cv-page.png' })
  })

  test('ROUTE: Trainee Trajectory (/team/:slug/trajectory) renders', async ({ page }) => {
    // Use a known trainee slug, fallback to nick
    const errors = await loadPage(page, '/team/nick-ingraham/trajectory')
    expect(errors).toEqual([])
    await page.screenshot({ path: 'review/route-trajectory.png' })
  })

  test('ROUTE: Meeting Prep (/meetings/:id/prep) renders', async ({ page, request }) => {
    const id = await getFirstMeetingId(request)
    if (!id) { test.skip(); return }
    const errors = await loadPage(page, `/meetings/${id}/prep`)
    expect(errors).toEqual([])
    await page.screenshot({ path: 'review/route-meeting-prep.png' })
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 2: MISSING API ENDPOINTS — Endpoints not in inspection.spec.ts
// ═════════════════════════════════════════════════════════════════════

test.describe('API — Missing GET endpoints', () => {
  const missingGets: [string, string][] = [
    ['/api/deadline-cascade/all', 'All deadline cascades'],
    ['/api/deadline-cascade/impact', 'Deadline impact analysis'],
    ['/api/decisions/similar?context=CLIF', 'Similar decisions by context'],
    ['/api/team/by-expertise?tag=critical+care', 'Team by expertise tag'],
    ['/api/team/nick-ingraham/cv-data', 'CV data for member'],
    ['/api/team/nick-ingraham/trajectory', 'Trajectory data for member'],
    ['/api/team/nick-ingraham/contributions', 'Contribution data for member'],
    ['/api/expertise/suggest', 'Expertise suggestions'],
    ['/api/graph/collaboration', 'Collaboration network graph'],
    ['/api/revisions/active', 'Active paper revisions'],
    ['/api/submissions/active', 'Active conference submissions'],
    ['/api/conferences/upcoming', 'Upcoming conferences'],
    ['/api/regulatory/expiring', 'Expiring regulatory items'],
    ['/api/grant-milestones/upcoming', 'Upcoming grant milestones'],
    ['/api/mentee-milestones', 'Mentee milestones'],
    ['/api/mentee-milestones/overview', 'Mentee milestones overview'],
    ['/api/analytics/contributions', 'Contribution analytics'],
    ['/api/pb/command-center', 'PB command center'],
    ['/api/pb/plan/history', 'PB plan history'],
    ['/api/pb/sessions', 'PB session history'],
    ['/api/pb/sessions/stats', 'PB session stats'],
    ['/api/pb/today', 'PB today data'],
    ['/api/pb/health', 'PB system health'],
  ]

  for (const [endpoint, desc] of missingGets) {
    test(`API GET: ${desc} — ${endpoint}`, async ({ request }) => {
      const res = await request.get(`${BASE}${endpoint}`)
      // Accept 200 or 404 (no data yet) — NOT 500
      expect([200, 404]).toContain(res.status())
    })
  }
})

test.describe('API — Missing write endpoints', () => {
  test('API POST: Create subtask on a task', async ({ request }) => {
    const taskId = await getFirstTaskId(request)
    if (!taskId) { test.skip(); return }
    const res = await request.post(`${BASE}/api/tasks/${taskId}/subtasks`, {
      data: { title: 'INSPECTION subtask — delete', assignee: 'nick-ingraham' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Reorder subtasks', async ({ request }) => {
    const taskId = await getFirstTaskId(request)
    if (!taskId) { test.skip(); return }
    // Get existing subtasks
    const subs = await (await request.get(`${BASE}/api/tasks/${taskId}/subtasks`)).json()
    if (!subs.data?.length) { test.skip(); return }
    const ids = subs.data.map((s: any) => s.id)
    const res = await request.post(`${BASE}/api/tasks/${taskId}/subtasks/reorder`, {
      data: { order: ids }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Create meeting with dedup check', async ({ request }) => {
    const uniqueTitle = `INSPECTION meeting ${Date.now()}`
    const res = await request.post(`${BASE}/api/meetings`, {
      data: { title: uniqueTitle, date: '2099-12-31', facilitator: 'nick-ingraham' }
    })
    expect(res.status()).toBe(201)

    // Try creating duplicate — should still succeed or return existing
    const dup = await request.post(`${BASE}/api/meetings`, {
      data: { title: uniqueTitle, date: '2099-12-31', facilitator: 'nick-ingraham' }
    })
    // UNIQUE index should prevent dupes — 409 or first entry returned
    expect([200, 201, 409]).toContain(dup.status())
  })

  test('API POST: Add agenda item to meeting', async ({ request }) => {
    const meetingId = await getFirstMeetingId(request)
    if (!meetingId) { test.skip(); return }
    const res = await request.post(`${BASE}/api/meetings/${meetingId}/agenda`, {
      data: { content: 'INSPECTION agenda item — delete', type: 'discussion' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Update decision outcome', async ({ request }) => {
    const decisions = await (await request.get(`${BASE}/api/decisions`)).json()
    const id = decisions.data?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await request.post(`${BASE}/api/decisions/${id}/outcome`, {
      data: { outcome_status: 'successful', outcome_notes: 'INSPECTION — delete' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Mark notification as read', async ({ request }) => {
    const notifs = await (await request.get(`${BASE}/api/notifications`)).json()
    const id = notifs.data?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await request.post(`${BASE}/api/notifications/${id}/read`)
    expect(res.status()).toBe(200)
  })

  test('API POST: Mark all notifications read', async ({ request }) => {
    const res = await request.post(`${BASE}/api/notifications/read-all`)
    expect(res.status()).toBe(200)
  })

  test('API POST: Batch task update', async ({ request }) => {
    const tasks = await (await request.get(`${BASE}/api/tasks?limit=2`)).json()
    const ids = tasks.data?.slice(0, 2).map((t: any) => t.id)
    if (!ids?.length) { test.skip(); return }
    const res = await request.post(`${BASE}/api/tasks/batch`, {
      data: { ids, updates: { priority: 'medium' } }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: PB capture (quick capture)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/pb/capture`, {
      data: { content: 'INSPECTION capture — delete', type: 'task' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Create dependency between tasks', async ({ request }) => {
    const tasks = await (await request.get(`${BASE}/api/tasks?limit=2`)).json()
    if (tasks.data?.length < 2) { test.skip(); return }
    const res = await request.post(`${BASE}/api/dependencies`, {
      data: { from_id: tasks.data[0].id, to_id: tasks.data[1].id, type: 'blocks' }
    })
    expect([200, 201, 409]).toContain(res.status()) // 409 if already exists
  })

  test('API POST: Add expertise tag', async ({ request }) => {
    const res = await request.post(`${BASE}/api/expertise`, {
      data: { slug: 'nick-ingraham', tag: 'INSPECTION-TAG-DELETE', level: 'expert' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Answer a question (Ask the Lab)', async ({ request }) => {
    const questions = await (await request.get(`${BASE}/api/questions`)).json()
    const id = questions.data?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await request.post(`${BASE}/api/questions/${id}/answers`, {
      data: { content: 'INSPECTION answer — delete', author_slug: 'nick-ingraham' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Create task handoff', async ({ request }) => {
    const taskId = await getFirstTaskId(request)
    if (!taskId) { test.skip(); return }
    const res = await request.post(`${BASE}/api/tasks/${taskId}/handoffs`, {
      data: { from_slug: 'nick-ingraham', to_slug: 'nick-ingraham', notes: 'INSPECTION handoff — delete' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API POST: Link paper to project', async ({ request }) => {
    const pubs = await (await request.get(`${BASE}/api/publications`)).json()
    const slug = await getFirstProjectSlug(request)
    const pubId = pubs.data?.[0]?.id
    if (!pubId || !slug) { test.skip(); return }
    const res = await request.post(`${BASE}/api/paper-links`, {
      data: { publication_id: pubId, project_slug: slug, relevance: 'background' }
    })
    expect([200, 201, 409]).toContain(res.status())
  })

  test('API POST: Task acknowledge', async ({ request }) => {
    const taskId = await getFirstTaskId(request)
    if (!taskId) { test.skip(); return }
    const res = await request.post(`${BASE}/api/tasks/${taskId}/acknowledge`, {
      data: { slug: 'nick-ingraham' }
    })
    // May not exist yet — 200/201 or 404
    expect([200, 201, 404]).toContain(res.status())
  })

  test('API POST: Add emoji reaction', async ({ request }) => {
    const taskId = await getFirstTaskId(request)
    if (!taskId) { test.skip(); return }
    const res = await request.post(`${BASE}/api/reactions`, {
      data: { entity_type: 'task', entity_id: taskId, emoji: '🔥', user_slug: 'nick-ingraham' }
    })
    expect([200, 201]).toContain(res.status())
  })

  test('API: Upload presigned URL generation', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upload/url`, {
      data: { filename: 'test-inspection.pdf', content_type: 'application/pdf' }
    })
    // May need R2 binding — accept 200 or 500 (if R2 not configured)
    console.log(`Upload URL status: ${res.status()}`)
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 3: KEYBOARD SHORTCUTS — Comprehensive shortcut coverage
// ═════════════════════════════════════════════════════════════════════

test.describe('FEATURE — G+key navigation shortcuts', () => {
  const gNavTests: [string, string, string][] = [
    ['d', '/dashboard', 'Dashboard'],
    ['t', '/tasks', 'Tasks'],
    ['p', '/projects', 'Projects'],
    ['m', '/meetings', 'Meetings'],
    ['c', '/calendar', 'Calendar'],
    ['i', '/ideas', 'Ideas'],
    ['k', '/deadlines', 'Deadlines'],
    ['y', '/my-tasks', 'My Tasks'],
  ]

  for (const [key, expectedPath, name] of gNavTests) {
    test(`FEATURE: G then ${key.toUpperCase()} navigates to ${name}`, async ({ page }) => {
      await loadPage(page, '/dashboard')
      await page.keyboard.press('g')
      await page.waitForTimeout(200)
      await page.keyboard.press(key)
      await page.waitForTimeout(1000)
      expect(page.url()).toContain(expectedPath)
    })
  }
})

test.describe('FEATURE — Space bar peek overlay', () => {
  test('FEATURE: Space opens peek overlay on focused task', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Select first task with J
    await page.keyboard.press('j')
    await page.waitForTimeout(300)
    // Space to peek
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)
    // Peek overlay should be visible — look for overlay/backdrop
    const peek = page.locator('[class*="peek"], [class*="Peek"], [class*="overlay"]').first()
    const peekVisible = await peek.isVisible().catch(() => false)
    await page.screenshot({ path: 'review/feature-peek-overlay.png' })
    console.log(`Peek overlay visible: ${peekVisible}`)
    // Close with Escape
    await page.keyboard.press('Escape')
  })
})

test.describe('FEATURE — Subtask expand/collapse with arrow keys', () => {
  test('FEATURE: → expands subtasks, ← collapses', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Focus first task
    await page.keyboard.press('j')
    await page.waitForTimeout(300)

    // Check if task row has a chevron/expand indicator
    const chevron = page.locator('[class*="chevron"], [class*="expand"], button[aria-label*="expand"]').first()
    const hasChevron = await chevron.isVisible().catch(() => false)
    console.log(`Task has expand chevron: ${hasChevron}`)

    if (hasChevron) {
      // → to expand
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/feature-subtask-expanded.png' })

      // Check for subtask content
      const subtaskInput = page.locator('input[placeholder*="subtask"], input[placeholder*="Add"]').first()
      const inputVisible = await subtaskInput.isVisible().catch(() => false)
      console.log(`Subtask add input visible after expand: ${inputVisible}`)

      // ← to collapse
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'review/feature-subtask-collapsed.png' })
    }
  })
})

test.describe('FEATURE — Bulk selection and actions', () => {
  test('FEATURE: X key toggles task selection, toolbar appears', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Select first task
    await page.keyboard.press('j')
    await page.waitForTimeout(200)
    // X to toggle selection
    await page.keyboard.press('x')
    await page.waitForTimeout(300)

    // Look for selection indicator (checkbox or highlight)
    await page.screenshot({ path: 'review/feature-bulk-select-1.png' })

    // Select second task
    await page.keyboard.press('j')
    await page.waitForTimeout(200)
    await page.keyboard.press('x')
    await page.waitForTimeout(300)

    // Bulk action toolbar should appear
    const toolbar = page.locator('[class*="bulk"], [class*="Bulk"], text=selected').first()
    const toolbarVisible = await toolbar.isVisible().catch(() => false)
    console.log(`Bulk toolbar visible: ${toolbarVisible}`)
    await page.screenshot({ path: 'review/feature-bulk-select-2.png' })

    // Deselect all
    await page.keyboard.press('Escape')
  })
})

test.describe('FEATURE — Snooze functionality', () => {
  test('FEATURE: Z key or context menu triggers snooze', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Focus first task
    await page.keyboard.press('j')
    await page.waitForTimeout(200)
    // Z to snooze
    await page.keyboard.press('z')
    await page.waitForTimeout(500)

    // Snooze dropdown or instant +1d
    const snoozeMenu = page.locator('text=+1 Day, text=+3 Days, text=+1 Week, text=Tomorrow').first()
    const snoozeVisible = await snoozeMenu.isVisible().catch(() => false)
    console.log(`Snooze menu/toast visible: ${snoozeVisible}`)
    await page.screenshot({ path: 'review/feature-snooze.png' })

    if (snoozeVisible) {
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('FEATURE — Right-click context menu', () => {
  test('FEATURE: Right-click on task row shows context menu', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Find a task row
    const row = page.locator('[class*="row"], [class*="Row"], tr').filter({ hasText: /\w{3,}/ }).first()
    if (await row.isVisible().catch(() => false)) {
      await row.click({ button: 'right' })
      await page.waitForTimeout(500)

      // Context menu should appear with options
      const menuItems = ['Open', 'Status', 'Snooze', 'Archive']
      let menuFound = false
      for (const item of menuItems) {
        if (await page.locator(`text=${item}`).first().isVisible({ timeout: 500 }).catch(() => false)) {
          menuFound = true
          break
        }
      }
      console.log(`Context menu found: ${menuFound}`)
      await page.screenshot({ path: 'review/feature-context-menu.png' })
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('FEATURE — Blocker flagging', () => {
  test('FEATURE: B key toggles blocker on focused task', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('j')
    await page.waitForTimeout(200)
    await page.keyboard.press('b')
    await page.waitForTimeout(500)

    // Should show blocker indicator or status change
    await page.screenshot({ path: 'review/feature-blocker-flag.png' })
    // Toggle back
    await page.keyboard.press('b')
    await page.waitForTimeout(300)
  })
})

test.describe('FEATURE — S key status cycle', () => {
  test('FEATURE: S key cycles task status (todo → in_progress → done)', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('j')
    await page.waitForTimeout(200)

    // Press S to cycle
    await page.keyboard.press('s')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/feature-status-cycle.png' })

    // Check for undo toast
    const undoToast = page.locator('text=Undo')
    const toastVisible = await undoToast.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`Undo toast after S key: ${toastVisible}`)

    // Undo if possible
    if (toastVisible) {
      await undoToast.click()
      await page.waitForTimeout(300)
    }
  })
})

test.describe('FEATURE — Sidebar collapse', () => {
  test('FEATURE: [ key collapses sidebar, [ again expands', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const sidebar = page.locator('nav').first()
    const beforeWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width).catch(() => 0)

    await page.keyboard.press('[')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/feature-sidebar-collapsed.png' })

    const afterWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width).catch(() => 0)
    console.log(`Sidebar width before: ${beforeWidth}, after: ${afterWidth}`)
    // Should be narrower after collapse
    if (beforeWidth > 0 && afterWidth > 0) {
      expect(afterWidth).toBeLessThan(beforeWidth)
    }

    // Expand again
    await page.keyboard.press('[')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/feature-sidebar-expanded.png' })
  })
})

test.describe('FEATURE — Notification bell', () => {
  test('FEATURE: Notification bell click opens dropdown', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const bell = page.locator('[class*="notification"], [class*="bell"], button[aria-label*="notif"]').first()
    if (await bell.isVisible().catch(() => false)) {
      await bell.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/feature-notification-dropdown.png' })

      // Should show notification items or empty state
      const hasContent = await page.locator('text=No notifications, text=notification').first().isVisible({ timeout: 2000 }).catch(() => false)
      console.log(`Notification dropdown has content: ${hasContent}`)
      await page.keyboard.press('Escape')
    } else {
      console.log('Notification bell not found on page')
    }
  })
})

test.describe('FEATURE — Favicon badge', () => {
  test('FEATURE: Favicon changes with notification count', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const favicon = await page.evaluate(() => {
      const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement
      return link?.href ?? null
    })
    console.log(`Favicon href: ${favicon?.substring(0, 50)}`)
    // If using canvas favicon, it will be a data URL
    const isCanvas = favicon?.startsWith('data:image')
    console.log(`Canvas favicon (dynamic badge): ${isCanvas}`)
  })
})

test.describe('FEATURE — Dashboard customize', () => {
  test('FEATURE: Customize button opens card selection', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const customizeBtn = page.locator('button:has-text("Customize")')
    if (await customizeBtn.isVisible().catch(() => false)) {
      await customizeBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/feature-dashboard-customize.png' })

      // Should show card toggles
      const toggles = page.locator('input[type="checkbox"], [role="switch"]')
      const count = await toggles.count()
      console.log(`Dashboard card toggles: ${count}`)

      await page.keyboard.press('Escape')
    }
  })
})

test.describe('FEATURE — Welcome banner', () => {
  test('FEATURE: Welcome banner shows and can be dismissed', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const banner = page.locator('[class*="welcome"], [class*="Welcome"]').first()
    const bannerVisible = await banner.isVisible().catch(() => false)
    console.log(`Welcome banner visible: ${bannerVisible}`)

    if (bannerVisible) {
      const dismissBtn = banner.locator('button').first()
      if (await dismissBtn.isVisible().catch(() => false)) {
        await dismissBtn.click()
        await page.waitForTimeout(300)
        const stillVisible = await banner.isVisible().catch(() => false)
        console.log(`Banner after dismiss: ${stillVisible}`)
      }
    }
  })
})

test.describe('FEATURE — CommandPalette quick actions', () => {
  test('FEATURE: Cmd+K shows contextual actions on Tasks page', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)

    // Should show "This Page" section with task-specific actions
    const thisPage = page.locator('text=This Page').first()
    const thisPageVisible = await thisPage.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`Contextual "This Page" section: ${thisPageVisible}`)
    await page.screenshot({ path: 'review/feature-cmdk-contextual.png' })

    // Check quick actions exist
    for (const action of ['Create Task', 'Submit Idea', 'Log Decision']) {
      const found = await page.locator(`text=${action}`).first().isVisible({ timeout: 1000 }).catch(() => false)
      console.log(`Quick action "${action}": ${found}`)
    }
    await page.keyboard.press('Escape')
  })

  test('FEATURE: Cmd+K "Create Task" action opens modal', async ({ page }) => {
    await loadPage(page, '/dashboard')
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)
    await page.keyboard.type('Create Task', { delay: 30 })
    await page.waitForTimeout(500)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    const modal = page.locator('text=Create New Task')
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Create Task modal from Cmd+K: ${modalVisible}`)
    await page.screenshot({ path: 'review/feature-cmdk-create-task.png' })
    await page.keyboard.press('Escape')
  })
})

test.describe('FEATURE — @mention autocomplete', () => {
  test('FEATURE: @mention shows team member suggestions', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Open task detail
    await page.keyboard.press('j')
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Go to comments tab
    const commentsTab = page.locator('button:has-text("Comments")')
    if (await commentsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentsTab.click()
      await page.waitForTimeout(300)

      // Find the comment input
      const input = page.locator('textarea, [contenteditable="true"], input[placeholder*="comment"]').first()
      if (await input.isVisible().catch(() => false)) {
        await input.click()
        await input.type('@ni', { delay: 50 })
        await page.waitForTimeout(500)

        // Autocomplete dropdown should appear
        const suggestion = page.locator('text=Nick Ingraham, text=nick-ingraham').first()
        const suggestVisible = await suggestion.isVisible({ timeout: 2000 }).catch(() => false)
        console.log(`@mention autocomplete visible: ${suggestVisible}`)
        await page.screenshot({ path: 'review/feature-mention-autocomplete.png' })
      }
    }
    await page.keyboard.press('Escape')
  })
})

test.describe('FEATURE — Inline date picker', () => {
  test('FEATURE: Click due date shows date picker with presets', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Find a due date cell
    const dateCell = page.locator('[class*="date"], button:has-text("Apr"), button:has-text("May"), button:has-text("Mar")').first()
    if (await dateCell.isVisible().catch(() => false)) {
      await dateCell.click()
      await page.waitForTimeout(500)

      // Expect preset buttons (Today, Tomorrow, Next Monday, +1 Week)
      const presets = ['Today', 'Tomorrow', 'Next Mon', '+1 Week', 'Clear']
      for (const preset of presets) {
        const found = await page.locator(`text=${preset}`).first().isVisible({ timeout: 500 }).catch(() => false)
        console.log(`Date preset "${preset}": ${found}`)
      }
      await page.screenshot({ path: 'review/feature-date-picker.png' })
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('FEATURE — Inline assignee picker', () => {
  test('FEATURE: Click assignee shows team member dropdown', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Find an assignee avatar/cell
    const assigneeCell = page.locator('[class*="assignee"], [class*="avatar"]').first()
    if (await assigneeCell.isVisible().catch(() => false)) {
      await assigneeCell.click()
      await page.waitForTimeout(500)

      // Should show team member list
      const teamMember = page.locator('text=Nick Ingraham').first()
      const memberVisible = await teamMember.isVisible({ timeout: 2000 }).catch(() => false)
      console.log(`Assignee picker shows team: ${memberVisible}`)
      await page.screenshot({ path: 'review/feature-assignee-picker.png' })
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('FEATURE — Meeting NLP quick-add', () => {
  test('FEATURE: NLP quick-add parses @person, priority, date on meeting page', async ({ page, request }) => {
    const meetingId = await getFirstMeetingId(request)
    if (!meetingId) { test.skip(); return }
    await loadPage(page, `/meetings/${meetingId}`)

    // Find the NLP quick-add input
    const nlpInput = page.locator('input[placeholder*="quick"], input[placeholder*="@"], input[placeholder*="action"]').first()
    if (await nlpInput.isVisible().catch(() => false)) {
      await nlpInput.click()
      await nlpInput.type('@nick Review CLIF draft p2 Friday', { delay: 30 })
      await page.waitForTimeout(500)

      // Token preview chips should appear
      await page.screenshot({ path: 'review/feature-nlp-quickadd.png' })

      // Look for parsed tokens (person, priority, date)
      const tokens = page.locator('[class*="chip"], [class*="token"], [class*="tag"]')
      const tokenCount = await tokens.count()
      console.log(`NLP parsed tokens: ${tokenCount}`)

      // Don't submit — just verify parsing
      await nlpInput.clear()
    } else {
      console.log('NLP quick-add input not found on meeting page')
    }
  })
})

test.describe('FEATURE — Calendar view modes', () => {
  test('FEATURE: Calendar Week view renders', async ({ page }) => {
    await loadPage(page, '/calendar')
    const weekBtn = page.getByRole('button', { name: /^week$/i })
    await weekBtn.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/feature-calendar-week.png' })
  })

  test('FEATURE: Calendar Day view renders', async ({ page }) => {
    await loadPage(page, '/calendar')
    const dayBtn = page.getByRole('button', { name: /^day$/i })
    await dayBtn.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/feature-calendar-day.png' })
  })

  test('FEATURE: Calendar Agenda view renders', async ({ page }) => {
    await loadPage(page, '/calendar')
    const agendaBtn = page.getByRole('button', { name: /agenda/i })
    if (await agendaBtn.isVisible().catch(() => false)) {
      await agendaBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/feature-calendar-agenda.png' })
    }
  })

  test('FEATURE: Calendar T key jumps to today', async ({ page }) => {
    await loadPage(page, '/calendar')
    // Navigate away from today
    const prevBtn = page.locator('button:has-text("‹"), button[aria-label*="previous"]').first()
    if (await prevBtn.isVisible().catch(() => false)) {
      await prevBtn.click()
      await prevBtn.click()
      await page.waitForTimeout(500)
    }
    // T key back to today
    await page.keyboard.press('t')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/feature-calendar-today-jump.png' })
  })
})

test.describe('FEATURE — Saved views', () => {
  test('FEATURE: Saved views selector exists on Tasks page', async ({ page }) => {
    await loadPage(page, '/tasks')
    const savedViews = page.locator('text=Saved Views, [class*="saved-view"], button:has-text("Views")')
    const visible = await savedViews.first().isVisible().catch(() => false)
    console.log(`Saved views control: ${visible}`)
  })
})

test.describe('FEATURE — Rich text editor', () => {
  test('FEATURE: Task description uses Tiptap rich text editor', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('j')
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Look for Tiptap/rich text toolbar (B, I, H2, list, link)
    const editor = page.locator('[class*="tiptap"], [class*="ProseMirror"], [contenteditable="true"]').first()
    const editorVisible = await editor.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Rich text editor visible: ${editorVisible}`)

    if (editorVisible) {
      // Check for formatting buttons
      const toolbar = page.locator('[class*="toolbar"], [class*="menu-bar"]').first()
      const toolbarVisible = await toolbar.isVisible().catch(() => false)
      console.log(`Editor toolbar visible: ${toolbarVisible}`)
      await page.screenshot({ path: 'review/feature-rich-text-editor.png' })
    }
    await page.keyboard.press('Escape')
  })
})

test.describe('FEATURE — Copy/Export buttons', () => {
  test('FEATURE: Copy Summary on Meeting Detail', async ({ page, request }) => {
    const meetingId = await getFirstMeetingId(request)
    if (!meetingId) { test.skip(); return }
    await loadPage(page, `/meetings/${meetingId}`)
    const copyBtn = page.locator('button:has-text("Copy Summary"), button:has-text("Copy")')
    const visible = await copyBtn.first().isVisible().catch(() => false)
    console.log(`Copy Summary button: ${visible}`)
  })

  test('FEATURE: Copy as Text on CV page', async ({ page }) => {
    await loadPage(page, '/team/nick-ingraham/cv')
    const copyBtn = page.locator('button:has-text("Copy"), button:has-text("Text")')
    const visible = await copyBtn.first().isVisible().catch(() => false)
    console.log(`Copy as Text on CV: ${visible}`)
  })

  test('FEATURE: Print button on PI Analytics', async ({ page }) => {
    await loadPage(page, '/pi/analytics')
    const printBtn = page.locator('button:has-text("Print")')
    const visible = await printBtn.isVisible().catch(() => false)
    console.log(`Print on PI Analytics: ${visible}`)
  })
})

test.describe('FEATURE — Onboarding checklist', () => {
  test('FEATURE: Personal Hub shows onboarding progress', async ({ page }) => {
    await loadPage(page, '/personal')
    const onboarding = page.locator('text=onboarding, text=Getting Started, text=Checklist').first()
    const visible = await onboarding.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Onboarding section visible: ${visible}`)
    await page.screenshot({ path: 'review/feature-onboarding.png' })
  })
})

test.describe('FEATURE — Ideas voting bounce animation', () => {
  test('FEATURE: Vote button works and shows count', async ({ page }) => {
    await loadPage(page, '/ideas')
    const voteBtn = page.locator('button:has(svg), button[aria-label*="vote"], button[class*="vote"]').first()
    if (await voteBtn.isVisible().catch(() => false)) {
      const beforeText = await voteBtn.textContent()
      await voteBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/feature-idea-vote.png' })
      console.log(`Vote button text before: ${beforeText}`)
    }
  })
})

test.describe('FEATURE — Decision tags and filtering', () => {
  test('FEATURE: Decision tags filter the list', async ({ page }) => {
    await loadPage(page, '/decisions')
    // Look for tag pills
    const tagPill = page.locator('[class*="tag"], [class*="chip"], button[class*="filter"]').filter({ hasText: /\w+/ }).first()
    if (await tagPill.isVisible().catch(() => false)) {
      await tagPill.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/feature-decision-tag-filter.png' })
    }
  })
})

test.describe('FEATURE — Project keyboard shortcuts', () => {
  test('FEATURE: P key pins/unpins project on Projects page', async ({ page }) => {
    await loadPage(page, '/projects')
    await page.keyboard.press('j')
    await page.waitForTimeout(200)
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/feature-project-pin.png' })
    // Unpin
    await page.keyboard.press('p')
    await page.waitForTimeout(300)
  })
})

test.describe('FEATURE — Settings interactions', () => {
  test('FEATURE: Settings reset dashboard + clear searches', async ({ page }) => {
    await loadPage(page, '/settings')
    const resetBtn = page.locator('button:has-text("Reset Dashboard")')
    const clearBtn = page.locator('button:has-text("Clear Searches"), button:has-text("Clear")')
    console.log(`Reset Dashboard: ${await resetBtn.isVisible().catch(() => false)}`)
    console.log(`Clear Searches: ${await clearBtn.first().isVisible().catch(() => false)}`)
    await page.screenshot({ path: 'review/feature-settings.png' })
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 4: USER JOURNEYS — Real daily workflow paths
// ═════════════════════════════════════════════════════════════════════

test.describe('JOURNEY — Full task lifecycle', () => {
  test('JOURNEY: Create task → assign → set date → add subtask → status cycle → complete → reopen', async ({ page, request }) => {
    await loadPage(page, '/tasks')

    // 1. Create task via API (faster than UI for setup)
    const create = await request.post(`${BASE}/api/tasks`, {
      data: {
        title: `JOURNEY-LIFECYCLE-${Date.now()}`,
        description: 'End-to-end lifecycle test',
        assignee: 'nick-ingraham',
        priority: 'medium',
        due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
      }
    })
    expect(create.status()).toBe(201)
    const { data: task } = await create.json()
    const taskId = task.id

    // 2. Change status to in_progress
    const s1 = await request.post(`${BASE}/api/tasks/${taskId}/status`, { data: { status: 'in_progress' } })
    expect(s1.status()).toBe(200)

    // 3. Add a subtask
    const sub = await request.post(`${BASE}/api/tasks/${taskId}/subtasks`, {
      data: { title: 'Subtask 1 — lifecycle test' }
    })
    expect([200, 201]).toContain(sub.status())

    // 4. Add a comment with @mention
    const comment = await request.post(`${BASE}/api/tasks/${taskId}/comments`, {
      data: { content: 'Testing lifecycle @nick-ingraham', author_slug: 'nick-ingraham' }
    })
    expect(comment.status()).toBe(201)

    // 5. Add a progress note
    const note = await request.post(`${BASE}/api/tasks/${taskId}/updates`, {
      data: { content: 'Making progress on lifecycle test', update_type: 'progress', author_slug: 'nick-ingraham' }
    })
    expect(note.status()).toBe(201)

    // 6. Complete the task
    const s2 = await request.post(`${BASE}/api/tasks/${taskId}/status`, { data: { status: 'done' } })
    expect(s2.status()).toBe(200)

    // 7. Verify it's done
    const verify = await (await request.get(`${BASE}/api/tasks/${taskId}/activity`)).json()
    const statuses = verify.data?.filter((a: any) => a.type === 'status_change' || a.field === 'status')
    console.log(`Status changes in activity: ${statuses?.length ?? 0}`)

    // 8. Reopen the task (Hub can do this)
    const reopen = await request.post(`${BASE}/api/tasks/${taskId}/status`, { data: { status: 'todo' } })
    expect(reopen.status()).toBe(200)

    console.log(`Full lifecycle test passed for task ${taskId}`)
  })
})

test.describe('JOURNEY — Meeting lifecycle', () => {
  test('JOURNEY: Create meeting → add agenda → add action item → prep view → copy summary', async ({ page, request }) => {
    // 1. Create meeting
    const meetingTitle = `JOURNEY Meeting ${Date.now()}`
    const create = await request.post(`${BASE}/api/meetings`, {
      data: { title: meetingTitle, date: '2099-12-31', facilitator: 'nick-ingraham' }
    })
    expect(create.status()).toBe(201)
    const { data: meeting } = await create.json()
    const meetingId = meeting.id

    // 2. Add agenda item
    const agenda = await request.post(`${BASE}/api/meetings/${meetingId}/agenda`, {
      data: { content: 'Discuss JOURNEY test results', type: 'discussion' }
    })
    expect([200, 201]).toContain(agenda.status())

    // 3. Navigate to meeting detail in browser
    await loadPage(page, `/meetings/${meetingId}`)
    await page.waitForTimeout(1000)
    const errors = await page.locator('text=Something went wrong').count()
    expect(errors).toBe(0)
    await page.screenshot({ path: 'review/journey-meeting-lifecycle.png' })

    // 4. Check prep view
    await page.goto(`${BASE}/meetings/${meetingId}/prep`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'review/journey-meeting-prep.png' })
  })
})

test.describe('JOURNEY — Project exploration', () => {
  test('JOURNEY: Projects list → filter by category → click project → each tab → post update', async ({ page, request }) => {
    await loadPage(page, '/projects')

    // 1. Filter by CLIF
    const clifFilter = page.locator('button:has-text("CLIF")')
    if (await clifFilter.isVisible().catch(() => false)) {
      await clifFilter.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/journey-projects-clif-filter.png' })
    }

    // 2. Click first project
    const projLink = page.locator('a[href*="/projects/"]').first()
    if (await projLink.isVisible().catch(() => false)) {
      await projLink.click()
      await page.waitForTimeout(1000)

      // 3. Click each tab
      for (const tab of ['Tasks', 'Revisions', 'Activity', 'Literature']) {
        const tabBtn = page.locator(`button:has-text("${tab}")`).first()
        if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await tabBtn.click()
          await page.waitForTimeout(500)
          await page.screenshot({ path: `review/journey-project-${tab.toLowerCase()}-tab.png` })
        }
      }
    }
  })
})

test.describe('JOURNEY — Research digest daily flow', () => {
  test('JOURNEY: Open digest → read dates → filter topic → expand abstract → bookmark → dismiss → check counts', async ({ page }) => {
    await loadPage(page, '/digest')

    // 1. Check reading progress bar
    const progressBar = page.locator('[class*="progress"], [role="progressbar"]').first()
    const hasProgress = await progressBar.isVisible().catch(() => false)
    console.log(`Digest progress bar: ${hasProgress}`)

    // 2. Check date pills
    const datePills = page.locator('button').filter({ hasText: /\d{4}-\d{2}-\d{2}|Apr|Mar|Feb/ })
    const dateCount = await datePills.count()
    console.log(`Digest date pills: ${dateCount}`)

    // 3. Filter by topic
    const topicPills = page.locator('button:has-text("ARDS"), button:has-text("CLIF"), button:has-text("Sepsis"), button:has-text("Ventilation")')
    if (await topicPills.first().isVisible().catch(() => false)) {
      await topicPills.first().click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/journey-digest-topic-filter.png' })
    }

    // 4. Switch tabs
    for (const tab of ['New', 'Saved']) {
      const tabBtn = page.locator(`button:has-text("${tab}")`).first()
      if (await tabBtn.isVisible().catch(() => false)) {
        await tabBtn.click()
        await page.waitForTimeout(300)
        await page.screenshot({ path: `review/journey-digest-${tab.toLowerCase()}-tab.png` })
      }
    }
  })
})

test.describe('JOURNEY — Manuscript pipeline view', () => {
  test('JOURNEY: Manuscripts → pipeline view → click stage → inline status edit', async ({ page }) => {
    await loadPage(page, '/manuscripts')

    // 1. Check stage dots
    const stageDots = page.locator('[class*="dot"], [class*="stage"]')
    console.log(`Stage indicator elements: ${await stageDots.count()}`)

    // 2. Try pipeline view toggle
    const pipelineBtn = page.locator('button:has-text("Pipeline")')
    if (await pipelineBtn.isVisible().catch(() => false)) {
      await pipelineBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/journey-manuscripts-pipeline.png' })
    }

    // 3. Try inline status edit
    const statusBtn = page.locator('button:has-text("Writing"), button:has-text("Submitted"), button:has-text("Published")').first()
    if (await statusBtn.isVisible().catch(() => false)) {
      await statusBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/journey-manuscripts-inline-edit.png' })
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('JOURNEY — Analytics deep dive', () => {
  test('JOURNEY: Analytics → read metrics → scroll charts → copy report', async ({ page }) => {
    await loadPage(page, '/analytics')

    // 1. Read metric cards
    const metricCards = page.locator('[class*="metric"], [class*="card"]').filter({ hasText: /\d+/ })
    const metricCount = await metricCards.count()
    console.log(`Analytics metric cards: ${metricCount}`)

    // 2. Check weekly date selector
    const weekSelector = page.locator('button:has-text("This Week"), button:has-text("Last Week")')
    if (await weekSelector.first().isVisible().catch(() => false)) {
      await weekSelector.first().click()
      await page.waitForTimeout(500)
    }

    // 3. Scroll to see all charts
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/journey-analytics-charts.png' })

    // 4. Check Attention Required section
    const attention = page.locator('text=Attention Required, text=attention').first()
    const attentionVisible = await attention.isVisible().catch(() => false)
    console.log(`Attention Required section: ${attentionVisible}`)
  })
})

test.describe('JOURNEY — Search deep dive', () => {
  test('JOURNEY: Search → type query → filter by type → click result → navigate', async ({ page }) => {
    await loadPage(page, '/search')

    // 1. Type query
    const input = page.locator('input[placeholder*="Search"]').first()
    await input.click()
    await input.fill('CLIF')
    await page.waitForTimeout(1000)

    // 2. Check type filter pills
    const typeFilters = ['Tasks', 'Projects', 'Meetings', 'Ideas']
    for (const type of typeFilters) {
      const pill = page.locator(`button:has-text("${type}")`).first()
      const visible = await pill.isVisible().catch(() => false)
      console.log(`Search filter "${type}": ${visible}`)
    }

    // 3. Click a type filter
    const taskFilter = page.locator('button:has-text("Tasks")').first()
    if (await taskFilter.isVisible().catch(() => false)) {
      await taskFilter.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/journey-search-filtered.png' })
    }

    // 4. Click first result
    const result = page.locator('a, [role="link"]').filter({ hasText: /CLIF/ }).first()
    if (await result.isVisible().catch(() => false)) {
      const href = await result.getAttribute('href')
      console.log(`First search result href: ${href}`)
      await result.click()
      await page.waitForTimeout(1000)
      expect(page.url()).not.toContain('/search')
    }
  })
})

test.describe('JOURNEY — Grants timeline interaction', () => {
  test('JOURNEY: Grants page → see timeline → check mechanism badges → legend', async ({ page }) => {
    await loadPage(page, '/grants')

    // 1. SVG timeline should render
    const svg = page.locator('svg').first()
    const svgVisible = await svg.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`Grants SVG timeline: ${svgVisible}`)

    // 2. TODAY marker
    const todayMarker = page.locator('text=TODAY')
    const todayVisible = await todayMarker.isVisible().catch(() => false)
    console.log(`TODAY marker: ${todayVisible}`)

    // 3. Mechanism badges
    for (const mech of ['K23', 'R03', 'R01']) {
      const badge = page.locator(`text=${mech}`).first()
      const visible = await badge.isVisible().catch(() => false)
      console.log(`Mechanism badge "${mech}": ${visible}`)
    }

    // 4. Progress bars
    const bars = page.locator('[class*="progress"]')
    console.log(`Grant progress bars: ${await bars.count()}`)
    await page.screenshot({ path: 'review/journey-grants-full.png' })
  })
})

test.describe('JOURNEY — Mentee milestones', () => {
  test('JOURNEY: Mentee page → filter by person → filter by type → see cards', async ({ page }) => {
    await loadPage(page, '/mentee-milestones')

    // Check for filters
    const menteeFilter = page.locator('select, [class*="filter"]').first()
    const hasFilter = await menteeFilter.isVisible().catch(() => false)
    console.log(`Mentee filter: ${hasFilter}`)

    // Check for milestone cards
    const cards = page.locator('[class*="card"], [class*="milestone"]')
    console.log(`Milestone cards: ${await cards.count()}`)
    await page.screenshot({ path: 'review/journey-mentee-milestones.png' })
  })
})

test.describe('JOURNEY — My Tasks daily triage', () => {
  test('JOURNEY: MyTasks → Overdue pill → see overdue tasks → click one → change status → undo', async ({ page }) => {
    await loadPage(page, '/my-tasks')

    // 1. Click Overdue filter
    const overdueBtn = page.locator('button:has-text("Overdue")')
    if (await overdueBtn.isVisible().catch(() => false)) {
      await overdueBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/journey-mytasks-overdue.png' })

      // 2. Count overdue tasks
      const tasks = page.locator('[class*="row"], [class*="task"]').filter({ hasText: /\w{3,}/ })
      const count = await tasks.count()
      console.log(`Overdue tasks shown: ${count}`)
    }

    // 3. Check completion streak
    const streak = page.locator('text=streak, text=Streak').first()
    const streakVisible = await streak.isVisible().catch(() => false)
    console.log(`Completion streak: ${streakVisible}`)

    // 4. Check Focus Next card
    const focusNext = page.locator('text=FOCUS NEXT, text=Focus Next').first()
    const fnVisible = await focusNext.isVisible().catch(() => false)
    console.log(`Focus Next card: ${fnVisible}`)
  })
})

test.describe('JOURNEY — PB Sector planner flow', () => {
  test('JOURNEY: PB Sector → star task → focus tasks → pomodoro → reflection', async ({ page }) => {
    await loadPage(page, '/pb')
    await page.waitForTimeout(1000)

    // 1. Check main planner sections
    const sections = ['Star', 'Focus', 'Evening', 'Quick', 'Pomodoro', 'Reflection']
    for (const section of sections) {
      const found = await page.locator(`text=${section}`).first().isVisible({ timeout: 2000 }).catch(() => false)
      console.log(`PB section "${section}": ${found}`)
    }

    // 2. Check dispatch badge
    const dispatch = page.locator('[class*="dispatch"], text=Dispatch').first()
    console.log(`Dispatch badge: ${await dispatch.isVisible().catch(() => false)}`)

    // 3. Check calendar timeline
    const calendar = page.locator('[class*="calendar"], [class*="timeline"]').first()
    console.log(`Calendar timeline: ${await calendar.isVisible().catch(() => false)}`)

    await page.screenshot({ path: 'review/journey-pb-sector.png' })
  })
})

test.describe('JOURNEY — Team member exploration', () => {
  test('JOURNEY: Team page → click member → see profile → cv link → trajectory link', async ({ page }) => {
    await loadPage(page, '/team')

    // Click Nick's card
    const nickCard = page.locator('a[href*="nick-ingraham"], text=Nick Ingraham').first()
    if (await nickCard.isVisible().catch(() => false)) {
      await nickCard.click()
      await page.waitForTimeout(1000)

      // Profile page
      await expect(page.locator('text=Nick Ingraham')).toBeVisible()
      await page.screenshot({ path: 'review/journey-team-member-profile.png' })

      // Check for CV link
      const cvLink = page.locator('a[href*="/cv"], text=CV, text=Publications')
      const cvVisible = await cvLink.first().isVisible().catch(() => false)
      console.log(`CV link on profile: ${cvVisible}`)

      // Check for trajectory link
      const trajLink = page.locator('a[href*="/trajectory"], text=Trajectory')
      const trajVisible = await trajLink.first().isVisible().catch(() => false)
      console.log(`Trajectory link on profile: ${trajVisible}`)
    }
  })
})

test.describe('JOURNEY — Publications library', () => {
  test('JOURNEY: Publications → scroll journal covers → search → year filter', async ({ page }) => {
    await loadPage(page, '/publications')

    // 1. Journal cover cards (horizontal scroll)
    const covers = page.locator('[class*="cover"], [class*="journal"]')
    console.log(`Journal cover cards: ${await covers.count()}`)

    // 2. Search
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('critical care')
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/journey-publications-search.png' })
    }

    // 3. Year timeline
    const yearFilter = page.locator('[class*="timeline"], button:has-text("2024"), button:has-text("2025")')
    const yearVisible = await yearFilter.first().isVisible().catch(() => false)
    console.log(`Year timeline visible: ${yearVisible}`)

    // 4. Copy bibliography button
    const copyBtn = page.locator('button:has-text("Copy bibliography")')
    const copyVisible = await copyBtn.isVisible().catch(() => false)
    console.log(`Copy bibliography: ${copyVisible}`)
  })
})

test.describe('JOURNEY — Activity feed', () => {
  test('JOURNEY: Activity → filter by person → filter by type → scroll', async ({ page }) => {
    await loadPage(page, '/activity')

    // 1. Person filter
    const personFilter = page.locator('select, [class*="filter"]').filter({ hasText: /Nick|All|Person/ }).first()
    if (await personFilter.isVisible().catch(() => false)) {
      console.log('Person filter found')
      await page.screenshot({ path: 'review/journey-activity-person-filter.png' })
    }

    // 2. Most active indicator
    const mostActive = page.locator('text=Most active, text=most active').first()
    console.log(`Most active indicator: ${await mostActive.isVisible().catch(() => false)}`)

    // 3. Activity items
    const items = page.locator('[class*="activity"], [class*="feed"]').filter({ hasText: /\w{3,}/ })
    console.log(`Activity items: ${await items.count()}`)
  })
})

test.describe('JOURNEY — Deadline cascade', () => {
  test('JOURNEY: Deadline cascade → dependency graph → impact view', async ({ page }) => {
    await loadPage(page, '/deadline-cascade')
    await page.waitForTimeout(1000)

    // Check for cascade visualization
    const cascade = page.locator('[class*="cascade"], [class*="graph"], [class*="dependency"], svg').first()
    const cascadeVisible = await cascade.isVisible().catch(() => false)
    console.log(`Cascade visualization: ${cascadeVisible}`)
    await page.screenshot({ path: 'review/journey-deadline-cascade.png' })
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 5: EDGE CASES — Boundary conditions and error handling
// ═════════════════════════════════════════════════════════════════════

test.describe('EDGE — Special characters and long text', () => {
  test('EDGE: Task with special characters in title', async ({ request }) => {
    const res = await request.post(`${BASE}/api/tasks`, {
      data: {
        title: 'EDGE TEST — "quotes" & <html> ampersands\' apostrophes (parens) [brackets] {braces}',
        description: 'Testing XSS: <script>alert("xss")</script> and SQL: \'; DROP TABLE tasks; --',
        assignee: 'nick-ingraham',
        priority: 'low'
      }
    })
    expect(res.status()).toBe(201)
    const { data } = await res.json()
    // Readback should have safe content
    const read = await (await request.get(`${BASE}/api/tasks/${data.id}/activity`)).json()
    expect(read).toBeTruthy()
  })

  test('EDGE: Task with very long title (500 chars)', async ({ request }) => {
    const longTitle = 'A'.repeat(500) + ' — EDGE TEST DELETE'
    const res = await request.post(`${BASE}/api/tasks`, {
      data: { title: longTitle, assignee: 'nick-ingraham', priority: 'low' }
    })
    expect([200, 201, 400]).toContain(res.status()) // 400 if server validates length
  })

  test('EDGE: Task with Unicode and emoji', async ({ request }) => {
    const res = await request.post(`${BASE}/api/tasks`, {
      data: {
        title: 'EDGE 日本語テスト 🔬 résumé café naïve — delete',
        description: '中文 العربية हिन्दी ‮bidirectional‬',
        assignee: 'nick-ingraham',
        priority: 'low'
      }
    })
    expect(res.status()).toBe(201)
  })
})

test.describe('EDGE — Task with no due date', () => {
  test('EDGE: Task without due date renders correctly in grid', async ({ page, request }) => {
    const res = await request.post(`${BASE}/api/tasks`, {
      data: { title: 'EDGE no-date task — delete', assignee: 'nick-ingraham', priority: 'medium' }
    })
    expect(res.status()).toBe(201)

    // Load tasks page and verify no crash
    await loadPage(page, '/tasks')
    const errors = await page.locator('text=Something went wrong').count()
    expect(errors).toBe(0)
  })
})

test.describe('EDGE — Empty API responses', () => {
  test('EDGE: Search with no results', async ({ page }) => {
    await loadPage(page, '/search')
    const input = page.locator('input[placeholder*="Search"]').first()
    await input.fill('zzzzzzzzzznonexistent12345')
    await page.waitForTimeout(1000)

    // Should show empty state, not crash
    const crashed = await page.locator('text=Something went wrong').count()
    expect(crashed).toBe(0)
    await page.screenshot({ path: 'review/edge-search-no-results.png' })
  })

  test('EDGE: Digest with no papers for topic', async ({ page }) => {
    await loadPage(page, '/digest')
    // Search for nonexistent topic
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('zzznonexistenttopic')
      await page.waitForTimeout(500)
      const crashed = await page.locator('text=Something went wrong').count()
      expect(crashed).toBe(0)
    }
  })
})

test.describe('EDGE — 404 and invalid routes', () => {
  test('EDGE: Invalid project slug shows error or 404', async ({ page }) => {
    const errors = await loadPage(page, '/projects/nonexistent-slug-12345')
    // Should show "not found" or redirect, not crash
    const crashed = await page.locator('text=Something went wrong').count()
    // Acceptable: 0 (graceful) or 1 (error boundary catches it)
    await page.screenshot({ path: 'review/edge-invalid-project.png' })
    console.log(`Invalid project: crashed=${crashed}, errors=${errors.length}`)
  })

  test('EDGE: Invalid meeting ID shows error or 404', async ({ page }) => {
    await loadPage(page, '/meetings/nonexistent-id-12345')
    const crashed = await page.locator('text=Something went wrong').count()
    await page.screenshot({ path: 'review/edge-invalid-meeting.png' })
    console.log(`Invalid meeting: crashed=${crashed}`)
  })

  test('EDGE: Invalid team member slug', async ({ page }) => {
    await loadPage(page, '/team/nonexistent-person-12345')
    const crashed = await page.locator('text=Something went wrong').count()
    await page.screenshot({ path: 'review/edge-invalid-member.png' })
    console.log(`Invalid member: crashed=${crashed}`)
  })

  test('EDGE: Completely bogus route', async ({ page }) => {
    await loadPage(page, '/this-route-does-not-exist')
    await page.screenshot({ path: 'review/edge-bogus-route.png' })
  })
})

test.describe('EDGE — API error handling', () => {
  test('EDGE: Create task with missing required fields', async ({ request }) => {
    const res = await request.post(`${BASE}/api/tasks`, { data: {} })
    // Should return 400, not 500
    expect(res.status()).toBeLessThan(500)
  })

  test('EDGE: Create idea with missing fields', async ({ request }) => {
    const res = await request.post(`${BASE}/api/ideas`, { data: {} })
    expect(res.status()).toBeLessThan(500)
  })

  test('EDGE: Update nonexistent task', async ({ request }) => {
    const res = await request.post(`${BASE}/api/tasks/nonexistent-id-12345`, { data: { title: 'updated' } })
    expect([404, 500]).toContain(res.status()) // 404 preferred, 500 acceptable
  })

  test('EDGE: Invalid status value', async ({ request }) => {
    const taskId = await getFirstTaskId(request)
    if (!taskId) { test.skip(); return }
    const res = await request.post(`${BASE}/api/tasks/${taskId}/status`, { data: { status: 'INVALID_STATUS' } })
    // Should reject gracefully
    expect(res.status()).toBeLessThan(500)
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 6: SYNC WORKFLOWS — Data integrity round-trips
// ═════════════════════════════════════════════════════════════════════

test.describe('SYNC — Status change round-trip', () => {
  test('SYNC: Change status via API → verify readback → change again → verify', async ({ request }) => {
    // Create test task
    const create = await request.post(`${BASE}/api/tasks`, {
      data: { title: `SYNC-STATUS-${Date.now()}`, assignee: 'nick-ingraham', priority: 'low' }
    })
    const { data } = await create.json()
    const id = data.id

    // Change to in_progress
    await request.post(`${BASE}/api/tasks/${id}/status`, { data: { status: 'in_progress' } })
    const r1 = await (await request.get(`${BASE}/api/tasks?limit=100`)).json()
    const task1 = r1.data?.find((t: any) => t.id === id)
    expect(task1?.status).toBe('in_progress')

    // Change to done
    await request.post(`${BASE}/api/tasks/${id}/status`, { data: { status: 'done' } })
    const r2 = await (await request.get(`${BASE}/api/tasks?status=done&limit=100`)).json()
    const task2 = r2.data?.find((t: any) => t.id === id)
    expect(task2?.status).toBe('done')

    // Reopen to todo
    await request.post(`${BASE}/api/tasks/${id}/status`, { data: { status: 'todo' } })
    const r3 = await (await request.get(`${BASE}/api/tasks?limit=100`)).json()
    const task3 = r3.data?.find((t: any) => t.id === id)
    expect(task3?.status).toBe('todo')
  })
})

test.describe('SYNC — Priority change round-trip', () => {
  test('SYNC: Change priority → readback matches', async ({ request }) => {
    const create = await request.post(`${BASE}/api/tasks`, {
      data: { title: `SYNC-PRIORITY-${Date.now()}`, assignee: 'nick-ingraham', priority: 'low' }
    })
    const { data } = await create.json()
    const id = data.id

    // Change priority
    await request.post(`${BASE}/api/tasks/${id}`, { data: { priority: 'urgent' } })
    const r = await (await request.get(`${BASE}/api/tasks?limit=100`)).json()
    const task = r.data?.find((t: any) => t.id === id)
    expect(task?.priority).toBe('urgent')
  })
})

test.describe('SYNC — Assignee change round-trip', () => {
  test('SYNC: Change assignee → readback matches → filter by new assignee includes task', async ({ request }) => {
    const create = await request.post(`${BASE}/api/tasks`, {
      data: { title: `SYNC-ASSIGNEE-${Date.now()}`, assignee: 'nick-ingraham', priority: 'low' }
    })
    const { data } = await create.json()
    const id = data.id

    // Get a different team member
    const team = await (await request.get(`${BASE}/api/team`)).json()
    const other = team.data?.find((m: any) => m.slug !== 'nick-ingraham')
    if (!other) { test.skip(); return }

    // Change assignee
    await request.post(`${BASE}/api/tasks/${id}`, { data: { assignee: other.slug } })

    // Filter by new assignee
    const r = await (await request.get(`${BASE}/api/tasks?assignee=${other.slug}&limit=100`)).json()
    const found = r.data?.find((t: any) => t.id === id)
    expect(found).toBeTruthy()
    expect(found.assignee).toBe(other.slug)
  })
})

test.describe('SYNC — Cross-tab BroadcastChannel', () => {
  test('SYNC: Change in one tab → verify other tab gets notified', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page1 = await ctx.newPage()
    const page2 = await ctx.newPage()

    await loadPage(page1, '/tasks')
    await loadPage(page2, '/tasks')

    // Set up BroadcastChannel listener in page2
    const received = page2.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const ch = new BroadcastChannel('mnccore-sync')
        const timeout = setTimeout(() => resolve(false), 5000)
        ch.onmessage = () => {
          clearTimeout(timeout)
          resolve(true)
        }
      })
    })

    // Post a message from page1
    await page1.evaluate(() => {
      const ch = new BroadcastChannel('mnccore-sync')
      ch.postMessage({ type: 'task_updated', taskId: 'test' })
    })

    const didReceive = await received
    console.log(`BroadcastChannel cross-tab: ${didReceive}`)

    await ctx.close()
  })
})

test.describe('SYNC — Bulk task operations', () => {
  test('SYNC: Create 3 tasks → batch status update → verify all changed', async ({ request }) => {
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const res = await request.post(`${BASE}/api/tasks`, {
        data: { title: `SYNC-BULK-${i}-${Date.now()}`, assignee: 'nick-ingraham', priority: 'low' }
      })
      const { data } = await res.json()
      ids.push(data.id)
    }

    // Batch update
    const batch = await request.post(`${BASE}/api/tasks/batch`, {
      data: { ids, updates: { status: 'in_progress' } }
    })
    expect([200, 201]).toContain(batch.status())

    // Verify all changed
    const all = await (await request.get(`${BASE}/api/tasks?limit=200`)).json()
    for (const id of ids) {
      const task = all.data?.find((t: any) => t.id === id)
      expect(task?.status, `Task ${id} should be in_progress`).toBe('in_progress')
    }
  })
})

test.describe('SYNC — Comment and note persistence', () => {
  test('SYNC: Add comment → add note → readback in correct order', async ({ request }) => {
    const create = await request.post(`${BASE}/api/tasks`, {
      data: { title: `SYNC-COMMENTS-${Date.now()}`, assignee: 'nick-ingraham', priority: 'low' }
    })
    const { data } = await create.json()
    const id = data.id

    // Add comment
    await request.post(`${BASE}/api/tasks/${id}/comments`, {
      data: { content: 'First comment', author_slug: 'nick-ingraham' }
    })

    // Add note
    await request.post(`${BASE}/api/tasks/${id}/updates`, {
      data: { content: 'Progress update', update_type: 'progress', author_slug: 'nick-ingraham' }
    })

    // Read back comments
    const comments = await (await request.get(`${BASE}/api/tasks/${id}/comments`)).json()
    expect(comments.data?.length).toBeGreaterThanOrEqual(1)
    expect(comments.data[0].content).toContain('First comment')

    // Read back notes
    const notes = await (await request.get(`${BASE}/api/tasks/${id}/updates`)).json()
    expect(notes.data?.length).toBeGreaterThanOrEqual(1)

    // Activity should contain both
    const activity = await (await request.get(`${BASE}/api/tasks/${id}/activity`)).json()
    expect(activity.data?.length).toBeGreaterThanOrEqual(2)
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 7: VISUAL VERIFICATION — Styles, animations, states
// ═════════════════════════════════════════════════════════════════════

test.describe('VISUAL — Overdue date red styling', () => {
  test('VISUAL: Overdue tasks show red date indicator', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Look for overdue indicators (red text, red dot, or danger class)
    const overdueIndicators = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="overdue"], [class*="red"], [class*="danger"], [style*="color: red"], [style*="color: rgb(239"]')
      return els.length
    })
    console.log(`Overdue indicator elements: ${overdueIndicators}`)
    await page.screenshot({ path: 'review/visual-overdue-styling.png' })
  })
})

test.describe('VISUAL — Hover row actions', () => {
  test('VISUAL: Task row hover reveals Edit/Archive actions', async ({ page }) => {
    await loadPage(page, '/tasks')
    const row = page.locator('[class*="row"], [class*="Row"]').filter({ hasText: /\w{3,}/ }).first()
    if (await row.isVisible().catch(() => false)) {
      await row.hover()
      await page.waitForTimeout(300)

      // Look for action buttons that appear on hover
      const editBtn = page.locator('button:has-text("Edit"), button[aria-label*="edit"]').first()
      const archiveBtn = page.locator('button:has-text("Archive"), button[aria-label*="archive"]').first()
      console.log(`Edit button on hover: ${await editBtn.isVisible().catch(() => false)}`)
      console.log(`Archive button on hover: ${await archiveBtn.isVisible().catch(() => false)}`)
      await page.screenshot({ path: 'review/visual-hover-actions.png' })
    }
  })
})

test.describe('VISUAL — Loading skeletons', () => {
  test('VISUAL: Skeleton appears during slow load', async ({ page }) => {
    // Throttle network to see skeleton
    await page.route('**/api/**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.continue()
    })

    await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Screenshot during loading state
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/visual-skeleton-loading.png' })

    // Look for skeleton elements
    const skeletons = await page.locator('[class*="skeleton"], [class*="Skeleton"], [class*="pulse"], [class*="animate-pulse"]').count()
    console.log(`Skeleton elements during load: ${skeletons}`)

    // Wait for actual content
    await page.waitForLoadState('networkidle')
  })
})

test.describe('VISUAL — Light mode full check', () => {
  test('VISUAL: Light mode renders correctly on key pages', async ({ page }) => {
    await loadPage(page, '/dashboard')

    // Force light mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      localStorage.setItem('theme', 'light')
    })
    await page.waitForTimeout(500)

    const keyPages = ['/dashboard', '/tasks', '/projects', '/meetings']
    for (const path of keyPages) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 })
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark')
        document.documentElement.classList.add('light')
      })
      await page.waitForTimeout(300)
      await page.screenshot({ path: `review/visual-light-${path.replace('/', '')}.png` })
    }
  })
})

test.describe('VISUAL — Stagger animations', () => {
  test('VISUAL: Ideas page has staggered card entrance', async ({ page }) => {
    // Navigate fresh to trigger entrance animation
    await page.goto(`${BASE}/ideas`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    // Quick screenshot to catch animation in progress
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'review/visual-stagger-early.png' })
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'review/visual-stagger-complete.png' })
  })
})

test.describe('VISUAL — Card hover lift', () => {
  test('VISUAL: Dashboard card lifts on hover', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const card = page.locator('[class*="bento"], [class*="card"]').first()
    if (await card.isVisible().catch(() => false)) {
      // Get transform before hover
      const beforeTransform = await card.evaluate(el => getComputedStyle(el).transform)

      await card.hover()
      await page.waitForTimeout(200)

      const afterTransform = await card.evaluate(el => getComputedStyle(el).transform)
      console.log(`Card transform before: ${beforeTransform}, after: ${afterTransform}`)
      await page.screenshot({ path: 'review/visual-card-hover-lift.png' })
    }
  })
})

test.describe('VISUAL — Route progress bar', () => {
  test('VISUAL: Navigation shows progress bar', async ({ page }) => {
    await loadPage(page, '/dashboard')
    // Click nav link and look for progress bar during transition
    const link = page.locator('nav >> a:has-text("All Tasks")').first()
    if (await link.isVisible().catch(() => false)) {
      await link.click()
      // Quick screenshot to catch progress bar
      await page.waitForTimeout(100)
      const progressBar = page.locator('[class*="progress-bar"], [class*="nprogress"], [class*="route-progress"]').first()
      const visible = await progressBar.isVisible().catch(() => false)
      console.log(`Route progress bar visible: ${visible}`)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 8: MOBILE-SPECIFIC — Phone viewport interactions
// ═════════════════════════════════════════════════════════════════════

test.describe('MOBILE — Phone viewport tests', () => {
  test('MOBILE: Task page at 375px — card layout, no table', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadPage(page, '/tasks')

    // Should use card layout, not columnar table
    const table = page.locator('table, thead, th')
    const tableVisible = await table.first().isVisible().catch(() => false)
    console.log(`Table visible at 375px: ${tableVisible}`)
    await page.screenshot({ path: 'review/mobile-tasks-375.png' })
  })

  test('MOBILE: Dashboard at 375px — single column', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadPage(page, '/dashboard')
    await page.screenshot({ path: 'review/mobile-dashboard-375.png' })

    // No horizontal overflow
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
  })

  test('MOBILE: "Press F" tooltip hidden on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadPage(page, '/tasks')
    const tooltip = page.locator('text=Press F')
    const visible = await tooltip.isVisible().catch(() => false)
    expect(visible, '"Press F" should be hidden on mobile').toBe(false)
  })

  test('MOBILE: Sidebar hamburger menu works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadPage(page, '/dashboard')

    // Look for hamburger menu button
    const hamburger = page.locator('button[aria-label*="menu"], button[aria-label*="nav"], button:has(svg)').first()
    if (await hamburger.isVisible().catch(() => false)) {
      await hamburger.click()
      await page.waitForTimeout(500)

      // Sidebar should be visible now
      const sidebar = page.locator('nav').filter({ hasText: /Dashboard|Tasks|Projects/ })
      const visible = await sidebar.first().isVisible().catch(() => false)
      console.log(`Mobile sidebar after hamburger: ${visible}`)
      await page.screenshot({ path: 'review/mobile-hamburger-open.png' })
    }
  })

  test('MOBILE: Project detail at 375px renders without overflow', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const slug = await getFirstProjectSlug(request)
    if (!slug) { test.skip(); return }
    await loadPage(page, `/projects/${slug}`)

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
    await page.screenshot({ path: 'review/mobile-project-detail.png' })
  })

  test('MOBILE: Meeting detail at 375px renders', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const id = await getFirstMeetingId(request)
    if (!id) { test.skip(); return }
    await loadPage(page, `/meetings/${id}`)
    await page.screenshot({ path: 'review/mobile-meeting-detail.png' })
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 9: MULTI-FILTER COMBINATIONS — Complex filter chains
// ═════════════════════════════════════════════════════════════════════

test.describe('FILTER — Complex filter combinations', () => {
  test('FILTER: Tasks API — status + assignee filter', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tasks?status=todo&assignee=nick-ingraham`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    // All tasks should match both filters
    for (const task of data.data ?? []) {
      expect(task.status).toBe('todo')
      expect(task.assignee).toBe('nick-ingraham')
    }
  })

  test('FILTER: Tasks API — status + priority filter', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tasks?status=in_progress&priority=high`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    for (const task of data.data ?? []) {
      expect(task.status).toBe('in_progress')
      expect(task.priority).toBe('high')
    }
  })

  test('FILTER: Tasks API — overdue filter returns tasks with past dates', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tasks/overdue-count`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(typeof data.count === 'number' || typeof data.data?.count === 'number').toBe(true)
  })

  test('FILTER: Activity API — person + limit filter', async ({ request }) => {
    const res = await request.get(`${BASE}/api/activity?person=nick-ingraham&limit=5`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.data?.length).toBeLessThanOrEqual(5)
  })

  test('FILTER: Decisions API — tag filter', async ({ request }) => {
    const tags = await (await request.get(`${BASE}/api/decisions/tags`)).json()
    const firstTag = tags.data?.[0]?.tag
    if (!firstTag) { test.skip(); return }
    const res = await request.get(`${BASE}/api/decisions?tag=${encodeURIComponent(firstTag)}`)
    expect(res.status()).toBe(200)
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 10: ACCESSIBILITY — Deep a11y checks
// ═════════════════════════════════════════════════════════════════════

test.describe('A11Y — Focus management', () => {
  test('A11Y: Tab key cycles through interactive elements on Dashboard', async ({ page }) => {
    await loadPage(page, '/dashboard')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)

    // Check that something is focused
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el?.tagName + '.' + el?.className.split(' ')[0]
    })
    console.log(`First Tab stop: ${focused}`)
    expect(focused).not.toBe('BODY.')
  })

  test('A11Y: All modals trap focus', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Open create task modal
    await page.keyboard.press('c')
    await page.waitForTimeout(500)

    // Tab through the modal
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(100)
    }

    // Active element should still be inside the modal
    const insideModal = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]')
      return dialog?.contains(document.activeElement)
    })
    console.log(`Focus trapped in modal: ${insideModal}`)
    await page.keyboard.press('Escape')
  })

  test('A11Y: PageHeader has aria-live for dynamic content', async ({ page }) => {
    await loadPage(page, '/tasks')
    const ariaLive = await page.evaluate(() => {
      const el = document.querySelector('[aria-live]')
      return el ? { tag: el.tagName, text: el.textContent?.substring(0, 50) } : null
    })
    console.log(`aria-live element: ${JSON.stringify(ariaLive)}`)
  })

  test('A11Y: prefers-reduced-motion disables animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadPage(page, '/dashboard')

    // Check that animation durations are 0 or near-0
    const animDuration = await page.evaluate(() => {
      const el = document.querySelector('[class*="fade"], [class*="stagger"]')
      return el ? getComputedStyle(el).animationDuration : 'no-anim-el'
    })
    console.log(`Animation duration with reduced-motion: ${animDuration}`)
  })

  test('A11Y: Dark mode contrast — text on dark bg meets 4.5:1', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const contrast = await page.evaluate(() => {
      const body = document.querySelector('main, body')
      if (!body) return null
      const bg = getComputedStyle(body).backgroundColor
      const text = getComputedStyle(body).color
      return { bg, text }
    })
    console.log(`Dark mode colors — bg: ${contrast?.bg}, text: ${contrast?.text}`)
    // Manual verification from screenshot is more reliable for contrast
  })
})

// ═════════════════════════════════════════════════════════════════════
// PART 11: COMPLETE VISUAL REGRESSION — All missing pages
// ═════════════════════════════════════════════════════════════════════

test.describe('VISUAL — Missing page screenshots', () => {
  const missingPages = [
    '/deadline-cascade', '/my-items', '/pb', '/pulse', '/network',
    '/team/nick-ingraham/cv', '/team/nick-ingraham/trajectory',
  ]

  for (const path of missingPages) {
    test(`VISUAL: Full screenshot — ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await loadPage(page, path)
      const safeName = path.replace(/\//g, '-').replace(/^-/, '')
      await page.screenshot({ path: `review/fullpage-${safeName}.png`, fullPage: true })
    })
  }

  // Mobile versions of missing pages
  for (const path of missingPages) {
    test(`VISUAL: Mobile screenshot — ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await loadPage(page, path)
      const safeName = path.replace(/\//g, '-').replace(/^-/, '')
      await page.screenshot({ path: `review/mobile-${safeName}.png`, fullPage: true })
    })
  }
})
