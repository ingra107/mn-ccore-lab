import { describe, it, expect } from 'vitest'
import { soleCachedMember } from '../../hooks/useAuth'

function store(entries: Record<string, string>) {
  const keys = Object.keys(entries)
  return {
    get length() { return keys.length },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => entries[k] ?? null,
  }
}

describe('soleCachedMember', () => {
  it('returns the one member this device has cached', () => {
    expect(soleCachedMember(store({
      'hub:auth-slug:ingra107@umn.edu': 'nick-ingraham',
      'hub:auth-directory': '[]',
      'mn-ccore-theme': 'dark',
    }))).toEqual({ email: 'ingra107@umn.edu', slug: 'nick-ingraham' })
  })
  it('returns null when nobody is cached', () => {
    expect(soleCachedMember(store({ 'hub:auth-directory': '[]' }))).toBeNull()
  })
  it('returns null when two members are cached (cannot tell who is signed in)', () => {
    expect(soleCachedMember(store({
      'hub:auth-slug:a@umn.edu': 'a-one',
      'hub:auth-slug:b@umn.edu': 'b-two',
    }))).toBeNull()
  })
  it('ignores an entry with an empty slug and survives no storage', () => {
    expect(soleCachedMember(store({ 'hub:auth-slug:a@umn.edu': '' }))).toBeNull()
    expect(soleCachedMember(null)).toBeNull()
  })
})
