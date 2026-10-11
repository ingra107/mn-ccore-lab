/**
 * Section I — file upload + R2. Lightweight: verify the upload endpoint
 * exists. Full drag-drop coverage requires real file fixture.
 */
import { openSession, closeSession, log, pass, bug, persistFindingsJson } from '../lib/harness'

export async function runSectionI(runId: string, rootDir: string) {
  const s = await openSession({ section: 'I-uploads', runId, rootDir })
  try {
    log(s, 'I — uploads endpoint existence')
    // Presigned URL endpoint is at /api/uploads/presign or similar
    const candidates = ['/api/uploads/presign', '/api/upload/url', '/api/files/presign']
    let found = false
    for (const path of candidates) {
      const r = await s.api.post(path, { data: { filename: '_TEST_DELETE_probe.txt', contentType: 'text/plain' } }).catch(() => null)
      if (!r) continue
      if (r.status() < 500 && r.status() !== 404) {
        pass(s, `I upload endpoint ${path} returns ${r.status()}`)
        found = true
        break
      }
    }
    if (!found) bug(s, 'I.1', 'P2', 'upload presign endpoint reachable', `tried ${candidates.join(', ')}, all 404/5xx`, 'one returns <500')
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'I-uploads', passes, bugs }
}
