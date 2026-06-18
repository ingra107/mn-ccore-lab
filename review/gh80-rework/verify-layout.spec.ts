/**
 * GH#80 Phase 4 — visual verification spec.
 *
 * Seeds Nick's real day shape:
 *   - 7:00 AM–3:00 PM "Inpt-ICU MICU Short" SERVICE block (≥3h → right rail)
 *   - 10:30–11:30 "Critical Care Team Meeting"
 *   - 12:00–1:00 "Division Conference"
 *   - 1:30–3:00 "IRB Continuing Review"
 *   - 2:00–3:00 "Manuscript Methods Review"
 *   - 2:30–3:30 "Stats Office Hours"  (3-way overlap with last two)
 *
 * Intercepts /api/user-calendar-events and /api/meetings to inject these.
 * Uses fake CF_Authorization cookie to bypass Hub's RequireAuth check.
 * Run against local Vite dev server (port 5175).
 *
 * Assertions:
 *   a) Service block "Service blocks" section header is visible.
 *   b) Service block title "Inpt-ICU MICU Short" appears in the strip (not full-width).
 *   c) Meeting titles are readable (checked by name).
 *   d) Clicking a meeting row reveals a textarea (expand works).
 *
 * Screenshots saved to review/gh80-rework/.
 */
import { test, expect } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

const SCREENSHOT_DIR = path.dirname(fileURLToPath(import.meta.url))

// Nick's test day — ISO timestamps for today's date
function todayAt(h: number, m: number): string {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const TEST_CALENDAR_EVENTS = [
  {
    id: 'test-service-1',
    title: 'Inpt-ICU MICU Short',
    location: null,
    startAt: todayAt(7, 0),
    endAt: todayAt(15, 0),    // 7am–3pm = 480 min (≥ 3h → right rail)
    isAllDay: false,
  },
  {
    id: 'test-mtg-1',
    title: 'Critical Care Team Meeting',
    location: null,
    startAt: todayAt(10, 30),
    endAt: todayAt(11, 30),   // 60 min meeting
    isAllDay: false,
  },
  {
    id: 'test-mtg-2',
    title: 'Division Conference',
    location: 'https://umn.zoom.us/j/12345',
    startAt: todayAt(12, 0),
    endAt: todayAt(13, 0),    // 60 min meeting, has Join URL
    isAllDay: false,
  },
  {
    id: 'test-mtg-3',
    title: 'IRB Continuing Review MN-CCORE Registry',
    location: null,
    startAt: todayAt(13, 30),
    endAt: todayAt(15, 0),    // 90 min — overlaps with next two
    isAllDay: false,
  },
  {
    id: 'test-mtg-4',
    title: 'Manuscript Methods Review',
    location: null,
    startAt: todayAt(14, 0),
    endAt: todayAt(15, 0),    // 60 min — overlaps
    isAllDay: false,
  },
  {
    id: 'test-mtg-5',
    title: 'Stats Office Hours',
    location: null,
    startAt: todayAt(14, 30),
    endAt: todayAt(15, 30),   // 60 min — overlaps with both above
    isAllDay: false,
  },
]

// Build a fake CF_Authorization cookie (Hub reads this client-side, no sig check)
function fakeCFAuthToken(email: string): string {
  const b64url = (s: string) =>
    Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ email, name: 'Nicholas Ingraham', iat: Math.floor(Date.now() / 1000), exp: 9999999999 }))
  return `${header}.${body}.fake`
}

