// #8862: runs scripts/check-api-test-fixtures.mjs inside `npm run test:api`,
// so CI (.github/workflows/vitest.yml) and the pre-commit vitest gate refuse a
// NEW hand-modelled schema or SQL-simulating fake in an API test, and refuse a
// stale exception once a file is converted (the list only shrinks).

import { describe, it, expect } from 'vitest'
// @ts-expect-error -- plain .mjs script, no type declarations
import { checkApiTestFixtures, classify, EXCEPTIONS } from '../../scripts/check-api-test-fixtures.mjs'

describe('API test fixture gate (#8862)', () => {
  it('no api test outside the exception list builds its own schema or simulates SQL, and no exception is stale', () => {
    const r = checkApiTestFixtures()
    expect(r.scanned).toBeGreaterThan(90) // the walk saw the suite, not an empty dir
    expect(r.violations, 'build on api/test-support/prod-schema-db.ts instead').toEqual([])
    expect(r.stale, 'delete these EXCEPTIONS entries in scripts/check-api-test-fixtures.mjs').toEqual([])
    expect(r.matches.length).toBe(EXCEPTIONS.size)
  })

  it('classify() sees each refused shape', () => {
    expect(classify("db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)`)")).toEqual(['ddl'])
    expect(classify("import Database from 'better-sqlite3'")).toEqual(['engine'])
    expect(classify('const db = new Database(":memory:")')).toEqual(['engine'])
    expect(classify("import { withSequentialBatch } from '../test-support/sequential-batch'")).toEqual(['seqbatch'])
    expect(classify("run: async () => { if (upper.startsWith('UPDATE')) row.x = 1 }")).toEqual(['interpWrite'])
    expect(classify("if (/^\\s*INSERT INTO processed_mutations/i.test(sql)) return")).toEqual(['interpWrite'])
    expect(classify('return { prepare: (sql) => stmt(sql), batch: async () => [] }')).toEqual(['stubBatch'])
    expect(classify("if (verb === 'UPDATE') row.x = 1")).toEqual(['interpWrite'])
    expect(classify("if (sql.slice(0, 6) == 'INSERT') return")).toEqual(['interpWrite'])
    expect(classify("switch (verb) { case 'DELETE': store.clear() }")).toEqual(['interpWrite'])
    expect(classify("const m = await import('better-sqlite3'); const d = new m.default(':memory:')")).toEqual(['engine'])
    expect(classify("const B = require('better-sqlite3')")).toEqual(['engine'])
  })

  it('interpWrite: an onExec log on the fixture passes; the same branch in a stub file is refused', () => {
    const onExecAssert = "expect(sqls.some((s) => s.startsWith('UPDATE tasks'))).toBe(true)"
    const onFixture = [
      "import type Database from 'better-sqlite3'",
      "import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'",
      "const sqls: string[] = []",
      "const env = { DB: d1Adapter(prodSchemaDb(), { onExec: (s) => sqls.push(s) }) }",
      onExecAssert,
    ].join('\n')
    expect(classify(onFixture)).toEqual([])
    expect(classify(onExecAssert)).toEqual(['interpWrite'])
    // The exemption covers interpWrite only: a stub batch on the fixture is still refused.
    expect(classify(`${onFixture}\nconst fake = { batch: async () => [] }`)).toEqual(['stubBatch'])
  })

  it('classify() passes a test built on the migration-chain fixture', () => {
    const src = [
      "import type Database from 'better-sqlite3'",
      "import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'",
      "const db = prodSchemaDb()",
      "db.prepare(\"INSERT INTO tasks (id, title, assignee) VALUES ('t', 't', 'n')\").run()",
      "const env = { DB: d1Adapter(db) }",
      "await d1.batch([d1.prepare('UPDATE tasks SET title = ? WHERE id = ?').bind('x', 't')])",
    ].join('\n')
    expect(classify(src)).toEqual([])
  })
})
