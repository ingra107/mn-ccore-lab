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
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's stub stored whatever columns the INSERT named and echoed
// them back, so a default the schema rejects (a CHECK, a NOT NULL, an FK)
// would still have passed. Here the asserted values are read from the stored
// row, and the create carries its processed_mutations receipt.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleCreateProject } from './projects'
import { _resetValidationFlagsCache } from '../helpers'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

const fakeUser = { email: 'nick@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
})

const stored = (id: string) =>
  db.prepare('SELECT domain, tier, category, stage FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined
const receiptFor = (id: string) =>
  db.prepare('SELECT outcome, table_name FROM processed_mutations WHERE record_id = ?').get(id) as { outcome: string; table_name: string } | undefined

describe('#614 handleCreateProject — domain/tier defaults', () => {
  it('defaults domain to "Research" and tier to "2-Biweekly" when omitted', async () => {
    const req = new Request('https://x/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title: 'New CLIF Substudy' }),
    })
    const res = await handleCreateProject(req, fakeUser, env)
    expect(res.status).toBe(201)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.domain).toBe('Research')
    expect(body.data.tier).toBe('2-Biweekly')
    // Existing default behavior (category/stage) must stay intact — on the stored row too.
    expect(stored(body.data.id as string)).toEqual({ domain: 'Research', tier: '2-Biweekly', category: 'MNCCORE', stage: 'idea' })
    expect(receiptFor(body.data.id as string)).toEqual({ outcome: 'accepted', table_name: 'projects' })
  })

  it('honors an explicit domain/tier when the caller supplies them', async () => {
    const req = new Request('https://x/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title: 'Grant Renewal', domain: 'Grants', tier: '1-Weekly' }),
    })
    const res = await handleCreateProject(req, fakeUser, env)
    expect(res.status).toBe(201)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data.domain).toBe('Grants')
    expect(body.data.tier).toBe('1-Weekly')
    expect(stored(body.data.id as string)).toMatchObject({ domain: 'Grants', tier: '1-Weekly' })
  })
})
