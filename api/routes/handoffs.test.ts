// #8842: a handoff is recorded only when its reassignment landed.
// Real migrated schema (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleCreateHandoff } from './handoffs'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

const USER = { email: 'nick@example.com' } as any
let db: InstanceType<typeof Database>
let env: any

const req = (body: unknown) => new Request('https://x/api/tasks/t/handoffs', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("INSERT INTO team_members (id, slug, name, role) VALUES ('m1', 'jane', 'Jane', 'member')").run()
  db.prepare("INSERT INTO tasks (id, title, assignee) VALUES ('task_1', 'Write it', 'nick')").run()
  env = { DB: d1Adapter(db) }
})

describe('POST /api/tasks/:id/handoffs', () => {
  it('reassigns, then records the handoff and notifies the recipient', async () => {
    const res = await handleCreateHandoff('task_1', req({ to_slug: 'jane', situation: 'over to you' }), USER, env)
    expect(res.status).toBe(201)
    expect((db.prepare("SELECT assignee FROM tasks WHERE id='task_1'").get() as any).assignee).toBe('jane')
    expect(count("SELECT COUNT(*) n FROM task_handoffs WHERE task_id='task_1'")).toBe(1)
    expect(count("SELECT COUNT(*) n FROM notifications WHERE recipient_slug='jane' AND type='handoff'")).toBe(1)
  })

  it('writes no handoff and no notification when the reassignment did not land', async () => {
    const res = await handleCreateHandoff('task_missing', req({ to_slug: 'jane', situation: 'over to you' }), USER, env)
    expect(res.status).toBe(409)
    expect(count('SELECT COUNT(*) n FROM task_handoffs')).toBe(0)
    expect(count("SELECT COUNT(*) n FROM notifications WHERE type='handoff'")).toBe(0)
  })
})
