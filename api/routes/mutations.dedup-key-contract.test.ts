// The task name-identity key has ONE definition — this file is the gate that
// keeps it that way (PB backlog #530b, reconciled Dual-Plan, 2026-09-02).
//
// schema-v92 carried the rule as a comment: "the two partial-index predicates
// BYTE-MATCH the two dedup SELECTs in api/routes/mutations.ts applyInsert
// (serial + race-loser catch). A predicate mismatch reopens the
// SELECT-then-INSERT race hole." A comment cannot fail a build. These tests can.
//
// Two halves:
//   1. the TypeScript side derives both arms from api/lib/task-dedup-sql.ts;
//   2. the SQL side — the migration file that creates the index — is read off
//      disk and asserted to carry the same key expression.
// Half 2 is what makes this more than a restatement of the source: the index
// lives in a .sql file applied to a remote database, and nothing else in the
// build looks at it.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  TASK_TITLE_KEY_SQL,
  TASK_TITLE_KEY_BIND_SQL,
  TASK_TITLE_NORM_INDEX,
  TASK_TITLE_DEDUP_SELECT,
  classifyTaskDedupSelect,
} from '../lib/task-dedup-sql'

const API_DIR = join(process.cwd(), 'api')

describe('task dedup key — one definition', () => {
  it('the normalized SELECT is built from the key expression', () => {
    expect(TASK_TITLE_DEDUP_SELECT).toContain(`${TASK_TITLE_KEY_SQL} = ${TASK_TITLE_KEY_BIND_SQL}`)
  })

  it('the SELECT keeps the identity scope byte-identical to the index predicate', () => {
    const scope =
      "AND deleted_at IS NULL AND status != 'done' " +
      "AND (source IS NULL OR source != 'meeting_approval') LIMIT 1"
    expect(TASK_TITLE_DEDUP_SELECT).toContain(scope)
  })

  it('NULL project_id matches NULL (IS ?, never = ?)', () => {
    expect(TASK_TITLE_DEDUP_SELECT).toContain('project_id IS ?')
    expect(TASK_TITLE_DEDUP_SELECT).not.toContain('project_id = ?')
  })

  it('BOTH applyInsert arms use the constant -- no raw title literal survives', () => {
    // The cutover is finished: the bridge ran the catch one deploy ahead of the
    // serial arm, and this is what closes it. A reintroduced `title = ?` would
    // silently unmatch the index and reopen the race the index exists to close.
    const src = readFileSync(join(API_DIR, 'routes', 'mutations.ts'), 'utf8')
    expect(src).not.toContain('title = ?')
    const uses = src.match(/TASK_TITLE_DEDUP_SELECT/g) ?? []
    expect(uses.length).toBe(3)   // the import + the two arms
  })

  it('normalization happens in SQL, never in JS', () => {
    // toLowerCase() is Unicode-aware; SQLite lower() is ASCII-only. A JS fold
    // silently breaks the byte-match for any non-ASCII title.
    const src = readFileSync(join(API_DIR, 'routes', 'mutations.ts'), 'utf8')
    expect(src).not.toContain('title.toLowerCase()')
    expect(src).not.toContain('.trim().toLowerCase()')
  })
})

describe('task dedup key — the migration and the code agree', () => {
  // The index is created by exactly one committed migration file. Find it by
  // its name rather than by a hardcoded version number, so a renumbering
  // cannot silently orphan this test.
  const schemaFiles = readdirSync(API_DIR).filter(f => /^schema-v\d+.*\.sql$/.test(f))
  const declaring = schemaFiles.filter(f =>
    readFileSync(join(API_DIR, f), 'utf8').includes(`CREATE UNIQUE INDEX IF NOT EXISTS ${TASK_TITLE_NORM_INDEX}`),
  )

  it('exactly one migration creates the normalized index', () => {
    // An empty read is a FAILURE here, not a pass: if nothing declares the
    // index, the key has no structural backstop and this whole contract is
    // decorative.
    expect(declaring).toHaveLength(1)
  })

  it('the index key expression matches TASK_TITLE_KEY_SQL', () => {
    const sql = readFileSync(join(API_DIR, declaring[0]), 'utf8')
    const create = sql.slice(sql.indexOf(`CREATE UNIQUE INDEX IF NOT EXISTS ${TASK_TITLE_NORM_INDEX}`))
    const keyLine = create.split('\n')[1]
    expect(keyLine).toContain(TASK_TITLE_KEY_SQL)
    // NULL-safe project half: SQLite treats NULLs as DISTINCT in a UNIQUE
    // index, so without COALESCE the index would not constrain the very rows
    // whose SELECT arm (`project_id IS ?`) claims NULL equality.
    expect(keyLine).toContain("COALESCE(project_id, '')")
  })

  it('the index predicate matches the SELECT scope', () => {
    const sql = readFileSync(join(API_DIR, declaring[0]), 'utf8')
    const create = sql.slice(sql.indexOf(`CREATE UNIQUE INDEX IF NOT EXISTS ${TASK_TITLE_NORM_INDEX}`))
    const predicate = create.slice(create.indexOf('WHERE'), create.indexOf(';'))
    for (const clause of [
      'deleted_at IS NULL',
      "status != 'done'",
      "(source IS NULL OR source != 'meeting_approval')",
    ]) {
      expect(predicate).toContain(clause)
    }
  })
})

