// D1 refuses a LIKE or GLOB pattern over 50 bytes ("LIKE or GLOB pattern too
// complex", SQLITE_ERROR code 7500). A pattern built from row data, such as
// d LIKE '% ' || related_id || ' deleted', passes every local test
// (better-sqlite3 allows 50,000 bytes) and 500s on prod the first time a long
// id or slug comes by: the cold review hit it on /api/activity, 2026-10-14.
// No local run can see the limit, so these tests ban the shape: a LIKE or GLOB
// pattern is a literal or a bound ?, never an expression.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { labFeedWhere, prepActivityWhere } from './activity-feed-types'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'

/** Every LIKE/GLOB in `sql` whose pattern is not a lone literal or a bind. */
function builtPatterns(sql: string): string[] {
  const bad: string[] = []
  for (const m of sql.matchAll(/\b(?:LIKE|GLOB)\s+/g)) {
    const rest = sql.slice((m.index ?? 0) + m[0].length)
    const lit = rest.match(/^'(?:[^']|'')*'/)
    const tail = lit ? rest.slice(lit[0].length) : rest
    const ok = rest.startsWith('?') || (lit && !/^\s*\|\|/.test(tail))
    if (!ok) bad.push(sql.slice(m.index, (m.index ?? 0) + m[0].length + 60))
  }
  return bad
}

describe('no LIKE pattern is built from a column', () => {
  it('the feed rules use literal patterns only', () => {
    for (const sql of [labFeedWhere('a'), prepActivityWhere('a'), labFeedWhere(), prepActivityWhere()]) {
      expect(builtPatterns(sql)).toEqual([])
    }
  })

  it('the scan catches the shape it bans', () => {
    expect(builtPatterns(`a.description LIKE '% ' || a.related_id || ' deleted'`)).toHaveLength(1)
    expect(builtPatterns(`p.author_slugs LIKE '%"' || tm.slug || '"%'`)).toHaveLength(1)
    expect(builtPatterns(`x LIKE y.col`)).toHaveLength(1)
    expect(builtPatterns(`x LIKE 'Bulk sync%' AND y LIKE ?`)).toEqual([])
  })

  it('no SQL under api/ concatenates a LIKE pattern', () => {
    const files = (readdirSync('api', { recursive: true }) as string[])
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.includes('test-support'))
    const hits: string[] = []
    for (const f of files) {
      const src = readFileSync(join('api', f), 'utf8')
      // Source form: a literal pattern followed by ||, or a bare column/table.col.
      for (const m of src.matchAll(/\b(?:LIKE|GLOB)\s+(?:'(?:[^'\n]|'')*'\s*\|\||[A-Za-z_][\w]*\.[A-Za-z_]\w*\b|[A-Za-z_]\w*\s*\|\|)/g)) {
        hits.push(`${f}: ${m[0]}`)
      }
    }
    expect(hits).toEqual([])
  })
})

describe('the feed rule on long ids', () => {
  const db = prodSchemaDb()
  const run = (where: string) =>
    (db.prepare(`SELECT a.id FROM activity_log a WHERE ${where} ORDER BY a.id`).all() as { id: string }[]).map((r) => r.id)
  const long = 'cqode-backbone-umn-clif-federated-meta-analysis-of-the-sites'
  insertRow(db, 'activity_log', { id: 'del-old', type: 'conference', description: `conferences ${long} deleted`, actor: 'nick-ingraham', related_id: long, related_type: 'conference' })
  insertRow(db, 'activity_log', { id: 'del-soft', type: 'submission', description: `submissions ${long} soft-deleted`, actor: 'nick-ingraham', related_id: long, related_type: 'submission' })
  insertRow(db, 'activity_log', { id: 'del-new', type: 'conference', description: 'Deleted conference', actor: 'nick-ingraham', related_id: long, related_type: 'conference' })
  insertRow(db, 'activity_log', { id: 'bulk-person', type: 'task', description: 'Bulk complete: 3 tasks', actor: 'nick-ingraham' })
  insertRow(db, 'activity_log', { id: 'bulk-sync', type: 'task', description: 'Bulk sync: 1 created, 0 updated', actor: 'nick-ingraham' })
  insertRow(db, 'activity_log', { id: 'mentions-id', type: 'project', description: `Linked ${long} deleted-items folder`, actor: 'nick-ingraham', related_id: long, related_type: 'project' })

  it('drops the old "<table> <id> deleted" text and Bulk sync, keeps people\'s bulk actions', () => {
    for (const where of [labFeedWhere('a'), prepActivityWhere('a')]) {
      expect(run(where)).toEqual(['bulk-person', 'del-new', 'mentions-id'])
    }
  })
})
