// #1593: task reads join the meeting on BOTH id spaces, and meeting_ref is
// always a meetings.id.
//
// The PB debrief stamps its action items with the meeting's calendar id and
// pushes the meeting first with that id as source_id (v95). The task reads
// joined on `t.meeting_id = m.id` only, so every such task fell to the
// date+slug guess in resolveMeetingRef. Joining `IN (m.id, m.source_id)` makes
// it exact; meeting_ref must still be the joined m.id, because a link to a
// source_id is a 404 (handleGetMeeting reads meetings.id only). Runs on the
// migration-chain database (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleGetTasks, handleGetTask } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

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
  task('t_legacy', 'mtg_20261009T150000') // approval-lane id: no meetings row, bridged by date
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

  it('keeps the id-keyed task, still bridges the legacy id, and returns one row per task', async () => {
    const rows = await list()
    expect(rows.map((r) => r.id).sort()).toEqual(['t_hub', 't_legacy', 't_none', 't_src'])
    expect(rows.find((r) => r.id === 't_hub').meeting_ref).toBe('mtg-2026-10-09-aaaa0000')
    expect(rows.find((r) => r.id === 't_legacy').meeting_ref).toBe('mtg-2026-10-09-aaaa0000')
    expect(rows.find((r) => r.id === 't_none').meeting_ref ?? null).toBeNull()
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
