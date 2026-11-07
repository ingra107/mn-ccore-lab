// Which queries a lab-wide "something changed" refetches. The pulse pill
// (#156) opts out: it is lab-wide, every member's tab holds it, and it keeps
// itself fresh (5 minutes, window focus, and its own writes invalidate it).
import { describe, it, expect, vi } from 'vitest'
import { coalesceCalls, refetchesOnLabChange } from '../realtimeRefetch'

const q = (queryKey: unknown[], meta?: Record<string, unknown>) => ({ queryKey, meta })

describe('coalesceCalls', () => {
  it('runs the first call at once, then once per window however many arrive, and never drops the last', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      const c = coalesceCalls(fn, 5000)
      c.call()
      expect(fn).toHaveBeenCalledTimes(1)
      for (let i = 0; i < 50; i++) c.call()
      expect(fn).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(5000)
      expect(fn).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(5000)
      expect(fn).toHaveBeenCalledTimes(2)
      c.call()
      expect(fn).toHaveBeenCalledTimes(3)
    } finally { vi.useRealTimers() }
  })
  it('cancel drops a pending run', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      const c = coalesceCalls(fn, 5000)
      c.call(); c.call(); c.cancel()
      vi.advanceTimersByTime(20000)
      expect(fn).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})

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
