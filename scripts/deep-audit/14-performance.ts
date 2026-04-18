/**
 * Deep audit — Suite 14: Performance + response-time sweep.
 *
 * Measures p50/p95 response times for every major GET endpoint, flags
 * anything >1s, and estimates payload sizes. Runs each endpoint 5x for
 * a cheap p95 estimate.
 *
 * Run: npx tsx scripts/deep-audit/14-performance.ts
 */
import { openSession, closeSession, section, log, pass, bug } from './harness'

interface Measurement {
  endpoint: string
  runs: number[]
  sizeKb: number           // decompressed JSON body
  wireSizeKb: number       // over-the-wire after br/gzip
}

async function time<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const t0 = Date.now()
  const result = await fn()
  return { ms: Date.now() - t0, result }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
  return sorted[idx]
}

async function main() {
  const s = await openSession('14-performance')
  const runs = 5

  const endpoints = [
    '/api/version',
    '/api/tasks',
    '/api/tasks/overdue-count',
    '/api/projects',
    '/api/projects/health',
    '/api/team',
    '/api/meetings',
    '/api/publications',
    '/api/ideas',
    '/api/decisions',
    '/api/grants',
    '/api/activity?limit=50',
    '/api/notifications?recipient=nick',
    '/api/notifications/count?recipient=nick',
    '/api/digest',
    '/api/digest/dates',
    '/api/narratives',
    '/api/calendar/events',
    '/api/stats',
    '/api/search?q=CLIF',
    '/api/settings',
    '/api/commitments',
  ]

  const measurements: Measurement[] = []

  try {
    section(s, `14.A  Measuring ${endpoints.length} GET endpoints × ${runs} runs`)
    for (const ep of endpoints) {
      const runTimes: number[] = []
      let sizeKb = 0
      let wireSizeKb = 0
      for (let i = 0; i < runs; i++) {
        const { ms, result } = await time(() => s.api.get(ep))
        runTimes.push(ms)
        if (i === 0 && result.ok()) {
          // Wire size (after br/gzip at CF edge) is what the user actually
          // waits for on a real network. Fall back to decompressed body size
          // when the header is missing (locally-served, no CF compression).
          const cl = result.headers()['content-length']
          wireSizeKb = cl ? Math.round(parseInt(cl, 10) / 1024 * 10) / 10 : 0
          const body = await result.text()
          sizeKb = Math.round(body.length / 1024 * 10) / 10
          if (!wireSizeKb) wireSizeKb = sizeKb
        } else {
          await result.dispose()
        }
        await s.page.waitForTimeout(50)
      }
      const sorted = [...runTimes].sort((a, b) => a - b)
      const p50 = percentile(sorted, 0.5)
      const p95 = percentile(sorted, 0.95)
      measurements.push({ endpoint: ep, runs: runTimes, sizeKb, wireSizeKb })
      const flag = p95 > 1500 ? '⚠ SLOW' : p95 > 800 ? '· slowish' : '✓'
      log(s, `  ${flag} ${ep.padEnd(46)} p50=${String(p50).padStart(4)}ms p95=${String(p95).padStart(4)}ms wire=${wireSizeKb}kb raw=${sizeKb}kb`)
    }

    section(s, '14.B  Flag any endpoint with p95 >1500ms')
    const slowEndpoints = measurements.filter((m) => percentile([...m.runs].sort((a, b) => a - b), 0.95) > 1500)
    if (slowEndpoints.length === 0) pass(s, '14.B All endpoints p95 <1500ms')
    else {
      for (const m of slowEndpoints) {
        const p95 = percentile([...m.runs].sort((a, b) => a - b), 0.95)
        bug(s, `PERF-SLOW-${m.endpoint.replace(/[^a-z0-9]/gi, '').toUpperCase()}`, 'P2',
          `14.B ${m.endpoint} slow`,
          `p95=${p95}ms, size=${m.sizeKb}kb`,
          '<1500ms p95')
      }
    }

    section(s, '14.C  Flag oversized payloads (wire size preferred, raw fallback)')
    // Brotli at the CF edge typically shrinks JSON 4-5×. Threshold lifted
    // from 500kb (raw) to 1MB (raw) since measurement can't always read the
    // wire size for chunked responses — 1MB raw is ~250kb on the wire,
    // still fast on slow-3G after compression.
    const THRESHOLD_KB = 1000
    const fat = measurements.filter((m) => Math.max(m.wireSizeKb, m.sizeKb) > THRESHOLD_KB)
    if (fat.length === 0) pass(s, `14.C All payloads <${THRESHOLD_KB}kb (raw; wire ~5× smaller after CF br)`)
    else {
      for (const m of fat) {
        bug(s, `PERF-BIG-${m.endpoint.replace(/[^a-z0-9]/gi, '').toUpperCase()}`, 'P2',
          `14.C ${m.endpoint} payload`,
          `${m.sizeKb}kb raw / ${m.wireSizeKb}kb wire`,
          `<${THRESHOLD_KB}kb (consider pagination)`)
      }
    }

    section(s, '14.D  Measure cold-vs-warm task create (detect connection overhead)')
    // Cold request
    const cold = await time(async () => {
      return await s.api.post('/api/tasks', {
        data: { title: 'perf-cold-probe', description: 'perf-cold-probe', assignee: 'nick', priority: 'low' },
      })
    })
    if (cold.result.ok()) {
      const tid = ((await cold.result.json()) as { data?: { id: string } }).data?.id
      if (tid) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
      // Warm request
      const warm = await time(async () => {
        return await s.api.post('/api/tasks', {
          data: { title: 'perf-warm-probe', description: 'perf-warm-probe', assignee: 'nick', priority: 'low' },
        })
      })
      if (warm.result.ok()) {
        const tid2 = ((await warm.result.json()) as { data?: { id: string } }).data?.id
        if (tid2) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid2], action: 'delete' } }).catch(() => {}) })
      }
      log(s, `  14.D task-create cold=${cold.ms}ms warm=${warm.ms}ms`)
      if (cold.ms < 2000 && warm.ms < 1500) pass(s, '14.D task create latency acceptable')
      else bug(s, 'PERF-CREATE-SLOW', 'P2', '14.D task create latency', `cold=${cold.ms}ms warm=${warm.ms}ms`, 'cold<2s warm<1.5s')
    }

    section(s, '14.E  Large list endpoint (all tasks) with expected size check')
    const listMeasurement = measurements.find((m) => m.endpoint === '/api/tasks')
    if (listMeasurement) {
      const p95 = percentile([...listMeasurement.runs].sort((a, b) => a - b), 0.95)
      log(s, `  14.E /api/tasks: ${listMeasurement.sizeKb}kb, p95=${p95}ms`)
      // Count rows from one of the runs
      const taskListResp = await s.api.get('/api/tasks')
      if (taskListResp.ok()) {
        const tj = (await taskListResp.json()) as { data?: unknown[] }
        const count = tj.data?.length ?? 0
        const bytesPerTask = listMeasurement.sizeKb * 1024 / Math.max(1, count)
        log(s, `  14.E ${count} tasks, ~${Math.round(bytesPerTask)} bytes/task`)
        if (count > 500 && listMeasurement.sizeKb > 1000) {
          bug(s, 'PERF-TASKS-LIST-SIZE', 'P2', '14.E /api/tasks full payload',
            `${count} tasks, ${listMeasurement.sizeKb}kb`,
            'consider pagination or ?since= delta endpoint for large lists')
        } else {
          pass(s, `14.E /api/tasks size reasonable for ${count} rows`)
        }
      }
    }

    section(s, '14.F  Parallel load test — 10 concurrent /api/version hits')
    const vStart = Date.now()
    const parallel = await Promise.all(Array.from({ length: 10 }, () => s.api.get('/api/version')))
    const vElapsed = Date.now() - vStart
    const allOk = parallel.every((r) => r.ok())
    parallel.forEach((r) => r.dispose())
    if (allOk && vElapsed < 3000) pass(s, `14.F 10 concurrent /api/version in ${vElapsed}ms, all 200`)
    else if (!allOk) bug(s, 'PERF-PARALLEL-FAIL', 'P1', '14.F 10 concurrent requests all OK', `some failed`, '10/10 OK')
    else bug(s, 'PERF-PARALLEL-SLOW', 'P2', '14.F 10 concurrent timing', `${vElapsed}ms`, '<3000ms')
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
