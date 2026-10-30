// schema-v152 (steps and check-ins): every wrong state the migration claims to
// refuse, attempted against the schema replayed from the real migration chain
// (prodSchemaDb, FKs on as D1).
//
// Plan: PB Scratch/plans/2026-10-30-steps-checkins-RECONCILED.md.

import { describe, it, expect } from 'vitest'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'

type Db = ReturnType<typeof prodSchemaDb>

function task(db: Db, id: string, extra: Record<string, unknown> = {}) {
  return insertRow(db, 'tasks', { id, title: id, assignee: 'nobody', ...extra })
}

const refuses = (fn: () => unknown, msg: RegExp) => expect(fn).toThrow(msg)
const done = (db: Db, id: string) =>
  db.prepare("UPDATE tasks SET status = 'done', completed = 1, completed_at = datetime('now') WHERE id = ?").run(id)
const row = (db: Db, id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>

describe('v152 tasks.parent_id: Level 1 at the arbiter', () => {
  it('a step points at a real task (the trigger answers in words; the FK holds without it)', () => {
    const db = prodSchemaDb()
    refuses(() => task(db, 'S', { parent_id: 'nope' }), /task_parent_not_live/)
    db.exec('DROP TRIGGER trg_tasks_parent_ins')
    refuses(() => task(db, 'S', { parent_id: 'nope' }), /FOREIGN KEY constraint failed/)
  })

  it('a task is not its own parent (CHECK)', () => {
    const db = prodSchemaDb()
    task(db, 'T')
    refuses(() => db.prepare("UPDATE tasks SET parent_id = 'T' WHERE id = 'T'").run(), /CHECK constraint failed/)
  })

  it('a hard delete of the parent releases its steps (ON DELETE SET NULL)', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    db.prepare("DELETE FROM tasks WHERE id = 'P'").run()
    expect(row(db, 'S').parent_id).toBeNull()
  })

  it('an existing row reads NULL and an ordinary step is accepted', () => {
    const db = prodSchemaDb()
    expect(task(db, 'P').parent_id).toBeNull()
    expect(task(db, 'S', { parent_id: 'P' }).parent_id).toBe('P')
  })
})

describe('v152 depth and eligibility triggers', () => {
  it('a step cannot have steps (insert and update)', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    refuses(() => task(db, 'G', { parent_id: 'S' }), /task_parent_depth/)
    task(db, 'X')
    refuses(() => db.prepare("UPDATE tasks SET parent_id = 'S' WHERE id = 'X'").run(), /task_parent_depth/)
  })

  it('a task with steps cannot become a step, so no cycle can close', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    task(db, 'Q')
    refuses(() => db.prepare("UPDATE tasks SET parent_id = 'Q' WHERE id = 'P'").run(), /task with steps cannot become a step/)
    refuses(() => db.prepare("UPDATE tasks SET parent_id = 'S' WHERE id = 'P'").run(), /task_parent_depth/)
  })

  it('a question is neither a step nor a parent', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    const spec = '{"v":1,"kind":"x","prompt":"?","choices":[{"key":"a","label":"A"}],"allow_text":false,"rec":"a"}'
    refuses(() => task(db, 'Qs', { kind: 'question', question_spec_json: spec, parent_id: 'P' }), /task_parent_question/)
    task(db, 'Qp', { kind: 'question', question_spec_json: spec })
    refuses(() => task(db, 'S', { parent_id: 'Qp' }), /task_parent_question/)
  })

  it('a step attaches only to a live parent', () => {
    const db = prodSchemaDb()
    task(db, 'P', { deleted_at: '2026-10-30 00:00:00', status: 'deleted' })
    refuses(() => task(db, 'S', { parent_id: 'P' }), /task_parent_not_live/)
  })

  it('re-patching a step with its own parent id passes (the trigger fires on a change only)', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    expect(() => db.prepare("UPDATE tasks SET parent_id = 'P', title = 'S2' WHERE id = 'S'").run()).not.toThrow()
  })

  it('a restored step whose parent became a step comes back as an ordinary task', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    task(db, 'G')
    db.prepare("UPDATE tasks SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'S'").run()
    db.prepare("UPDATE tasks SET parent_id = 'G' WHERE id = 'P'").run()
    db.prepare("UPDATE tasks SET deleted_at = NULL, status = 'todo' WHERE id = 'S'").run()
    expect(row(db, 'S').parent_id).toBeNull()
  })

  it('a restored step whose parent is still a live parent keeps it', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    db.prepare("UPDATE tasks SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'S'").run()
    db.prepare("UPDATE tasks SET deleted_at = NULL, status = 'todo' WHERE id = 'S'").run()
    expect(row(db, 'S').parent_id).toBe('P')
  })
})

