/**
 * Persona: mobile-first user.
 *
 * Role: team member checking the Hub from their phone between clinical
 * shifts. 375×812 viewport, touch interactions, portrait orientation.
 * Tests that every primary action works on a phone screen.
 *
 * Run: npx tsx scripts/pre-flight/persona-mobile.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto, mk } from './shared'

async function main() {
  const s = await openPersona({
    persona: 'mobile',
    role: 'Team member on iPhone 12-class device',
    viewport: { width: 375, height: 812 },
    colorScheme: 'dark',
  })
  const cleanupTasks: string[] = []

  try {
    section(s, '1  Land on /my-tasks on mobile')
    await goto(s, '/portal/my-tasks')
    await snap(s, 'my-tasks-mobile', 1500)
    // No horizontal overflow
    const overflow = await s.page.evaluate(() => ({ body: document.body.scrollWidth, vw: window.innerWidth }))
    if (overflow.body <= overflow.vw + 2) pass(s, `No horizontal overflow (${overflow.body} ≤ ${overflow.vw}px)`)
    else record(s, { id: 'MOBILE-OVERFLOW', severity: 'P1', scenario: 'No h-overflow on /my-tasks', observed: `body=${overflow.body}px vw=${overflow.vw}px`, expected: 'body ≤ vw+2' })

    section(s, '2  MobileTabBar at bottom — 4 primary + More')
    const tabBar = await s.page.locator('[class*="MobileTabBar"], nav[class*="tab"], [aria-label*="tab" i]').count().catch(() => 0)
    if (tabBar > 0) pass(s, 'Mobile tab bar rendered at viewport <768px')
    else record(s, { id: 'MOBILE-TABBAR', severity: 'P2', scenario: 'Mobile tab bar present', observed: 'no tab bar visible', expected: 'bottom nav on mobile' })

    section(s, '3  Tap targets ≥44×44 — no sub-44 interactive elements')
    const smallTargets = await s.page.evaluate(() => {
      const small: { tag: string; text: string; w: number; h: number }[] = []
      const all = document.querySelectorAll('button, a[href], [role="button"]')
      for (const el of all) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && r.width < 44 && r.height < 44) {
          const text = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').slice(0, 40)
          small.push({ tag: el.tagName, text, w: Math.round(r.width), h: Math.round(r.height) })
        }
      }
      return small.slice(0, 5)
    })
    if (smallTargets.length === 0) pass(s, 'No sub-44 tap targets on /my-tasks mobile')
    else record(s, { id: 'MOBILE-TAP-TARGETS', severity: 'P2', scenario: 'Mobile tap target sizes', observed: `${smallTargets.length} sub-44 elements: ${smallTargets.map(t => `${t.tag} ${t.w}×${t.h} "${t.text}"`).join(', ').slice(0, 300)}`, expected: 'all ≥44×44' })

    section(s, '4  Create task via API, verify shows on mobile list')
    const taskTitle = mk('mobile')
    const r = await s.api.post('/api/tasks', {
      data: { title: taskTitle, description: taskTitle, assignee: 'nick', priority: 'medium' },
    })
    if (r.ok()) {
      const tid = ((await r.json()) as { data?: { id: string } }).data?.id
      if (tid) cleanupTasks.push(tid)
      await s.page.reload({ waitUntil: 'networkidle' }).catch(() => {})
      await s.page.waitForTimeout(1500)
      const onList = await s.page.locator(`text=${JSON.stringify(taskTitle)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
      if (onList) pass(s, 'New task visible on mobile /my-tasks after create')
      else record(s, { id: 'MOBILE-NEW-TASK-MISS', severity: 'P1', scenario: 'New task visible on mobile', observed: 'title not visible', expected: 'visible in list' })
    }

    section(s, '5  Tap task title → detail panel opens')
    if (cleanupTasks.length > 0) {
      const titleCell = s.page.locator(`text=${JSON.stringify(mk('mobile').slice(0, 20))}`).first()
      const anyTaskTitle = s.page.locator('a, span').filter({ hasText: /test_delete_preflight_mobile/ }).first()
      if (await anyTaskTitle.count()) {
        await anyTaskTitle.click({ force: true }).catch(() => {})
        await s.page.waitForTimeout(1500)
        await snap(s, 'mobile-task-detail')
        const panelOpen = await s.page.locator('[data-testid="task-detail-panel"]').isVisible({ timeout: 3000 }).catch(() => false)
        if (panelOpen) pass(s, 'Task detail panel opens on mobile')
        else record(s, { id: 'MOBILE-DETAIL-PANEL', severity: 'P1', scenario: 'Mobile task detail panel', observed: 'panel not visible', expected: 'opens on tap' })
        await s.page.keyboard.press('Escape').catch(() => {})
      }
    }

    section(s, '6  Dashboard on mobile — cards stack vertically, no clipping')
    await goto(s, '/portal/dashboard')
    await snap(s, 'dashboard-mobile', 2000)
    const overflow2 = await s.page.evaluate(() => ({ body: document.body.scrollWidth, vw: window.innerWidth }))
    if (overflow2.body <= overflow2.vw + 2) pass(s, 'Dashboard mobile — no h-overflow')
    else record(s, { id: 'DASH-MOBILE-OVERFLOW', severity: 'P1', scenario: 'No h-overflow on /dashboard', observed: `body=${overflow2.body}`, expected: `≤${overflow2.vw}` })

    section(s, '7  /projects, /manuscripts, /deadlines, /ideas, /decisions — all no h-overflow on mobile')
    const pages = ['/portal/projects', '/portal/manuscripts', '/portal/deadlines', '/portal/ideas', '/portal/decisions', '/portal/grants', '/portal/meetings']
    let overflowCount = 0
    for (const p of pages) {
      await goto(s, p)
      await s.page.waitForTimeout(800)
      const o = await s.page.evaluate(() => ({ body: document.body.scrollWidth, vw: window.innerWidth }))
      if (o.body > o.vw + 2) {
        overflowCount++
        record(s, { id: 'MOBILE-OVERFLOW-PAGE', severity: 'P1', scenario: `${p} mobile overflow`, observed: `body=${o.body}px`, expected: `≤${o.vw}px` })
      }
    }
    if (overflowCount === 0) pass(s, `All ${pages.length} pages clean — no h-overflow`)

    section(s, '8  Bug report modal opens + Attach photo button visible on mobile')
    await goto(s, '/portal/my-tasks')
    await s.page.waitForTimeout(1000)
    // On mobile the sidebar is hidden; Report-a-Bug lives in MobileTabBar's
    // More drawer under Support section. Open drawer then click the
    // VISIBLE Report-a-Bug (exclude the hidden sidebar button).
    const moreBtn = s.page.locator('button[aria-controls="mobile-overflow-drawer"]').first()
    if (await moreBtn.count()) {
      await moreBtn.click({ force: true }).catch(() => {})
      await s.page.waitForTimeout(500)
      await snap(s, 'mobile-more-drawer')
    }
    // Find the visible Report-a-Bug (scoped to the drawer or any visible button)
    const bugBtn = s.page.locator('button:visible').filter({ hasText: /Report a Bug|Report Bug/i }).first()
    const bugVisible = await bugBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (bugVisible) {
      await bugBtn.click({ force: true }).catch(() => {})
      // Wait explicitly for the dialog to mount (lazy import delay + state flip)
      const modal = s.page.locator('[role="dialog"]').filter({ hasText: /Report a Bug|bug/i }).first()
      await modal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      await snap(s, 'bug-modal-mobile', 400)
      const attachBtn = await s.page.locator('button').filter({ hasText: /Attach photo/i }).first().isVisible({ timeout: 2000 }).catch(() => false)
      if (attachBtn) pass(s, 'Attach photo button visible on mobile bug reporter')
      else record(s, { id: 'MOBILE-ATTACH', severity: 'P1', scenario: 'Mobile bug reporter has Attach photo', observed: 'not found inside modal', expected: 'visible Attach photo button' })
      await s.page.keyboard.press('Escape').catch(() => {})
    } else {
      record(s, { id: 'MOBILE-BUG-BTN', severity: 'P1', scenario: 'Report-a-Bug reachable on mobile', observed: 'no visible Report-a-Bug button in More drawer', expected: 'Support section has Report-a-Bug button' })
    }

    section(s, '9  Font floor — no sub-11px text on mobile')
    await goto(s, '/portal/my-tasks')
    await s.page.waitForTimeout(800)
    const tinyText = await s.page.evaluate(() => {
      const bad: string[] = []
      const nodes = document.querySelectorAll('p, span, div, a, button, label, li, td, th')
      for (const el of nodes) {
        const cs = window.getComputedStyle(el as Element)
        const fs = parseFloat(cs.fontSize)
        const hasText = (el as HTMLElement).innerText?.trim().length > 0
        if (hasText && fs > 0 && fs < 11) {
          const text = ((el as HTMLElement).innerText || '').slice(0, 20)
          bad.push(`${fs}px "${text}"`)
        }
      }
      return bad.slice(0, 5)
    })
    if (tinyText.length === 0) pass(s, 'No sub-11px text on mobile /my-tasks')
    else record(s, { id: 'MOBILE-FONT-TINY', severity: 'P2', scenario: 'Mobile text floor', observed: `${tinyText.length} sub-11px nodes: ${tinyText.join(', ')}`, expected: 'all text ≥11px on mobile' })
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes' })
  } finally {
    for (const tid of cleanupTasks) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    const result = await closePersona(s)
    console.log(`\n[mobile] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
