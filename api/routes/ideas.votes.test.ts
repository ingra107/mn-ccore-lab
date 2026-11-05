// Ideas: one vote per person, with a toggle, counted from idea_votes (schema-v158).
// Through the real worker (the viewer-bound handle, from a member's seat) on the
// migration-chain database, and the migration file itself for the existing votes.

import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const DAN = 'shyu@umn.edu'
const STRANGER = 'stranger@umn.edu'

let db: InstanceType<typeof Database>
let env: Env

interface Idea { id: string; votes: number; voters: string[] }

async function call(method: string, path: string, who: string, body?: unknown) {
  const headers: Record<string, string> = { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, CTX)
  const json = await res.json().catch(() => ({})) as { data?: unknown }
  return { status: res.status, data: json.data }
}
const vote = (who: string, id = 'idea_a', body?: unknown) => call('POST', `/api/ideas/${id}/vote`, who, body)
const list = async (who: string) => (await call('GET', '/api/ideas', who)).data as Idea[]
const rows = (id = 'idea_a') => db.prepare('SELECT slug FROM idea_votes WHERE idea_id = ? ORDER BY slug').all(id) as { slug: string }[]

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  insertRow(db, 'team_members', { id: 'tm-dan', name: 'Dan', slug: 'dan-shyu', member_type: 'research_team', email: DAN })
  insertRow(db, 'ideas', { id: 'idea_a', title: 'A', submitted_by: 'dan-shyu' })
  insertRow(db, 'ideas', { id: 'idea_b', title: 'B', submitted_by: 'dan-shyu' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals(); _resetPiEmailsCacheForTests() })

describe('one vote per person, with a toggle', () => {
  it('a vote lands once, under the viewer, and a second press takes it back', async () => {
    const first = await vote(CASEY)
    expect(first.status).toBe(200)
    expect(first.data).toMatchObject({ id: 'idea_a', votes: 1, voters: ['casey-eddington'] })
    expect(rows()).toEqual([{ slug: 'casey-eddington' }])
    const second = await vote(CASEY)
    expect(second.data).toMatchObject({ votes: 0, voters: [] })
    expect(rows()).toEqual([])
  })

  it('two people count as two, each with their own face', async () => {
    await vote(CASEY)
    const r = await vote(DAN)
    expect(r.data).toMatchObject({ votes: 2 })
    expect([...(r.data as Idea).voters].sort()).toEqual(['casey-eddington', 'dan-shyu'])
  })

  it('a stated value is idempotent: a retry never flips it', async () => {
    await vote(CASEY, 'idea_a', { voted: true })
    const again = await vote(CASEY, 'idea_a', { voted: true })
    expect(again.data).toMatchObject({ votes: 1 })
    await vote(CASEY, 'idea_a', { voted: false })
    const off = await vote(CASEY, 'idea_a', { voted: false })
    expect(off.data).toMatchObject({ votes: 0 })
  })

  it('a body cannot vote as someone else, or state nonsense', async () => {
    await vote(CASEY, 'idea_a', { slug: 'dan-shyu', voted: true })
    expect(rows()).toEqual([{ slug: 'casey-eddington' }])
    expect((await vote(CASEY, 'idea_a', { voted: 'yes' })).status).toBe(400)
  })

  it('the list counts from the table, and sorts by that count', async () => {
    await vote(CASEY, 'idea_b')
    db.prepare("UPDATE ideas SET votes = 99 WHERE id = 'idea_a'").run() // the old column means nothing now
    const ideas = await list(CASEY)
    expect(ideas.map((i) => [i.id, i.votes])).toEqual([['idea_b', 1], ['idea_a', 0]])
  })

  it('a new idea starts with no votes and no voters', async () => {
    const r = await call('POST', '/api/ideas', CASEY, { title: 'New' })
    expect(r.status).toBe(201)
    expect(r.data).toMatchObject({ votes: 0, voters: [] })
  })

  it('an unknown idea is a 404 and writes nothing', async () => {
    expect((await vote(CASEY, 'nope')).status).toBe(404)
    expect(rows('nope')).toEqual([])
  })

  it('someone who is not a member cannot vote', async () => {
    expect((await vote(STRANGER)).status).toBe(403)
    expect(rows()).toEqual([])
  })
})

describe('Rule 90: an idea on a project follows that project', () => {
  beforeEach(() => {
    insertRow(db, 'projects', { id: 'proj_p', slug: 'p', title: 'P', category: 'MNCCORE' })
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES ('proj_p', 'dan-shyu', 'test')").run()
    insertRow(db, 'ideas', { id: 'idea_p', title: 'Private', submitted_by: 'dan-shyu', project_id: 'proj_p' })
  })

  it('a member off the project cannot vote on it, and it answers as absent', async () => {
    expect((await vote(CASEY, 'idea_p')).status).toBe(404)
    expect(rows('idea_p')).toEqual([])
  })

  it('a member on it can, and the voters of a hidden idea do not reach anyone else', async () => {
    expect((await vote(DAN, 'idea_p')).data).toMatchObject({ votes: 1, voters: ['dan-shyu'] })
    expect((await list(CASEY)).map((i) => i.id)).not.toContain('idea_p')
    const dan = await list(DAN)
    expect(dan.find((i) => i.id === 'idea_p')).toMatchObject({ votes: 1, voters: ['dan-shyu'] })
  })
})

describe('schema-v158 carries the votes that have no voter', () => {
  const migrate = () => db.exec(readFileSync('api/schema-v158-idea-votes.sql', 'utf8'))

  beforeEach(() => {
    db.prepare("UPDATE ideas SET votes = 3 WHERE id = 'idea_a'").run()
    db.prepare("UPDATE ideas SET votes = 0 WHERE id = 'idea_b'").run()
  })

  it('no count changes, and a placeholder draws no face', async () => {
    migrate()
    const ideas = await list(CASEY)
    expect(ideas.find((i) => i.id === 'idea_a')).toMatchObject({ votes: 3, voters: [] })
    expect(ideas.find((i) => i.id === 'idea_b')).toMatchObject({ votes: 0, voters: [] })
  })

  it('running it twice adds nothing, and picks up a vote the old Worker counted meanwhile', () => {
    migrate()
    migrate()
    expect(rows()).toHaveLength(3)
    db.prepare("UPDATE ideas SET votes = 4 WHERE id = 'idea_a'").run()
    migrate()
    expect(rows()).toHaveLength(4)
  })

  it('a real vote adds to the old count, and taking it back returns to it', async () => {
    migrate()
    expect((await vote(CASEY)).data).toMatchObject({ votes: 4, voters: ['casey-eddington'] })
    expect((await vote(CASEY)).data).toMatchObject({ votes: 3, voters: [] })
  })
})