describe('v152 a parent closes only when its steps are closed', () => {
  it('refuses done while a live step is open, accepts it once every step is done', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S1', { parent_id: 'P' })
    task(db, 'S2', { parent_id: 'P' })
    refuses(() => done(db, 'P'), /task_parent_open_steps/)
    done(db, 'S1')
    refuses(() => done(db, 'P'), /task_parent_open_steps/)
    done(db, 'S2')
    expect(() => done(db, 'P')).not.toThrow()
    expect(row(db, 'P').status).toBe('done')
  })

  it('a deleted step does not hold the parent open; a task with no steps closes as before', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    db.prepare("UPDATE tasks SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'S'").run()
    expect(() => done(db, 'P')).not.toThrow()
    task(db, 'Plain')
    expect(() => done(db, 'Plain')).not.toThrow()
  })

  it('completed=1 alone is refused too', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    refuses(() => db.prepare("UPDATE tasks SET completed = 1, completed_at = datetime('now'), status = 'done' WHERE id = 'P'").run(), /task_parent_open_steps/)
  })

  it('soft-deleting a parent with open steps is not a completion', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    expect(() => db.prepare("UPDATE tasks SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'P'").run()).not.toThrow()
  })
})

describe('v152 a deleted parent releases its steps on every delete path', () => {
  it('a soft delete (deleted_at set, as by a status=deleted patch) releases live steps; a restore does not re-attach', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    task(db, 'D', { parent_id: 'P', status: 'deleted', deleted_at: '2026-10-29 00:00:00' })
    db.prepare("UPDATE tasks SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'P'").run()
    expect(row(db, 'S').parent_id).toBeNull()
    expect(row(db, 'S').deleted_at).toBeNull()
    expect(row(db, 'D').parent_id).toBe('P')
    db.prepare("UPDATE tasks SET deleted_at = NULL, status = 'todo' WHERE id = 'P'").run()
    expect(row(db, 'S').parent_id).toBeNull()
  })

  it('a re-stamp of an already-deleted parent fires nothing', () => {
    const db = prodSchemaDb()
    task(db, 'P', { status: 'deleted', deleted_at: '2026-10-29 00:00:00' })
    expect(() => db.prepare("UPDATE tasks SET deleted_at = datetime('now') WHERE id = 'P'").run()).not.toThrow()
  })
})

describe('v152 a done parent never holds an open step', () => {
  it('refuses attaching a step to a done parent, on insert and on update', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    done(db, 'P')
    task(db, 'X')
    refuses(() => task(db, 'S', { parent_id: 'P' }), /task_parent_done/)
    refuses(() => db.prepare("UPDATE tasks SET parent_id = 'P' WHERE id = 'X'").run(), /task_parent_done/)
  })

  it('a step reopening under a done parent reopens the parent, whole triad cleared', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    done(db, 'S')
    db.prepare("UPDATE tasks SET status = 'done', completed = 1, completed_at = datetime('now'), completed_by = 'x@umn.edu' WHERE id = 'P'").run()
    db.prepare("UPDATE tasks SET status = 'todo', completed = 0, completed_at = NULL WHERE id = 'S'").run()
    const p = row(db, 'P')
    expect([p.status, p.completed, p.completed_at, p.completed_by]).toEqual(['todo', 0, null, null])
    // The loop check: the parent can be closed again once the step is.
    done(db, 'S')
    done(db, 'P')
    expect(row(db, 'P').status).toBe('done')
  })

  it('a step restored under a done parent reopens it too', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    db.prepare("UPDATE tasks SET deleted_at = datetime('now'), status = 'deleted' WHERE id = 'S'").run()
    done(db, 'P')
    db.prepare("UPDATE tasks SET deleted_at = NULL, status = 'todo' WHERE id = 'S'").run()
    expect(row(db, 'S').parent_id).toBe('P')
    expect(row(db, 'P').status).toBe('todo')
  })

  it('an open step under an open parent, or a step closing, leaves the parent alone', () => {
    const db = prodSchemaDb()
    task(db, 'P')
    task(db, 'S', { parent_id: 'P' })
    const seq = row(db, 'P').seq
    db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = 'S'").run()
    done(db, 'S')
    expect(row(db, 'P').seq).toBe(seq)
  })
})

describe('v152 check-in titles', () => {
  it('a check-in titled "Check in: ..." is accepted', () => {
    const db = prodSchemaDb()
    expect(task(db, 'C', { kind: 'checkin', title: 'Check in: CQODE -- what is next?' }).kind).toBe('checkin')
  })

  it('refuses a check-in with any other title, on insert and on update', () => {
    const db = prodSchemaDb()
    refuses(() => task(db, 'C1', { kind: 'checkin', title: 'CQODE follow-up' }), /checkin_title/)
    refuses(() => task(db, 'C2', { kind: 'checkin', title: 'check in: lower case' }), /checkin_title/)
    task(db, 'C3', { kind: 'checkin', title: 'Check in: X' })
    refuses(() => db.prepare("UPDATE tasks SET title = 'Renamed' WHERE id = 'C3'").run(), /checkin_title/)
    task(db, 'T', { title: 'Plain task' })
    refuses(() => db.prepare("UPDATE tasks SET kind = 'checkin' WHERE id = 'T'").run(), /checkin_title/)
  })

  it('leaves other kinds alone', () => {
    const db = prodSchemaDb()
    expect(() => task(db, 'M', { kind: 'milestone', title: 'LOI due' })).not.toThrow()
  })
})
