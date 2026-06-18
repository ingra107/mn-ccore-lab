/**
 * GH#80 Agenda Screenshot Script
 *
 * Seeds Nick's real-day calendar:
 *   - 7:00 AM–3:00 PM service block (Consult Service, 480min)
 *   - 10:30–11:30 Critical Care Team Meeting
 *   - 12:00–1:00 Pulmonary HSR Group Meeting
 *   - 1:30–2:00 Research Design Review (overlap A)
 *   - 2:00–3:00 Fellow Check-in (overlap B)
 *   - 2:30–3:30 MNCCORE Research Session (overlap C)
 *
 * Intercepts /api/* to return mock data so the static preview server works.
 * Usage: SCREENSHOT_BASE_URL=http://localhost:4174 node review/gh80-agenda/take-screenshots.mjs
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'http://localhost:4174'

function todayAt(h, m) {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function todayDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const SEED_CALENDAR = [
  { id: 'svc-0700-1500', title: 'Consult Service', location: null, startAt: todayAt(7,0), endAt: todayAt(15,0), isAllDay: false },
  { id: 'cctm-1030', title: 'Critical Care Team Meeting', location: null, startAt: todayAt(10,30), endAt: todayAt(11,30), isAllDay: false },
  { id: 'pul-1200', title: 'Pulmonary HSR Group Meeting', location: null, startAt: todayAt(12,0), endAt: todayAt(13,0), isAllDay: false },
  { id: 'ov-a-1330', title: 'Research Design Review', location: null, startAt: todayAt(13,30), endAt: todayAt(14,0), isAllDay: false },
  { id: 'ov-b-1400', title: 'Fellow Check-in', location: null, startAt: todayAt(14,0), endAt: todayAt(15,0), isAllDay: false },
  { id: 'ov-c-1430', title: 'MNCCORE Research Session', location: null, startAt: todayAt(14,30), endAt: todayAt(15,30), isAllDay: false },
]

// Minimal task data for drop testing
// assignee must match emailToSlug('ingra107@umn.edu') = 'nick-ingraham'
const SEED_TASKS = [
  {
    id: 'task_01SCREENSHOT01', title: 'Review RO3 Specific Aims', short_title: 'Review RO3 Aims',
    status: 'todo', priority: 'high', assignee: 'nick-ingraham', project_id: null,
    due_date: null, notes: null, source: 'manual', completed: 0, completed_at: null,
    group_override: null, plan_slot: null, plan_rank: null, planned_for: null,
    deleted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    key_link_1: null, key_link_1_desc: null, key_link_2: null, key_link_2_desc: null,
    key_link_3: null, key_link_3_desc: null, acknowledged_at: null,
  },
  {
    id: 'task_01SCREENSHOT02', title: 'Write CLIF data dictionary', short_title: 'CLIF data dict',
    status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: null,
    due_date: null, notes: null, source: 'manual', completed: 0, completed_at: null,
    group_override: null, plan_slot: null, plan_rank: null, planned_for: null,
    deleted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    key_link_1: null, key_link_1_desc: null, key_link_2: null, key_link_2_desc: null,
    key_link_3: null, key_link_3_desc: null, acknowledged_at: null,
  },
]

const SEED_PROJECTS = []

// Mock API responses — keyed by path prefix
const API_MOCKS = {
  '/api/tasks': { data: SEED_TASKS, count: SEED_TASKS.length },
  '/api/projects': { data: SEED_PROJECTS, count: 0 },
  '/api/meetings': { data: [], count: 0 },
  '/api/integrations/calendar/events': { events: SEED_CALENDAR },
  '/api/auth/me': { authenticated: true, email: 'ingra107@umn.edu', name: 'Nicholas Ingraham', isPi: true, slug: 'nick' },
  '/api/team': { data: [], count: 0 },
  '/api/seen/unseen': { data: [], count: 0 },
  '/api/version': { version: '999', sha: 'test', built_at: new Date().toISOString() },
  '/api/ai-requests': { data: [], count: 0 },
  '/api/pb-session-stats': { totalPomodoros: 0, totalMinutes: 0 },
  '/api/health': { status: 'ok', db: 'ok' },
  '/api/notifications': { data: [], count: 0 },
  '/api/bug-report': { ok: true },
  '/api/activity': { data: [], count: 0 },
  '/api/pb/today-md': { artifact: null },
  '/api/seen': { data: [], count: 0 },
}

async function setupContext(browser, theme = 'dark') {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })

  // Intercept all /api/* routes
  await ctx.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const pathname = url.pathname

    // Find matching mock
    const match = Object.entries(API_MOCKS).find(([key]) => pathname.startsWith(key))
    if (match) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(match[1]),
      })
    } else {
      // Default: empty success
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], count: 0 }),
      })
    }
  })

  const page = await ctx.newPage()
  await page.addInitScript((t) => {
    window.localStorage.setItem('mn-ccore-theme', t)
    // Suppress realtime WS noise
    window.localStorage.setItem('mnccore_last_sync_at', new Date().toISOString())
  }, theme)

  return { page, ctx }
}

async function snap(page, name) {
  const p = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: p, fullPage: false })
  console.log(`  ✓ ${p}`)
  return p
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    // ── P2: Proportional agenda dark ─────────────────────────────────────
    console.log('\n[P2] Proportional agenda — dark')
    {
      const { page, ctx } = await setupContext(browser, 'dark')
      await page.goto(`${BASE_URL}/portal/dashboard`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      const tl = page.locator('[data-b2-timeline]')
      if (await tl.count() > 0) await tl.scrollIntoViewIfNeeded()
      results.push(await snap(page, 'p2-proportional-dark'))
      await ctx.close()
    }

    // ── P2: Proportional agenda light ────────────────────────────────────
    console.log('\n[P2] Proportional agenda — light')
    {
      const { page, ctx } = await setupContext(browser, 'light')
      await page.goto(`${BASE_URL}/portal/dashboard`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      const tl = page.locator('[data-b2-timeline]')
      if (await tl.count() > 0) await tl.scrollIntoViewIfNeeded()
      results.push(await snap(page, 'p2-proportional-light'))
      await ctx.close()
    }

    // ── P3: Side-by-side overlaps ─────────────────────────────────────────
    console.log('\n[P3] Side-by-side overlaps')
    {
      const { page, ctx } = await setupContext(browser, 'dark')
      await page.goto(`${BASE_URL}/portal/dashboard`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      // Scroll to overlap region
      const overlap = page.locator('[data-agenda-unit="overlap"]').first()
      if (await overlap.count() > 0) {
        await overlap.scrollIntoViewIfNeeded()
      } else {
        const tl = page.locator('[data-b2-timeline]')
        if (await tl.count() > 0) await tl.scrollIntoViewIfNeeded()
      }
      results.push(await snap(page, 'p3-side-by-side-overlaps'))
      await ctx.close()
    }

    // ── P4: Service block ─────────────────────────────────────────────────
    console.log('\n[P4] Service block transparent right quarter')
    {
      const { page, ctx } = await setupContext(browser, 'dark')
      await page.goto(`${BASE_URL}/portal/dashboard`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      const tl = page.locator('[data-b2-timeline]')
      if (await tl.count() > 0) await tl.scrollIntoViewIfNeeded()
      results.push(await snap(page, 'p4-service-block'))
      await ctx.close()
    }

    // ── P5: Expanded notes on a meeting ──────────────────────────────────
    console.log('\n[P5] Expanded notes on meeting')
    {
      const { page, ctx } = await setupContext(browser, 'dark')
      await page.goto(`${BASE_URL}/portal/dashboard`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      const header = page.locator('[data-b2-timeline] [data-agenda-unit="meeting"] .meeting-row-header').first()
      if (await header.count() > 0) {
        await header.scrollIntoViewIfNeeded()
        await header.click()
        await page.waitForTimeout(400)
      } else {
        // Fall back to any meeting row header
        const anyHeader = page.locator('[data-b2-timeline] .meeting-row-header').first()
        if (await anyHeader.count() > 0) {
          await anyHeader.scrollIntoViewIfNeeded()
          await anyHeader.click()
          await page.waitForTimeout(400)
        }
      }
      results.push(await snap(page, 'p5-notes-expanded'))
      await ctx.close()
    }

    // ── P5: Expanded notes on overlap card ───────────────────────────────
    console.log('\n[P5] Expanded notes on overlap card')
    {
      const { page, ctx } = await setupContext(browser, 'dark')
      await page.goto(`${BASE_URL}/portal/dashboard`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      const overlapHeader = page.locator('[data-agenda-unit="overlap"] .meeting-row-header').first()
      if (await overlapHeader.count() > 0) {
        await overlapHeader.scrollIntoViewIfNeeded()
        await overlapHeader.click()
        await page.waitForTimeout(400)
      }
      results.push(await snap(page, 'p5-overlap-notes-expanded'))
      await ctx.close()
    }

    // ── P6: Drag task into gap ────────────────────────────────────────────
    console.log('\n[P6] Drag task into gap')
    {
      const { page, ctx } = await setupContext(browser, 'dark')
      await page.goto(`${BASE_URL}/portal/dashboard`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      const planBtn = page.locator('[data-plan-btn]').first()
      const btnCount = await planBtn.count()

      if (btnCount > 0) {
        const taskId = await planBtn.getAttribute('data-plan-btn')
        if (taskId) {
          const row = page.locator(`[data-task-id="${taskId}"]`).first()
          await row.hover()

          const result = await page.evaluate((id) => {
            const grip = document.querySelector(`[data-task-id="${id}"] [draggable="true"]`)
            const gaps = Array.from(document.querySelectorAll('[data-b2-timeline] .today-drop-zone'))
            const gap = gaps[0]
            if (!grip || !gap) return { ok: false, grip: !!grip, gap: !!gap, gapCount: gaps.length }
            const dt = new DataTransfer()
            dt.setData('text/plain', id)
            grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
            gap.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }))
            gap.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
            gap.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
            grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
            return { ok: true, grip: true, gap: true, gapCount: gaps.length }
          }, taskId)

          console.log(`  Drop result: ${JSON.stringify(result)}`)
          await page.waitForTimeout(800)
        }
      } else {
        console.log('  No unplanned tasks visible (seed tasks may not match today\'s filter)')
      }

      const tl = page.locator('[data-b2-timeline]')
      if (await tl.count() > 0) await tl.scrollIntoViewIfNeeded()
      results.push(await snap(page, 'p6-drag-to-gap'))
      await ctx.close()
    }

  } finally {
    await browser.close()
  }

  console.log('\n=== All screenshots saved ===')
  results.forEach(r => console.log(`  ${r}`))
  return results
}

run().catch(e => { console.error(e); process.exit(1) })
