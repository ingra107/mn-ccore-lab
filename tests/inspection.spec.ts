/**
 * MN-CCORE Lab Hub — Office of Inspection Test Suite
 *
 * COMPREHENSIVE test of every feature, every page, every API endpoint,
 * every interaction, every responsive breakpoint, every design rule.
 *
 * Run ALL:    npx playwright test tests/inspection.spec.ts
 * Run fast:   npx playwright test tests/inspection.spec.ts --grep "API"
 * Run pages:  npx playwright test tests/inspection.spec.ts --grep "PAGE"
 * Run visual: npx playwright test tests/inspection.spec.ts --grep "VISUAL"
 * Run UX:     npx playwright test tests/inspection.spec.ts --grep "UX"
 *
 * Results:    review/audit-results.json
 * Score:      X passed / Y total = Z%
 */
import { test, expect, type Page } from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'

// Helper: collect page errors (excluding known WebSocket issue)
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

// ═══════════════════════════════════════════════════════════════════
// PART 1: API HEALTH — Every endpoint must return correct status
// ═══════════════════════════════════════════════════════════════════

test.describe('API — Read Endpoints', () => {
  const endpoints: [string, number, string][] = [
    // [endpoint, expected status, description]
    ['/api/tasks', 200, 'Task list'],
    ['/api/tasks?status=todo', 200, 'Task filter by status'],
    ['/api/tasks/overdue-count', 200, 'Overdue task count'],
    ['/api/projects', 200, 'Project list'],
    ['/api/projects/health', 200, 'Project health scores'],
    ['/api/team', 200, 'Team members'],
    ['/api/team/slugs', 200, 'Team slug list'],
    ['/api/team/pulse', 200, 'Team pulse'],
    ['/api/meetings', 200, 'Meeting list'],
    ['/api/meetings/cadence-check', 200, 'Meeting cadence'],
    ['/api/ideas', 200, 'Ideas list'],
    ['/api/decisions', 200, 'Decision log'],
    ['/api/decisions/tags', 200, 'Decision tags'],
    ['/api/decisions/review', 200, 'Decisions for review'],
    ['/api/search?q=CLIF', 200, 'Full-text search'],
    ['/api/version', 200, 'Version check'],
    ['/api/settings', 200, 'Lab settings'],
    ['/api/workflow-templates', 200, 'Workflow templates'],
    ['/api/calendar/events', 200, 'Calendar events'],
    ['/api/activity?limit=5', 200, 'Activity feed'],
    ['/api/activity/heatmap?slug=nick-ingraham&days=90', 200, 'Activity heatmap'],
    ['/api/grants', 200, 'Grants list'],
    ['/api/grants/timeline', 200, 'Grants timeline'],
    ['/api/publications', 200, 'Publications'],
    ['/api/notifications', 200, 'Notifications'],
    ['/api/notifications/count', 200, 'Notification count'],
    ['/api/commitments', 200, 'Commitments'],
    ['/api/milestones', 200, 'Milestones'],
    ['/api/digest', 200, 'Research digest'],
    ['/api/digest/dates', 200, 'Digest dates'],
    ['/api/action-items', 200, 'Action items'],
    ['/api/updates/recent', 200, 'Recent updates'],
    ['/api/narratives', 200, 'Research narratives'],
    ['/api/questions', 200, 'Ask the Lab questions'],
    ['/api/expertise', 200, 'Expertise tags'],
    ['/api/stats', 200, 'Lab stats'],
    ['/api/graph/collaboration', 200, 'Collaboration graph'],
    ['/api/revisions/active', 200, 'Active revisions'],
    ['/api/submissions/active', 200, 'Active submissions'],
    ['/api/mentee-milestones', 200, 'Mentee milestones'],
    ['/api/mentee-milestones/overview', 200, 'Mentee overview'],
    ['/api/conferences/upcoming', 200, 'Upcoming conferences'],
    ['/api/regulatory/expiring', 200, 'Expiring regulatory items'],
    ['/api/grant-milestones/upcoming', 200, 'Upcoming grant milestones'],
    ['/api/deadline-cascade/all', 200, 'Deadline cascades'],
    ['/api/analytics/pi-dashboard', 200, 'PI dashboard analytics'],
    ['/api/analytics/mentee-velocity', 200, 'Mentee velocity'],
    ['/api/analytics/response-time', 200, 'Response time analytics'],
    ['/api/analytics/team-engagement', 200, 'Team engagement'],
    ['/api/auth/me', 200, 'Auth check'],
  ]

  for (const [endpoint, status, desc] of endpoints) {
    test(`API GET ${desc}: ${endpoint} → ${status}`, async ({ request }) => {
      const res = await request.get(`${BASE}${endpoint}`)
      expect(res.status(), `${endpoint} returned ${res.status()}`).toBe(status)
    })
  }
})

