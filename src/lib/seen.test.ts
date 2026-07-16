import { describe, it, expect } from 'vitest'
import { isMeetingUnseenWithinCap, MEETING_UNSEEN_RECENCY_CAP_DAYS } from './seen'

describe('isMeetingUnseenWithinCap', () => {
  const NOW = new Date('2026-07-16T12:00:00Z').getTime()

  it('keeps the badge for a meeting updated today', () => {
    expect(isMeetingUnseenWithinCap('2026-07-16T08:00:00Z', NOW)).toBe(true)
  })

  it('keeps the badge exactly at the cap boundary', () => {
    const atCap = NOW - MEETING_UNSEEN_RECENCY_CAP_DAYS * 86400000
    expect(isMeetingUnseenWithinCap(new Date(atCap).toISOString(), NOW)).toBe(true)
  })

  it('drops the badge just past the cap boundary (the cold-start flood case)', () => {
    const pastCap = NOW - (MEETING_UNSEEN_RECENCY_CAP_DAYS * 86400000 + 1000)
    expect(isMeetingUnseenWithinCap(new Date(pastCap).toISOString(), NOW)).toBe(false)
  })

  it('drops the badge for an ancient pre-T12 meeting', () => {
    expect(isMeetingUnseenWithinCap('2026-01-01T00:00:00Z', NOW)).toBe(false)
  })

  it('fails closed (no badge) on null/undefined/invalid timestamps rather than throwing', () => {
    expect(isMeetingUnseenWithinCap(null, NOW)).toBe(false)
    expect(isMeetingUnseenWithinCap(undefined, NOW)).toBe(false)
    expect(isMeetingUnseenWithinCap('not-a-date', NOW)).toBe(false)
    expect(isMeetingUnseenWithinCap('', NOW)).toBe(false)
  })
})
