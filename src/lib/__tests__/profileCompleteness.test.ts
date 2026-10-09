import { describe, it, expect } from 'vitest'
import { missingProfileFields, isSnoozed, snoozeKey } from '../profileCompleteness'

describe('missingProfileFields', () => {
  it('a full profile is complete', () => {
    expect(missingProfileFields({ title: 'Fellow', bio: 'Hi', photo_url: 'https://x/y.jpg' })).toEqual([])
  })

  it('names each empty required field, treating blank and null as empty', () => {
    expect(missingProfileFields({ title: '  ', bio: null, photo_url: 'https://x/y.jpg' })).toEqual(['title', 'bio'])
    expect(missingProfileFields({})).toEqual(['title', 'bio', 'photo_url'])
  })

  it('credentials, department and Scholar id are not required', () => {
    expect(missingProfileFields({ title: 'RA', bio: 'b', photo_url: 'p', credentials: '', department: '', scholar_id: '' })).toEqual([])
  })

  it('no row (not loaded, not provisioned) asks for nothing', () => {
    expect(missingProfileFields(undefined)).toEqual([])
  })
})

describe('snooze', () => {
  it('holds until the stored day, then lapses', () => {
    expect(isSnoozed('2026-10-10', '2026-10-09')).toBe(true)
    expect(isSnoozed('2026-10-10', '2026-10-10')).toBe(false)
    expect(isSnoozed(null, '2026-10-09')).toBe(false)
    expect(isSnoozed('garbage', '2026-10-09')).toBe(false)
  })

  it('is keyed per person', () => {
    expect(snoozeKey('casey-eddington')).not.toBe(snoozeKey('nick-ingraham'))
  })
})
