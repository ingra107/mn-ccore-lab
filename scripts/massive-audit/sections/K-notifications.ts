/**
 * Section K — notifications + mention surfaces.
 */
import { openSession, closeSession, log, pass, bug, persistFindingsJson } from '../lib/harness'

export async function runSectionK(runId: string, rootDir: string) {
  const s = await openSession({ section: 'K-notifications', runId, rootDir })
  try {
    log(s, 'K — notifications endpoints')
    const r = await s.api.get('/api/notifications')
    if (r.ok()) {
      const j = (await r.json()) as any
      const count = j?.data?.length ?? 0
      pass(s, `K /api/notifications returns ${count} item(s)`)
    } else {
      bug(s, 'K.0', 'P1', '/api/notifications reachable', `status=${r.status()}`, '200')
    }
    const c = await s.api.get('/api/notifications/count')
    if (c.ok()) pass(s, 'K /api/notifications/count reachable')
    else bug(s, 'K.1', 'P2', '/api/notifications/count reachable', `status=${c.status()}`, '200')
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'K-notifications', passes, bugs }
}