describe('classifyTaskDedupSelect — the stubs fail loud', () => {
  it('recognises the three live dedup SELECTs', () => {
    expect(classifyTaskDedupSelect(TASK_TITLE_DEDUP_SELECT)).toBe('title')
    // The retired raw form still classifies, so a stub stays honest if an old
    // query shape shows up in a fixture.
    expect(classifyTaskDedupSelect(
      "SELECT id FROM tasks WHERE title = ? AND project_id IS ? AND deleted_at IS NULL AND status != 'done' AND (source IS NULL OR source != 'meeting_approval') LIMIT 1",
    )).toBe('title')
    expect(classifyTaskDedupSelect(
      "SELECT id FROM tasks WHERE source = 'meeting_approval' AND meeting_id = ? AND deleted_at IS NULL AND status != 'done' LIMIT 1",
    )).toBe('meeting')
    expect(classifyTaskDedupSelect(
      'SELECT id FROM tasks WHERE lower(trim(title)) = lower(trim(?)) AND ((project_id IS NULL AND ? IS NULL) OR project_id = ?) AND completed = 0 AND deleted_at IS NULL LIMIT 1',
    )).toBe('mobile')
  })

  it('the mobile pre-check and the central rule stay distinguishable', () => {
    // Both fold the title now. If these two ever classified the same, a stub
    // would answer the central SELECT with the mobile predicate (completed = 0,
    // no meeting exclusion) and the test would pass for the wrong reason.
    const mobile = 'SELECT id FROM tasks WHERE lower(trim(title)) = lower(trim(?)) AND ((project_id IS NULL AND ? IS NULL) OR project_id = ?) AND completed = 0 AND deleted_at IS NULL LIMIT 1'
    expect(classifyTaskDedupSelect(mobile)).not.toBe(classifyTaskDedupSelect(TASK_TITLE_DEDUP_SELECT))
  })

  it('returns null for statements that are not task dedup SELECTs', () => {
    expect(classifyTaskDedupSelect('SELECT * FROM tasks WHERE id = ?')).toBeNull()
    expect(classifyTaskDedupSelect('SELECT value FROM lab_settings WHERE key = ?')).toBeNull()
  })

  it('THROWS on a task dedup SELECT it does not recognise', () => {
    expect(() => classifyTaskDedupSelect(
      'SELECT id FROM tasks WHERE short_title = ? AND project_id IS ? LIMIT 1',
    )).toThrow(/unrecognised task dedup SELECT/)
  })

  it('every SELECT id FROM tasks in api/ is classifiable', () => {
    // The enumerator, not a remembered count: walk the route sources and prove
    // the classifier answers for each live dedup query.
    const routesDir = join(API_DIR, 'routes')
    const sources = readdirSync(routesDir)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map(f => readFileSync(join(routesDir, f), 'utf8'))
    const queries = sources.flatMap(src =>
      [...src.matchAll(/SELECT id FROM tasks WHERE [\s\S]*?LIMIT 1/g)].map(m => m[0]),
    )
    // Not a remembered number: applyInsert's two arms plus the mobile
    // pre-check. If a fourth appears, it must be classifiable or this fails.
    expect(queries.length).toBeGreaterThanOrEqual(3)
    for (const q of queries) {
      expect(classifyTaskDedupSelect(q)).not.toBeNull()
    }
  })
})
