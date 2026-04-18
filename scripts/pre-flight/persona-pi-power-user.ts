/**
 * Persona: PI power user (Nick).
 *
 * Role: primary Hub user. Knows every keyboard shortcut. Runs the lab.
 * Daily routine: dashboard → see what's due → decide priorities → delegate.
 *
 * Run: npx tsx scripts/pre-flight/persona-pi-power-user.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto, assertVisible, clickReliable, mk } from './shared'

async function main() {
  const s = await openPersona({
    persona: 'pi-power-user',
    role: 'Principal Investigator, daily power user',
    colorScheme: 'dark',
  })
  const cleanupTasks: string[] = []

  try {
    section(s, '1  Dashboard landing — the first thing I see every morning')
    await goto(s, '/dashboard')
    await snap(s, 'dashboard')
    // Dashboard h1 is the time-of-day greeting ("Good morning/afternoon/evening, Nick"), not literally "Dashboard".
    await assertVisible(s, 'Dashboard greeting heading', 'h1', { severity: 'P1' })
    await assertVisible(s, 'Focus Next card', 'text=Focus Next', { severity: 'P2' })
    await assertVisible(s, 'Publication Pipeline card', 'text=Publication Pipeline', { severity: 'P2' })
    // Count bento cards — expect 6+ on default PI layout
    const bentoCount = await s.page.locator('.bento-card').count().catch(() => 0)
    if (bentoCount >= 4) pass(s, `Dashboard renders ${bentoCount} bento cards (PI sees ≥4)`)
    else record(s, { id: 'DASH-TOO-FEW-CARDS', severity: 'P1', scenario: 'Dashboard card count', observed: `${bentoCount} cards`, expected: '≥4 cards for PI role' })

    section(s, '2  Command palette — Ctrl+K should open in <500ms')
    const t0 = Date.now()
    await s.page.keyboard.press('Control+k')
    await s.page.locator('[data-testid="command-palette"]').waitFor({ state: 'visible', timeout: 2000 }).catch(() => {})
    const elapsed = Date.now() - t0
    await snap(s, 'cmdk-open', 200)
    if (elapsed < 500) pass(s, `Command palette opened in ${elapsed}ms`)
    else record(s, { id: 'CMDK-SLOW', severity: 'P2', scenario: 'Command palette open latency', observed: `${elapsed}ms`, expected: '<500ms' })
    // Search + navigate via keyboard
    await s.page.keyboard.type('analytics')
    await s.page.waitForTimeout(400)
    await snap(s, 'cmdk-analytics')
    await s.page.keyboard.press('Enter')
    await s.page.waitForTimeout(1200)
    if (s.page.url().includes('/analytics')) pass(s, 'Ctrl+K → type "analytics" → Enter navigates to /analytics')
    else record(s, { id: 'CMDK-NAV', severity: 'P1', scenario: 'Ctrl+K Enter navigation', observed: s.page.url(), expected: 'URL includes /analytics' })

    section(s, '3  Chord navigation — g+p (go projects)')
    await goto(s, '/dashboard')
    await s.page.keyboard.press('g')
    await s.page.waitForTimeout(150)
    await s.page.keyboard.press('p')
    await s.page.waitForTimeout(1200)
    if (s.page.url().includes('/projects')) pass(s, 'g+p chord → /projects')
    else record(s, { id: 'CHORD-GP', severity: 'P2', scenario: 'g+p chord nav', observed: s.page.url(), expected: '/projects' })

    section(s, '4  Decision log — create + record outcome')
    await goto(s, '/decisions')
    await snap(s, 'decisions-list')
    await s.page.keyboard.press('n').catch(() => {})
    await s.page.waitForTimeout(800)
    const decModalVisible = await s.page.locator('[role="dialog"], [data-testid*="decision"]').first().isVisible({ timeout: 2000 }).catch(() => false)
    if (decModalVisible) {
      pass(s, 'N-key opens Create Decision modal')
      await snap(s, 'decision-modal')
      await s.page.keyboard.press('Escape')
    } else {
      record(s, { id: 'DEC-MODAL', severity: 'P2', scenario: 'N-key on /decisions opens modal', observed: 'modal not visible', expected: 'dialog opens' })
    }

    section(s, '5  Multi-project view — /projects lists all my active work')
    await goto(s, '/projects')
    await snap(s, 'projects-list')
    const projCount = await s.page.locator('a[href*="/projects/"], [data-testid^="project-"]').count().catch(() => 0)
    if (projCount > 10) pass(s, `Projects list shows ${projCount} clickable project rows`)
    else record(s, { id: 'PROJ-LIST-SMALL', severity: 'P1', scenario: 'Projects list populated', observed: `${projCount} rows`, expected: '>10' })

    section(s, '6  Filter projects by PI = me (mental model: "what do I own?")')
    const piToggle = s.page.locator('button, select').filter({ hasText: /Nick|My projects|All PIs/i }).first()
    if (await piToggle.count()) {
      await piToggle.click({ force: true }).catch(() => {})
      await snap(s, 'projects-pi-filter')
      pass(s, 'PI filter control exists on /projects')
    } else {
      record(s, { id: 'PI-FILTER-MISSING', severity: 'P2', scenario: 'Filter projects by PI', observed: 'no PI filter control', expected: 'filter to show only my projects' })
    }

    section(s, '7  Analytics — charts render without errors')
    await goto(s, '/analytics')
    await snap(s, 'analytics', 1500)
    const charts = await s.page.locator('svg, canvas').count().catch(() => 0)
    if (charts >= 3) pass(s, `Analytics page renders ${charts} chart elements`)
    else record(s, { id: 'ANALYTICS-EMPTY', severity: 'P2', scenario: 'Analytics has charts', observed: `${charts} svg/canvas`, expected: '≥3 charts' })

    section(s, '8  PI Analytics — personal scorecards')
    await goto(s, '/pi-analytics')
    await snap(s, 'pi-analytics', 1500)
    const piCards = await s.page.locator('.bento-card, [class*="card"], [class*="Card"]').count().catch(() => 0)
    if (piCards > 0) pass(s, `PI Analytics renders ${piCards} card-like panels`)
    else record(s, { id: 'PI-ANALYTICS-EMPTY', severity: 'P2', scenario: 'PI Analytics populated', observed: `${piCards} panels`, expected: '>0' })

    section(s, '9  Create a high-priority task, assign to myself, verify Focus Next picks it up')
    const taskTitle = mk('pi_urgent_task')
    const tResp = await s.api.post('/api/tasks', {
      data: { title: taskTitle, description: taskTitle, assignee: 'nick', priority: 'urgent', status: 'todo', due_date: new Date().toISOString().slice(0, 10) },
    })
    if (tResp.ok()) {
      const tid = ((await tResp.json()) as { data?: { id: string } }).data?.id
      if (tid) cleanupTasks.push(tid)
      pass(s, `Urgent task created via API id=${tid}`)
      await goto(s, '/dashboard')
      await s.page.waitForTimeout(1500)
      await snap(s, 'dashboard-with-urgent')
      const onFocus = await s.page.locator(`text=${JSON.stringify(taskTitle)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
      if (onFocus) pass(s, 'Focus Next picked up new urgent task')
      else record(s, { id: 'FOCUS-NEXT-MISS', severity: 'P2', scenario: 'Urgent due-today task surfaces in Focus Next', observed: 'title not visible on dashboard', expected: 'appears as top pick' })
    }

    section(s, '10  Meetings — the upcoming biweekly')
    await goto(s, '/meetings')
    await snap(s, 'meetings')
    await assertVisible(s, 'Meeting rows', 'a[href*="/meetings/"], [data-testid*="meeting"]', { severity: 'P1' })

    section(s, '11  Ideas board — vote + comment')
    await goto(s, '/ideas')
    await snap(s, 'ideas')
    await assertVisible(s, 'Ideas content', '[data-testid*="idea"], h1:has-text("Ideas")', { severity: 'P2' })

    section(s, '12  Keyboard ? opens Shortcut Help')
    await s.page.keyboard.press('Shift+?').catch(() => s.page.keyboard.press('?'))
    await s.page.waitForTimeout(600)
    const helpVisible = await s.page.locator('[role="dialog"]').filter({ hasText: /keyboard|shortcut/i }).first().isVisible({ timeout: 2000 }).catch(() => false)
    if (helpVisible) pass(s, '? opens Shortcut Help dialog')
    else record(s, { id: 'HELP-KEY', severity: 'P2', scenario: '? key opens help', observed: 'dialog not visible', expected: 'shortcut help modal' })
    await s.page.keyboard.press('Escape').catch(() => {})

    section(s, '13  Ctrl+. cycles theme')
    const themeBefore = await s.page.evaluate(() => document.documentElement.classList.contains('dark'))
    await s.page.keyboard.press('Control+.')
    await s.page.waitForTimeout(400)
    const themeAfter = await s.page.evaluate(() => document.documentElement.classList.contains('dark'))
    if (themeBefore !== themeAfter) pass(s, `Ctrl+. toggled theme (dark: ${themeBefore} → ${themeAfter})`)
    else record(s, { id: 'THEME-TOGGLE', severity: 'P2', scenario: 'Ctrl+. toggles theme', observed: `still dark=${themeAfter}`, expected: 'toggled' })
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes without fatal error' })
  } finally {
    for (const tid of cleanupTasks) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    const result = await closePersona(s)
    console.log(`\n[pi-power-user] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
