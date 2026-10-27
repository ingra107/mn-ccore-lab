// #156: a release draft is Nick's until he approves it. The rule lives in
// TABLE_SCOPE, so every read through a viewer handle hides drafts from a
// non-PI member without the route having to remember. One pending draft at
// a time is a schema fact (partial unique index), not route discipline.
import { describe, it, expect } from 'vitest'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'
import { viewerDb, personViewer, serviceViewer, nobodyViewer } from './viewer-db'

const CASEY = personViewer({ slug: 'casey-eddington', email: 'eddin022@umn.edu', pi: false })
const NICK = personViewer({ slug: 'nick-ingraham', email: 'ingra107@umn.edu', pi: true })

function seeded() {
  const db = prodSchemaDb()
  db.prepare("INSERT INTO hub_releases (id, status, commit_from, commit_to) VALUES ('rel_a', 'approved', 'a1', 'a2')").run()
  db.prepare("INSERT INTO hub_releases (id, status, commit_from, commit_to) VALUES ('rel_d', 'draft', 'a2', 'a3')").run()
  db.prepare("INSERT INTO hub_releases (id, status, commit_from, commit_to) VALUES ('rel_x', 'discarded', 'a0', 'a1')").run()
  return db
}

async function ids(h: D1Database): Promise<string[]> {
  const r = await h.prepare('SELECT id FROM hub_releases ORDER BY id').all<{ id: string }>()
  return r.results.map((x) => x.id)
}

describe('hub_releases scope (#156)', () => {
  it('a non-PI member reads approved releases only', async () => {
    const raw = d1Adapter(seeded()) as unknown as D1Database
    expect(await ids(viewerDb(raw, CASEY))).toEqual(['rel_a'])
  })
  it('nobody reads nothing beyond approved either', async () => {
    const raw = d1Adapter(seeded()) as unknown as D1Database
    expect(await ids(viewerDb(raw, nobodyViewer()))).toEqual(['rel_a'])
  })
  it('a PI and the service key read every row', async () => {
    const raw = d1Adapter(seeded()) as unknown as D1Database
    expect(await ids(viewerDb(raw, NICK))).toEqual(['rel_a', 'rel_d', 'rel_x'])
    expect(await ids(viewerDb(raw, serviceViewer()))).toEqual(['rel_a', 'rel_d', 'rel_x'])
  })
  it('refuses a second pending draft', () => {
    const db = seeded()
    expect(() => db.prepare("INSERT INTO hub_releases (id, status, commit_from, commit_to) VALUES ('rel_d2', 'draft', 'a3', 'a4')").run()).toThrow(/UNIQUE/)
  })
  it('announcements are lab-readable and capped at 280 chars', async () => {
    const db = prodSchemaDb()
    db.prepare("INSERT INTO hub_announcements (id, body, author_slug) VALUES ('ann_1', 'Retreat moved', 'nick-ingraham')").run()
    const h = viewerDb(d1Adapter(db) as unknown as D1Database, CASEY)
    const r = await h.prepare('SELECT id FROM hub_announcements').all<{ id: string }>()
    expect(r.results.map((x) => x.id)).toEqual(['ann_1'])
    expect(() => db.prepare("INSERT INTO hub_announcements (id, body, author_slug) VALUES ('ann_2', ?, 'nick-ingraham')").run('x'.repeat(281))).toThrow(/CHECK/)
  })
})
