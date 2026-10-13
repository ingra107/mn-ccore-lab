// table-scope.test.ts -- every table the migration chain builds has exactly
// one access rule, and every view the chain defines is listed in HUB_VIEWS
// with its exact columns (a view body reads the real tables, past the
// viewer-bound handle, so each view is a deliberate opening; see
// api/lib/viewer-db.ts).

import { describe, it, expect } from 'vitest'
import { prodSchemaDb } from '../test-support/prod-schema-db'
import { HUB_TABLES, HUB_VIEWS, TABLE_SCOPE } from './table-scope'

describe('TABLE_SCOPE covers the migrated schema', () => {
  const db = prodSchemaDb()
  const tables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  ).all() as { name: string }[]).map((r) => r.name)

  it('classifies every table the chain creates, and names no table it does not', () => {
    expect([...HUB_TABLES].sort()).toEqual(tables)
    expect(Object.keys(TABLE_SCOPE).sort()).toEqual(tables)
  })

  it('every view the chain defines is listed in HUB_VIEWS, with exactly its columns', () => {
    const views = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name").all() as { name: string }[]).map((r) => r.name)
    expect(views).toEqual(Object.keys(HUB_VIEWS).sort())
    for (const [v, cols] of Object.entries(HUB_VIEWS)) {
      const live = (db.prepare(`PRAGMA table_info(${v})`).all() as { name: string }[]).map((c) => c.name)
      expect(live, `${v}: the view's columns are its contract`).toEqual([...cols])
    }
  })

  it('project_directory carries no column a non-member may not see', () => {
    // Nick, 2026-10-13: before joining, a member sees the project's name, a
    // one-line description and its PI. Nothing else.
    expect([...HUB_VIEWS.project_directory]).toEqual(['project_id', 'name', 'blurb', 'pi_slug', 'pi_name'])
  })

  it('every scoped table has the key column its DML restriction names, and its dependencies are scoped', () => {
    for (const [t, s] of Object.entries(TABLE_SCOPE)) {
      if (s.kind !== 'scoped') continue
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; pk: number }[])
      const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name)
      expect(typeof s.key === 'string' ? [s.key] : [...s.key], `${t}: the DML key must be the whole primary key`).toEqual(pk)
      for (const d of s.dependsOn) expect(TABLE_SCOPE[d].kind, `${t} depends on ${d}`).toBe('scoped')
    }
  })
})
