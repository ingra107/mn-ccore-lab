// R02: a generated agenda is shared text, so a private project update must not
// reach it, for a member or for the PI generating it: whoever generates the
// agenda reads it out to the room. Runs the route's own SQL on the real migration
// chain, from a member's viewer-bound handle and from the PI's.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Env } from '../helpers'
import { handleGenerateAgenda } from './meetings'
import { viewerDb, personViewer } from '../lib/viewer-db'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

let db: InstanceType<typeof Database>
let piEnv: Env
let memberEnv: Env

function update(id: string, visibility: 'team' | 'author', body: string, actor = 'alice') {
  insertRow(db, 'activity_entries', {
    id, entity_type: 'project', entity_id: 'proj_shared', project_id: 'proj_shared', kind: 'update',
    visibility, actor_slug: actor, body, created_at: '2026-10-20 12:00:00',
  })
}

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'projects', { id: 'proj_shared', slug: 'shared', title: 'Shared', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'team_members', { id: 'tm-bob', name: 'Bob', slug: 'bob', email: 'bob@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-alice', name: 'Alice', slug: 'alice', email: 'alice@umn.edu' })
  for (const slug of ['alice', 'bob']) {
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES ('proj_shared', ?, 'test')").run(slug)
  }
  insertRow(db, 'meetings', { id: 'mtg_prev', date: '2026-10-01', title: 'Lab sync', type: 'lab', attendees: '["bob"]' })
  insertRow(db, 'meetings', { id: 'mtg_now', date: '2026-11-01', title: 'Lab sync', type: 'lab', attendees: '["bob"]' })
  update('u_team', 'team', 'TEAM UPDATE')
  update('u_private', 'author', 'ALICE PRIVATE NOTE')
  update('u_own_private', 'author', 'BOB PRIVATE NOTE', 'bob')
  piEnv = { DB: d1Adapter(db) } as unknown as Env
  memberEnv = { DB: viewerDb(piEnv.DB, personViewer({ slug: 'bob', email: 'bob@umn.edu', pi: false })) } as unknown as Env
})

async function agendaText(env: Env) {
  const res = await handleGenerateAgenda('mtg_now', env, true)
  expect(res.status).toBe(200)
  return JSON.stringify(await res.json())
}

describe('generate-agenda: recent project updates', () => {
  it("a member's agenda has the team update and nobody's private note", async () => {
    const text = await agendaText(memberEnv)
    expect(text).toContain('TEAM UPDATE')
    expect(text).not.toContain('ALICE PRIVATE NOTE')
    expect(text).not.toContain('BOB PRIVATE NOTE')
  })

  it("the PI's agenda leaves private notes out too", async () => {
    const text = await agendaText(piEnv)
    expect(text).toContain('TEAM UPDATE')
    expect(text).not.toContain('PRIVATE NOTE')
  })
})
