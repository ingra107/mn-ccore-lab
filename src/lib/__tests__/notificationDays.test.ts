// The bell groups by the viewer's calendar day. D1's datetime('now') is
// `YYYY-MM-DD HH:MM:SS` with no T, so splitting on 'T' made the whole timestamp
// the key: one header per row, and no row was ever "Today" (visual audit 2, H3).
import { describe, it, expect } from 'vitest'
import { groupByViewerDay } from '../notificationDays'
import { dbStampDay } from '../time'

const pad = (n: number) => String(n).padStart(2, '0')
/** A Date as D1 writes it: UTC, a space, no zone. */
const d1Stamp = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`

const NOW = new Date(2026, 10, 5, 12, 0, 0) // Nov 5 2026, noon local
const atHour = (dayOffset: number, hour: number) => new Date(2026, 10, 5 + dayOffset, hour, 30, 0)
const row = (d: Date) => ({ created_at: d1Stamp(d) })

describe('groupByViewerDay', () => {
  it('puts three D1 stamps from one local day under one Today header', () => {
    const groups = groupByViewerDay([row(atHour(0, 11)), row(atHour(0, 9)), row(atHour(0, 1))], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Today'])
    expect(groups[0].items).toHaveLength(3)
  })

  it('labels Yesterday and an older day, newest first as given', () => {
    const groups = groupByViewerDay([row(atHour(0, 9)), row(atHour(-1, 9)), row(atHour(-6, 9))], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Oct 30, 2026'])
  })

  it('reads a zoned ISO stamp the same way', () => {
    const groups = groupByViewerDay([{ created_at: atHour(0, 9).toISOString() }, row(atHour(0, 8))], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Today'])
  })

  it('keeps a row with no usable date in its own group, not a NaN header', () => {
    const groups = groupByViewerDay([{ created_at: '' }, { created_at: 'nonsense' }], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Earlier'])
    expect(groups[0].items).toHaveLength(2)
  })
})

describe('dbStampDay', () => {
  it('gives the viewer-local day of a bare D1 stamp', () => {
    expect(dbStampDay(d1Stamp(atHour(0, 23)))).toBe('2026-11-05')
  })
  it('leaves a date-only value on its own day', () => {
    expect(dbStampDay('2026-11-05')).toBe('2026-11-05')
  })
  it('is empty for nothing or nonsense', () => {
    expect(dbStampDay(null)).toBe('')
    expect(dbStampDay('nonsense')).toBe('')
  })
})