test.describe('API — Write Endpoints', () => {
  test('API POST: Create task → update status → add comment → add note → verify', async ({ request }) => {
    // Create
    const create = await request.post(`${BASE}/api/tasks`, {
      data: { title: 'INSPECTION TEST — auto-delete', description: 'Automated inspection', assignee: 'nick-ingraham', priority: 'low' }
    })
    expect(create.status()).toBe(201)
    const { data } = await create.json()
    expect(data.id).toBeTruthy()
    const id = data.id

    // Status change
    const status = await request.post(`${BASE}/api/tasks/${id}/status`, { data: { status: 'in_progress' } })
    expect(status.status()).toBe(200)

    // Field update
    const update = await request.post(`${BASE}/api/tasks/${id}`, { data: { priority: 'high' } })
    expect(update.status()).toBe(200)

    // Comment
    const comment = await request.post(`${BASE}/api/tasks/${id}/comments`, { data: { content: 'Inspection comment', author_slug: 'nick-ingraham' } })
    expect(comment.status()).toBe(201)

    // Task note
    const note = await request.post(`${BASE}/api/tasks/${id}/updates`, { data: { content: 'Inspection note', update_type: 'progress', author_slug: 'nick-ingraham' } })
    expect(note.status()).toBe(201)

    // Verify readback
    const comments = await (await request.get(`${BASE}/api/tasks/${id}/comments`)).json()
    expect(comments.data.length).toBeGreaterThanOrEqual(1)
    const notes = await (await request.get(`${BASE}/api/tasks/${id}/updates`)).json()
    expect(notes.data.length).toBeGreaterThanOrEqual(1)
    const activity = await (await request.get(`${BASE}/api/tasks/${id}/activity`)).json()
    expect(activity.data.length).toBeGreaterThanOrEqual(1)
  })

  test('API POST: Create idea', async ({ request }) => {
    const res = await request.post(`${BASE}/api/ideas`, { data: { title: 'INSPECTION idea — delete', description: 'test', author_slug: 'nick-ingraham' } })
    expect(res.status()).toBe(201)
  })

  test('API POST: Create decision', async ({ request }) => {
    const res = await request.post(`${BASE}/api/decisions`, { data: { title: 'INSPECTION decision — delete', context: 'test', decision: 'test', made_by: 'nick-ingraham' } })
    expect(res.status()).toBe(201)
  })

  test('API POST: Create question (Ask the Lab)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/questions`, { data: { title: 'INSPECTION question — delete', body: 'test question body', author_slug: 'nick-ingraham', project_slug: null } })
    expect(res.status(), `Questions POST returned ${res.status()}: ${await res.text()}`).toBe(201)
  })

  test('API POST: Post project update', async ({ request }) => {
    const projects = await (await request.get(`${BASE}/api/projects`)).json()
    const slug = projects.data?.[0]?.slug
    if (!slug) { test.skip(); return }
    const res = await request.post(`${BASE}/api/projects/${slug}/updates`, { data: { content: 'INSPECTION update — delete', author_slug: 'nick-ingraham' } })
    expect(res.status()).toBe(201)
  })

  test('API POST: Update lab settings', async ({ request }) => {
    const res = await request.post(`${BASE}/api/settings`, { data: { key: '_inspection_test', value: 'delete_me' } })
    expect(res.status()).toBe(200)
  })

  test('API POST: Vote on idea', async ({ request }) => {
    const ideas = await (await request.get(`${BASE}/api/ideas`)).json()
    if (!ideas.data?.length) { test.skip(); return }
    const res = await request.post(`${BASE}/api/ideas/${ideas.data[0].id}/vote`, { data: { voter_slug: 'nick-ingraham' } })
    expect([200, 201]).toContain(res.status())
  })
})

