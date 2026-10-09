// health-unscoped.test.ts -- GET /api/health counts the DATABASE, not the
// caller (#145 Lane B review). On the viewer-bound handle an anonymous caller
// reads zero tasks, so the check answered 503 'tasks table empty' and the
// post-deploy probe in deploy:pages:gated failed after Pages was live.
// The health handler reads its counts on the unscoped handle; this file pins
// that it does, and that nothing else does.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import worker from './index'
import type { Env } from './types'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'

function world(): Env {
  const db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify(['ingra107@umn.edu']))
  _resetPiEmailsCacheForTests()
  for (let i = 0; i < 6; i++) insertRow(db, 'team_members', { id: `tm${i}`, name: `M ${i}`, slug: `m-${i}`, email: `m${i}@umn.edu` })
  insertRow(db, 'projects', { id: 'proj_h', slug: 'h', title: 'H', category: 'MNCCORE', status: 'active', stage: 'idea' })
  insertRow(db, 'tasks', { id: 't_h', project_id: 'proj_h', title: 'h', assignee: 'm-1' })
  insertRow(db, 'activity_log', { id: 'a_h', type: 'task', description: 'x', related_id: 't_h', related_type: 'task' })
  return { DB: d1Adapter(db), REQUIRE_AUTH: '1', TEST_MODE_KEY: TEST_KEY } as unknown as Env
}

async function health(env: Env, who?: string) {
  const headers: Record<string, string> = who ? { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who } : {}
  const res = await worker.fetch(new Request('https://hub.test/api/health', { headers }), env, CTX)
  return { status: res.status, body: JSON.parse(await res.text()) as { ok: boolean; failures: string[] } }
}

describe('GET /api/health is about the database, not the caller', () => {
  it('anonymous: 200, ok true (it sees no task row, the count still does)', async () => {
    const r = await health(world())
    expect(r.body.failures).toEqual([])
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
  })

  it('a member on no project with no task: still 200', async () => {
    const r = await health(world(), 'm5@umn.edu')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
  })

  it('no /api response that reads a scoped table is cacheable by a shared cache', () => {
    // Every `Cache-Control: public` left in api/ is on data that is the same
    // for every viewer: _meta version, team_members citations, the og card,
    // and public artifacts. Anything else must be private.
    const allowed = new Set(['lib/version.ts', 'routes/citations.ts', 'routes/og-card.ts', 'routes/public-artifact.ts'])
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    const files = [
      ...readdirSync(join(__dirname, 'lib')).map((f: string) => `lib/${f}`),
      ...readdirSync(join(__dirname, 'routes')).map((f: string) => `routes/${f}`),
    ].filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    const offenders = files.filter((f) => /Cache-Control['"]?\s*[,:]\s*['"]public/.test(readFileSync(join(__dirname, f), 'utf8')) && !allowed.has(f))
    expect(offenders).toEqual([])
    expect(readFileSync(join(__dirname, 'routes/insights.ts'), 'utf8')).toContain("'Cache-Control': 'private, no-store'")
  })

  it('the unscoped handle has exactly two readers: health, and the daily-digest fan-out (which rebinds per recipient)', () => {
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8')
    // Plus the slug-claim oracle (api/lib/project-slug.ts), which hands the
    // project create/rename routes one yes/no per value, never the handle:
    // pinned to that exact form on exactly those two routes.
    const ORACLE = "slugClaimCheck(c.get('unscopedDb'))"
    const lines = src.split('\n').filter((l) => l.includes("get('unscopedDb')"))
    const oracle = lines.filter((l) => l.includes(ORACLE))
    expect(oracle).toHaveLength(2)
    for (const l of oracle) expect(l.split("get('unscopedDb')").length - 1, l).toBe(1)
    for (const [path, fn] of [["path: '/api/projects',", 'handleCreateProject('], ["path: '/api/projects/:slug',", 'handleUpdateProject(']]) {
      const line = oracle.find((l) => l.includes(fn))
      expect(line, fn).toBeDefined()
      const at = src.indexOf(line!)
      const block = src.slice(src.lastIndexOf('defineRoute(', at), at)
      expect(block, fn).toContain("method: 'POST'")
      expect(block, fn).toContain(path)
    }
    const uses = lines.filter((l) => !l.includes(ORACLE))
    expect(uses).toHaveLength(2)
    for (const path of ["path: '/api/health'", "path: '/api/digest-email/daily'"]) {
      const start = src.indexOf(path)
      const end = src.indexOf('defineRoute(', start)
      expect(src.slice(start, end), path).toContain("get('unscopedDb')")
    }
  })
})
