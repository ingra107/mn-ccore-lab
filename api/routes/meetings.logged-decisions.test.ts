// A decision logged on a meeting page shows on that meeting (audit G02). Through
// the REAL worker, so env.DB is each caller's viewer-bound handle: the read
// carries the hub_decisions rule (table-scope.ts, Rule 90), from a member's seat.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NICK = 'ingra107@umn.edu'
const DAVE = 'dave@umn.edu' // a member on no project and no meeting; a lab meeting reaches him

let db: InstanceType<typeof Database>
let env: Env

async function detail(who: string, id: string) {
  const res = await worker.fetch(
    new Request(`https://hub.test/api/meetings/${id}`, { headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who } }),
    env, CTX,
  )
  const body = await res.json() as { data?: { logged_decisions?: { id: string; title: string; decided_by: string | null }[] } }
  return { status: res.status, rows: body.data?.logged_decisions }
}

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-dave', name: 'Dave Wacker', slug: 'dave-wacker', member_type: 'research_team', email: DAVE })
  insertRow(db, 'projects', { id: 'proj_nick', slug: 'nick-proj', title: 'Nick project', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'project_members', { project_id: 'proj_nick', member_slug: 'nick-ingraham', added_by: 'test' })
  insertRow(db, 'meetings', { id: 'mtg-lab', date: '2026-10-06', title: 'MNCCORE', audience: 'lab', source_id: 'cal-lab-1', owner_slug: 'nick-ingraham' })
  insertRow(db, 'meetings', { id: 'mtg-priv', date: '2026-10-06', title: 'Private', owner_slug: 'nick-ingraham' })
  const dec = (id: string, extra: Record<string, unknown>) => insertRow(db, 'hub_decisions', { id, title: id, decided_by: 'nick-ingraham', ...extra })
  dec('dec-hub-id', { meeting_id: 'mtg-lab', created_at: '2026-10-06 10:00:00' })
  dec('dec-source-id', { meeting_id: 'cal-lab-1', created_at: '2026-10-06 11:00:00' })
  dec('dec-hidden-project', { meeting_id: 'mtg-lab', project_slug: 'nick-proj' })
  dec('_TEST_DELETE_decision_probe', { meeting_id: 'mtg-lab' })
  dec('dec-other-meeting', { meeting_id: 'mtg-priv' })
  dec('dec-no-meeting', {})
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: 'k', REQUIRE_AUTH: '1' } as unknown as Env
})

describe('GET /api/meetings/:id logged_decisions', () => {
  it('a member sees the decisions on either meeting id, oldest first, and no fixture', async () => {
    const { status, rows } = await detail(DAVE, 'mtg-lab')
    expect(status).toBe(200)
    expect(rows?.map((r) => r.id)).toEqual(['dec-hub-id', 'dec-source-id'])
    expect(rows?.[0].decided_by).toBe('nick-ingraham')
  })

  it("the viewer's rule holds: a decision on a project the member is not on stays hidden from him and not from Nick", async () => {
    expect((await detail(DAVE, 'mtg-lab')).rows?.map((r) => r.id)).not.toContain('dec-hidden-project')
    expect((await detail(NICK, 'mtg-lab')).rows?.map((r) => r.id)).toContain('dec-hidden-project')
  })

  it('a meeting the member cannot see answers 404, with no decisions', async () => {
    const { status, rows } = await detail(DAVE, 'mtg-priv')
    expect(status).toBe(404)
    expect(rows).toBeUndefined()
  })
})
