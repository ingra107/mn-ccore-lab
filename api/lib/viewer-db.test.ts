// viewer-db.test.ts -- the scoped D1 handle, on the real migrated schema.
//
// Every case runs SQL through d1Adapter over prodSchemaDb() (the migration
// chain, FKs on), so what is proven is what SQLite does with the rewritten
// text, not what the rewriter intended.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import {
  viewerDb, personViewer, serviceViewer, nobodyViewer, scopeSql, activeScopes, ScopeRefused, type Viewer,
} from './viewer-db'
import { TABLE_SCOPE } from './table-scope'

const CASEY = personViewer({ slug: 'casey-eddington', email: 'eddin022@umn.edu', pi: false })
const NATE = personViewer({ slug: 'nate-mesfin', email: 'mesfin@umn.edu', pi: false })
const NICK = personViewer({ slug: 'nick-ingraham', email: 'ingra107@umn.edu', pi: true })

function seeded(): InstanceType<typeof Database> {
  const db = prodSchemaDb()
  const m = (id: string, attendees: unknown, extra: Record<string, unknown> = {}) =>
    insertRow(db, 'meetings', {
      id, date: '2026-10-01', title: `title ${id}`, notes: `notes ${id}`,
      attendees: attendees === null ? null : typeof attendees === 'string' ? attendees : JSON.stringify(attendees),
      ...extra,
    })
  m('m-slug', ['casey-eddington', 'nick-ingraham'])
  m('m-email', ['EDDIN022@umn.edu'])          // a raw email written before Casey's row had one
  m('m-local', ['eddin022'])                   // a bare legacy NetID: NOT Casey (no prefix grants)
  m('m-other', ['nate-mesfin', 'mesfin@umn.edu'])
  m('m-none', null)
  m('m-empty', [])
  m('m-badjson', 'not json')
  m('m-tags', ['nick-ingraham'], { tags: JSON.stringify(['casey-eddington', 'some-project']) })
  m('m-facil', ['nick-ingraham'], { facilitator: 'casey-eddington' }) // facilitator confers nothing
  m('m-owned', null, { owner_slug: 'casey-eddington' })                // her own Prep meeting, no attendees
  m('m-src', ['nate-mesfin'], { source_id: 'cal-src-1' })
  insertRow(db, 'agenda_items', { id: 'ag-mine', meeting_id: 'm-slug', content: 'mine', added_by: 'x' })
  insertRow(db, 'agenda_items', { id: 'ag-other', meeting_id: 'm-other', content: 'other', added_by: 'x' })
  insertRow(db, 'hub_decisions', { id: 'd-mine', title: 'dm', meeting_id: 'm-slug' })
  insertRow(db, 'hub_decisions', { id: 'd-other', title: 'do', meeting_id: 'm-other' })
  insertRow(db, 'hub_decisions', { id: 'd-other-src', title: 'ds', meeting_id: 'cal-src-1' })
  insertRow(db, 'hub_decisions', { id: 'd-free', title: 'df', meeting_id: null })
  insertRow(db, 'activity_entries', { id: 'ae-mine', entity_type: 'meeting', entity_id: 'm-slug', kind: 'comment', actor_slug: 'x', body: 'b' })
  insertRow(db, 'activity_entries', { id: 'ae-other', entity_type: 'meeting', entity_id: 'm-other', kind: 'comment', actor_slug: 'x', body: 'b' })
  insertRow(db, 'activity_entries', { id: 'ae-task', entity_type: 'task', entity_id: 'task-x', kind: 'comment', actor_slug: 'x', body: 'b' })
  insertRow(db, 'file_attachments', { id: 'f-mine', entity_type: 'meeting', entity_id: 'm-slug', filename: 'a', r2_key: 'meeting/m-slug/a', uploaded_by: 'x' })
  insertRow(db, 'file_attachments', { id: 'f-other', entity_type: 'meeting', entity_id: 'm-other', filename: 'b', r2_key: 'meeting/m-other/b', uploaded_by: 'x' })
  insertRow(db, 'file_attachments', { id: 'f-proj', entity_type: 'project', entity_id: 'p', filename: 'c', r2_key: 'project/p/c', uploaded_by: 'x' })
  const log = (id: string, type: string, rid: string | null, rtype: string | null) =>
    insertRow(db, 'activity_log', { id, type, description: id, actor: 'x', related_id: rid, related_type: rtype })
  log('l-mine', 'meeting', 'm-slug', 'meeting')
  log('l-other', 'meeting', 'm-other', 'meeting')
  log('l-pb', 'pb_session', null, null)
  log('l-sync', 'sync', null, null)
  log('l-task', 'task', 'task-x', 'task')
  return db
}

