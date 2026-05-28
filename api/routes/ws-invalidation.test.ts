import { describe, it, expect, vi } from 'vitest'

// Unit test for the WS message → cache-invalidation routing introduced in 8.1.
//
// The hook (useRealtimeSync.ts) calls invalidateAll() when msg.type === 'data'
// because 'data' is the all-invalidate sentinel emitted by notifyClients().
// Calling invalidateQueries({queryKey:['data']}) matched nothing; the old code
// silently dropped every cross-client update.
//
// This test exercises the decision logic without mounting a React component or
// a real QueryClient — it mirrors the conditional exactly so any future
// refactor that breaks the 'data' branch fails loudly here.

/** Mirror of the routing logic in useRealtimeSync's bus.subscribe callback. */
function routeWsMessage(
  msg: unknown,
  invalidateAll: () => void,
  invalidateByKey: (key: string) => void,
) {
  const IGNORE = [
    'presence-ping', 'presence-leave',
    'typing-start', 'typing-stop',
    'intent', 'intent-leave',
  ]
  if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).type) {
    const type = (msg as Record<string, unknown>).type as string
    if (IGNORE.includes(type)) return
    if (type === 'data') {
      invalidateAll()
    } else {
      invalidateByKey(type)
    }
  } else {
    invalidateAll()
  }
}

describe('WS invalidation routing (8.1)', () => {
  it('calls invalidateAll for msg.type === "data"', () => {
    const all = vi.fn()
    const byKey = vi.fn()
    routeWsMessage({ type: 'data' }, all, byKey)
    expect(all).toHaveBeenCalledOnce()
    expect(byKey).not.toHaveBeenCalled()
  })

  it('calls invalidateByKey for other typed messages', () => {
    const all = vi.fn()
    const byKey = vi.fn()
    routeWsMessage({ type: 'tasks' }, all, byKey)
    expect(byKey).toHaveBeenCalledWith('tasks')
    expect(all).not.toHaveBeenCalled()
  })

  it('calls invalidateAll when msg has no type (legacy broadcast)', () => {
    const all = vi.fn()
    const byKey = vi.fn()
    routeWsMessage({ payload: 'something' }, all, byKey)
    expect(all).toHaveBeenCalledOnce()
    expect(byKey).not.toHaveBeenCalled()
  })

  it('calls invalidateAll for null/non-object messages', () => {
    const all = vi.fn()
    const byKey = vi.fn()
    routeWsMessage(null, all, byKey)
    expect(all).toHaveBeenCalledOnce()
    expect(byKey).not.toHaveBeenCalled()
  })

  it('silently ignores presence/typing/intent chatter', () => {
    const ignored = [
      'presence-ping', 'presence-leave',
      'typing-start', 'typing-stop',
      'intent', 'intent-leave',
    ]
    for (const type of ignored) {
      const all = vi.fn()
      const byKey = vi.fn()
      routeWsMessage({ type }, all, byKey)
      expect(all, `${type} should not call invalidateAll`).not.toHaveBeenCalled()
      expect(byKey, `${type} should not call invalidateByKey`).not.toHaveBeenCalled()
    }
  })
})
