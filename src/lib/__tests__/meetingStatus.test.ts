import { describe, it, expect } from 'vitest'
import { meetingStatus } from '../meetingStatus'
import { localDateKey } from '../dateUtils'

const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return localDateKey(d)
}

describe('meetingStatus', () => {
  it('a past date is completed even though the stored status is always upcoming', () => {
    expect(meetingStatus({ date: day(-3), status: 'upcoming' })).toBe('completed')
  })
  it('a future date with no debrief is upcoming', () => {
    expect(meetingStatus({ date: day(4), status: 'upcoming' })).toBe('upcoming')
  })
  it('a debrief (notes or decisions) means it happened, even today', () => {
    expect(meetingStatus({ date: day(0), status: 'upcoming', notes: 'Summary...' })).toBe('completed')
    expect(meetingStatus({ date: day(0), status: 'upcoming', decisions: '["Anchor on admission"]' })).toBe('completed')
    expect(meetingStatus({ date: day(0), status: 'upcoming', decisions: '[]' })).toBe('upcoming')
  })
  it('trusts a stored completed or in-progress', () => {
    expect(meetingStatus({ date: day(5), status: 'completed' })).toBe('completed')
    expect(meetingStatus({ date: day(5), status: 'in-progress' })).toBe('in-progress')
  })
})
