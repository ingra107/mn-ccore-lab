import { describe, it, expect } from 'vitest'
import { matchMeetingRecord, normalizeMeetingTitle, projectCalendarEventToDay, continuationNote } from './constants'
import { todayKey } from '../../lib/taskGrouping'

// T13: pure-function coverage for the cal- row <-> D1 meeting bridge.
// normalizeMeetingTitle mirrors api/routes/meetings.ts's server-side copy —
// these cases are chosen to match that file's own doc comment examples.
describe('normalizeMeetingTitle', () => {
  it('collapses case + surrounding/internal whitespace to one join key', () => {
    const a = normalizeMeetingTitle('MNCCORE Lab Sync')
    const b = normalizeMeetingTitle('mnccore lab sync')
    const c = normalizeMeetingTitle('  MNCCORE Lab  Sync  ')
    expect(a).toBe('mnccore lab sync')
    expect(b).toBe(a)
    expect(c).toBe(a)
  })
})

describe('matchMeetingRecord', () => {
  const today = todayKey()
  const notToday = '2000-01-01'

  it('matches a same-day meeting by normalized title', () => {
    const meetings = [
      { id: 'm1', title: '  MNCCORE Lab  Sync  ', date: today, notes: 'debrief notes' },
    ]
    const match = matchMeetingRecord({ title: 'MNCCORE Lab Sync', startMin: 540 }, meetings, normalizeMeetingTitle)
    expect(match?.id).toBe('m1')
    expect(match?.notes).toBe('debrief notes')
  })

  it('does not match a meeting on a different day even with the same title', () => {
    const meetings = [
      { id: 'm1', title: 'MNCCORE Lab Sync', date: notToday, notes: null },
    ]
    const match = matchMeetingRecord({ title: 'MNCCORE Lab Sync' }, meetings, normalizeMeetingTitle)
    expect(match).toBeUndefined()
  })

  it('does not match when no title matches on the same day', () => {
    const meetings = [
      { id: 'm1', title: 'Grant Review', date: today, notes: null },
    ]
    const match = matchMeetingRecord({ title: 'MNCCORE Lab Sync' }, meetings, normalizeMeetingTitle)
    expect(match).toBeUndefined()
  })

  it('returns undefined when there are no meetings at all', () => {
    expect(matchMeetingRecord({ title: 'Anything' }, [], normalizeMeetingTitle)).toBeUndefined()
  })

  // #549: multiple same-title same-day candidates previously always resolved
  // to list order (cands[0]) regardless of startMin — a documented but
  // unimplemented "nearest start time" tie-break.
  it('breaks a same-title same-day tie by nearest startMin, not list order', () => {
    const meetings = [
      { id: 'far', title: 'MNCCORE Lab Sync', date: today, notes: 'far notes', startMin: 900 },   // 15:00, delta 360
      { id: 'near', title: 'MNCCORE Lab Sync', date: today, notes: 'near notes', startMin: 555 }, // 09:15, delta 15
    ]
    // ev at 09:00 (540) — 'near' (09:15) should win over 'far' (15:00) even
    // though 'far' is listed first.
    const match = matchMeetingRecord({ title: 'MNCCORE Lab Sync', startMin: 540 }, meetings, normalizeMeetingTitle)
    expect(match?.id).toBe('near')
  })

  it('falls back to list order when candidates carry no startMin (current D1 shape)', () => {
    const meetings = [
      { id: 'm1', title: 'MNCCORE Lab Sync', date: today, notes: 'first' },
      { id: 'm2', title: 'MNCCORE Lab Sync', date: today, notes: 'second' },
    ]
    const match = matchMeetingRecord({ title: 'MNCCORE Lab Sync', startMin: 540 }, meetings, normalizeMeetingTitle)
    expect(match?.id).toBe('m1')
  })

  it('falls back to list order when the event itself has no startMin', () => {
    const meetings = [
      { id: 'm1', title: 'MNCCORE Lab Sync', date: today, notes: 'first', startMin: 300 },
      { id: 'm2', title: 'MNCCORE Lab Sync', date: today, notes: 'second', startMin: 540 },
    ]
    const match = matchMeetingRecord({ title: 'MNCCORE Lab Sync' }, meetings, normalizeMeetingTitle)
    expect(match?.id).toBe('m1')
  })
})

