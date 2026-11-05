// R04, the calendar half: the title+date merge exists for meetings synced twice
// under different ids. Two tasks are two tasks.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Env } from '../helpers'
import { handleCalendarEvents } from './calendar'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'team_members', { id: 'tm-bob', name: 'Bob', slug: 'bob', email: 'bob@umn.edu' })
  env = { DB: d1Adapter(db) } as unknown as Env
})

async function events() {
  const url = 'https://x/api/calendar/events?start=2026-11-01&end=2026-11-30'
  const res = await handleCalendarEvents(new URL(url), env, 'bob')
  return ((await res.json()) as { data: { id: string; type: string }[] }).data
}

describe('calendar collapse', () => {
  it('two same-titled tasks due the same day both show', async () => {
    const t = { title: 'Review manuscript', status: 'todo', priority: 'medium', assignee: 'bob', completed: 0, due_date: '2026-11-10' }
    insertRow(db, 'tasks', { ...t, id: 't1', project_id: 'proj_a' })
    insertRow(db, 'tasks', { ...t, id: 't2', project_id: 'proj_b' })
    expect((await events()).filter((e) => e.type === 'task').map((e) => e.id).sort()).toEqual(['t1', 't2'])
  })

  it('a meeting synced twice under two ids still shows once', async () => {
    const m = { date: '2026-11-10', title: 'Lab sync', type: 'lab', attendees: '["bob"]', owner_slug: 'bob' }
    insertRow(db, 'meetings', { ...m, id: 'm1' })
    insertRow(db, 'meetings', { ...m, id: 'm2', owner_slug: 'eve' })
    expect((await events()).filter((e) => e.type === 'meeting')).toHaveLength(1)
  })
})
