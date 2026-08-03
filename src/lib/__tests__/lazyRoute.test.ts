// Regression cover for the stale-chunk recovery (2026-08-03).
//
// The bug: a tab left open across a deploy asks for a chunk filename that the
// new build no longer has. Cloudflare Pages answers a missing asset with the
// SPA fallback (200 text/html), the dynamic import rejects, React's lazy()
// caches that rejection, and the error boundary's "Try Again" replays it
// forever. Only a document reload recovers.
//
// These tests pin the two decisions that make the recovery safe: WHICH errors
// count as a stale chunk, and WHEN a second reload is allowed (never inside the
// window, or a genuinely broken chunk becomes a reload loop).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isStaleChunkError, shouldReload, recoverFromStaleChunk } from '../lazyRoute'

describe('isStaleChunkError', () => {
  it('matches the real message from each browser engine', () => {
    // Chrome — this exact string is what Nick's tab reported.
    expect(isStaleChunkError(new Error(
      'Failed to fetch dynamically imported module: https://mn-ccore-lab.pages.dev/assets/ProjectDetail-CtV-H_BT.js',
    ))).toBe(true)
    // Firefox
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true)
    // Safari
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true)
  })

  it('does not swallow unrelated page errors', () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined (reading 'slug')"))).toBe(false)
    expect(isStaleChunkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(false)
    expect(isStaleChunkError(new TypeError('x is not a function'))).toBe(false)
  })

  it('tolerates non-Error throws', () => {
    expect(isStaleChunkError(null)).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
    expect(isStaleChunkError('Failed to fetch dynamically imported module: /assets/x.js')).toBe(true)
  })
})

describe('shouldReload', () => {
  const now = 1_700_000_000_000

  it('allows the first reload of an episode', () => {
    expect(shouldReload(now, null)).toBe(true)
  })

  it('refuses a second reload inside the window — this is the loop guard', () => {
    expect(shouldReload(now, String(now - 1_000))).toBe(false)
    expect(shouldReload(now, String(now - 29_999))).toBe(false)
  })

  it('treats a later deploy as a fresh episode', () => {
    expect(shouldReload(now, String(now - 30_001))).toBe(true)
  })

  it('does not trust a corrupted stored value', () => {
    expect(shouldReload(now, 'not-a-number')).toBe(true)
  })
})

describe('recoverFromStaleChunk', () => {
  let store: Record<string, string>
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = {}
    reload = vi.fn()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
    })
    vi.stubGlobal('window', { location: { reload } })
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('reloads once and records that it did', () => {
    expect(recoverFromStaleChunk()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(Object.keys(store)).toHaveLength(1)
  })

  it('does not reload a second time inside the window', () => {
    expect(recoverFromStaleChunk()).toBe(true)
    expect(recoverFromStaleChunk()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('still recovers when sessionStorage is unavailable', () => {
    // Private mode / blocked cookies: storage throws on both access paths.
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('SecurityError') },
    })
    expect(recoverFromStaleChunk()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
