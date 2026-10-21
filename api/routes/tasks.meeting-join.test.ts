// #1593: task reads join the meeting on BOTH id spaces, and meeting_ref is
// always a meetings.id.
//
// The PB debrief stamps its action items with the meeting's calendar id and
// pushes the meeting first with that id as source_id (v95). The task reads
// joined on `t.meeting_id = m.id` only, so every such task fell to a
// date+slug guess. Joining both id spaces (TASK_MEETING_JOIN) makes it exact;
// meeting_ref must still be the joined m.id, because a link to a source_id is a
// 404 (handleGetMeeting reads meetings.id only). A capture staging key
// (`mtg_<stamp>-<lane>`) joins nothing and gets NO meeting_ref: the "only
// meeting that day" guess was deleted 2026-10-21 because it linked recordings of
// other meetings. Runs on the migration-chain database
// (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleGetTasks, handleGetTask } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { TASK_MEETING_JOIN } from '../lib/meeting-ref'

let db: InstanceType<typeof Database>
let env: any

const OURS = new Set(['t_src', 't_hub', 't_legacy', 't_none'])

function task(id: string, meetingId: string | null) {
  insertRow(db, 'tasks', {
    id, title: id, meeting_id: meetingId, status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    completed: 0, created_at: '2026-09-01 00:00:00',
  })
}

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'meetings', { id: 'mtg-2026-10-12-bb24f00f', date: '2026-10-12', title: 'Weekly Meeting with Daniel/Nick', source_id: 'cal-20261012T1300-weekly-meeting-with-dani' })
  insertRow(db, 'meetings', { id: 'mtg-2026-10-09-aaaa0000', date: '2026-10-09', title: 'ADHERE-LPV meeting', source_id: null })
  task('t_src', 'cal-20261012T1300-weekly-meeting-with-dani') // debrief-written: keyed by source_id
  task('t_hub', 'mtg-2026-10-09-aaaa0000') // Hub-written: keyed by meetings.id
  task('t_legacy', 'mtg_20261009T150000-zoom') // capture staging key: no meetings row, ONE meeting that day
  task('t_none', null)
  env = { DB: d1Adapter(db) }
})

async function list(qs = '') {
  const body = await (await handleGetTasks(new URL(`https://x/api/tasks${qs}`), env, true)).json() as any
  return (body.data as any[]).filter((r) => OURS.has(r.id))
}

describe('task list meeting join', () => {
  it('resolves a source_id-keyed task to the canonical meetings.id, never the source_id', async () => {
    const rows = await list()
    const src = rows.find((r) => r.id === 't_src')
    expect(src.meeting_ref).toBe('mtg-2026-10-12-bb24f00f')
    expect(src.meeting_title).toBe('Weekly Meeting with Daniel/Nick')
    expect(src.meeting_id).toBe('cal-20261012T1300-weekly-meeting-with-dani') // stored value untouched
  })

  it('keeps the id-keyed task and returns one row per task', async () => {
    const rows = await list()
    expect(rows.map((r) => r.id).sort()).toEqual(['t_hub', 't_legacy', 't_none', 't_src'])
    expect(rows.find((r) => r.id === 't_hub').meeting_ref).toBe('mtg-2026-10-09-aaaa0000')
    expect(rows.find((r) => r.id === 't_none').meeting_ref ?? null).toBeNull()
  })

  it('never links an mtg_ capture key to the only meeting that day (#1593)', async () => {
    const legacy = (await list()).find((r) => r.id === 't_legacy')
    expect(legacy.meeting_ref ?? null).toBeNull()
    expect(legacy.meeting_title ?? null).toBeNull()
    expect(legacy.meeting_id).toBe('mtg_20261009T150000-zoom') // origin still stated
    const one = await (await handleGetTask('t_legacy', env)).json() as any
    expect(one.data.meeting_ref ?? null).toBeNull()
  })

  it('?meeting=<meetings.id> also returns the tasks keyed by its source_id', async () => {
    expect((await list('?meeting=mtg-2026-10-12-bb24f00f')).map((r) => r.id)).toEqual(['t_src'])
    expect((await list('?meeting=cal-20261012T1300-weekly-meeting-with-dani')).map((r) => r.id)).toEqual(['t_src'])
    expect((await list('?meeting=mtg-2026-10-09-aaaa0000')).map((r) => r.id)).toEqual(['t_hub'])
  })

  it('GET /api/tasks/:id carries the same meeting_ref', async () => {
    const body = await (await handleGetTask('t_src', env)).json() as any
    expect(body.data.meeting_ref).toBe('mtg-2026-10-12-bb24f00f')
  })
})

describe('TASK_MEETING_JOIN shape', () => {
  it('joins at most one meetings row, the id match first, when one row id is another row source_id', async () => {
    // Nothing in the schema forbids this overlap; the join must not double the task.
    insertRow(db, 'meetings', { id: 'mtg-A', date: '2026-10-01', title: 'A', source_id: 'mtg-B' })
    insertRow(db, 'meetings', { id: 'mtg-B', date: '2026-10-02', title: 'B', source_id: null })
    task('t_overlap', 'mtg-B')
    const rows = db.prepare(`SELECT t.id, m.id AS meeting_ref FROM tasks t ${TASK_MEETING_JOIN} WHERE t.id = 't_overlap'`).all()
    expect(rows).toEqual([{ id: 't_overlap', meeting_ref: 'mtg-B' }])
    const body = await (await handleGetTasks(new URL('https://x/api/tasks'), env, true)).json() as any
    expect((body.data as any[]).filter((r) => r.id === 't_overlap')).toHaveLength(1)
    const one = await (await handleGetTask('t_overlap', env)).json() as any
    expect(one.data.meeting_ref).toBe('mtg-B')
  })

  it('reaches meetings only through its indexes, never a scan per task row', () => {
    const plan = (db.prepare(`EXPLAIN QUERY PLAN SELECT t.id, m.title FROM tasks t ${TASK_MEETING_JOIN}`).all() as any[])
      .map((r) => String(r.detail))
    expect(plan.filter((d) => / SCAN (m|meetings)$|^SCAN (m|meetings)$|^SCAN (m|meetings) /.test(d))).toEqual([])
    expect(plan.some((d) => d.includes('SEARCH m USING'))).toBe(true)
  })
})
