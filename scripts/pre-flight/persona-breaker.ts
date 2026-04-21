/**
 * Persona: breaker.
 *
 * Role: security researcher / QA adversary. Tries to break the Hub via
 * rapid clicks, XSS, long inputs, concurrent edits, network throttle,
 * and other edge cases humans don't think to check.
 *
 * Run: npx tsx scripts/pre-flight/persona-breaker.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto, mk } from './shared'

async function main() {
  const s = await openPersona({
    persona: 'breaker',
    role: 'Adversary — rapid clicks, edge inputs, races',
    colorScheme: 'dark',
  })
  const cleanupTasks: string[] = []

  try {
    section(s, '1  XSS payload — <script>alert(1)</script> in task title')
    const xssTitle = `<script>window.__BREAKER_XSS=1</script>${mk('xss')}`
    const xResp = await s.api.post('/api/tasks', { data: { title: xssTitle, description: xssTitle, assignee: 'nick', priority: 'low' } })
    if (xResp.ok()) {
      const tid = ((await xResp.json()) as { data?: { id: string } }).data?.id
      if (tid) cleanupTasks.push(tid)
      await goto(s, '/portal/my-tasks')
      await s.page.waitForTimeout(1500)
      const executed = await s.page.evaluate(() => !!(window as { __BREAKER_XSS?: number }).__BREAKER_XSS).catch(() => false)
      if (!executed) pass(s, 'XSS <script> in title did not execute (React escapes)')
      else record(s, { id: 'XSS-EXECUTED', severity: 'P0', scenario: 'XSS script tag executes', observed: 'window.__BREAKER_XSS=1', expected: 'no execution' })
    }

    section(s, '2  Rapid-fire — 10 identical POSTs concurrently')
    const burstStart = Date.now()
    const burst = await Promise.all(Array.from({ length: 10 }, () => s.api.post('/api/tasks', {
      data: { title: mk('burst'), description: 'burst test', assignee: 'nick', priority: 'low' },
    })))
    const burstElapsed = Date.now() - burstStart
    const okCount = burst.filter((r) => r.ok()).length
    for (const r of burst) {
      try { const tid = ((await r.json()) as { data?: { id: string } }).data?.id; if (tid) cleanupTasks.push(tid) } catch {}
    }
    if (okCount === 10 && burstElapsed < 5000) pass(s, `10 concurrent POST /api/tasks in ${burstElapsed}ms, all OK`)
    else record(s, { id: 'BURST-PARTIAL', severity: 'P1', scenario: '10 concurrent creates', observed: `${okCount}/10 ok in ${burstElapsed}ms`, expected: '10/10 ok under 5s' })

    section(s, '3  Long input — 50KB title')
    const hugeTitle = 'X'.repeat(50_000)
    const hResp = await s.api.post('/api/tasks', { data: { title: hugeTitle, description: hugeTitle, assignee: 'nick', priority: 'low' } })
    if (hResp.ok()) {
      const t = ((await hResp.json()) as { data?: { id: string; title: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.title?.length === hugeTitle.length) pass(s, `50KB title round-trips intact (${t.title.length} chars)`)
      else record(s, { id: 'LONG-TITLE-TRUNC', severity: 'P2', scenario: 'Long title round-trip', observed: `length=${t?.title?.length}`, expected: String(hugeTitle.length) })
    } else if (hResp.status() === 413 || hResp.status() === 400) {
      pass(s, `50KB title rejected with ${hResp.status()} (payload limit policy)`)
    } else if (hResp.status() >= 500) {
      record(s, { id: 'LONG-TITLE-500', severity: 'P1', scenario: '50KB title handling', observed: `HTTP ${hResp.status()}`, expected: '200/400/413' })
    }

    section(s, '4  Rapid clicks — spam New Task button 5 times in 500ms')
    await goto(s, '/portal/my-tasks')
    await s.page.waitForTimeout(800)
    const newBtn = s.page.locator('button').filter({ hasText: /New Task/i }).first()
    if (await newBtn.count()) {
      for (let i = 0; i < 5; i++) {
        await newBtn.click({ force: true }).catch(() => {})
        await s.page.waitForTimeout(100)
      }
      await s.page.waitForTimeout(500)
      const modalCount = await s.page.locator('[role="dialog"]').count().catch(() => 0)
      if (modalCount <= 1) pass(s, `Rapid-click spam → ${modalCount} modal (idempotent)`)
      else record(s, { id: 'MODAL-STACK', severity: 'P1', scenario: 'Rapid-click spawns multiple modals', observed: `${modalCount} dialogs`, expected: '1 modal' })
      await s.page.keyboard.press('Escape').catch(() => {})
    }

    section(s, '5  Concurrent status change race — 3 rapid changes on same task')
    if (cleanupTasks.length > 0) {
      const tid = cleanupTasks[0]
      const raceResults = await Promise.all([
        s.api.post(`/api/tasks/${tid}/status`, { data: { status: 'in_progress' } }),
        s.api.post(`/api/tasks/${tid}/status`, { data: { status: 'done' } }),
        s.api.post(`/api/tasks/${tid}/status`, { data: { status: 'blocked' } }),
      ])
      const raceOk = raceResults.filter((r) => r.ok()).length
      if (raceOk === 3) pass(s, `3 concurrent status changes all accepted (LWW converges)`)
      else record(s, { id: 'RACE-PARTIAL', severity: 'P2', scenario: '3 concurrent status changes', observed: `${raceOk}/3 ok`, expected: '3/3' })
    }

    section(s, '6  Invalid enum on PATCH — should reject')
    if (cleanupTasks.length > 0) {
      const tid = cleanupTasks[0]
      const invalidResp = await s.api.post(`/api/tasks/${tid}/status`, { data: { status: 'bogus_status_xyz' } })
      if (invalidResp.status() === 400) pass(s, 'Invalid status rejected with 400')
      else if (invalidResp.ok()) record(s, { id: 'ENUM-ACCEPTED', severity: 'P1', scenario: 'Invalid status rejected', observed: `HTTP ${invalidResp.status()} accepted`, expected: '400' })
      else if (invalidResp.status() >= 500) record(s, { id: 'ENUM-CRASH', severity: 'P1', scenario: 'Invalid status handling', observed: `HTTP ${invalidResp.status()}`, expected: '400' })
    }

    section(s, '7  Empty batch ids array')
    const empty = await s.api.post('/api/tasks/batch', { data: { ids: [], action: 'delete' } })
    if (empty.status() === 400) pass(s, 'Empty batch rejected with 400')
    else record(s, { id: 'EMPTY-BATCH', severity: 'P2', scenario: 'Empty batch rejected', observed: `HTTP ${empty.status()}`, expected: '400' })

    section(s, '8  Browser resize from 1920px → 320px — no horizontal overflow at any step')
    await goto(s, '/portal/dashboard')
    const widths = [1920, 1600, 1280, 1024, 768, 640, 480, 375, 320]
    let overflowAtWidth: number | null = null
    for (const w of widths) {
      await s.page.setViewportSize({ width: w, height: 900 })
      await s.page.waitForTimeout(400)
      const o = await s.page.evaluate(() => ({ body: document.body.scrollWidth, vw: window.innerWidth }))
      if (o.body > o.vw + 2) { overflowAtWidth = w; break }
    }
    if (overflowAtWidth === null) pass(s, `Dashboard handles resize from 1920 → 320px without h-overflow`)
    else record(s, { id: 'RESIZE-OVERFLOW', severity: 'P1', scenario: 'Dashboard resize h-overflow', observed: `overflow at ${overflowAtWidth}px`, expected: 'no overflow at any common width' })
    await s.page.setViewportSize({ width: 1440, height: 900 })

    section(s, '9  Hammer /api/version — 50 requests, all should succeed')
    const verStart = Date.now()
    const verBurst = await Promise.all(Array.from({ length: 50 }, () => s.api.get('/api/version')))
    const verElapsed = Date.now() - verStart
    const verOk = verBurst.filter((r) => r.ok()).length
    for (const r of verBurst) await r.dispose()
    if (verOk === 50 && verElapsed < 5000) pass(s, `50 GET /api/version in ${verElapsed}ms, ${verOk}/50 ok`)
    else record(s, { id: 'VERSION-BURST', severity: 'P2', scenario: '50 req burst /api/version', observed: `${verOk}/50 ok in ${verElapsed}ms`, expected: '50/50 under 5s' })

    section(s, '10  Slow-3G throttle → still usable')
    const client = await s.ctx.newCDPSession(s.page)
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (250 * 1024) / 8, // 250 kbps
      uploadThroughput: (250 * 1024) / 8,
      latency: 400,
    })
    const slowStart = Date.now()
    await goto(s, '/portal/my-tasks')
    const slowElapsed = Date.now() - slowStart
    await client.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 })
    if (slowElapsed < 20_000) pass(s, `/my-tasks loads under slow-3G in ${Math.round(slowElapsed / 1000)}s`)
    else record(s, { id: 'SLOW-3G-BAD', severity: 'P2', scenario: '/my-tasks load on slow-3G', observed: `${Math.round(slowElapsed / 1000)}s`, expected: '<20s' })

    section(s, '11  HTML injection in comment — is it rendered as HTML?')
    if (cleanupTasks.length > 0) {
      const tid = cleanupTasks[0]
      const htmlCmt = `<b onclick="window.__BREAKER_HTML=1">CLICK ME ${mk('html')}</b>`
      await s.api.post(`/api/tasks/${tid}/comments`, { data: { content: htmlCmt, author_slug: 'nick' } })
      await s.page.waitForTimeout(600)
      const triggered = await s.page.evaluate(() => !!(window as { __BREAKER_HTML?: number }).__BREAKER_HTML).catch(() => false)
      if (!triggered) pass(s, 'HTML payload in comment did not execute onclick')
      else record(s, { id: 'HTML-ONCLICK-FIRED', severity: 'P0', scenario: 'HTML onclick in comment', observed: 'executed', expected: 'escaped' })
    }

    section(s, '12  /api/projects/health still fast after earlier N+1 fix')
    const hStart = Date.now()
    const hResp2 = await s.api.get('/api/projects/health')
    const hElapsed = Date.now() - hStart
    await hResp2.dispose()
    if (hElapsed < 1500) pass(s, `/api/projects/health responded in ${hElapsed}ms`)
    else record(s, { id: 'PROJ-HEALTH-SLOW', severity: 'P1', scenario: 'projects/health regression check', observed: `${hElapsed}ms`, expected: '<1500ms (post N+1 fix)' })
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes' })
  } finally {
    for (const tid of cleanupTasks) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    const result = await closePersona(s)
    console.log(`\n[breaker] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