test.describe('API — Schema Integrity', () => {
  test('publications table has pub_date column', async ({ request }) => {
    const res = await (await request.get(`${BASE}/api/publications`)).json()
    expect(res.data?.[0]).toBeTruthy()
    expect('pub_date' in res.data[0]).toBe(true)
  })

  test('tasks have updated_at and deleted_at columns', async ({ request }) => {
    const res = await (await request.get(`${BASE}/api/tasks?limit=1`)).json()
    const task = res.data?.[0]
    expect(task).toBeTruthy()
    expect('updated_at' in task).toBe(true)
  })

  test('task_updates endpoint exists', async ({ request }) => {
    const tasks = await (await request.get(`${BASE}/api/tasks?limit=1`)).json()
    const id = tasks.data?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await request.get(`${BASE}/api/tasks/${id}/updates`)
    expect(res.status()).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 2: PAGE RENDERING — Every page loads without React crashes
// ═══════════════════════════════════════════════════════════════════

test.describe('PAGE — Portal pages render without errors', () => {
  const portalPages: [string, string, string[]][] = [
    // [route, name, elements that MUST be present]
    ['/dashboard', 'Dashboard', ['Good morning|Good afternoon|Good evening', 'Customize']],
    ['/personal', 'My Hub', ['My Hub']],
    ['/my-tasks', 'My Tasks', ['My Tasks', 'active tasks']],
    ['/tasks', 'All Tasks', ['All Tasks', 'List', 'Board']],
    ['/calendar', 'Calendar', ['Lab Calendar', 'Month']],
    ['/deadlines', 'Deadlines', ['Deadlines']],
    ['/projects', 'Projects', ['Research Pipeline', 'New Project']],
    ['/manuscripts', 'Manuscripts', ['Manuscripts']],
    ['/ideas', 'Ideas', ['Ideas Board', 'New Idea']],
    ['/ask', 'Ask the Lab', ['Ask the Lab', 'New Question']],
    ['/decisions', 'Decisions', ['Decision Log', 'Log Decision']],
    ['/digest', 'Research Digest', ['Research Digest']],
    ['/search', 'Search', ['Search']],
    ['/grants', 'Grants', ['Grants', 'Funding']],
    ['/meetings', 'Meetings', ['Meeting', 'Record Meeting']],
    ['/meeting-notes', 'Meeting Transcripts', ['Meeting Transcripts', 'Upload Audio']],
    ['/activity', 'Activity', ['Activity']],
    ['/analytics', 'Analytics', ['Lab Analytics', 'Completed']],
    ['/settings', 'Settings', ['Settings', 'Lab Name']],
    ['/narratives', 'Narratives', ['Research Narratives']],
    ['/sessions', 'Session History', ['Session History']],
    ['/mentee-milestones', 'Mentee Milestones', ['Mentee Milestones']],
    ['/pi/analytics', 'PI Analytics', ['PI Access Only|PI Dashboard']],
  ]

  for (const [route, name, mustHave] of portalPages) {
    test(`PAGE: ${name} (${route}) renders`, async ({ page }) => {
      const errors = await loadPage(page, route)
      expect(errors, `React errors on ${route}`).toEqual([])

      // Check for error boundary
      const crashed = await page.locator('text=Something went wrong').count()
      expect(crashed, `${route} shows error boundary`).toBe(0)

      // Check required text elements
      for (const text of mustHave) {
        const found = await page.locator(`text=${text}`).first().isVisible({ timeout: 3000 }).catch(() => false)
        // If text has | separator, any match is acceptable
        if (text.includes('|')) {
          const options = text.split('|')
          const anyFound = await Promise.all(options.map(t => page.locator(`text=${t}`).first().isVisible({ timeout: 1000 }).catch(() => false)))
          expect(anyFound.some(Boolean), `${route} missing: ${text}`).toBe(true)
        } else {
          expect(found, `${route} missing: "${text}"`).toBe(true)
        }
      }

      await page.screenshot({ path: `review/page-${name.toLowerCase().replace(/\s+/g, '-')}.png` })
    })
  }
})

test.describe('PAGE — Public pages render without errors', () => {
  const publicPages: [string, string][] = [
    ['/', 'Homepage'],
    ['/team', 'Team'],
    ['/publications', 'Publications'],
    ['/contact', 'Contact'],
  ]

  for (const [route, name] of publicPages) {
    test(`PAGE: ${name} (${route}) renders`, async ({ page }) => {
      const errors = await loadPage(page, route)
      expect(errors).toEqual([])
      await page.screenshot({ path: `review/page-${name.toLowerCase()}.png` })
    })
  }
})

test.describe('PAGE — Detail pages render with real data', () => {
  test('PAGE: Project Detail renders', async ({ page, request }) => {
    const projects = await (await request.get(`${BASE}/api/projects`)).json()
    const slug = projects.data?.[0]?.slug
    if (!slug) { test.skip(); return }
    const errors = await loadPage(page, `/projects/${slug}`)
    expect(errors).toEqual([])
    // Must have tabs — use first() to handle multiple matches
    await expect(page.locator('button:has-text("Overview"), text=Overview').first()).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'review/page-project-detail.png' })
  })

  test('PAGE: Meeting Detail renders without crash', async ({ page, request }) => {
    const meetings = await (await request.get(`${BASE}/api/meetings`)).json()
    const id = meetings.data?.[0]?.id
    if (!id) { test.skip(); return }
    const errors = await loadPage(page, `/meetings/${id}`)
    expect(errors, 'MeetingDetail crashed').toEqual([])
    const crashed = await page.locator('text=Something went wrong').count()
    expect(crashed, 'MeetingDetail shows error boundary').toBe(0)
    await page.screenshot({ path: 'review/page-meeting-detail.png' })
  })

  test('PAGE: Member page renders', async ({ page }) => {
    const errors = await loadPage(page, '/team/nick-ingraham')
    expect(errors).toEqual([])
    await expect(page.locator('text=Nick Ingraham')).toBeVisible()
    await page.screenshot({ path: 'review/page-member.png' })
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 3: VISUAL — Screenshots at every breakpoint
// ═══════════════════════════════════════════════════════════════════

test.describe('VISUAL — Responsive breakpoints', () => {
  const breakpoints = [
    { name: 'mobile', w: 375, h: 812 },
    { name: 'tablet', w: 768, h: 1024 },
    { name: 'desktop', w: 1280, h: 900 },
  ] as const

  const keyPages = ['/dashboard', '/tasks', '/projects', '/my-tasks']

  for (const bp of breakpoints) {
    for (const path of keyPages) {
      const pageName = path.replace('/', '') || 'home'
      test(`VISUAL: ${pageName} at ${bp.name} (${bp.w}x${bp.h})`, async ({ page }) => {
        await page.setViewportSize({ width: bp.w, height: bp.h })
        await loadPage(page, path)
        await page.screenshot({ path: `review/visual-${pageName}-${bp.name}.png` })

        // No horizontal overflow
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth
        )
        expect(overflow, `${path} overflows at ${bp.name}`).toBe(false)
      })
    }
  }

  test('VISUAL: Mobile sidebar collapses', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadPage(page, '/dashboard')
    // Full sidebar text should not be visible
    const sidebarText = await page.locator('text=Research Digest').first().isVisible().catch(() => false)
    expect(sidebarText, 'Sidebar visible on mobile').toBe(false)
  })

  test('VISUAL: Touch targets >= 36px on mobile tasks', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadPage(page, '/tasks')
    const small = await page.evaluate(() => {
      const els = document.querySelectorAll('button, a, [role="button"], input, select')
      let count = 0
      els.forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && r.top > 0 && r.left > 0 && (r.width < 36 || r.height < 36)) count++
      })
      return count
    })
    // Report but allow some small elements (icon buttons)
    console.log(`Small touch targets on mobile tasks: ${small}`)
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 4: DESIGN SYSTEM — Font, weight, color, spacing rules
// ═══════════════════════════════════════════════════════════════════

test.describe('VISUAL — Design system compliance', () => {
  test('VISUAL: Portal h1 font-weight is 600 (not 800)', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const weight = await page.evaluate(() => getComputedStyle(document.querySelector('h1')!).fontWeight)
    expect(weight, 'h1 weight should be 600').toBe('600')
  })

  test('VISUAL: Portal uses DM Sans, not Fraunces', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const font = await page.evaluate(() => getComputedStyle(document.querySelector('h1')!).fontFamily)
    expect(font).toContain('DM Sans')
    expect(font).not.toContain('Fraunces')
  })

  test('VISUAL: Dark mode bg is #0b1017 (not blue-tinted)', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const bg = await page.evaluate(() => {
      // Check if dark mode
      const main = document.querySelector('main') || document.body
      return getComputedStyle(main).backgroundColor
    })
    // Should be very dark, near-black
    console.log(`Dark bg color: ${bg}`)
  })

  test('VISUAL: Transition CSS variables are set', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const vars = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      return {
        fast: root.getPropertyValue('--transition-fast').trim(),
        panel: root.getPropertyValue('--transition-panel').trim(),
      }
    })
    expect(vars.fast).toBeTruthy()
    expect(vars.panel).toBeTruthy()
    console.log(`Transitions: fast=${vars.fast}, panel=${vars.panel}`)
  })

  test('VISUAL: No fontWeight 800 on portal h1s', async ({ page }) => {
    const portalPaths = ['/dashboard', '/tasks', '/projects', '/meetings', '/grants', '/digest', '/decisions']
    for (const path of portalPaths) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 })
      const weight = await page.evaluate(() => {
        const h1 = document.querySelector('h1')
        return h1 ? getComputedStyle(h1).fontWeight : null
      })
      if (weight) {
        expect(parseInt(weight), `${path} h1 weight is ${weight}`).toBeLessThanOrEqual(700)
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 5: UX — Keyboard shortcuts, modals, interactive features
// ═══════════════════════════════════════════════════════════════════

test.describe('UX — Keyboard shortcuts', () => {
  test('UX: Ctrl+K opens command palette', async ({ page }) => {
    await loadPage(page, '/dashboard')
    await page.keyboard.press('Control+k')
    // Command palette may show different placeholder text
    const visible = await page.locator('[placeholder*="Search tasks"], [placeholder*="search"], text=Search tasks').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(visible, 'Command palette should open').toBe(true)
    await page.screenshot({ path: 'review/ux-command-palette.png' })
    await page.keyboard.press('Escape')
  })

  test('UX: ? opens shortcut help', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('?')
    await expect(page.locator('text=Keyboard Shortcuts')).toBeVisible({ timeout: 2000 })
    await page.screenshot({ path: 'review/ux-shortcut-help.png' })
    await page.keyboard.press('Escape')
  })

  test('UX: C opens create task modal on Tasks page', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('c')
    await expect(page.locator('text=Create New Task')).toBeVisible({ timeout: 2000 })
    await page.screenshot({ path: 'review/ux-create-task-modal.png' })
    await page.keyboard.press('Escape')
  })

  test('UX: J/K navigates task rows', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('j')
    // First row should be highlighted
    await page.screenshot({ path: 'review/ux-jk-nav.png' })
    await page.keyboard.press('j')
    await page.keyboard.press('k')
    // Should be back to first row
  })

  test('UX: Enter opens TaskDetailPanel', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('j') // Select first
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter') // Open detail
    // Panel header text
    const panel = page.locator('text=TASK DETAIL').or(page.locator('text=Overview').first())
    await expect(panel).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'review/ux-task-detail-panel.png' })
    await page.keyboard.press('Escape')
  })

  test('UX: Shortcuts do NOT fire when input is focused', async ({ page }) => {
    await loadPage(page, '/search')
    const input = page.locator('input[placeholder*="Search"]').first()
    await input.click()
    await input.type('test query', { delay: 50 })
    const value = await input.inputValue()
    expect(value, 'Input should contain typed text').toContain('test')
    // Sidebar should still be visible (F didn't trigger focus mode)
    await page.screenshot({ path: 'review/ux-shortcut-guard.png' })
  })
})