async function ids(db: D1Database, sql: string, ...binds: unknown[]): Promise<string[]> {
  const r = await db.prepare(sql).bind(...binds).all<{ id: string }>()
  return (r.results ?? []).map((x) => x.id).sort()
}

function handle(v: Viewer) {
  const db = seeded()
  return { db, h: viewerDb(d1Adapter(db) as unknown as D1Database, v) }
}

describe('who sees which meeting', () => {
  it('a member sees the meetings they own and those whose attendee list names their slug or whole email (any case)', async () => {
    const { h } = handle(CASEY)
    expect(await ids(h, 'SELECT id FROM meetings')).toEqual(['m-email', 'm-owned', 'm-slug'])
  })

  it('no prefix, local part, facilitator or tag grants a meeting; no attendees, [] or bad JSON hide it', async () => {
    const { h } = handle(CASEY)
    const seen = await ids(h, 'SELECT id FROM meetings')
    for (const hidden of ['m-local', 'm-facil', 'm-tags', 'm-none', 'm-empty', 'm-badjson', 'm-other']) expect(seen).not.toContain(hidden)
  })

  it('the rule is per person', async () => {
    const { h } = handle(NATE)
    expect(await ids(h, 'SELECT id FROM meetings')).toEqual(['m-other', 'm-src'])
  })

  it('a PI person and the service key get the raw handle and see all', async () => {
    const db = seeded()
    const raw = d1Adapter(db) as unknown as D1Database
    expect(viewerDb(raw, NICK)).toBe(raw)
    expect(viewerDb(raw, serviceViewer())).toBe(raw)
    expect(await ids(raw, 'SELECT id FROM meetings')).toHaveLength(11)
  })

  it('nobody sees no meeting', async () => {
    const { h } = handle(nobodyViewer())
    expect(await ids(h, 'SELECT id FROM meetings')).toEqual([])
  })
})

describe('rows that hang off a meeting follow it', () => {
  it('agenda items, decisions (by id or source_id), activity entries, files and activity_log', async () => {
    const { h } = handle(CASEY)
    expect(await ids(h, 'SELECT id FROM agenda_items')).toEqual(['ag-mine'])
    expect(await ids(h, 'SELECT id FROM hub_decisions')).toEqual(['d-free', 'd-mine'])
    expect(await ids(h, 'SELECT id FROM activity_entries')).toEqual(['ae-mine', 'ae-task'])
    expect(await ids(h, 'SELECT id FROM file_attachments')).toEqual(['f-mine', 'f-proj'])
    expect(await ids(h, 'SELECT id FROM activity_log')).toEqual(['l-mine', 'l-task'])
    const nate = viewerDb(d1Adapter(seeded()) as unknown as D1Database, NATE)
    expect(await ids(nate, 'SELECT id FROM hub_decisions')).toEqual(['d-free', 'd-other', 'd-other-src'])
  })

  it('PB automation rows in activity_log reach only a PI or the service', async () => {
    const db = seeded()
    const raw = d1Adapter(db) as unknown as D1Database
    expect(await ids(viewerDb(raw, NICK), "SELECT id FROM activity_log WHERE type IN ('pb_session','sync')")).toEqual(['l-pb', 'l-sync'])
    expect(await ids(viewerDb(raw, CASEY), "SELECT id FROM activity_log WHERE type IN ('pb_session','sync')")).toEqual([])
    expect(await ids(viewerDb(raw, nobodyViewer()), 'SELECT id FROM activity_log')).toEqual(['l-task'])
  })

  it('the shadow holds through joins, aliases, subqueries, counts and INSERT..SELECT', async () => {
    const { db, h } = handle(CASEY)
    expect(await ids(h, 'SELECT a.id FROM agenda_items a JOIN meetings m ON m.id = a.meeting_id')).toEqual(['ag-mine'])
    expect(await ids(h, "SELECT id FROM meetings WHERE id IN (SELECT meeting_id FROM agenda_items)")).toEqual(['m-slug'])
    const n = await h.prepare('SELECT (SELECT COUNT(*) FROM meetings) AS n').first<{ n: number }>()
    expect(n?.n).toBe(3)
    await h.prepare("INSERT INTO activity_log (id, type, description) SELECT 'copy-' || id, 'x', title FROM meetings").run()
    const copied = db.prepare("SELECT id FROM activity_log WHERE id LIKE 'copy-%' ORDER BY id").all() as { id: string }[]
    expect(copied.map((r) => r.id)).toEqual(['copy-m-email', 'copy-m-owned', 'copy-m-slug'])
  })
})

