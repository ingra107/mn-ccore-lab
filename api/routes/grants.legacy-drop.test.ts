/**
 * Grants phase 2 (schema-v134): the legacy grants, grant_milestones and
 * nih_grants tables are gone from the migration chain, and milestones lost the
 * grant_id column whose FK pointed at grants. Before v134 a DROP TABLE grants
 * alone left that FK dangling and failed the next milestones write with
 * "no such table: main.grants" (this file's 2026-10-12 probe). The second
 * case is that write.
 */
import { describe, it, expect } from 'vitest'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'

describe('schema-v134 drops the legacy grant tables', () => {
  it('no table, index or FK names grants, grant_milestones or nih_grants', () => {
    const db = prodSchemaDb()
    const left = db.prepare(
      `SELECT name FROM sqlite_master
        WHERE name IN ('grants', 'grant_milestones', 'nih_grants')
           OR tbl_name IN ('grants', 'grant_milestones', 'nih_grants')
           OR sql LIKE '%REFERENCES grants%' OR sql LIKE '%REFERENCES grant_milestones%'
           OR sql LIKE '%REFERENCES nih_grants%'`,
    ).all()
    expect(left).toEqual([])
    const cols = (db.prepare('PRAGMA table_info(milestones)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).not.toContain('grant_id')
  })

  it('milestones still takes a write, FKs on, and the chain stays FK-clean', () => {
    const db = prodSchemaDb()
    insertRow(db, 'milestones', { id: 'ms_v134', title: 'x' })
    expect(db.prepare("SELECT COUNT(*) AS n FROM milestones WHERE id = 'ms_v134'").get()).toEqual({ n: 1 })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