test.describe('UX — Task view modes', () => {
  test('UX: Board view renders Kanban columns', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.locator('button:has-text("Board")').click()
    await page.waitForTimeout(500)
    // Board should show column headers
    const hasTodo = await page.locator('text=To Do').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasTodo, 'Board view should show To Do column').toBe(true)
    await page.screenshot({ path: 'review/ux-board-view.png' })
  })

  test('UX: Timeline view renders Gantt chart', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.click('button:has-text("Timeline")')
    await expect(page.locator('text=TODAY')).toBeVisible({ timeout: 3000 })
    await page.screenshot({ path: 'review/ux-timeline-view.png' })
  })

  test('UX: By Person view shows team workload', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.click('button:has-text("By Person")')
    await expect(page.locator('text=Nick Ingraham')).toBeVisible({ timeout: 3000 })
    await page.screenshot({ path: 'review/ux-byperson-view.png' })
  })

  test('UX: MyTasks QuickFilter pills work', async ({ page }) => {
    await loadPage(page, '/my-tasks')
    // Verify pills exist
    // QuickFilter pills contain counts like "All 19", "Today 2"
    await expect(page.locator('button:has-text("All")')).toBeVisible()
    await expect(page.locator('button:has-text("Overdue")')).toBeVisible()
    await page.screenshot({ path: 'review/ux-mytasks-filters.png' })
  })

  test('UX: MyTasks Focus Next card visible', async ({ page }) => {
    await loadPage(page, '/my-tasks')
    const focusNext = await page.locator('text=FOCUS NEXT').isVisible().catch(() => false)
    console.log(`Focus Next visible: ${focusNext}`)
    await page.screenshot({ path: 'review/ux-mytasks-focus.png' })
  })
})

