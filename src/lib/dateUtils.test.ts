import { describe, it, expect } from 'vitest'
import { localDateKey } from './dateUtils'

describe('localDateKey', () => {
  it('returns YYYY-MM-DD built from local getters, not the UTC ISO date', () => {
    // A local-time evening timestamp. In any timezone west of UTC, the UTC
    // calendar date is already "tomorrow" — toISOString() would roll forward.
    // localDateKey must report the LOCAL calendar day instead.
    const evening = new Date(2026, 4, 22, 23, 30, 0) // 2026-05-22 23:30 local
    const expected = `${evening.getFullYear()}-${String(evening.getMonth() + 1).padStart(2, '0')}-${String(evening.getDate()).padStart(2, '0')}`
    expect(localDateKey(evening)).toBe(expected)
    expect(localDateKey(evening)).toBe('2026-05-22')
  })

  it('does NOT roll forward to the UTC date for a timezone where UTC has already advanced', () => {
    // Construct a moment that is local-evening but UTC-next-day whenever the
    // runtime's offset is negative (Americas). Where that's true, the UTC slice
    // differs from the local key; localDateKey must follow LOCAL.
    const evening = new Date(2026, 4, 22, 23, 30, 0)
    const utcKey = evening.toISOString().split('T')[0]
    const localKey = localDateKey(evening)
    if (evening.getTimezoneOffset() > 0) {
      // Behind UTC (e.g. US Central) — UTC slice has already rolled to the 23rd.
      expect(utcKey).not.toBe(localKey)
    }
    // localKey always matches the local calendar day regardless of TZ.
    expect(localKey).toBe('2026-05-22')
  })

  it('defaults to now and matches manual local formatting', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(localDateKey()).toBe(expected)
  })
})