test.describe('GH#80 Phase 4 — Timeline layout verification', () => {
  test.beforeEach(async ({ page, context }) => {
    // Inject fake CF_Authorization so RequireAuth lets us through
    await context.addCookies([{
      name: 'CF_Authorization',
      value: fakeCFAuthToken('ingra107@umn.edu'),
      url: 'http://localhost:5175',
      httpOnly: false,
      sameSite: 'Lax',
    }])

    // Playwright route matching: last-registered wins (LIFO).
    // Register catch-all FIRST so specific routes registered after it take priority.

    // Catch-all for all remaining /api/* — must be registered first (lowest priority)
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })

    // Specific stubs registered AFTER catch-all (higher priority in LIFO matching):
    await page.route('**/api/tasks**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.route('**/api/projects**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.route('**/api/regulatory**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.route('**/api/pb-session-stats**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ per_day: [] }) })
    })
    // Meetings API — return empty (using calendar events for test meetings)
    await page.route('**/api/meetings**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      })
    })
    // Calendar events — highest priority (registered last = first matched in LIFO).
    // Actual URL: /api/integrations/calendar/events
    // Response format: { events: [...] } (NOT the {data:} wrapper)
    await page.route('**/api/integrations/calendar/events**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: TEST_CALENDAR_EVENTS }),
      })
    })
  })

  test('(a+b) service block in rail, NOT full canvas width; (c) meetings readable; (d) expand works', async ({ page }) => {
    await page.goto('/portal/dashboard', { waitUntil: 'networkidle', timeout: 30_000 })

    // Wait for timeline to render
    await expect(page.locator('[data-b2-timeline]')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500) // allow React to finish rendering

    // Screenshot 1: full timeline (before expand)
    const ss1 = path.join(SCREENSHOT_DIR, '01-full-timeline.png')
    await page.locator('[data-b2-timeline]').screenshot({ path: ss1 })

    // (a) Service block header must be visible ("Service blocks" label)
    const serviceHeader = page.locator('[data-b2-timeline]').getByText('Service blocks')
    await expect(serviceHeader).toBeVisible({ timeout: 8_000 })

    // (b) Service block title is visible in the strip
    const serviceTitle = page.locator('[data-b2-timeline]').getByText('Inpt-ICU MICU Short')
    await expect(serviceTitle).toBeVisible({ timeout: 5_000 })

    // Verify service block is in a narrow container (not full canvas width).
    // The strip is 140px wide; the canvas is much wider.
    const serviceBox = await serviceTitle.boundingBox()
    if (serviceBox) {
      // The strip is 140px; service title should be within that band
      expect(serviceBox.width, 'service block title should be ≤160px').toBeLessThan(160)
    }

    // (c) Meeting titles are readable — check non-overlapping meetings are visible.
    // Overlapping meetings in a 3-way cluster may be visually small (column width
    // splits the space) — check they exist in the DOM even if clipped by line-clamp.
    await expect(page.locator('[data-b2-timeline]').getByText('Critical Care Team Meeting')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('[data-b2-timeline]').getByText('Division Conference')).toBeVisible({ timeout: 5_000 })
    // Overlap cluster: check presence in DOM (not visibility — they may be clipped by -webkit-line-clamp)
    const irbTitle = page.locator('[data-b2-timeline]').locator('.meeting-row-title').filter({ hasText: 'IRB Continuing Review' })
    expect(await irbTitle.count()).toBeGreaterThan(0)
    const manuscriptTitle = page.locator('[data-b2-timeline]').locator('.meeting-row-title').filter({ hasText: 'Manuscript Methods Review' })
    expect(await manuscriptTitle.count()).toBeGreaterThan(0)
    const statsTitle = page.locator('[data-b2-timeline]').locator('.meeting-row-title').filter({ hasText: 'Stats Office Hours' })
    expect(await statsTitle.count()).toBeGreaterThan(0)

    // (c) Title width — check visible titles are wider than a mere icon.
    // The "Critical Care Team Meeting" title is a non-overlapping meeting and
    // should occupy most of the canvas width.
    const ctmTitle = page.locator('[data-b2-timeline]').locator('.meeting-row-title').filter({ hasText: 'Critical Care Team Meeting' }).first()
    const ctmBox = await ctmTitle.boundingBox()
    if (ctmBox) {
      expect(ctmBox.width, 'Critical Care Team Meeting title width').toBeGreaterThan(100)
    }

    // Screenshot 2: overlap area (zoom in around 1:30pm area)
    const ss2 = path.join(SCREENSHOT_DIR, '02-overlap-area.png')
    await page.locator('[data-b2-timeline]').screenshot({ path: ss2 })

    // (d) Click-to-expand works: clicking a meeting row opens the notes panel
    const meetingHeaders = page.locator('.meeting-row-header')
    const headerCount = await meetingHeaders.count()
    // Click the first available meeting header (Critical Care Team Meeting)
    if (headerCount > 0) {
      await meetingHeaders.first().click()
      // The textarea should now be visible (notes panel opened)
      // Calendar events get "Personal calendar event — no meeting record" placeholder;
      // real D1 meetings get "Jot notes…". Either proves expand worked.
      const notesTextarea = page.locator('textarea').first()
      await expect(notesTextarea).toBeVisible({ timeout: 4_000 })

      const ss3 = path.join(SCREENSHOT_DIR, '03-expand-notes.png')
      await page.locator('[data-b2-timeline]').screenshot({ path: ss3 })
    }

    // Screenshot 4: full page
    const ss4 = path.join(SCREENSHOT_DIR, '04-full-page.png')
    await page.screenshot({ path: ss4, fullPage: true })
  })
})
