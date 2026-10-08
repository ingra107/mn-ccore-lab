// projects.last-activity.test.ts — GET /api/projects' last_activity projection
// (PB #8236, 2026-10-05).
//
// last_activity is the later of the activity rollup (MAX activity_entries
// .created_at, #95) and projects.last_meaningful_movement. The rollup alone
// froze for a project worked only through PB field writes, which post no
// timeline line by design (mutations.ts advanceProjectOwnMovement); the
// Projects-list sort merged LMM client-side, every other consumer did not.
// The merge now happens once, in the projection (api/lib/project-recency.ts).
//
// Runs on the migration-chain fixture (api/test-support/prod-schema-db.ts):
// the real projects and activity_entries tables, the real aggregate SQL.

import { describe, it, expect } from 'vitest'
import { handleGetProjects } from './projects'
import { lastWorkedIso } from '../lib/project-recency'
import type { AuthUser, Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' }

function makeEnv() {
  const db = prodSchemaDb()
  return { db, env: { DB: d1Adapter(db, {}) } as unknown as Env }
}

type Db = ReturnType<typeof prodSchemaDb>

function seedProject(db: Db, id: string, lmm: string | null) {
  insertRow(db, 'projects', {
    id, title: `Project ${id}`, slug: id.replace(/_/g, '-'), status: 'active',
    category: 'MNCCORE', last_meaningful_movement: lmm, deleted_at: null,
  })
}

function seedActivity(db: Db, projectId: string, createdAt: string, n = 1) {
  insertRow(db, 'activity_entries', {
    id: `ae_${projectId}_${n}`, entity_type: 'project', entity_id: projectId,
    project_id: projectId, kind: 'update', visibility: 'team', actor_slug: 'nick-ingraham',
    body: 'progress', created_at: createdAt, hidden_at: null,
  })
}

async function lastActivityById(env: Env, url = 'https://hub.test/api/projects') {
  const res = await handleGetProjects(new URL(url), env, NICK)
  const body = (await res.json()) as { data: Record<string, unknown>[] }
  return new Map(body.data.map((r) => [String(r.id), r.last_activity as string | null | undefined]))
}

describe('GET /api/projects last_activity merges last_meaningful_movement (PB #8236)', () => {
  it('a project with only old backfill activity and fresh PB movement reads the movement', async () => {
    const { db, env } = makeEnv()
    seedProject(db, 'proj_lpv', '2026-07-20 14:00:00')
    seedActivity(db, 'proj_lpv', '2026-03-12 09:00:00')
    expect((await lastActivityById(env)).get('proj_lpv')).toBe('2026-07-20T14:00:00Z')
  })

  it('a newer activity entry beats an older movement', async () => {
    const { db, env } = makeEnv()
    seedProject(db, 'proj_a', '2026-07-01 00:00:00')
    seedActivity(db, 'proj_a', '2026-09-30 08:30:00')
    expect((await lastActivityById(env)).get('proj_a')).toBe('2026-09-30T08:30:00Z')
  })

  it('a NULL movement leaves the rollup; no activity and no movement is null', async () => {
    const { db, env } = makeEnv()
    seedProject(db, 'proj_b', null)
    seedActivity(db, 'proj_b', '2026-05-05 05:05:05')
    seedProject(db, 'proj_c', null)
    const m = await lastActivityById(env)
    expect(m.get('proj_b')).toBe('2026-05-05T05:05:05Z')
    expect(m.get('proj_c')).toBeNull()
  })

  it('movement alone (no activity rows at all) is returned', async () => {
    const { db, env } = makeEnv()
    seedProject(db, 'proj_d', '2026-08-08 08:08:08')
    expect((await lastActivityById(env)).get('proj_d')).toBe('2026-08-08T08:08:08Z')
  })

  it('cursor mode (the PB sync wire) carries no derived last_activity', async () => {
    const { db, env } = makeEnv()
    seedProject(db, 'proj_e', '2026-08-08 08:08:08')
    const res = await handleGetProjects(new URL('https://hub.test/api/projects?seq_after=0'), env, NICK)
    const body = (await res.json()) as { data: Record<string, unknown>[] }
    const row = body.data.find((r) => r.id === 'proj_e')!
    expect(row).toBeDefined()
    expect(Object.prototype.hasOwnProperty.call(row, 'last_activity')).toBe(false)
  })
})

describe('lastWorkedIso compares instants, not strings', () => {
  it('mixed shapes: a zoned ISO value and a bare UTC stamp are compared by instant', () => {
    // Same day; lexically ' ' < 'T', so a string compare would pick the ISO
    // value even though the bare stamp is two hours later.
    expect(lastWorkedIso('2026-09-01T10:00:00Z', '2026-09-01 12:00:00')).toBe('2026-09-01T12:00:00Z')
    expect(lastWorkedIso('2026-09-01 12:00:00', '2026-09-01T10:00:00Z')).toBe('2026-09-01T12:00:00Z')
  })

  it('an unparseable value never wins', () => {
    expect(lastWorkedIso('not a date', '2026-09-01 12:00:00')).toBe('2026-09-01T12:00:00Z')
    expect(lastWorkedIso('2026-09-01 12:00:00', 'garbage')).toBe('2026-09-01T12:00:00Z')
    expect(lastWorkedIso('', null)).toBeNull()
    expect(lastWorkedIso(undefined, undefined)).toBeNull()
  })
})
