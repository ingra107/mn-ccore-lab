/**
 * Persona: health-check probe.
 *
 * Hits /api/health once and fails the preflight if the endpoint reports
 * ok:false or returns non-200. Catches D1 regressions, empty-table
 * failures, stalled activity pipelines — anything that indicates the
 * production Hub is broken from an ops standpoint.
 *
 * Run: npx tsx scripts/pre-flight/persona-health.ts
 */
import { openPersona, closePersona, section, pass, record } from './shared'

async function main() {
  const s = await openPersona({
    persona: 'health',
    role: 'Ops health probe — /api/health',
  })

  try {
    section(s, '1  GET /api/health — deployed environment health')
    const resp = await s.api.get('/api/health')
    const body = await resp.json().catch(() => ({ ok: false, failures: ['invalid JSON'] })) as {
      ok?: boolean
      failures?: string[]
      checks?: Record<string, unknown>
      timestamp?: string
    }

    if (resp.status() === 200 && body.ok) {
      pass(s, `Health: OK (${Object.keys(body.checks || {}).length} checks, duration_ms=${body.checks?.duration_ms})`)
    } else {
      record(s, {
        id: 'HEALTH-FAIL',
        severity: 'P0',
        scenario: '/api/health reports healthy',
        observed: `HTTP ${resp.status()}, ok=${body.ok}, failures=[${(body.failures || []).join('; ')}]`,
        expected: 'HTTP 200 with ok:true',
      })
    }
  } catch (e) {
    record(s, {
      id: 'FATAL',
      severity: 'P0',
      scenario: 'Persona journey aborted',
      observed: (e as Error).message.slice(0, 200),
      expected: 'journey completes',
    })
  } finally {
    const result = await closePersona(s)
    console.log(`\n[health] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
