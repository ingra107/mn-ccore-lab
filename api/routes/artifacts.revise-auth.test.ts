// R03, R07, R08: artifact revision and the artifact feed through the REAL
// resolveActor and visibility gate. artifacts.test.ts mocks both seams, which is
// how all three passed there.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { _resetPiEmailsCacheForTests, type AuthUser, type Env } from '../helpers'
import { handleCreateArtifact, handleGetArtifactActivity, handleReviseArtifact } from './artifacts'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const KEY = 'pb-key'
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const MEMBER: AuthUser = { email: 'bob@umn.edu', name: 'Bob', slug: 'bob' }
const OTHER: AuthUser = { email: 'eve@umn.edu', name: 'Eve', slug: 'eve' }
const PI: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' }
const SERVICE: AuthUser = { email: 'claude-ai', name: 'Hermes', slug: 'claude-ai' }

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'team_members', { id: 'tm-bob', name: 'Bob', slug: 'bob', email: 'bob@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-eve', name: 'Eve', slug: 'eve', email: 'eve@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' })
  insertRow(db, 'artifacts', { id: 'art_h', title: 'Hermes doc', body_md: 'original', version: 4, created_by: 'claude-ai' })
  insertRow(db, 'artifacts', { id: 'art_b', title: 'Bob doc', body_md: 'original', version: 1, created_by: 'bob' })
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run('["ingra107@umn.edu"]')
  _resetPiEmailsCacheForTests()
  env = { DB: d1Adapter(db), PB_API_KEY: KEY, TEST_MODE_KEY: TEST_KEY } as unknown as Env
})

function seat(user: AuthUser | 'service', url: string, body?: unknown): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (user === 'service') headers.Authorization = `Bearer ${KEY}`
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = user.email }
  return new Request(`https://example.com${url}`, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) })
}
const revise = (user: AuthUser | 'service', id: string, body: Record<string, unknown>) =>
  handleReviseArtifact(id, seat(user, `/api/artifacts/${id}/revise`, body), user === 'service' ? SERVICE : user, env)
const row = (id: string) => db.prepare('SELECT body_md, version, created_by FROM artifacts WHERE id = ?').get(id) as { body_md: string; version: number; created_by: string }

