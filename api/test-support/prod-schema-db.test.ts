// #8862: the contract of the shared migration-chain fixture, pinned.
//
// api/test-support/prod-schema-db.ts is what write-path tests stand on; if it
// silently stopped enforcing a property prod has, every test on it would go
// green on the wrong database, which is the #8842 failure again one level
// down. Each property below is one prod has and a hand-written stub does not.

import { describe, it, expect } from 'vitest'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from './prod-schema-db'

const TASK = { id: 'task_c1', title: 't', assignee: 'nick' }

describe('prod-schema-db contract', () => {
  it('every clone enforces foreign keys (D1 does, on every query)', () => {
    const a = prodSchemaDb()
    const b = prodSchemaDb()
    expect(a.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(b.pragma('foreign_keys', { simple: true })).toBe(1)
    // task_subtasks.task_id REFERENCES tasks(id) ON DELETE CASCADE.
    expect(() => a.prepare("INSERT INTO task_subtasks (id, task_id, title) VALUES ('s1', 'no_such_task', 'x')").run())
      .toThrow(/FOREIGN KEY constraint failed/)
    insertRow(a, 'tasks', TASK)
    a.prepare("INSERT INTO task_subtasks (id, task_id, title) VALUES ('s1', 'task_c1', 'x')").run()
    a.prepare("DELETE FROM tasks WHERE id = 'task_c1'").run()
    expect(a.prepare('SELECT COUNT(*) AS n FROM task_subtasks').get()).toEqual({ n: 0 })
  })

  it('carries the prod constraints the 2026-09-24 bug and its neighbours hit', () => {
    const db = prodSchemaDb()
    // processed_mutations.original_response_json is TEXT NOT NULL (schema-v58).
    expect(() => db.prepare(
      "INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id) VALUES ('m', 'home', 'now', 'accepted', NULL, 'tasks', 't')",
    ).run()).toThrow(/NOT NULL constraint failed: processed_mutations.original_response_json/)
    // v98 completion-triad guard.
    expect(() => insertRow(db, 'tasks', { ...TASK, status: 'done' })).toThrow(/completion triad guard/)
    // v53 seq triggers: an insert gets a seq, an update moves it.
    const seq0 = insertRow(db, 'tasks', TASK).seq as number
    expect(seq0).toBeGreaterThan(0)
    db.prepare("UPDATE tasks SET title = 'u' WHERE id = 'task_c1'").run()
    expect((db.prepare("SELECT seq FROM tasks WHERE id = 'task_c1'").get() as { seq: number }).seq).toBeGreaterThan(seq0)
    const triggers = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[]).map((r) => r.name)
    expect(triggers).toEqual(expect.arrayContaining([
      'trg_tasks_seq_insert', 'trg_tasks_seq_update', 'trg_projects_seq_update',
      'trg_tasks_completion_triad_guard_ins', 'trg_tasks_completion_triad_guard_upd',
    ]))
  })

  it('clones are independent of each other and of the image', () => {
    const a = prodSchemaDb()
    insertRow(a, 'tasks', TASK)
    const b = prodSchemaDb()
    expect(b.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual({ n: 0 })
    insertRow(b, 'tasks', TASK) // same PK: no collision with a's row
    expect(a.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual({ n: 1 })
  })

  it('d1Adapter batch() is one transaction: a failing statement rolls back the earlier ones', async () => {
    const db = prodSchemaDb()
    insertRow(db, 'tasks', TASK)
    const d1 = d1Adapter(db)
    await expect(d1.batch([
      d1.prepare("UPDATE tasks SET title = 'landed?' WHERE id = ?").bind('task_c1'),
      d1.prepare(
        "INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id) VALUES (?, 'home', 'now', 'accepted', NULL, 'tasks', 'task_c1')",
      ).bind('m_null'),
    ])).rejects.toThrow(/^D1_ERROR: .*SQLITE_CONSTRAINT \(extended: SQLITE_CONSTRAINT_NOTNULL\)$/)
    expect((db.prepare("SELECT title FROM tasks WHERE id = 'task_c1'").get() as { title: string }).title).toBe('t')
    expect(receiptOf(db, 'm_null')).toBeUndefined()
  })

  it('a D1 error from a single statement carries the D1 message form', async () => {
    const d1 = d1Adapter(prodSchemaDb())
    await expect(d1.prepare("INSERT INTO task_subtasks (id, task_id, title) VALUES ('s', 'nope', 'x')").run())
      .rejects.toThrow(/^D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT \(extended: SQLITE_CONSTRAINT_FOREIGNKEY\)$/)
  })
})