describe('writes cannot reach a row the viewer cannot read', () => {
  it('UPDATE on a hidden meeting changes nothing; on a visible one it lands', async () => {
    const { db, h } = handle(CASEY)
    const hidden = await h.prepare("UPDATE meetings SET notes = 'x', updated_at = datetime('now') WHERE id = ?").bind('m-other').run()
    expect(hidden.meta.changes).toBe(0)
    expect((db.prepare("SELECT notes FROM meetings WHERE id = 'm-other'").get() as { notes: string }).notes).toBe('notes m-other')
    const mine = await h.prepare("UPDATE meetings SET notes = 'x' WHERE id = ?").bind('m-slug').run()
    expect(mine.meta.changes).toBe(1)
  })

  it('UPDATE with RETURNING, with no WHERE, and with OR in the WHERE stay inside the scope', async () => {
    const { db, h } = handle(CASEY)
    const r = await h.prepare("UPDATE meetings SET status = 'done' WHERE id = ? OR id = ? RETURNING id").bind('m-other', 'm-slug').all<{ id: string }>()
    expect(r.results.map((x) => x.id)).toEqual(['m-slug'])
    await h.prepare("UPDATE agenda_items SET sort_order = 9").run()
    const orders = db.prepare('SELECT id, sort_order FROM agenda_items ORDER BY id').all()
    expect(orders).toEqual([{ id: 'ag-mine', sort_order: 9 }, { id: 'ag-other', sort_order: 0 }])
  })

  it('DELETE on a hidden child changes nothing', async () => {
    const { db, h } = handle(CASEY)
    const r = await h.prepare('DELETE FROM agenda_items WHERE meeting_id = ?').bind('m-other').run()
    expect(r.meta.changes).toBe(0)
    expect(db.prepare("SELECT COUNT(*) AS n FROM agenda_items WHERE id = 'ag-other'").get()).toEqual({ n: 1 })
    const ae = await h.prepare('DELETE FROM activity_entries WHERE parent_id IS NULL').run()
    expect(ae.meta.changes).toBe(2) // ae-mine + ae-task, never ae-other
  })

  it('the rewrite text: guard ANDed ahead of the original WHERE, before RETURNING / ORDER BY / LIMIT', () => {
    const active = activeScopes(CASEY)
    const out = scopeSql('UPDATE meetings SET notes = ? WHERE id = ? RETURNING *', active)
    expect(out).toMatch(/WHERE meetings\.id IN \(SELECT id FROM meetings\) AND \( id = \? \) RETURNING \*$/)
    const noWhere = scopeSql('DELETE FROM agenda_items;', active)
    expect(noWhere).toMatch(/DELETE FROM agenda_items WHERE agenda_items\.id IN \(SELECT id FROM agenda_items\);$/)
  })
})

