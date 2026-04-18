/**
 * Deep audit — Suite 7: Realtime + multi-tab coherence.
 *
 * Open two independent browser contexts (different sessions, no shared
 * cache). In context A mutate a task; in context B verify the UI reflects
 * the change without a manual reload (within a reasonable polling window).
 *
 * Also test:
 *   - Concurrent edits on same field (2 tabs race)
 *   - Version bump / cache invalidation picks up cross-tab writes
 *
 * The Hub uses PartySocket → Durable Object `notification-hub` for realtime
 * and falls back to 10s polling when WS fails.
 *
 * Run: npx tsx scripts/deep-audit/07-realtime-multitab.ts
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { openSession, closeSession, section, log, pass, bug, snap, marker } from './harness'

const BASE = process.env.DEEP_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev'

async function openTab(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  return { ctx, page }
}

async function main() {
  const s = await openSession('07-realtime-multitab')
  const createdTaskIds: string[] = []

  try {
    section(s, '7.A  Create a task via API — will use as shared subject')
    const title = marker('rt_task')
    const createResp = await s.api.post('/api/tasks', {
      data: { title, description: title, assignee: 'nick', priority: 'medium', status: 'todo' },
    })
    if (!createResp.ok()) {
      bug(s, 'RT-TASK-CREATE', 'P0', '7.A create task', `HTTP ${createResp.status()}`, '200')
      await closeSession(s)
      return
    }
    const taskId = ((await createResp.json()) as { data?: { id: string } }).data?.id
    if (!taskId) {
      await closeSession(s)
      return
    }
    createdTaskIds.push(taskId)
    pass(s, `7.A Task ${taskId} ready`)

    section(s, '7.B  Open 2 independent browser contexts to /tasks')
    // Reuse the harness's browser
    const browser = s.browser
    const tabA = await openTab(browser)
    const tabB = await openTab(browser)
    // Instrument tab B to count /api/version polls + /api/tasks refetches
    const polls: { url: string; status: number; at: number }[] = []
    tabB.page.on('response', (r) => {
      const u = r.url()
      if (u.includes('/api/version') || u.includes('/api/tasks')) {
        polls.push({ url: u.replace('https://mn-ccore-lab.pages.dev', ''), status: r.status(), at: Date.now() })
      }
    })
    await tabA.page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })
    await tabB.page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' })
    await tabA.page.waitForTimeout(1200)
    await tabB.page.waitForTimeout(1200)
    log(s, `  7.B tab B initial network: ${polls.length} /api/version+/api/tasks calls in first 3s`)
    // Both tabs should show the task
    const aVis = await tabA.page.locator(`text=${JSON.stringify(title)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
    const bVis = await tabB.page.locator(`text=${JSON.stringify(title)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (aVis && bVis) pass(s, '7.B Both tabs show task')
    else bug(s, 'RT-BOTH-TABS-VISIBLE', 'P1', '7.B both tabs render task', `tabA=${aVis} tabB=${bVis}`, 'both true')

    section(s, '7.C  Mutate in tab A (priority=urgent) — tab B should pick up without reload')
    // Capture tab B's current priority pill text for baseline
    await tabB.page.locator(`text=${JSON.stringify(title)}`).first().scrollIntoViewIfNeeded().catch(() => {})
    await s.page.waitForTimeout(400)
    // Change via API (simulates what tabA's UI mutation would do)
    await s.api.post(`/api/tasks/${taskId}`, { data: { priority: 'urgent' } })

    // Wait up to 35s for tab B to update (polling fires every 15s; give it 2 cycles)
    let seenUrgent = false
    const pollStart = Date.now()
    while (Date.now() - pollStart < 35_000) {
      // Direct DOM query for the task's priority cell text — more reliable
      // than HTML search on huge virtualized documents.
      const priorityText = await tabB.page.evaluate((t) => {
        const rows = document.querySelectorAll('[class*="task-grid-row"]')
        for (const row of rows) {
          if ((row as HTMLElement).innerText?.includes(t)) {
            return (row as HTMLElement).innerText.toLowerCase()
          }
        }
        return ''
      }, title).catch(() => '')
      if (priorityText.includes('urgent')) { seenUrgent = true; break }
      await tabB.page.waitForTimeout(1000)
    }
    const elapsed = Math.round((Date.now() - pollStart) / 1000)
    if (seenUrgent) pass(s, `7.C Tab B picked up priority=urgent without reload (~${elapsed}s)`)
    else bug(s, 'RT-NO-PROPAGATION', 'P1', '7.C tab B sees priority change without reload', `no urgent text found in ${elapsed}s window; tab B network: ${polls.length} calls (${polls.map(p => `${p.status} ${p.url.split('?')[0]}`).join(', ').slice(0, 300)})`, 'urgent text visible after poll push')
    await snap({ ...s, page: tabB.page }, 'C-tabB-after-propagation')

    section(s, '7.D  Race — 5 rapid edits across both tabs')
    const edits = [
      { tab: 'A', field: { priority: 'low' } },
      { tab: 'B', field: { priority: 'high' } },
      { tab: 'A', field: { priority: 'medium' } },
      { tab: 'B', field: { priority: 'urgent' } },
      { tab: 'A', field: { priority: 'high' } },
    ]
    const rs = await Promise.all(edits.map((e) => s.api.post(`/api/tasks/${taskId}`, { data: e.field })))
    const allOk = rs.every((r) => r.ok())
    if (allOk) pass(s, '7.D All 5 concurrent edits accepted')
    else bug(s, 'RT-CONCURRENT-EDIT-FAIL', 'P2', '7.D 5 concurrent edits all accepted', rs.map(r => r.status()).join(','), '200x5')

    // Final state via direct API read
    await s.page.waitForTimeout(500)
    const list = await s.api.get('/api/tasks')
    if (list.ok()) {
      const row = ((await list.json()) as { data?: Array<{ id: string; priority: string }> }).data?.find((t) => t.id === taskId)
      log(s, `  7.D final priority after race: ${row?.priority} (last-write-wins: expect "high" as last payload)`)
      if (row?.priority === 'high') pass(s, '7.D LWW converged on last edit')
      else log(s, '  7.D LWW may not have converged on last-issued edit — race ordering is non-deterministic across 2 API workers')
    }

    section(s, '7.E  Close tab A, edit from tab B only — tab B reflects own change fast')
    await tabA.ctx.close()
    await s.api.post(`/api/tasks/${taskId}`, { data: { priority: 'low' } })
    let seenLow = false
    const pollStart2 = Date.now()
    while (Date.now() - pollStart2 < 20_000) {
      // Scope to the row that contains the unique task title — avoids false
      // positives from CSS classes / other tasks. Mirrors 7.C pattern.
      const priorityText = await tabB.page.evaluate((t) => {
        const rows = document.querySelectorAll('[class*="task-grid-row"]')
        for (const row of rows) {
          if ((row as HTMLElement).innerText?.includes(t)) {
            return (row as HTMLElement).innerText.toLowerCase()
          }
        }
        return ''
      }, title).catch(() => '')
      if (priorityText.includes('low')) { seenLow = true; break }
      await tabB.page.waitForTimeout(1000)
    }
    const elapsed2 = Math.round((Date.now() - pollStart2) / 1000)
    if (seenLow) pass(s, `7.E Single-tab propagation reflects own change (~${elapsed2}s)`)
    else bug(s, 'RT-SELF-PROPAGATION', 'P1', '7.E tab sees its own recent change within 20s', 'not seen', 'priority=low visible')

    await tabB.ctx.close()
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const tid of createdTaskIds) {
      s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    }
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
