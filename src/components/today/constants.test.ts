import { describe, it, expect } from 'vitest'
import { matchMeetingRecord, normalizeMeetingTitle } from './constants'
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
