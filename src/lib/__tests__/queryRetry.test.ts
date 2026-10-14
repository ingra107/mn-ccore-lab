import { describe, it, expect } from 'vitest'
import { shouldRetryQuery, errorStatus } from '../queryRetry'

describe('shouldRetryQuery', () => {
  it('never retries a 4xx, from either error shape', () => {
    expect(shouldRetryQuery(0, Object.assign(new Error('nope'), { status: 404 }))).toBe(false)
    expect(shouldRetryQuery(0, new Error('fetch failed: 403 /api/projects/x/updates'))).toBe(false)
    expect(shouldRetryQuery(0, Object.assign(new Error('x'), { status: 401 }))).toBe(false)
  })
  it('retries 408, 429, 5xx and network errors, up to 3 times', () => {
    expect(shouldRetryQuery(0, Object.assign(new Error('x'), { status: 429 }))).toBe(true)
    expect(shouldRetryQuery(1, new Error('fetch failed: 503 /api/x'))).toBe(true)
    expect(shouldRetryQuery(2, new TypeError('Failed to fetch'))).toBe(true)
    expect(shouldRetryQuery(3, new TypeError('Failed to fetch'))).toBe(false)
  })
  it('does not read a 3-digit number out of an unrelated message', () => {
    expect(errorStatus(new Error('timeout after 404 ms'))).toBeNull()
  })
})
