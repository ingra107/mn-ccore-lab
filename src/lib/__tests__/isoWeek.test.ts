import { describe, it, expect } from 'vitest'
import { isoWeekOf, isIsoWeek, isoWeekMonday, shiftIsoWeek, mondayOf, trailingMondays, formatWeekRange } from '../isoWeek'

describe('isoWeekOf', () => {
  it('puts Monday and Sunday of one week in the same ISO week', () => {
    // Mon Oct 12 2026 .. Sun Oct 18 2026 is ISO week 42.
    expect(isoWeekOf(new Date(2026, 9, 12))).toBe('2026-W42')
    expect(isoWeekOf(new Date(2026, 9, 18))).toBe('2026-W42')
    expect(isoWeekOf(new Date(2026, 9, 19))).toBe('2026-W43')
  })
  it('belongs a January-1st Friday to the last week of the old year', () => {
    expect(isoWeekOf(new Date(2027, 0, 1))).toBe('2026-W53')
  })
})

describe('isIsoWeek', () => {
  it('accepts real weeks and refuses everything else', () => {
    expect(isIsoWeek('2026-W42')).toBe(true)
    expect(isIsoWeek('2026-W53')).toBe(true) // 2026 is a 53-week year
    expect(isIsoWeek('2025-W53')).toBe(false) // 2025 has 52
    expect(isIsoWeek('2026-W00')).toBe(false)
    expect(isIsoWeek('2026-W54')).toBe(false)
    expect(isIsoWeek('2026-42')).toBe(false)
    expect(isIsoWeek('')).toBe(false)
    expect(isIsoWeek(null)).toBe(false)
  })
})

describe('isoWeekMonday / shiftIsoWeek', () => {
  it('returns the Monday at local midnight', () => {
    const m = isoWeekMonday('2026-W42')!
    expect([m.getFullYear(), m.getMonth(), m.getDate(), m.getHours()]).toEqual([2026, 9, 12, 0])
    expect(m.getDay()).toBe(1)
  })
  it('shifts across a year boundary', () => {
    expect(shiftIsoWeek('2026-W53', 1)).toBe('2027-W01')
    expect(shiftIsoWeek('2027-W01', -1)).toBe('2026-W53')
    expect(shiftIsoWeek('2026-W42', -1)).toBe('2026-W41')
  })
  it('leaves bad input alone', () => {
    expect(shiftIsoWeek('nope', 1)).toBe('nope')
  })
})

describe('mondayOf / trailingMondays', () => {
  it('maps a Sunday to the Monday before it, never the Sunday itself', () => {
    const m = mondayOf(new Date(2026, 9, 18)) // Sunday
    expect([m.getMonth(), m.getDate(), m.getDay()]).toEqual([9, 12, 1])
  })
  it('lists Mondays only, oldest first, ending with this week', () => {
    const list = trailingMondays(8, new Date(2026, 9, 14))
    expect(list).toHaveLength(8)
    expect(list.every((d) => d.getDay() === 1)).toBe(true)
    expect(list[7].getDate()).toBe(12)
    expect(list[0].getTime()).toBeLessThan(list[1].getTime())
  })
})

describe('formatWeekRange', () => {
  it('names Monday through Sunday', () => {
    expect(formatWeekRange(new Date(2026, 9, 12))).toBe('Oct 12 - Oct 18, 2026')
  })
})
