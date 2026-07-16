// projects.create-defaults.test.ts — backlog #614
//
// handleCreateProject (POST /api/projects) defaulted category='MNCCORE' and
// stage='idea' when the caller omitted them, but had NO default for
// domain/tier — every Hub-created project landed with domain=NULL,
// tier=NULL, silently dropping it from the Dataview dashboards that filter
// on those fields (Docs/improvement-backlog.md #614). PB's `create_project()`
// has always defaulted domain="Research"/tier="2-Biweekly"; this closes the
// asymmetry so a Hub-created project is never worse-defaulted than a
// PB-created one. Live evidence (prod D1, 2026-07-16): the one row whose
// created_at carries the Hub TS `nowInstant()` signature (ISO8601+ms+Z) —
// clif-steering-committee, proj_01KVWXMDRGF9DFKGNTP3KBVGXP — has
// domain=NULL/tier=NULL while every other field handleCreateProject DOES
// default (category) is set; the other 7 NULL rows predate this route
// entirely (raw-inserted or pre-dating the schema-v71 column add) and are
// NOT evidence for or against this code path — see the #614 provenance note
// filed alongside this fix.

import { describe, it, expect, beforeEach } from 'vitest'
import { handleCreateProject } from './projects'
import { _resetValidationFlagsCache } from '../helpers'
import type { Env, AuthUser } from '../helpers'

const fakeUser = { email: 'nick@umn.edu', name: 'Nick' } as AuthUser

// Minimal D1 stub covering exactly what handleCreateProject's call chain
// touches: the slug-collision SELECT, lab_settings (validators stay OFF —
// getValidationFlags catches any stub gap and falls back all-off),
// processed_mutations idempotency lookup, the generic projects INSERT
// (captures whatever columns applyInsert actually writes), the post-insert
// SELECT * re-read, and the activity_log INSERT logActivity fires.
function makeStubDB() {
  const store = new Map<string, Record<string, unknown>>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeStmt(sql: string, boundVals: unknown[]): any {
    const upper = sql.trim().toUpperCase()
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T>() => {
        if (upper.includes('FROM LAB_SETTINGS')) return null as T | null
        if (upper.includes('FROM PROCESSED_MUTATIONS')) return null as T | null
        if (upper.includes('SELECT ID FROM PROJECTS WHERE SLUG')) return null as T | null
        if (upper.includes('SELECT * FROM PROJECTS WHERE ID')) {
          const id = boundVals[0] as string
          return (store.get(id) ?? null) as T | null
        }
        return null as T | null
      },
      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        if (upper.startsWith('INSERT INTO PROJECTS')) {
          const m = sql.match(/INSERT INTO \w+ \(([^)]+)\)/i)
          if (m) {
            const cols = m[1].split(',').map((s) => s.trim())
            const row: Record<string, unknown> = {}
            cols.forEach((c, i) => { row[c] = boundVals[i] })
            row.seq = store.size + 1
            row.deleted_at = null
            store.set(row.id as string, row)
          }
          return { meta: { changes: 1 } }
        }
        // processed_mutations INSERT, activity_log INSERT — no-op success.
        return { meta: { changes: 1 } }
      },
    }
  }

  return {
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => Promise.all(stmts.map((s) => s.run())),
  } as unknown as Env['DB']
}

function envWith(db: Env['DB']): Env {
  return { DB: db } as unknown as Env
}

beforeEach(() => _resetValidationFlagsCache())

describe('#614 handleCreateProject — domain/tier defaults', () => {
  it('defaults domain to "Research" and tier to "2-Biweekly" when omitted', async () => {
    const env = envWith(makeStubDB())
    const req = new Request('https://x/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title: 'New CLIF Substudy' }),
    })
    const res = await handleCreateProject(req, fakeUser, env)
    expect(res.status).toBe(201)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.domain).toBe('Research')
    expect(body.data.tier).toBe('2-Biweekly')
    // Existing default behavior (category/stage) must stay intact.
    expect(body.data.category).toBe('MNCCORE')
    expect(body.data.stage).toBe('idea')
  })

  it('honors an explicit domain/tier when the caller supplies them', async () => {
    const env = envWith(makeStubDB())
    const req = new Request('https://x/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title: 'Grant Renewal', domain: 'Grants', tier: '1-Weekly' }),
    })
    const res = await handleCreateProject(req, fakeUser, env)
    expect(res.status).toBe(201)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.domain).toBe('Grants')
    expect(body.data.tier).toBe('1-Weekly')
  })
})
