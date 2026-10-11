/**
 * Section J — Hermes AI. Conditional: skip if listener not running.
 */
import { openSession, closeSession, log, pass, bug, persistFindingsJson } from '../lib/harness'

export async function runSectionJ(runId: string, rootDir: string) {
  const s = await openSession({ section: 'J-hermes', runId, rootDir })
  try {
    log(s, 'J — ai-requests endpoint health')
    const r = await s.api.get('/api/ai-requests?status=pending&limit=1')
    if (r.ok()) {
      pass(s, `J /api/ai-requests reachable (${r.status()})`)
    } else {
      bug(s, 'J.0', 'P2', 'ai-requests endpoint', `status=${r.status()}`, '200')
    }
    // Note: end-to-end @hermes test deferred until home AI listener known up.
    log(s, 'J end-to-end @hermes mention test deferred (requires home listener)')
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'J-hermes', passes, bugs }
}
