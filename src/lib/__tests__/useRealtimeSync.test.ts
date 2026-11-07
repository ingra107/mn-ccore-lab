// The real hook with a one-component renderer: refs, memos and effects run in order.
// What it pins (PB #9033): every version change refetches, socket or no socket, and the
// 5 s coalescing neither drops a change nor leaks a timer. S1-S3 are the cold review's
// cases, where a skip of the poll's refetch left a tab stale until the next bump; that
// skip was deleted, and these keep it out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  type Slot = { v?: unknown; deps?: unknown[]; cleanup?: void | (() => void) }
  let slots: Slot[] = []
  let i = 0
  let pending: (() => void)[] = []
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((x, k) => Object.is(x, b[k]))
  const useMemo = <T,>(f: () => T, deps: unknown[]): T => {
    let s = slots[i]
    if (!s || !same(s.deps, deps)) { s = { v: f(), deps }; slots[i] = s }
    i++
    return s.v as T
  }
  const react = {
    useRef: <T,>(v: T) => { const s = slots[i] ?? (slots[i] = { v: { current: v } }); i++; return s.v },
    useMemo,
    useCallback: <T,>(f: T, deps: unknown[]) => useMemo(() => f, deps),
    useEffect: (f: () => void | (() => void), deps: unknown[]) => {
      const k = i++
      const s = slots[k]
      if (!s || !same(s.deps, deps)) {
        pending.push(() => {
          if (s && typeof s.cleanup === 'function') s.cleanup()
          slots[k] = { deps, cleanup: f() }
        })
      }
    },
  }
  const state = { version: undefined as string | undefined, invalidations: 0 }
  const client = { invalidateQueries: (o: { predicate?: unknown }) => { if (o?.predicate) state.invalidations++ } }
  const subs = new Set<(d: unknown) => void>()
  return {
    react, state, client, subs,
    render: (hook: () => void) => { i = 0; hook(); const p = pending; pending = []; p.forEach((x) => x()) },
    unmount: () => { for (const s of slots) if (s && typeof s.cleanup === 'function') s.cleanup(); slots = []; pending = []; i = 0 },
  }
})

vi.mock('react', () => h.react)
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => h.client, useQuery: () => ({ data: h.state.version }) }))
vi.mock('../realtimeBus', () => ({ getRealtimeBus: () => ({ subscribe: (f: (d: unknown) => void) => { h.subs.add(f); return () => h.subs.delete(f) } }) }))

import { useRealtimeSync } from '../../hooks/useRealtimeSync'

class BC { onmessage: unknown = null; postMessage() {} close() {} }

describe('useRealtimeSync', () => {
  const poll = (v: string) => { h.state.version = v; h.render(useRealtimeSync) }
  const socket = () => { for (const s of h.subs) s({ type: 'data', timestamp: 1 }) }
  const settle = () => vi.advanceTimersByTime(6000)
  const refetchesDuring = (f: () => void) => { const b = h.state.invalidations; f(); settle(); return h.state.invalidations - b }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('BroadcastChannel', BC)
    h.state.version = undefined
    h.state.invalidations = 0
    h.subs.clear()
    h.render(useRealtimeSync)
    poll('1000')
  })
  afterEach(() => { h.unmount(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('S1 lid closed: socket for A, then a wake poll with later writes refetches', () => {
    socket(); settle()
    expect(refetchesDuring(() => poll('9000'))).toBe(1)
  })
  it('S2 lost notify: A delivered, B only reaches the poll, B refetches', () => {
    socket(); settle()
    expect(refetchesDuring(() => poll('3000'))).toBe(1)
  })
  it('S3 poll beat the socket for A, an hour later a write only the poll carries refetches', () => {
    poll('2000'); settle()
    socket(); settle()
    vi.advanceTimersByTime(3_600_000)
    expect(refetchesDuring(() => poll('3000'))).toBe(1)
  })
  it('one write seen by socket then poll, apart, refetches twice, as at HEAD', () => {
    expect(refetchesDuring(() => socket())).toBe(1)
    expect(refetchesDuring(() => poll('2000'))).toBe(1)
  })
  it('socket then poll inside one window: the poll still refetches, after the window', () => {
    socket()
    expect(h.state.invalidations).toBe(1)
    vi.advanceTimersByTime(1000)
    poll('2000')
    expect(h.state.invalidations).toBe(1)
    vi.advanceTimersByTime(4000)
    expect(h.state.invalidations).toBe(2)
  })
  it('a change inside the trailing run\'s window also refetches after it', () => {
    socket(); socket()
    vi.advanceTimersByTime(5000)
    expect(h.state.invalidations).toBe(2)
    vi.advanceTimersByTime(1000)
    poll('2000')
    expect(h.state.invalidations).toBe(2)
    vi.advanceTimersByTime(4000)
    expect(h.state.invalidations).toBe(3)
  })
  it('unmount with a run pending leaves no timer and no later refetch', () => {
    socket(); socket()
    h.unmount()
    const before = h.state.invalidations
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(20000)
    expect(h.state.invalidations).toBe(before)
    h.render(useRealtimeSync)
  })
  it('no socket at all: every version change refetches', () => {
    let n = 0
    for (const v of ['2000', '3000', '4000']) n += refetchesDuring(() => poll(v))
    expect(n).toBe(3)
  })
  it('50 socket messages in 5 s are at most two refetches', () => {
    for (let i = 0; i < 50; i++) { socket(); vi.advanceTimersByTime(100) }
    settle()
    expect(h.state.invalidations).toBe(2)
  })
})