describe('R03: only the service or a PI may speak as Hermes', () => {
  it("a member naming claude-ai cannot overwrite Hermes's artifact", async () => {
    const res = await revise(MEMBER, 'art_h', { body_md: 'hijacked', revised_by: 'claude-ai' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(row('art_h')).toMatchObject({ body_md: 'original', version: 4 })
  })

  it('a member cannot create an artifact as Hermes', async () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM artifacts').get() as { n: number }).n
    const req = seat(MEMBER, '/api/artifacts', { title: 'Fake', body_md: 'x', created_by: 'claude-ai' })
    const res = await handleCreateArtifact(req, MEMBER, env)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect((db.prepare('SELECT COUNT(*) AS n FROM artifacts').get() as { n: number }).n).toBe(before)
  })

  it('the listener path still works: PB key, revised_by claude-ai', async () => {
    const res = await revise('service', 'art_h', { body_md: 'revised by hermes', revised_by: 'claude-ai', revision_note: 'n' })
    expect(res.status).toBe(200)
    expect(row('art_h')).toMatchObject({ body_md: 'revised by hermes', version: 5 })
    const v = db.prepare('SELECT revised_by FROM artifact_versions WHERE artifact_id = ? AND version = 4').get('art_h') as { revised_by: string }
    expect(v.revised_by).toBe('claude-ai')
  })

  it('a member still revises their own artifact', async () => {
    expect((await revise(MEMBER, 'art_b', { body_md: 'mine' })).status).toBe(200)
    expect(row('art_b').body_md).toBe('mine')
  })
})

describe('R07: concurrent revisions do not lose a version', () => {
  it('two revisions from one read: one lands, the other gets 409, history stays whole', async () => {
    // Hold both handlers at the same read of version 4: the second reads the row
    // as it stood before the first wrote.
    const stale = row('art_h')
    const adapter = d1Adapter(db)
    const raced = {
      ...env,
      DB: {
        ...adapter,
        prepare: (sql: string) => {
          const stmt = adapter.prepare(sql)
          if (!/^SELECT \* FROM artifacts WHERE id = \? LIMIT 1/.test(sql)) return stmt
          return { ...stmt, bind: () => ({ first: async () => ({ id: 'art_h', title: 'Hermes doc', content_type: 'markdown', ...stale }) }) }
        },
      },
    } as unknown as Env
    const send = (body: string) => {
      const req = seat('service', '/api/artifacts/art_h/revise', { body_md: body, revised_by: 'claude-ai' })
      return handleReviseArtifact('art_h', req, SERVICE, raced)
    }
    const first = await send('first')
    const second = await send('second')
    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(row('art_h')).toMatchObject({ body_md: 'first', version: 5 })
    const versions = db.prepare('SELECT version, body_md FROM artifact_versions WHERE artifact_id = ? ORDER BY version').all('art_h')
    expect(versions).toEqual([{ version: 4, body_md: 'original' }])
  })

  it('the archive and the replace land together: a failed replace leaves no phantom history', async () => {
    const failing = { ...env, DB: d1Adapter(db, { failSql: /^\s*UPDATE artifacts SET body_md/, failTimes: 1 }) } as unknown as Env
    const req = seat('service', '/api/artifacts/art_h/revise', { body_md: 'x', revised_by: 'claude-ai' })
    await expect(handleReviseArtifact('art_h', req, SERVICE, failing)).rejects.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM artifact_versions WHERE artifact_id = ?').get('art_h')).toEqual({ n: 0 })
    expect(row('art_h')).toMatchObject({ body_md: 'original', version: 4 })
  })
})

describe('R08: a private Hermes reply reaches its requester on the artifact page', () => {
  beforeEach(() => {
    const base = { entity_type: 'artifact', entity_id: 'art_b', kind: 'comment', created_at: '2026-11-01 10:00:00' }
    insertRow(db, 'activity_entries', { ...base, id: 'root_private', visibility: 'author', actor_slug: 'bob', body: '@hermes secret ask' })
    insertRow(db, 'activity_entries', { ...base, id: 'reply_private', parent_id: 'root_private', visibility: 'author', actor_slug: 'claude-ai', body: 'SECRET ANSWER' })
    insertRow(db, 'activity_entries', { ...base, id: 'root_team', visibility: 'team', actor_slug: 'eve', body: 'open comment' })
    insertRow(db, 'activity_entries', { ...base, id: 'root_eve', visibility: 'author', actor_slug: 'eve', body: '@hermes eve ask' })
    insertRow(db, 'activity_entries', { ...base, id: 'reply_eve', parent_id: 'root_eve', visibility: 'author', actor_slug: 'claude-ai', body: 'EVE ANSWER' })
  })
  async function feed(user: AuthUser | 'service', qs = '') {
    const res = await handleGetArtifactActivity('art_b', seat(user, `/api/artifacts/art_b/activity${qs}`), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { id: string }[]; hidden_count: number }
    return { ids: body.data.map((r) => r.id).sort(), hidden: body.hidden_count }
  }

  it("the requester reads their own private thread and nobody else's", async () => {
    expect((await feed(MEMBER)).ids).toEqual(['reply_private', 'root_private', 'root_team'])
  })

  it("the other member reads only their own private thread", async () => {
    expect((await feed(OTHER)).ids).toEqual(['reply_eve', 'root_eve', 'root_team'])
  })

  it('the PI and the listener read every row, as before', async () => {
    const all = ['reply_eve', 'reply_private', 'root_eve', 'root_private', 'root_team']
    expect((await feed(PI)).ids).toEqual(all)
    expect((await feed('service')).ids).toEqual(all)
  })

  it('a hidden thread counts for its owner and stays out of the feed', async () => {
    db.prepare("UPDATE activity_entries SET hidden_at = '2026-11-02 00:00:00' WHERE id IN ('root_private','reply_private')").run()
    expect(await feed(MEMBER)).toEqual({ ids: ['root_team'], hidden: 2 })
    expect((await feed(MEMBER, '?include_hidden=1')).ids).toEqual(['reply_private', 'root_private', 'root_team'])
  })
})
