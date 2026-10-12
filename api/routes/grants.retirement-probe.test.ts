/**
 * Phase 2 probe (drop the legacy grants tables, with Nick's go): what a DROP
 * does on the migration-chain database, FKs on as D1 runs them. Nothing here
 * drops anything outside this in-memory copy.
 *
 * Prod, read 2026-10-12: grants 5 rows, grant_milestones 0, nih_grants 0,
 * milestones 0 (milestones.grant_id REFERENCES grants(id) is the one FK).
 */
import { describe, it, expect } from 'vitest'
import { prodSchemaDb } from '../test-support/prod-schema-db'

describe('dropping the legacy grants tables', () => {
  it('grant_milestones and nih_grants drop clean: nothing references them', () => {
    const db = prodSchemaDb()
    const refs = db.prepare(
      "SELECT name FROM sqlite_master WHERE sql LIKE '%REFERENCES grant_milestones%' OR sql LIKE '%REFERENCES nih_grants%'",
    ).all()
    expect(refs).toEqual([])
    db.exec('DROP TABLE grant_milestones; DROP TABLE nih_grants;')
  })

  it('grants drops while milestones holds no grant row, but leaves a dangling FK that breaks the next milestones write', () => {
    const db = prodSchemaDb()
    const refs = (db.prepare("SELECT name FROM sqlite_master WHERE sql LIKE '%REFERENCES grants(%'").all() as { name: string }[]).map((r) => r.name)
    expect(refs).toEqual(['milestones'])
    db.exec('DROP TABLE grants')
    // milestones still declares grant_id REFERENCES grants(id): any write that
    // checks it now fails, so phase 2 must rebuild (or drop) milestones in the
    // same migration, not drop grants alone.
    expect(() => db.prepare("INSERT INTO milestones (id, title, grant_id) VALUES ('m1', 'x', 'g1')").run())
      .toThrow(/no such table: main\.grants/)
  })
})