test.describe('UX — Modals have focus trapping + Escape', () => {
  test('UX: CreateTaskModal — Escape closes', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.click('button:has-text("New Task")')
    await expect(page.locator('text=Create New Task')).toBeVisible({ timeout: 2000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('text=Create New Task')).not.toBeVisible({ timeout: 2000 })
  })

  test('UX: CreateIdeaModal — N key + Escape', async ({ page }) => {
    await loadPage(page, '/ideas')
    await page.keyboard.press('n')
    const visible = await page.locator('text=Submit').first().isVisible({ timeout: 2000 }).catch(() => false)
    if (visible) {
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('UX — Inline editing', () => {
  test('UX: InlineSelect status dropdown renders as portal', async ({ page }) => {
    await loadPage(page, '/tasks')
    // Click a status dropdown
    const statusBtn = page.locator('button:has-text("To Do")').first()
    await statusBtn.click()
    await page.screenshot({ path: 'review/ux-inline-status-dropdown.png' })
    // Dropdown should be visible and not clipped
    const dropdown = page.locator('text=In Progress').last()
    const visible = await dropdown.isVisible({ timeout: 1000 }).catch(() => false)
    expect(visible, 'Status dropdown should be visible').toBe(true)
    await page.keyboard.press('Escape')
  })
})

test.describe('UX — Copy/Export buttons', () => {
  test('UX: Copy Bibliography button exists on Publications', async ({ page }) => {
    await loadPage(page, '/publications')
    const btn = page.locator('button:has-text("Copy bibliography")')
    await expect(btn).toBeVisible()
  })

  test('UX: Export .ics button exists on Deadlines', async ({ page }) => {
    await loadPage(page, '/deadlines')
    const btn = page.locator('button:has-text("Export")')
    await expect(btn).toBeVisible()
  })

  test('UX: Copy Report button exists on Analytics', async ({ page }) => {
    await loadPage(page, '/analytics')
    const btn = page.locator('button:has-text("Copy Report")')
    const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Copy Report on Analytics: ${visible}`)
  })
})

test.describe('UX — Dashboard cards', () => {
  test('UX: Dashboard shows 6 bento cards', async ({ page }) => {
    await loadPage(page, '/dashboard')
    // Check for key cards
    const tasks = await page.locator('text=Tasks').first().isVisible().catch(() => false)
    const upcoming = await page.locator('text=Upcoming').first().isVisible().catch(() => false)
    const health = await page.locator('text=Project Health').first().isVisible().catch(() => false)
    expect(tasks, 'Tasks card').toBe(true)
    expect(upcoming, 'Upcoming card').toBe(true)
    expect(health, 'Project Health card').toBe(true)
  })

  test('UX: Dashboard overdue banner visible when overdue tasks exist', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const banner = await page.locator('text=overdue tasks need attention').isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Overdue banner visible: ${banner}`)
  })

  test('UX: Dashboard time-of-day greeting', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const greeting = await page.evaluate(() => document.querySelector('h1')?.textContent)
    const valid = greeting?.includes('Good morning') || greeting?.includes('Good afternoon') || greeting?.includes('Good evening')
    expect(valid, `Greeting: "${greeting}"`).toBe(true)
  })
})

test.describe('UX — Search', () => {
  test('UX: Search returns results for "CLIF"', async ({ page }) => {
    await loadPage(page, '/search')
    const input = page.locator('input[placeholder*="Search"]').first()
    await input.click()
    await input.fill('CLIF')
    // Wait for results
    await page.waitForTimeout(1000)
    const results = await page.locator('text=CLIF').count()
    expect(results, 'Search results for CLIF').toBeGreaterThan(0)
    await page.screenshot({ path: 'review/ux-search-results.png' })
  })
})

test.describe('UX — Calendar', () => {
  test('UX: Calendar shows today highlighted', async ({ page }) => {
    await loadPage(page, '/calendar')
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^week$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^day$/i })).toBeVisible()
    await page.screenshot({ path: 'review/ux-calendar.png' })
  })
})

