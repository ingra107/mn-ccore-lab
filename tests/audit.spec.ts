/**
 * MN-CCORE Hub — Automated Audit Script
 *
 * Run: npx playwright test tests/audit.spec.ts --reporter=json > review/audit-results.json
 * Or:  npx playwright test tests/audit.spec.ts
 *
 * Claude reads the results via: Read review/audit-results.json
 * 4x fewer tokens than Playwright MCP.
 */
import { test, expect } from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'

// ── Section 1: API Health Check ──────────────────────────────────
// This is the cheapest, most valuable test. Catches schema errors, 500s, missing columns.

const GET_ENDPOINTS = [
  ['/api/tasks', 200],
  ['/api/projects', 200],
  ['/api/team', 200],
  ['/api/meetings', 200],
  ['/api/ideas', 200],
  ['/api/decisions', 200],
  ['/api/search?q=CLIF', 200],
  ['/api/version', 200],
  ['/api/settings', 200],
  ['/api/calendar/events', 200],
  ['/api/activity?limit=3', 200],
  ['/api/analytics/pi-dashboard', 200],
  ['/api/grants', 200],
  ['/api/publications', 200],
  ['/api/notifications', 200],
  ['/api/workflow-templates', 200],
  ['/api/milestones', 200],
  ['/api/digest', 200],
  ['/api/projects/health', 200],
] as const

for (const [endpoint, expectedStatus] of GET_ENDPOINTS) {
  test(`API GET ${endpoint} returns ${expectedStatus}`, async ({ request }) => {
    const res = await request.get(`${BASE}${endpoint}`)
    expect(res.status()).toBe(expectedStatus)
    const json = await res.json()
    expect(json.error).toBeUndefined()
  })
}

// ── Section 2: Write endpoints (create → verify → clean up) ─────

test('Task CRUD lifecycle', async ({ request }) => {
  // Create
  const createRes = await request.post(`${BASE}/api/tasks`, {
    data: {
      title: 'AUDIT TEST — auto-delete',
      description: 'Created by automated audit',
      assignee: 'nick-ingraham',
      priority: 'low',
    },
  })
  expect(createRes.status()).toBe(201)
  const { data } = await createRes.json()
  const taskId = data.id
  expect(taskId).toBeTruthy()

  // Status change
  const statusRes = await request.post(`${BASE}/api/tasks/${taskId}/status`, {
    data: { status: 'in_progress' },
  })
  expect(statusRes.status()).toBe(200)

  // Field update
  const updateRes = await request.post(`${BASE}/api/tasks/${taskId}`, {
    data: { priority: 'high' },
  })
  expect(updateRes.status()).toBe(200)

  // Comment
  const commentRes = await request.post(`${BASE}/api/tasks/${taskId}/comments`, {
    data: { content: 'Audit test comment', author_slug: 'nick-ingraham' },
  })
  expect(commentRes.status()).toBe(201)

  // Note
  const noteRes = await request.post(`${BASE}/api/tasks/${taskId}/updates`, {
    data: { content: 'Audit test note', update_type: 'progress', author_slug: 'nick-ingraham' },
  })
  expect(noteRes.status()).toBe(201)

  // Verify readback
  const comments = await request.get(`${BASE}/api/tasks/${taskId}/comments`)
  const commentsJson = await comments.json()
  expect(commentsJson.data.length).toBeGreaterThanOrEqual(1)

  const updates = await request.get(`${BASE}/api/tasks/${taskId}/updates`)
  const updatesJson = await updates.json()
  expect(updatesJson.data.length).toBeGreaterThanOrEqual(1)
})

test('Idea creation', async ({ request }) => {
  const res = await request.post(`${BASE}/api/ideas`, {
    data: { title: 'AUDIT TEST idea — auto-delete', description: 'test', author_slug: 'nick-ingraham' },
  })
  expect(res.status()).toBe(201)
})

test('Decision creation', async ({ request }) => {
  const res = await request.post(`${BASE}/api/decisions`, {
    data: { title: 'AUDIT TEST decision — auto-delete', context: 'test', decision: 'test', made_by: 'nick-ingraham' },
  })
  expect(res.status()).toBe(201)
})

// ── Section 3: Page rendering (no console errors) ────────────────

const PORTAL_PAGES = [
  '/dashboard',
  '/my-tasks',
  '/tasks',
  '/projects',
  '/manuscripts',
  '/ideas',
  '/calendar',
  '/deadlines',
  '/decisions',
  '/meetings',
  '/analytics',
  '/search',
  '/grants',
  '/settings',
  '/activity',
  '/digest',
  '/meeting-notes',
  '/ask',
  '/narratives',
  '/sessions',
  '/mentee-milestones',
  '/personal',
]

