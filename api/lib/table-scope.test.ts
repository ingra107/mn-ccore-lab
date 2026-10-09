// table-scope.test.ts -- every table the migration chain builds has exactly
// one access rule, and the chain defines no view (a view body reads the real
// tables, past the viewer-bound handle; the first view must be classified
// on purpose, see api/lib/viewer-db.ts).

import { describe, it, expect } from 'vitest'
import { prodSchemaDb } from '../test-support/prod-schema-db'
import { HUB_TABLES, TABLE_SCOPE } from './table-scope'

describe('TABLE_SCOPE covers the migrated schema', () => {
  const db = prodSchemaDb()
  const tables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  ).all() as { name: string }[]).map((r) => r.name)

  it('classifies every table the chain creates, and names no table it does not', () => {
    expect([...HUB_TABLES].sort()).toEqual(tables)
    expect(Object.keys(TABLE_SCOPE).sort()).toEqual(tables)
  })

  it('the chain defines no view', () => {
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all()).toEqual([])
  })

  it('every scoped table has the key column its DML restriction names, and its dependencies are scoped', () => {
    for (const [t, s] of Object.entries(TABLE_SCOPE)) {
      if (s.kind !== 'scoped') continue
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; pk: number }[])
      expect(cols.find((c) => c.name === s.key)?.pk, `${t}.${s.key} must be the primary key`).toBe(1)
      for (const d of s.dependsOn) expect(TABLE_SCOPE[d].kind, `${t} depends on ${d}`).toBe('scoped')
    }
  })
})
