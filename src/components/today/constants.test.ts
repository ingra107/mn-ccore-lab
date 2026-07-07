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
})