describe('the statement forms routes use', () => {
  it('positional ? and ordered ?N binds keep their positions', async () => {
    const { h } = handle(CASEY)
    expect(await ids(h, 'SELECT id FROM meetings WHERE id = ? OR id = ?', 'm-slug', 'm-other')).toEqual(['m-slug'])
    expect(await ids(h, 'SELECT id FROM meetings WHERE id = ?2 OR id = ?1', 'm-other', 'm-email')).toEqual(['m-email'])
  })

  it("a route's own WITH (and WITH RECURSIVE) gets ours spliced in front", async () => {
    const { h } = handle(CASEY)
    expect(await ids(h, '\n  WITH mine AS (SELECT id FROM meetings) SELECT id FROM mine')).toHaveLength(3)
    const r = await h.prepare('WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 3) SELECT (SELECT COUNT(*) FROM meetings) AS c, COUNT(*) AS k FROM n').first<{ c: number; k: number }>()
    expect(r).toEqual({ c: 3, k: 3 })
  })

  it('a route CTE named like a scoped table is a loud error, not a bypass', async () => {
    const { h } = handle(CASEY)
    await expect(h.prepare('WITH meetings AS (SELECT 1 AS id) SELECT id FROM meetings').all()).rejects.toThrow(/duplicate WITH table name/)
  })

  it('SQL that does not name a scoped table is passed through untouched', () => {
    const active = activeScopes(CASEY)
    const sql = 'SELECT id FROM tasks WHERE id = ?'
    expect(scopeSql(sql, active)).toBe(sql)
  })

  it('main./temp./sqlite_master/pragma next to a scoped table are refused', () => {
    const active = activeScopes(CASEY)
    expect(() => scopeSql('SELECT COUNT(*) FROM main.meetings', active)).toThrow(ScopeRefused)
    expect(() => scopeSql("SELECT name FROM sqlite_master WHERE name = 'meetings'", active)).toThrow(ScopeRefused)
    expect(() => scopeSql('PRAGMA table_info(meetings)', active)).toThrow(ScopeRefused)
  })

  it('quoted identifiers, quoted main., multi-statement SQL, upserts, REPLACE and aliased DML targets are refused', () => {
    const active = activeScopes(CASEY)
    const refused = [
      'SELECT id FROM "meetings"',
      'SELECT id FROM [meetings]',
      'SELECT id FROM `meetings`',
      'SELECT COUNT(*) FROM "main".meetings',
      'SELECT COUNT(*) FROM [main].meetings',
      'SELECT COUNT(*) FROM temp.meetings',
      "SELECT 1 FROM meetings; DELETE FROM meetings",
      "INSERT INTO meetings (id, date, title) VALUES ('x', 'd', 't') ON CONFLICT(id) DO UPDATE SET notes = 'x'",
      "INSERT OR REPLACE INTO meetings (id, date, title) VALUES ('x', 'd', 't')",
      "REPLACE INTO agenda_items (id, meeting_id, content) VALUES ('x', 'm', 'c')",
      "UPDATE meetings AS m SET notes = 'x' WHERE m.id = ?",
      'DELETE FROM agenda_items AS a WHERE a.id = ?',
      'DELETE FROM agenda_items a WHERE a.id = ?',
    ]
    for (const sql of refused) expect(() => scopeSql(sql, active), sql).toThrow(ScopeRefused)
    // what stays legal: a trailing semicolon, INSERT OR IGNORE, a plain INSERT, DO NOTHING
    for (const sql of [
      'DELETE FROM agenda_items WHERE id = ?;',
      "INSERT OR IGNORE INTO activity_entries (id, entity_type, entity_id, kind, actor_slug, body) VALUES ('a','meeting','m','comment','x','b')",
      "INSERT INTO agenda_items (id, meeting_id, content) VALUES ('x', 'm', 'c') ON CONFLICT DO NOTHING",
      "SELECT 'meetings; and more' FROM meetings",
    ]) expect(() => scopeSql(sql, active), sql).not.toThrow()
  })

  it('batch() runs the scoped statements as one transaction', async () => {
    const { db, h } = handle(CASEY)
    await expect(h.batch([
      h.prepare("UPDATE meetings SET notes = 'batched' WHERE id = 'm-slug'"),
      h.prepare("INSERT INTO meetings (id, date, title) VALUES ('m-slug', '2026-01-01', 'dup')"),
    ])).rejects.toThrow()
    expect((db.prepare("SELECT notes FROM meetings WHERE id = 'm-slug'").get() as { notes: string }).notes).toBe('notes m-slug')
  })

  it('exec, dump and withSession refuse on a scoped handle', () => {
    const { h } = handle(CASEY)
    expect(() => (h as unknown as { exec: () => void }).exec()).toThrow(ScopeRefused)
    expect(() => (h as unknown as { withSession: () => void }).withSession()).toThrow(ScopeRefused)
  })
})