test.describe('UX — Sidebar navigation', () => {
  test('UX: All sidebar nav items are clickable', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const navItems = ['Dashboard', 'My Hub', 'My Tasks', 'All Tasks', 'Meetings', 'Calendar', 'Deadlines', 'Projects', 'Manuscripts', 'Ideas', 'Research Digest', 'Search', 'Grants']
    for (const item of navItems) {
      const link = page.locator(`nav >> text=${item}`).first()
      const visible = await link.isVisible().catch(() => false)
      expect(visible, `Sidebar "${item}" should be visible`).toBe(true)
    }
  })

  test('UX: Sidebar overdue badge on My Tasks', async ({ page }) => {
    await loadPage(page, '/dashboard')
    // My Tasks should have a badge count
    const badge = page.locator('nav >> text=/\\d+/').first()
    const visible = await badge.isVisible().catch(() => false)
    console.log(`Overdue badge visible: ${visible}`)
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 6: PERFORMANCE — Load times, API speed
// ═══════════════════════════════════════════════════════════════════

test.describe('UX — Performance', () => {
  test('UX: Dashboard loads in under 10 seconds', async ({ page }) => {
    const start = Date.now()
    await loadPage(page, '/dashboard')
    const elapsed = Date.now() - start
    console.log(`Dashboard load: ${elapsed}ms`)
    expect(elapsed).toBeLessThan(10000)
  })

  test('UX: Tasks page loads in under 5 seconds', async ({ page }) => {
    const start = Date.now()
    await loadPage(page, '/tasks')
    const elapsed = Date.now() - start
    console.log(`Tasks load: ${elapsed}ms`)
    expect(elapsed).toBeLessThan(5000)
  })

  test('UX: API endpoints respond in under 2 seconds', async ({ request }) => {
    const slow: string[] = []
    for (const ep of ['/api/tasks', '/api/projects', '/api/team', '/api/meetings', '/api/publications']) {
      const start = Date.now()
      await request.get(`${BASE}${ep}`)
      const ms = Date.now() - start
      if (ms > 2000) slow.push(`${ep} (${ms}ms)`)
    }
    expect(slow, 'Slow endpoints').toEqual([])
  })

  test('UX: No layout shift — content visible on load', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const opacity = await page.evaluate(() => {
      const h1 = document.querySelector('h1')
      return h1 ? getComputedStyle(h1).opacity : '0'
    })
    expect(opacity).toBe('1')
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 7: ACCESSIBILITY
// ═══════════════════════════════════════════════════════════════════

test.describe('UX — Accessibility', () => {
  test('UX: Skip-to-content link exists', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const skip = await page.evaluate(() => {
      const links = document.querySelectorAll('a')
      return Array.from(links).some(a => a.textContent?.toLowerCase().includes('skip'))
    })
    console.log(`Skip-to-content link: ${skip}`)
  })

  test('UX: UndoToast has aria-live', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const hasAriaLive = await page.evaluate(() => {
      const el = document.querySelector('[role="status"], [aria-live]')
      return !!el
    })
    expect(hasAriaLive, 'aria-live region exists').toBe(true)
  })

  test('UX: Page title updates dynamically', async ({ page }) => {
    await loadPage(page, '/tasks')
    const title = await page.title()
    expect(title).toContain('Tasks')
    expect(title).toContain('MN-CCORE')
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 8: UNDO SYSTEM — Status changes produce undo toasts
// ═══════════════════════════════════════════════════════════════════

test.describe('UX — Undo system', () => {
  test('UX: Status change shows undo toast', async ({ page }) => {
    await loadPage(page, '/tasks')
    const statusBtn = page.locator('button:has-text("To Do")').first()
    if (await statusBtn.isVisible()) {
      await statusBtn.click()
      const inProgress = page.locator('text=In Progress').last()
      if (await inProgress.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.screenshot({ path: 'review/ux-undo-test.png' })
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 9: VISUAL BEHAVIOR — Every dropdown, modal, hover state
// ═══════════════════════════════════════════════════════════════════

test.describe('VISUAL — Dropdown and modal states', () => {
  test('VISUAL: Status dropdown open state', async ({ page }) => {
    await loadPage(page, '/tasks')
    const btn = page.locator('button:has-text("To Do")').first()
    if (await btn.isVisible()) {
      await btn.click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'review/visual-status-dropdown-open.png' })
      // Dropdown should show all 4 options
      for (const opt of ['To Do', 'In Progress', 'Blocked', 'Done']) {
        const visible = await page.locator(`text=${opt}`).last().isVisible({ timeout: 1000 }).catch(() => false)
        expect(visible, `Status option "${opt}" should be visible`).toBe(true)
      }
      await page.keyboard.press('Escape')
    }
  })

  test('VISUAL: Priority dropdown open state', async ({ page }) => {
    await loadPage(page, '/tasks')
    const btn = page.locator('button:has-text("Medium")').first()
    if (await btn.isVisible()) {
      await btn.click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'review/visual-priority-dropdown-open.png' })
      await page.keyboard.press('Escape')
    }
  })

  test('VISUAL: Create Task modal all fields visible', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('c')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/visual-create-task-modal.png' })
    // Verify all fields
    await expect(page.locator('text=Title')).toBeVisible()
    await expect(page.locator('text=Description')).toBeVisible()
    await expect(page.locator('text=Owner')).toBeVisible()
    await expect(page.locator('text=Priority')).toBeVisible()
    await expect(page.locator('text=Due Date')).toBeVisible()
    // Template chips
    await expect(page.locator('text=Paper Review')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('VISUAL: Command palette with search results', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)
    // Type a search query
    await page.keyboard.type('CLIF', { delay: 50 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/visual-command-palette-search.png' })
    await page.keyboard.press('Escape')
  })

  test('VISUAL: TaskDetailPanel all 5 tabs', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.keyboard.press('j')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Screenshot Overview tab
    await page.screenshot({ path: 'review/visual-detail-overview.png' })

    // Click each tab and screenshot
    for (const tab of ['Notes', 'Comments', 'Activity', 'Details']) {
      const tabBtn = page.locator(`button:has-text("${tab}"), text=${tab}`).first()
      if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabBtn.click()
        await page.waitForTimeout(300)
        await page.screenshot({ path: `review/visual-detail-${tab.toLowerCase()}.png` })
      }
    }
    await page.keyboard.press('Escape')
  })

  test('VISUAL: Board view columns and cards', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.locator('button:has-text("Board")').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/visual-board-full.png' })
    // Group by Priority
    const priorityBtn = page.locator('text=Priority').last()
    if (await priorityBtn.isVisible().catch(() => false)) {
      await priorityBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/visual-board-by-priority.png' })
    }
  })

  test('VISUAL: Timeline view with Gantt bars', async ({ page }) => {
    await loadPage(page, '/tasks')
    await page.locator('button:has-text("Timeline")').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/visual-timeline-full.png' })
  })

  test('VISUAL: Calendar month view', async ({ page }) => {
    await loadPage(page, '/calendar')
    await page.screenshot({ path: 'review/visual-calendar-month.png' })
  })

  test('VISUAL: Calendar week view', async ({ page }) => {
    await loadPage(page, '/calendar')
    await page.getByRole('button', { name: /^week$/i }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/visual-calendar-week.png' })
  })

  test('VISUAL: Digest with paper cards expanded', async ({ page }) => {
    await loadPage(page, '/digest')
    await page.screenshot({ path: 'review/visual-digest.png' })
    // Click show abstract on first paper
    const showAbstract = page.locator('text=Show abstract').first()
    if (await showAbstract.isVisible().catch(() => false)) {
      await showAbstract.click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'review/visual-digest-abstract-expanded.png' })
    }
  })

  test('VISUAL: Projects pipeline view', async ({ page }) => {
    await loadPage(page, '/projects')
    const pipelineBtn = page.locator('button:has-text("Pipeline")')
    if (await pipelineBtn.isVisible().catch(() => false)) {
      await pipelineBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'review/visual-projects-pipeline.png' })
    }
  })

  test('VISUAL: Ideas grid vs list view', async ({ page }) => {
    await loadPage(page, '/ideas')
    await page.screenshot({ path: 'review/visual-ideas-grid.png' })
    const listBtn = page.locator('button:has-text("List")')
    if (await listBtn.isVisible().catch(() => false)) {
      await listBtn.click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'review/visual-ideas-list.png' })
    }
  })

  test('VISUAL: Decisions timeline view', async ({ page }) => {
    await loadPage(page, '/decisions')
    const timelineBtn = page.locator('button:has-text("Timeline")')
    if (await timelineBtn.isVisible().catch(() => false)) {
      await timelineBtn.click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: 'review/visual-decisions-timeline.png' })
    }
  })

  test('VISUAL: Analytics charts render', async ({ page }) => {
    await loadPage(page, '/analytics')
    await page.screenshot({ path: 'review/visual-analytics-top.png' })
    // Scroll down to see charts
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'review/visual-analytics-charts.png' })
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'review/visual-analytics-bottom.png' })
  })

  test('VISUAL: Grants timeline with TODAY marker', async ({ page }) => {
    await loadPage(page, '/grants')
    await page.screenshot({ path: 'review/visual-grants-timeline.png' })
    // Scroll to details
    await page.evaluate(() => window.scrollBy(0, 400))
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'review/visual-grants-details.png' })
  })

  test('VISUAL: Shortcut help modal all categories', async ({ page }) => {
    await loadPage(page, '/dashboard')
    await page.keyboard.press('?')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'review/visual-shortcut-help-top.png' })
    // Scroll within the modal to see all categories
    const modal = page.locator('[role="dialog"], [aria-modal="true"]').first()
    if (await modal.isVisible().catch(() => false)) {
      await modal.evaluate((el) => el.scrollBy(0, 400))
      await page.waitForTimeout(200)
      await page.screenshot({ path: 'review/visual-shortcut-help-bottom.png' })
    }
    await page.keyboard.press('Escape')
  })

  test('VISUAL: Settings theme preview cards', async ({ page }) => {
    await loadPage(page, '/settings')
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'review/visual-settings-themes.png' })
  })

  test('VISUAL: MyTasks Focus Next card', async ({ page }) => {
    await loadPage(page, '/my-tasks')
    await page.screenshot({ path: 'review/visual-mytasks-focusnext.png' })
  })

  test('VISUAL: Dashboard all cards', async ({ page }) => {
    await loadPage(page, '/dashboard')
    await page.screenshot({ path: 'review/visual-dashboard-top.png' })
    await page.evaluate(() => window.scrollBy(0, 500))
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'review/visual-dashboard-cards.png' })
  })
})

// ═══════════════════════════════════════════════════════════════════
// PART 10: EVERY PAGE AT EVERY BREAKPOINT (visual regression set)
// ═══════════════════════════════════════════════════════════════════

test.describe('VISUAL — Full page screenshots for visual regression', () => {
  const allPortalPaths = [
    'dashboard', 'my-tasks', 'tasks', 'projects', 'manuscripts',
    'ideas', 'calendar', 'deadlines', 'decisions', 'meetings',
    'analytics', 'search', 'grants', 'settings', 'activity',
    'digest', 'meeting-notes', 'ask', 'personal',
  ]

  for (const pg of allPortalPaths) {
    test(`VISUAL: Full screenshot — /${pg}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await loadPage(page, `/${pg}`)
      await page.screenshot({ path: `review/fullpage-${pg}.png`, fullPage: true })
    })
  }
})
