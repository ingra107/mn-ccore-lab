// Which queries a lab-wide "something changed" refetches. The pulse pill
// (#156) opts out: it is lab-wide, every member's tab holds it, and it keeps
// itself fresh (5 minutes, window focus, and its own writes invalidate it).
import { describe, it, expect } from 'vitest'
import { refetchesOnLabChange } from '../realtimeRefetch'

const q = (queryKey: unknown[], meta?: Record<string, unknown>) => ({ queryKey, meta })

describe('refetchesOnLabChange', () => {
  it('refetches ordinary queries', () => {
    expect(refetchesOnLabChange(q(['tasks']))).toBe(true)
  })
  it('never the version poll itself', () => {
    expect(refetchesOnLabChange(q(['_version']))).toBe(false)
  })
  it('not a query that opts out with meta.labChangeRefetch: false', () => {
    expect(refetchesOnLabChange(q(['pulse'], { labChangeRefetch: false }))).toBe(false)
  })
})
