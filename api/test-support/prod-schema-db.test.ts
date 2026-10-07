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

  // #8875: D1 binds `?NNN` ordered parameters positionally, one value serving
  // every site of its ordinal; better-sqlite3 refuses a positional list for
  // them. The Hermes transcript query (api/lib/activity-entry.ts) is written
  // with ?1..?4, so without this every transcript read failed on the fixture.
  it('binds ?NNN ordered parameters positionally, as D1 does, on first / all / run / batch', async () => {
    const db = prodSchemaDb()
    const d1 = d1Adapter(db)
    insertRow(db, 'tasks', TASK)
    insertRow(db, 'tasks', { ...TASK, id: 'task_c2', title: 'other' })
    const sel = 'SELECT id FROM tasks WHERE (id = ?1 OR title = ?1) AND assignee = ?2 ORDER BY id'
    expect(await d1.prepare(sel).bind('task_c1', 'nick').first()).toEqual({ id: 'task_c1' })
    expect((await d1.prepare(sel).bind('other', 'nick').all()).results).toEqual([{ id: 'task_c2' }])
    expect((await d1.prepare(sel).bind('task_c1', 'someone-else').all()).results).toEqual([])
    // An extra or a missing value is refused, as a plain `?` list is.
    await expect(d1.prepare(sel).bind('task_c1', 'nick', 'extra').all()).rejects.toThrow(/^D1_ERROR: 3 values bound for 2/)
    await expect(d1.prepare(sel).bind('task_c1').first()).rejects.toThrow(/^D1_ERROR: 1 values bound for 2/)
    await d1.prepare('UPDATE tasks SET title = ?2 WHERE id = ?1').bind('task_c1', 'renamed').run()
    await d1.batch([d1.prepare('UPDATE tasks SET title = ?2 WHERE id = ?1').bind('task_c2', 'renamed2')])
    expect((db.prepare('SELECT title FROM tasks ORDER BY id').all() as { title: string }[]).map((r) => r.title))
      .toEqual(['renamed', 'renamed2'])
  })

  // #8875 cold review: better-sqlite3 stores an `undefined` bind as NULL; D1
  // refuses it. The adapter must refuse it too, on every path, or a route that
  // forgets `?? null` is green here and broken in prod.
  it('refuses an undefined bind value, as D1 does, on bind / batch / every exec path, and writes nothing', async () => {
    const db = prodSchemaDb()
    const d1 = d1Adapter(db)
    const D1_UNDEF = /^D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'/
    // notifications.body is nullable, so a NULL there is legal and only `undefined` is refused.
    const sql = "INSERT INTO notifications (id, title, body, recipient_slug, type, source_type, source_id) VALUES (?, ?, ?, 'nick-ingraham', 'update', 'x', 'x')"
    // bind() itself throws (workerd validates at bind time), a TypeError.
    expect(() => d1.prepare(sql).bind('i1', 'T', undefined)).toThrow(TypeError)
    expect(() => d1.prepare(sql).bind('i1', 'T', undefined)).toThrow(D1_UNDEF)
    // A chained bind is checked too.
    expect(() => d1.prepare(sql).bind('i1', 'T').bind(undefined)).toThrow(D1_UNDEF)
    // A statement assembled without bind() (vals set directly) is caught at exec, for run/all/first and in batch.
    const raw = { ...d1.prepare(sql), vals: ['i2', 'T', undefined] }
    const forged = d1.prepare(sql)
    forged.vals.push('i3', 'T', undefined)
    await expect(forged.run()).rejects.toThrow(D1_UNDEF)
    await expect(forged.all()).rejects.toThrow(D1_UNDEF)
    await expect(forged.first()).rejects.toThrow(D1_UNDEF)
    await expect(d1.batch([d1.prepare(sql).bind('ok', 'T', 'body'), raw])).rejects.toThrow(D1_UNDEF)
    // null is fine, and nothing from the refused batch landed.
    await d1.prepare(sql).bind('i4', 'T', null).run()
    expect((db.prepare("SELECT id FROM notifications WHERE id IN ('ok','i1','i2','i3','i4')").all() as { id: string }[]).map((r) => r.id)).toEqual(['i4'])
  })
})
