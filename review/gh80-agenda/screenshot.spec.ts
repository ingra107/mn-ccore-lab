/**
 * GH#80 Agenda Codex-Plan Screenshot Spec
 * Captures Nick's real-day seed at each verification phase.
 *
 * Seeds:
 *   - 7:00 AM–3:00 PM service block (480min)
 *   - 10:30–11:30 "Critical Care Team Meeting"
 *   - 12:00–1:00 "Pulmonary HSR Group Meeting"
 *   - 1:30–2:00 overlap A
 *   - 2:00–3:00 overlap B
 *   - 2:30–3:30 overlap C (3-way overlap with B, 2-way with A)
 *
 * Screenshot filenames map to codex phases P2-P6.
 */
import { test, expect } from '@playwright/test'

const SEED_SCRIPT = `
(function seedTimeline() {
  // Inject real-day events into the TodayPage via localStorage override.
  // The page reads from the React Query cache — we inject by dispatching a
  // custom event that TodayPage listens for in dev/test environments.
  // Alternatively we use the __SEED_TODAY_EVENTS__ global that TodayPage
  // can check on mount.
  window.__SEED_TODAY_EVENTS__ = [
    {
      id: 'svc-0700-1500',
      time: '7:00 AM',
      end: '3:00 PM',
      title: 'Consult Service',
      startMin: 420,
      endMin: 900,
      isAllDay: false,
    },
    {
      id: 'mtg-cctm',
      time: '10:30 AM',
      end: '11:30 AM',
      title: 'Critical Care Team Meeting',
      startMin: 630,
      endMin: 690,
      isAllDay: false,
    },
    {
      id: 'mtg-pul',
      time: '12:00 PM',
      end: '1:00 PM',
      title: 'Pulmonary HSR Group Meeting',
      startMin: 720,
      endMin: 780,
      isAllDay: false,
    },
    {
      id: 'mtg-ov-a',
      time: '1:30 PM',
      end: '2:00 PM',
      title: 'Research Design Review',
      startMin: 810,
      endMin: 840,
      isAllDay: false,
    },
    {
      id: 'mtg-ov-b',
      time: '2:00 PM',
      end: '3:00 PM',
      title: 'Fellow Check-in',
      startMin: 840,
      endMin: 900,
      isAllDay: false,
    },
    {
      id: 'mtg-ov-c',
      time: '2:30 PM',
      end: '3:30 PM',
      title: 'MNCCORE Research Session',
      startMin: 870,
      endMin: 930,
      isAllDay: false,
    },
  ]
})()
`

test('P2: proportional agenda — basic flow', async ({ page }) => {
  await page.addInitScript(SEED_SCRIPT)
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'review/gh80-agenda/p2-basic-agenda-dark.png', fullPage: false })
})

test('P2 light: proportional agenda — light theme', async ({ page }) => {
  await page.addInitScript(SEED_SCRIPT)
  await page.addInitScript(() => {
    window.localStorage.setItem('mn-ccore-theme', 'light')
  })
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'review/gh80-agenda/p2-basic-agenda-light.png', fullPage: false })
})

test('P3: side-by-side overlaps', async ({ page }) => {
  await page.addInitScript(SEED_SCRIPT)
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')
  // Scroll to the afternoon overlap region
  const timeline = page.locator('[data-b2-timeline]')
  await expect(timeline).toBeVisible()
  await page.screenshot({ path: 'review/gh80-agenda/p3-overlaps-dark.png', fullPage: true })
})

test('P4: service block transparent right quarter', async ({ page }) => {
  await page.addInitScript(SEED_SCRIPT)
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'review/gh80-agenda/p4-service-block.png', fullPage: false })
})

test('P5: expanded notes on meeting', async ({ page }) => {
  await page.addInitScript(SEED_SCRIPT)
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')

  // Click on Critical Care Team Meeting to expand notes
  await page.locator('[data-b2-timeline]').waitFor()
  // Click the first meeting row header to expand
  const meetingHeaders = page.locator('[data-b2-timeline] .meeting-row-header')
  const count = await meetingHeaders.count()
  if (count > 0) {
    await meetingHeaders.first().click()
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: 'review/gh80-agenda/p5-expanded-notes.png', fullPage: false })
})

test('P5 overlap: expanded notes on overlap card', async ({ page }) => {
  await page.addInitScript(SEED_SCRIPT)
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')

  await page.locator('[data-b2-timeline]').waitFor()
  // Click the overlap region's first meeting header
  const overlapHeaders = page.locator('[data-agenda-unit="overlap"] .meeting-row-header')
  const count = await overlapHeaders.count()
  if (count > 0) {
    await overlapHeaders.first().click()
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: 'review/gh80-agenda/p5-overlap-expanded.png', fullPage: false })
})

test('P6: drag task into gap', async ({ page }) => {
  await page.addInitScript(SEED_SCRIPT)
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')

  const planBtn = page.locator('[data-plan-btn]').first()
  await expect(planBtn).toHaveCount(1, { timeout: 10_000 })
  const taskId = await planBtn.getAttribute('data-plan-btn')

  if (taskId) {
    const row = page.locator(`[data-task-id="${taskId}"]`).first()
    await row.hover()

    // Find an AgendaGapRow drop target and dispatch drag events
    const dropped = await page.evaluate((id) => {
      const grip = document.querySelector(`[data-task-id="${id}"] [draggable="true"]`) as HTMLElement | null
      // Find a gap row (today-drop-zone class)
      const gaps = Array.from(document.querySelectorAll('[data-b2-timeline] .today-drop-zone'))
      const gap = gaps[0] as HTMLElement | null
      if (!grip || !gap) return { ok: false, grip: !!grip, gap: !!gap }
      const dt = new DataTransfer()
      dt.setData('text/plain', id)
      grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      gap.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }))
      gap.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      gap.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
      grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
      return { ok: true, grip: true, gap: true }
    }, taskId)

    await page.waitForTimeout(500)
  }

  await page.screenshot({ path: 'review/gh80-agenda/p6-drag-to-gap.png', fullPage: false })
})
