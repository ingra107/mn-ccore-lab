// The prep page and the generated agenda read the PREVIOUS MEETING OF THE SAME
// SERIES, and the prep's Recent activity holds people's events only.
//
// G5-3 (2026-10-14 mobile audit): the prep for "Weekly Meeting with
// Daniel/Nick" (Oct 12) showed "Previous action items, From Oct 9" taken from
// the ADHERE-LPV meeting, because the previous meeting was chosen by date
// alone. G5-5: Recent activity listed "Bulk sync: 1 created, 0 updated" and
// "Deleted links record link_01M..." beside real events. G5-2: the action-item
// rows showed the task's provenance body because the query never selected the
// title. Runs on the migration-chain database (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleMeetingPrep, handleGenerateAgenda } from './meetings'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { meetingSeriesKey } from '../../shared/meetingAudience'
import { nowInstant } from '../lib/time'

let db: InstanceType<typeof Database>
let env: any

function meeting(id: string, date: string, title: string, sourceId: string | null = null) {
  insertRow(db, 'meetings', { id, date, title, type: 'one-on-one', source_id: sourceId })
}
function task(id: string, title: string, meetingId: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'tasks', {
    id, title, description: `From the meeting. Source: [[Context/Meetings/x.md]] [meeting:${meetingId}:abc]`,
    meeting_id: meetingId, status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    completed: 0, deleted_at: null, created_at: '2026-09-01 00:00:00', ...extra,
  })
}
function activity(id: string, type: string, description: string) {
  insertRow(db, 'activity_log', { id, type, description, actor: 'nick-ingraham', timestamp: nowInstant() })
}

beforeEach(() => {
  db = prodSchemaDb()
  // Two series interleaved by date: the 1:1 on Sep 28 and Oct 12, another
  // group's meeting in between on Oct 9.
  meeting('mtg-1on1-old', '2026-09-28', 'Weekly Meeting with Daniel/Nick', 'cal-20260928T1300-weekly-meeting-with-dani')
  meeting('mtg-other', '2026-10-09', 'ADHERE-LPV meeting', 'cal-20261009T0900-adhere-lpv-meeting')
  meeting('mtg-1on1-now', '2026-10-12', 'Weekly Meeting with Daniel/Nick', 'cal-20261012T1300-weekly-meeting-with-dani')
  task('t_1on1', 'Send Daniel the cohort numbers', 'cal-20260928T1300-weekly-meeting-with-dani')
  task('t_other', 'ADHERE item', 'cal-20261009T0900-adhere-lpv-meeting')
  env = { DB: d1Adapter(db) }
})

describe('series key', () => {
  it('a lab series matches across its title variants; any other title by its normalized form', () => {
    expect(meetingSeriesKey('MNCCORE')).toBe(meetingSeriesKey('MNCCORE Biweekly Meeting -- April 21, 2026'))
    expect(meetingSeriesKey('Weekly Meeting with Daniel/Nick')).toBe(meetingSeriesKey('weekly meeting with daniel/nick '))
    expect(meetingSeriesKey('Weekly Meeting with Daniel/Nick')).not.toBe(meetingSeriesKey('ADHERE-LPV meeting'))
    expect(meetingSeriesKey(null)).toBeNull()
  })
})

describe('meeting prep', () => {
  it('takes the previous meeting from the same series, not the latest meeting of any series', async () => {
    const body = await (await handleMeetingPrep('mtg-1on1-now', env, true)).json() as any
    expect(body.data.previousMeeting.id).toBe('mtg-1on1-old')
    expect(body.data.previousActionItems.map((r: any) => r.id)).toEqual(['t_1on1'])
  })

  it('returns no previous meeting when the series has none', async () => {
    const body = await (await handleMeetingPrep('mtg-other', env, true)).json() as any
    expect(body.data.previousMeeting).toBeNull()
    expect(body.data.previousActionItems).toEqual([])
  })

  it('carries each action item title, not only its provenance body', async () => {
    const body = await (await handleMeetingPrep('mtg-1on1-now', env, true)).json() as any
    expect(body.data.previousActionItems[0].title).toBe('Send Daniel the cohort numbers')
  })

  it('Recent activity keeps people events and drops machine audit rows', async () => {
    activity('a1', 'task', 'Created task: "Draft aims" → casey-eddington')
    activity('a2', 'pb_session', 'Bulk sync: 1 created, 0 updated')
    activity('a3', 'links', 'Deleted links record link_01M47SDF3Q53JFWK8486HW5QW2')
    activity('a4', 'task', 'Bulk complete: 1 tasks')
    activity('a5', 'digest', 'Dismissed digest paper')
    activity('a6', 'stage_change', 'Stage: data_analysis → data_collection')
    const body = await (await handleMeetingPrep('mtg-1on1-now', env, true)).json() as any
    const descs = body.data.recentActivity.map((r: any) => r.description).sort()
    expect(descs).toEqual(['Created task: "Draft aims" → casey-eddington', 'Stage: data_analysis → data_collection'])
  })
})

describe('generated agenda', () => {
  it('carries forward open items from this series only', async () => {
    const body = await (await handleGenerateAgenda('mtg-1on1-now', env, true)).json() as any
    const carried = body.sections.find((s: any) => s.title === 'Carried-forward action items')
    expect(carried.items.map((i: any) => i.id)).toEqual(['t_1on1'])
  })

  it('carries forward nothing when the series has no earlier meeting', async () => {
    const body = await (await handleGenerateAgenda('mtg-other', env, true)).json() as any
    const carried = body.sections.find((s: any) => s.title === 'Carried-forward action items')
    expect(carried.items).toEqual([])
  })
})
