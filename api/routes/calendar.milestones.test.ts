// F07 (2026-11-05): the calendar feed has no leg for the legacy `milestones`
// table. A milestone is a task with kind='milestone' (CLAUDE.md Rule 86), and
// the tasks leg already returns it, so the page's chip opens the task. The old
// leg sent chips to the Deadlines page, which never lists a `milestones` row.
//
// Real handler against the migrated schema (prodSchemaDb), as
// kind-label-surfaces.test.ts does.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { handleCalendarEvents } from './calendar'
import { ctToday } from '../lib/ct-date'
import type { Env } from '../helpers'

let db: InstanceType<typeof Database>
let env: Env
const today = ctToday()
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  insertRow(db, 'tasks', { id: 'task_m', title: 'LOI due', kind: 'milestone', assignee: 'nick-ingraham', due_date: today, status: 'todo' })
  insertRow(db, 'milestones', { id: 'ms_legacy', title: 'Legacy row', target_date: today, status: 'pending' })
})

describe('GET /api/calendar/events and milestones', () => {
  it('returns a milestone task, as a task event the page opens', async () => {
    const res = await handleCalendarEvents(new URL('https://x/api/calendar/events'), env, 'nick-ingraham')
    const body = await res.json() as { data: Array<{ id: string; kind: string | null; type: string }> }
    const m = body.data.find((e) => e.id === 'task_m')
    expect(m).toMatchObject({ kind: 'milestone', type: 'task' })
  })

  it('does not read the legacy milestones table', async () => {
    const res = await handleCalendarEvents(new URL('https://x/api/calendar/events'), env, 'nick-ingraham')
    const body = await res.json() as { data: Array<{ id: string; type: string }> }
    expect(body.data.some((e) => e.type === 'milestone' || e.id === 'ms_legacy')).toBe(false)
  })
})