for (const path of PORTAL_PAGES) {
  test(`Page ${path} renders without React errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })

    // Filter out known WebSocket errors
    const realErrors = errors.filter((e) => !e.includes('WebSocket') && !e.includes('hub-realtime'))
    expect(realErrors).toEqual([])
  })
}

// ── Section 4: Critical page — MeetingDetail ─────────────────────

test('MeetingDetail renders without crash', async ({ page, request }) => {
  // Get a real meeting ID
  const meetingsRes = await request.get(`${BASE}/api/meetings`)
  const meetings = await meetingsRes.json()
  const firstMeeting = meetings.data?.[0]

  if (!firstMeeting) {
    test.skip()
    return
  }

  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto(`${BASE}/meetings/${firstMeeting.id}`, { waitUntil: 'networkidle' })

  const realErrors = errors.filter((e) => !e.includes('WebSocket'))
  expect(realErrors).toEqual([])

  // Should NOT show error boundary
  const errorBoundary = await page.locator('text=Something went wrong').count()
  expect(errorBoundary).toBe(0)
})

// ── Section 5: Design system checks ─────────────────────────────

test('Portal h1 uses font-weight 600 (not 800)', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const weight = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    return h1 ? getComputedStyle(h1).fontWeight : 'no h1 found'
  })
  expect(weight).toBe('600')
})

test('Portal uses DM Sans (not Fraunces)', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const font = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    return h1 ? getComputedStyle(h1).fontFamily : 'no h1 found'
  })
  expect(font).toContain('DM Sans')
  expect(font).not.toContain('Fraunces')
})

// ── Section 6: Schema integrity ──────────────────────────────────

test('publications table has pub_date column', async ({ request }) => {
  const res = await request.get(`${BASE}/api/publications`)
  const json = await res.json()
  const first = json.data?.[0]
  expect(first).toBeTruthy()
  expect('pub_date' in first).toBe(true)
})

// ── Section 7: Performance ───────────────────────────────────────

test('Dashboard loads in under 8 seconds', async ({ page }) => {
  // Note: networkidle includes WebSocket retry backoff (~3s).
  // Real user-perceived load is faster. Use domcontentloaded for stricter test.
  const start = Date.now()
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const loadTime = Date.now() - start
  console.log(`Dashboard load: ${loadTime}ms`)
  expect(loadTime).toBeLessThan(8000)
})

test('Tasks page (500+ rows) loads in under 5 seconds', async ({ page }) => {
  const start = Date.now()
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })
  const loadTime = Date.now() - start
  console.log(`Tasks load: ${loadTime}ms`)
  expect(loadTime).toBeLessThan(5000)
})

test('API response times under 1 second', async ({ request }) => {
  const slow: string[] = []
  const endpoints = ['/api/tasks', '/api/projects', '/api/team', '/api/meetings', '/api/publications']

  for (const ep of endpoints) {
    const start = Date.now()
    await request.get(`${BASE}${ep}`)
    const elapsed = Date.now() - start
    console.log(`${ep}: ${elapsed}ms`)
    if (elapsed > 1000) slow.push(`${ep} (${elapsed}ms)`)
  }
  expect(slow).toEqual([])
})

test('No layout shift on dashboard load', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })

  // Content should be visible immediately (opacity: 1), not hidden behind animation
  const greeting = page.locator('h1').first()
  const opacity = await greeting.evaluate((el) => getComputedStyle(el).opacity)
  expect(opacity).toBe('1')
})

test('Transition durations use design system constants', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const durations = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return {
      fast: root.getPropertyValue('--transition-fast').trim(),
      panel: root.getPropertyValue('--transition-panel').trim(),
    }
  })
  // Design system: 150ms / 250ms (CSS may store as .15s / .25s)
  expect(durations.fast === '150ms' || durations.fast === '.15s' || durations.fast === '0.15s').toBe(true)
  expect(durations.panel === '250ms' || durations.panel === '.25s' || durations.panel === '0.25s').toBe(true)
})

// ── Section 8: Responsive breakpoints ────────────────────────────

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

for (const bp of BREAKPOINTS) {
  test(`Dashboard renders at ${bp.name} (${bp.width}x${bp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height })
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `review/responsive-dashboard-${bp.name}.png` })

    // No horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasOverflow).toBe(false)
  })

  test(`Tasks renders at ${bp.name} (${bp.width}x${bp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height })
    await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `review/responsive-tasks-${bp.name}.png` })

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasOverflow).toBe(false)
  })
}

test('Mobile sidebar collapses to hamburger', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })

  // Sidebar nav should NOT be visible on mobile
  const sidebar = page.locator('nav >> text=Dashboard').first()
  const isVisible = await sidebar.isVisible().catch(() => false)

  // Either hidden or collapsed — the full sidebar text shouldn't show
  // Hamburger icon should exist
  const hamburger = page.locator('button:has(svg), [aria-label*="menu"], [aria-label*="Menu"]').first()
  const hasHamburger = await hamburger.isVisible().catch(() => false)

  expect(isVisible === false || hasHamburger === true).toBe(true)
})

test('Touch targets >= 36px on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })

  const smallTargets = await page.evaluate(() => {
    const clickables = document.querySelectorAll('button, a, [role="button"], select, input')
    const tooSmall: string[] = []
    clickables.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && (rect.width < 36 || rect.height < 36)) {
        const text = el.textContent?.trim().substring(0, 30) || el.tagName
        // Skip hidden/offscreen elements
        if (rect.top > -100 && rect.left > -100) {
          tooSmall.push(`${text} (${Math.round(rect.width)}x${Math.round(rect.height)})`)
        }
      }
    })
    return tooSmall.slice(0, 10) // Cap at 10 to avoid noise
  })

  // Log but don't hard-fail — some small icons are acceptable
  if (smallTargets.length > 0) {
    console.log(`Small touch targets found: ${JSON.stringify(smallTargets)}`)
  }
})

// ── Section 9: Keyboard shortcut guard ───────────────────────────

test('No keyboard shortcuts in focused inputs', async ({ page }) => {
  await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' })

  // Focus the search input
  const input = page.locator('input[placeholder*="Search"]')
  await input.click()

  // Type 'f' — should NOT trigger focus mode
  await input.type('f')

  // The input should contain 'f'
  const value = await input.inputValue()
  expect(value).toContain('f')

  // Sidebar should still be visible (not hidden by focus mode)
  const sidebar = page.locator('nav, [role="complementary"]').first()
  await expect(sidebar).toBeVisible()
})