// ── #107: cross-day event projection ────────────────────────────────────────
//
// The Today geometry is minutes-since-local-midnight, which cannot express a
// span that crosses one. Before this, an 11 PM -> 7 AM event produced
// startMin=1380 / endMin=420 — an interval whose end precedes its start, which
// made duration() negative, kept it OUT of the service rail, and fed
// packColumns an inverted interval.
describe('projectCalendarEventToDay', () => {
  const ev = (startAt: string, endAt: string | null, isAllDay = false) => ({
    id: 'e1', title: 'Overnight thing', location: null, startAt, endAt, isAllDay,
  })
  // Local-time ISO strings so the test does not depend on the runner's zone.
  const local = (s: string) => new Date(s).toISOString()

  it('clips an event that runs past midnight, and flags the continuation', () => {
    const e = projectCalendarEventToDay(ev(local('2026-08-03T23:00'), local('2026-08-04T07:00')), '2026-08-03')!
    expect(e).not.toBeNull()
    expect(e.startMin).toBe(23 * 60)
    expect(e.endMin).toBe(1440)          // midnight-at-end-of-day, NOT 0
    expect(e.endsAfterDay).toBe(true)
    expect(e.startsBeforeDay).toBeFalsy()
    expect(continuationNote(e)).toBe('continues tomorrow')
  })

  it('shows the SAME event on the next day as a carry-in', () => {
    const e = projectCalendarEventToDay(ev(local('2026-08-03T23:00'), local('2026-08-04T07:00')), '2026-08-04')!
    expect(e).not.toBeNull()
    expect(e.startMin).toBe(0)
    expect(e.endMin).toBe(7 * 60)
    expect(e.startsBeforeDay).toBe(true)
    expect(continuationNote(e)).toBe('started yesterday')
  })

  it('ALWAYS produces a forward interval — the actual defect', () => {
    for (const day of ['2026-08-03', '2026-08-04']) {
      const e = projectCalendarEventToDay(ev(local('2026-08-03T23:00'), local('2026-08-04T07:00')), day)!
      expect(e.endMin! > e.startMin!).toBe(true)
    }
  })

  it('gives distinct ids per day so dismissing one slice keeps the other', () => {
    const a = projectCalendarEventToDay(ev(local('2026-08-03T23:00'), local('2026-08-04T07:00')), '2026-08-03')!
    const b = projectCalendarEventToDay(ev(local('2026-08-03T23:00'), local('2026-08-04T07:00')), '2026-08-04')!
    expect(a.id).not.toBe(b.id)
  })

  it('treats the end as EXCLUSIVE — a block ending at midnight is not on the next day', () => {
    const args = [local('2026-08-03T17:00'), local('2026-08-04T00:00')] as const
    expect(projectCalendarEventToDay(ev(...args), '2026-08-03')).not.toBeNull()
    expect(projectCalendarEventToDay(ev(...args), '2026-08-04')).toBeNull()
  })

  it('spans a whole middle day', () => {
    const e = projectCalendarEventToDay(ev(local('2026-08-02T20:00'), local('2026-08-04T09:00')), '2026-08-03')!
    expect(e.startMin).toBe(0)
    expect(e.endMin).toBe(1440)
    expect(continuationNote(e)).toBe('all day · started yesterday, runs past midnight')
  })

  it('returns null for a day the event does not touch', () => {
    expect(projectCalendarEventToDay(ev(local('2026-08-03T09:00'), local('2026-08-03T10:00')), '2026-08-04')).toBeNull()
    expect(projectCalendarEventToDay(ev(local('2026-08-03T09:00'), local('2026-08-03T10:00')), '2026-08-02')).toBeNull()
  })

  it('falls back to a 30-minute block when DTEND is missing', () => {
    const e = projectCalendarEventToDay(ev(local('2026-08-03T09:00'), null), '2026-08-03')!
    expect(e.endMin! - e.startMin!).toBe(30)
  })

  it('keeps an all-day event on its civil date, unclipped and untimed', () => {
    const e = projectCalendarEventToDay(ev('2026-08-03T00:00:00.000Z', null, true), '2026-08-03')!
    expect(e.isAllDay).toBe(true)
    expect(e.time).toBe('all day')
    expect(e.startMin).toBeUndefined()
    expect(projectCalendarEventToDay(ev('2026-08-03T00:00:00.000Z', null, true), '2026-08-04')).toBeNull()
  })

  it('keeps an ordinary same-day event unflagged', () => {
    const e = projectCalendarEventToDay(ev(local('2026-08-03T09:00'), local('2026-08-03T10:30')), '2026-08-03')!
    expect(e.startsBeforeDay).toBe(false)
    expect(e.endsAfterDay).toBe(false)
    expect(continuationNote(e)).toBe('')
  })
})
