// tasks.kind.test.ts — schema-v109 tasks.kind guard (2026-09-16, GH #131/#132)
//
// A milestone is a task row with kind='milestone'. The column is NOT NULL
// DEFAULT 'task' on both stores, so the UPDATE path must 400 on any value
// outside shared/taskKinds.ts AND on a null/'' clear (there is no "reset to
// default" through a patch — a milestone must not silently become a task).
//
// #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The stub this file copied from tasks.update-emaillink.test.ts had no NOT
// NULL on kind at all, so it could not tell the route's 400 from the column's
// refusal; here the column is the real one and each landed write has a receipt.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleUpdateTask } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

function apiKeyPost(body: unknown): Request {
  return new Request('https://x/api/tasks/test', {
    method: 'POST',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const user = { email: 'ingra107@umn.edu', name: 'Nick' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as import('../helpers').Env
})

function seedTask(id: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'tasks', { id, title: 'Probe', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', ...extra })
}
const kindOf = (id: string) => (db.prepare('SELECT kind FROM tasks WHERE id = ?').get(id) as { kind: string }).kind
const receiptCount = () => (db.prepare('SELECT COUNT(*) AS n FROM processed_mutations').get() as { n: number }).n

describe('handleUpdateTask guards tasks.kind (schema-v109)', () => {
  it('the column itself refuses a NULL kind (the route guard is not the only line)', () => {
    seedTask('task_01hwtest_kind_000000')
    expect(() => db.prepare("UPDATE tasks SET kind = NULL WHERE id = 'task_01hwtest_kind_000000'").run())
      .toThrow(/NOT NULL constraint failed: tasks.kind/)
  })

  it('kind=milestone lands on the row', async () => {
    const id = 'task_01hwtest_kind_000001'
    seedTask(id, { kind: 'task' })

    const res = await handleUpdateTask(id, apiKeyPost({ kind: 'milestone' }), user, env)
    expect(res.status).toBe(200)
    expect(kindOf(id)).toBe('milestone')
    expect(receiptCount()).toBe(1)
  })

  it('an unlisted kind is a 400 that names the vocabulary', async () => {
    const id = 'task_01hwtest_kind_000002'
    seedTask(id, { kind: 'task' })

    const res = await handleUpdateTask(id, apiKeyPost({ kind: 'deadline' }), user, env)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/Invalid kind "deadline"\. Must be one of task\/milestone/)
    expect(kindOf(id)).toBe('task')
    expect(receiptCount()).toBe(0)
  })

  it('a null or empty kind is refused (NOT NULL, no clear branch)', async () => {
    const id = 'task_01hwtest_kind_000003'
    seedTask(id, { kind: 'milestone' })
    for (const bad of [null, '']) {
      const res = await handleUpdateTask(id, apiKeyPost({ kind: bad }), user, env)
      expect(res.status).toBe(400)
      expect(kindOf(id)).toBe('milestone')
    }
  })

  it('an unrelated patch leaves kind alone', async () => {
    const id = 'task_01hwtest_kind_000004'
    seedTask(id, { kind: 'milestone' })

    const res = await handleUpdateTask(id, apiKeyPost({ due_date: '2026-10-01' }), user, env)
    expect(res.status).toBe(200)
    expect(kindOf(id)).toBe('milestone')
    expect((db.prepare('SELECT due_date FROM tasks WHERE id = ?').get(id) as { due_date: string }).due_date).toBe('2026-10-01')
  })
})