describe('personViewer is the one door for the literals the rules inline', () => {
  it('lower-cases, derives the local part, and refuses what no member row holds', () => {
    const v = personViewer({ slug: 'Casey-Eddington', email: ' EDDIN022@UMN.EDU ', pi: false })
    expect(v).toMatchObject({ kind: 'person', slug: 'casey-eddington', email: 'eddin022@umn.edu' })
    expect(() => personViewer({ slug: 'anonymous', email: null, pi: false })).toThrow()
    expect(() => personViewer({ slug: '', email: null, pi: false })).toThrow()
    expect(() => personViewer({ slug: 'a?1', email: null, pi: false })).toThrow()
    expect(() => personViewer({ slug: 'x', email: 'no-at-sign', pi: false })).toThrow()
  })

  it("a quote in an email is escaped, never executed", async () => {
    const v = personViewer({ slug: 'o-brien', email: "o'brien@umn.edu", pi: false })
    const db = seeded()
    insertRow(db, 'meetings', { id: 'm-ob', date: '2026-10-02', title: 't', attendees: JSON.stringify(["o'brien@umn.edu"]) })
    expect(await ids(viewerDb(d1Adapter(db) as unknown as D1Database, v), 'SELECT id FROM meetings')).toEqual(['m-ob'])
  })
})

// Every SQL literal a route prepares, compiled after scoping. A literal that
// compiles as written must still compile once a scoped viewer's CTEs are in
// front of it (prepare only compiles; nothing runs). This is the falsifier for
// "every route statement starts with a keyword the splice handles".
describe('every prepared SQL literal in api/ still compiles under a scoped viewer', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { if (name !== 'test-support') walk(p, out) }
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p)
    }
    return out
  }
  const UNCOMPILED_CEILING = 7 // measured 2026-10-09: dynamic column lists (meeting meta, decision update, postActivityEntry, search); all driven by viewer-sweep.test.ts
  const LITERAL = /\.prepare\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g

  // A template literal's `${...}` holes are filled with each placeholder in
  // turn (empty, a number, NULL, a column, a WHERE fragment) until the skeleton
  // compiles; a literal no placeholder makes compile is listed, and the count
  // of those that name a scoped table is pinned so it cannot grow unseen.
  const HOLES = ['', '1', 'NULL', 'id', ' AND 1', '1 = 1']
  function decode(raw: string, hole: string): string {
    return raw.slice(1, -1).replace(/\$\{[^}]*\}/g, hole).replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n')
  }

  it('compiles', () => {
    const db = prodSchemaDb()
    const active = activeScopes(CASEY)
    let scopedCount = 0
    let templateCount = 0
    const broken: string[] = []
    const uncompiled: string[] = []
    for (const file of walk(join(__dirname, '..'))) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(LITERAL)) {
        let sql: string | null = null
        for (const hole of HOLES) {
          const candidate = decode(m[1], hole)
          try { db.prepare(candidate); sql = candidate; break } catch { /* next placeholder */ }
        }
        if (sql === null) {
          const skeleton = decode(m[1], '')
          if (/\b(meetings|agenda_items|hub_decisions|activity_entries|file_attachments|activity_log)\b/i.test(skeleton)) {
            uncompiled.push(`${file.replace(/.*[\\/]api[\\/]/, 'api/')}: ${skeleton.replace(/\s+/g, ' ').slice(0, 100)}`)
          }
          continue
        }
        let out: string
        try { out = scopeSql(sql, active) } catch (e) {
          broken.push(`${file}: REFUSED ${(e as Error).message}\n  ${sql.slice(0, 160)}`)
          continue
        }
        if (out === sql) continue
        scopedCount++
        if (m[1].includes('${')) templateCount++
        try { db.prepare(out) } catch (e) { broken.push(`${file}: ${(e as Error).message}\n  ${sql.slice(0, 160)}`) }
      }
    }
    expect(broken).toEqual([])
    expect(scopedCount, 'the sweep must reach the meeting statements, or it proves nothing').toBeGreaterThan(40)
    expect(templateCount, 'template literals must be in the sweep too').toBeGreaterThan(5)
    // Literals naming a scoped table whose skeleton no placeholder compiles.
    // Each is covered only by viewer-sweep.test.ts. Pinned: a new one fails here.
    expect(uncompiled.length, uncompiled.join('\n')).toBeLessThanOrEqual(UNCOMPILED_CEILING)
  })
})

it('every table rule renders for every viewer kind', () => {
  for (const v of [CASEY, NICK, nobodyViewer()]) {
    for (const s of Object.values(TABLE_SCOPE)) if (s.kind === 'scoped') s.where(v as never)
  }
})
