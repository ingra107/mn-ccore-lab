/**
 * Deep audit — Suite 13: Error resilience + security.
 *
 * Stress-test the API with bad inputs to make sure:
 *   - Malformed JSON → 400 not 500
 *   - Empty / invalid fields → proper validation error with message
 *   - XSS payloads in content → stored as-is but output-encoded on render
 *   - SQL-injection patterns in query params → D1 prepared statements hold
 *   - Very large payloads → either rejected or accepted without crash
 *   - Nonexistent resources → 404 not 500
 *   - Method-not-allowed → 405 not 500
 *   - Division by zero / edge arithmetic → no unhandled exceptions
 *
 * Run: npx tsx scripts/deep-audit/13-error-resilience.ts
 */
import { openSession, closeSession, section, log, pass, bug, apiGetTaskFromList, marker } from './harness'

async function main() {
  const s = await openSession('13-error-resilience')
  const cleanupTasks: string[] = []

  try {
    // ═══════════════════ MALFORMED INPUT ═══════════════════
    section(s, '13.A  Malformed JSON body on POST /api/tasks')
    const badJsonResp = await s.api.post('/api/tasks', {
      data: 'this is not json at all',
      headers: { 'Content-Type': 'application/json' },
    })
    if (badJsonResp.status() >= 400 && badJsonResp.status() < 500) pass(s, `13.A Malformed JSON returns ${badJsonResp.status()} (not 500)`)
    else bug(s, 'ERR-MALFORMED-JSON', 'P1', '13.A malformed JSON handling', `HTTP ${badJsonResp.status()}`, '400-499 (client error)')

    section(s, '13.B  Empty body on POST /api/tasks')
    const emptyResp = await s.api.post('/api/tasks', { data: {} })
    if (emptyResp.status() === 400) pass(s, '13.B Empty body rejected with 400')
    else bug(s, 'ERR-EMPTY-BODY', 'P1', '13.B empty body rejected', `HTTP ${emptyResp.status()}`, '400')

    section(s, '13.C  Whitespace-only description on POST /api/tasks')
    const wsResp = await s.api.post('/api/tasks', {
      data: { description: '   ', assignee: 'nick' },
    })
    // Could accept (description trimmed later) or reject. Either is valid — as long as no 500.
    if (wsResp.status() < 500) pass(s, `13.C Whitespace description handled gracefully (${wsResp.status()})`)
    else bug(s, 'ERR-WS-DESC', 'P1', '13.C whitespace description → no 500', `HTTP ${wsResp.status()}`, '<500')

    // ═══════════════════ XSS ═══════════════════
    section(s, '13.D  XSS payload in task title — stored raw, not executed at render')
    const xssTitle = `<script>window.XSS_TRIGGERED=true</script>${marker('xss')}`
    const xssResp = await s.api.post('/api/tasks', {
      data: { title: xssTitle, description: xssTitle, assignee: 'nick', priority: 'low' },
    })
    if (xssResp.ok()) {
      const t = ((await xssResp.json()) as { data?: { id: string; title: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.title === xssTitle) pass(s, '13.D XSS payload stored as-is (React escapes on render)')
      else bug(s, 'XSS-STRIP', 'P2', '13.D XSS round-trips untouched', String(t?.title), xssTitle)
      // Check via UI that script does NOT execute
      await s.page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'networkidle' })
      await s.page.waitForTimeout(1500)
      const wasTriggered = await s.page.evaluate(() => !!(window as unknown as { XSS_TRIGGERED?: boolean }).XSS_TRIGGERED).catch(() => false)
      if (!wasTriggered) pass(s, '13.D XSS <script> did NOT execute on /tasks (React sanitizes)')
      else bug(s, 'XSS-EXEC', 'P0', '13.D XSS payload executes in browser', 'window.XSS_TRIGGERED=true', 'React escaped, no execution')
    }

    section(s, '13.E  HTML injection via description in comment')
    const xssTask = cleanupTasks[0]
    if (xssTask) {
      const imgXss = `<img src=x onerror="window.IMG_XSS=1">${marker('img')}`
      const cResp = await s.api.post(`/api/tasks/${xssTask}/comments`, {
        data: { content: imgXss, author_slug: 'nick' },
      })
      if (cResp.ok()) {
        pass(s, '13.E HTML payload in comment accepted (React will escape)')
        await s.page.goto(`https://mn-ccore-lab.pages.dev/tasks?open=${xssTask}`, { waitUntil: 'networkidle' })
        await s.page.waitForTimeout(2000)
        const imgTriggered = await s.page.evaluate(() => !!(window as unknown as { IMG_XSS?: number }).IMG_XSS).catch(() => false)
        if (!imgTriggered) pass(s, '13.E <img onerror> did not execute in comment render')
        else bug(s, 'XSS-IMG-COMMENT', 'P0', '13.E img-tag XSS in comment', 'window.IMG_XSS=1', 'not executed')
      }
    }

    // ═══════════════════ SQL INJECTION ═══════════════════
    section(s, '13.F  SQL injection attempts in query params')
    const injPatterns = [
      `'; DROP TABLE tasks;--`,
      `' OR '1'='1`,
      `admin'--`,
      `1; DELETE FROM tasks WHERE 1=1`,
    ]
    let allSafe = true
    for (const pattern of injPatterns) {
      const r = await s.api.get(`/api/tasks?assignee=${encodeURIComponent(pattern)}`)
      if (!r.ok()) {
        allSafe = false
        bug(s, 'SQL-INJECT-CRASH', 'P0', `13.F SQL-injection pattern handled`, `HTTP ${r.status()} for "${pattern}"`, '200 with empty result')
      }
    }
    // Verify tasks table still exists + has rows
    const verify = await s.api.get('/api/tasks')
    const verifyBody = verify.ok() ? ((await verify.json()) as { data?: unknown[] }) : null
    const stillHasTasks = Array.isArray(verifyBody?.data) && (verifyBody?.data?.length ?? 0) > 100
    if (allSafe && stillHasTasks) pass(s, '13.F All SQL-injection patterns safely parameterized')
    else if (!stillHasTasks) bug(s, 'SQL-INJECT-DROPPED', 'P0', '13.F tasks table intact after injection attempts', `count=${verifyBody?.data?.length ?? 0}`, '>100')

    // ═══════════════════ NONEXISTENT RESOURCES ═══════════════════
    section(s, '13.G  Operations on nonexistent task id')
    const fakeId = 'deadbeef00000000deadbeef00000000'
    const r404 = await s.api.get(`/api/tasks/${fakeId}/comments`)
    if (r404.status() === 404 || r404.status() === 200) {
      const body = r404.ok() ? ((await r404.json()) as { data?: unknown[] }) : null
      const data = body?.data
      if (r404.status() === 404 || (Array.isArray(data) && data.length === 0)) pass(s, `13.G Nonexistent task comments → ${r404.status()} / empty, no crash`)
      else bug(s, 'GET-NONEXISTENT', 'P2', '13.G nonexistent task comments', JSON.stringify(body).slice(0, 100), 'empty array or 404')
    } else {
      bug(s, 'GET-NONEXISTENT-500', 'P1', '13.G nonexistent task should not 500', `HTTP ${r404.status()}`, '200/404')
    }

    section(s, '13.H  Update nonexistent task')
    const u404 = await s.api.post(`/api/tasks/${fakeId}`, { data: { priority: 'low' } })
    if (u404.status() === 404 || u404.ok()) pass(s, `13.H Update on missing task → ${u404.status()}, no crash`)
    else if (u404.status() >= 500) bug(s, 'UPDATE-NONEXISTENT-500', 'P1', '13.H update missing task', `HTTP ${u404.status()}`, '404 or 200 (no-op)')

    section(s, '13.I  Batch delete empty ids array')
    const emptyBatch = await s.api.post('/api/tasks/batch', { data: { ids: [], action: 'delete' } })
    if (emptyBatch.status() === 400) pass(s, '13.I Empty ids array rejected with 400')
    else bug(s, 'BATCH-EMPTY-IDS', 'P2', '13.I empty batch ids rejected', `HTTP ${emptyBatch.status()}`, '400')

    section(s, '13.J  Batch with 100 ids — bulk operation handles')
    const bulkIds = Array.from({ length: 100 }, (_, i) => `nonexistent-${i}`)
    const bulkResp = await s.api.post('/api/tasks/batch', { data: { ids: bulkIds, action: 'delete' } })
    if (bulkResp.ok()) pass(s, `13.J 100-id batch accepted (${bulkResp.status()}) — idempotent on missing`)
    else if (bulkResp.status() < 500) pass(s, `13.J 100-id batch rejected with ${bulkResp.status()}`)
    else bug(s, 'BATCH-LARGE-500', 'P1', '13.J large batch handling', `HTTP ${bulkResp.status()}`, '<500')

    section(s, '13.K  Very long description (100KB)')
    const hugeDesc = 'A'.repeat(100_000)
    const hugeResp = await s.api.post('/api/tasks', {
      data: { title: marker('huge'), description: hugeDesc, assignee: 'nick', priority: 'low' },
    })
    if (hugeResp.ok()) {
      const t = ((await hugeResp.json()) as { data?: { id: string; description: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.description === hugeDesc) pass(s, `13.K 100KB description round-trips intact`)
      else bug(s, 'HUGE-DESC-TRUNCATED', 'P2', '13.K 100KB description length', `returned length=${t?.description?.length}`, String(hugeDesc.length))
    } else if (hugeResp.status() === 413 || hugeResp.status() === 400) {
      pass(s, `13.K 100KB description rejected with ${hugeResp.status()} (payload limit)`)
    } else {
      bug(s, 'HUGE-DESC-500', 'P1', '13.K large description handling', `HTTP ${hugeResp.status()}`, '200 / 400 / 413')
    }

    section(s, '13.L  Method not allowed — DELETE /api/tasks/:id (API uses POST)')
    const delResp = await s.api.delete(`/api/tasks/${fakeId}`)
    if (delResp.status() === 404 || delResp.status() === 405) {
      pass(s, `13.L DELETE method → ${delResp.status()} (properly not supported)`)
    } else if (delResp.status() >= 500) {
      bug(s, 'METHOD-NOT-HANDLED', 'P2', '13.L unsupported DELETE verb', `HTTP ${delResp.status()}`, '404 / 405')
    } else {
      log(s, `  13.L DELETE responded ${delResp.status()} (unusual but not a crash)`)
    }

    section(s, '13.M  Query string with extreme length')
    const longQuery = 'a'.repeat(5_000)
    const lqResp = await s.api.get(`/api/search?q=${encodeURIComponent(longQuery)}`)
    if (lqResp.ok() || lqResp.status() === 414 || lqResp.status() === 400) {
      pass(s, `13.M 5000-char query handled (${lqResp.status()})`)
    } else {
      bug(s, 'LONG-QUERY-500', 'P2', '13.M long query handling', `HTTP ${lqResp.status()}`, '200 / 400 / 414')
    }

    section(s, '13.N  CORS preflight OPTIONS')
    const corsResp = await s.api.fetch('https://mn-ccore-lab.pages.dev/api/tasks', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://example.com', 'Access-Control-Request-Method': 'POST' },
    })
    const corsHeader = corsResp.headers()['access-control-allow-origin']
    if (corsResp.ok() && corsHeader) pass(s, `13.N CORS preflight returns allow-origin=${corsHeader}`)
    else bug(s, 'CORS-PREFLIGHT', 'P2', '13.N OPTIONS preflight', `status=${corsResp.status()} allow-origin=${corsHeader}`, '200 + allow-origin set')

    section(s, '13.O  Unicode emoji in title — no corruption')
    const emojiTitle = `🎯 ${marker('emoji')} 🧬 ∑∆√π ℥`
    const eResp = await s.api.post('/api/tasks', {
      data: { title: emojiTitle, description: emojiTitle, assignee: 'nick', priority: 'low' },
    })
    if (eResp.ok()) {
      const t = ((await eResp.json()) as { data?: { id: string; title: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.title === emojiTitle) pass(s, '13.O Unicode + emoji round-trips bit-exact')
      else bug(s, 'UNICODE-CORRUPTED', 'P1', '13.O unicode emoji round-trip', String(t?.title), emojiTitle)
    }

    section(s, '13.P  Null-byte injection in title')
    const nullByte = `before\u0000after-${marker('nullbyte')}`
    const nbResp = await s.api.post('/api/tasks', {
      data: { title: nullByte, description: nullByte, assignee: 'nick', priority: 'low' },
    })
    if (nbResp.ok()) {
      const t = ((await nbResp.json()) as { data?: { id: string; title: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      // Either stored as-is or stripped at null byte; both acceptable, no crash
      pass(s, `13.P Null byte handled: stored length=${t?.title?.length}`)
    } else if (nbResp.status() < 500) {
      pass(s, `13.P Null byte rejected with ${nbResp.status()}`)
    } else {
      bug(s, 'NULLBYTE-CRASH', 'P2', '13.P null byte handling', `HTTP ${nbResp.status()}`, '<500')
    }

    section(s, '13.Q  Status override via PUT (should fail, API uses POST)')
    const putResp = await s.api.put(`/api/tasks/${fakeId}`, { data: { status: 'done' } })
    if (putResp.status() === 404 || putResp.status() === 405) pass(s, `13.Q PUT returns ${putResp.status()} (not crashing)`)
    else if (putResp.status() >= 500) bug(s, 'PUT-CRASH', 'P2', '13.Q PUT handling', `HTTP ${putResp.status()}`, '404 / 405')
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const t of cleanupTasks) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [t], action: 'delete' } }).catch(() => {}) })
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
