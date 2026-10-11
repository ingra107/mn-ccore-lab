/**
 * Section H — realtime / multi-tab sync. Lightweight verification of the
 * /api/version polling endpoint and edge cache header. Full multi-tab
 * verification is deferred until the framework matures.
 */
import { openSession, closeSession, log, pass, bug, persistFindingsJson, BASE } from '../lib/harness'

export async function runSectionH(runId: string, rootDir: string) {
  const s = await openSession({ section: 'H-realtime', runId, rootDir })
  try {
    log(s, 'H — /api/version edge-cached versioning')
    const r = await s.api.get('/api/version')
    if (r.ok()) {
      pass(s, `H /api/version returns ${r.status()}`)
      const cc = r.headers()['cache-control'] || ''
      if (/max-age=10/.test(cc) || /s-maxage=10/.test(cc)) {
        pass(s, `H /api/version Cache-Control includes 10s edge cache (${cc})`)
      } else {
        bug(s, 'H.1', 'P2', '/api/version edge cache header', `cache-control=${cc}`, 'includes max-age=10 or s-maxage=10')
      }
      const body = (await r.json()) as any
      if (body?.v || body?.version || body?.timestamp) pass(s, `H /api/version returns version field`)
      else bug(s, 'H.2', 'P2', '/api/version body shape', JSON.stringify(body).slice(0, 100), 'has v / version / timestamp')
    } else {
      bug(s, 'H.0', 'P0', '/api/version reachable', `status=${r.status()}`, '200')
    }
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'H-realtime', passes, bugs }
}
