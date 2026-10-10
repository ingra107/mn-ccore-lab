import { describe, it, expect } from 'vitest'
import { civilDaysUntil, civilDaysOverdue, addDaysYmd } from './dateUtils'

describe('civilDaysUntil (#137)', () => {
  const CHI = 'America/Chicago'
  it('a same-day meeting is Today (0), never Tomorrow, at 3:09 PM CDT', () => {
    // 2026-09-24T20:09Z = 3:09 PM CDT on Sep 24 (the #137 report time)
    const now = new Date('2026-09-24T20:09:20Z')
    expect(civilDaysUntil('2026-09-24', now, CHI)).toBe(0)
    expect(civilDaysUntil('2026-09-25', now, CHI)).toBe(1)
    expect(civilDaysUntil('2026-09-26', now, CHI)).toBe(2)
    expect(civilDaysUntil('2026-09-23', now, CHI)).toBe(-1)
  })
  it('uses the Chicago day at 11:30 PM CDT, when UTC has already rolled to tomorrow', () => {
    const now = new Date('2026-09-25T04:30:00Z') // 11:30 PM CDT Sep 24
    expect(civilDaysUntil('2026-09-24', now, CHI)).toBe(0)
    expect(civilDaysUntil('2026-09-25', now, CHI)).toBe(1)
  })
  it('uses the Chicago day at 12:30 AM CDT, just after the boundary', () => {
    const now = new Date('2026-09-25T05:30:00Z') // 12:30 AM CDT Sep 25
    expect(civilDaysUntil('2026-09-24', now, CHI)).toBe(-1)
    expect(civilDaysUntil('2026-09-25', now, CHI)).toBe(0)
  })
  it('stays exact across the fall DST change (Nov 1 2026, CDT to CST)', () => {
    const now = new Date('2026-10-31T17:00:00Z') // noon CDT Oct 31
    expect(civilDaysUntil('2026-11-01', now, CHI)).toBe(1)
    expect(civilDaysUntil('2026-11-02', now, CHI)).toBe(2)
  })
})

describe('addDaysYmd (#143 cumulative +7)', () => {
  it('four +7 steps from one date land 28 days out', () => {
    let d = '2026-10-08'
    for (let i = 0; i < 4; i++) d = addDaysYmd(d, 7)
    expect(d).toBe('2026-11-05')
  })
  it('crosses month, year and DST boundaries without drift', () => {
    expect(addDaysYmd('2026-12-28', 7)).toBe('2027-01-04')
    expect(addDaysYmd('2026-10-30', 7)).toBe('2026-11-06')
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('civilDaysOverdue (site audit F03)', () => {
  it('stays a whole calendar-day count after 19:00 CDT (no UTC-midnight +1)', () => {
    // 2026-10-10T03:45Z = 10:45 PM CDT on Oct 9
    const now = new Date('2026-10-10T03:45:00Z')
    expect(civilDaysOverdue('2026-09-22', now, 'America/Chicago')).toBe(17)
    expect(civilDaysOverdue('2026-10-09', now, 'America/Chicago')).toBe(0)
    expect(civilDaysOverdue('2026-10-20', now, 'America/Chicago')).toBe(0)
  })
})
