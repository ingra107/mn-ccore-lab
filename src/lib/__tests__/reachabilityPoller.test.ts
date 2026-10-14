import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createReachabilityPoller } from '../reachabilityPoller'

describe('createReachabilityPoller', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  function setup(answers: boolean[]) {
    const focus = new EventTarget()
    const vis = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    let clock = 0
    const poll = vi.fn(async () => (answers.length > 1 ? answers.shift()! : answers[0]))
    const poller = createReachabilityPoller({
      poll, intervalMs: 5000, backoffMs: 45_000, retryGapMs: 10_000, focusTarget: focus, visibilityTarget: vis, now: () => clock,
    })
    return { poller, poll, focus, vis, tick: (ms: number) => { clock += ms } }
  }

  it('polls on the interval while the service answers', async () => {
    const { poller, poll } = setup([true])
    poller.start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(poll).toHaveBeenCalledTimes(3)
    poller.stop()
  })

  it('after a miss it slows to the backoff interval and never stops', async () => {
    const { poller, poll } = setup([false])
    poller.start()
    await vi.advanceTimersByTimeAsync(44_000)
    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000) // 46 s: first slow tick
    expect(poll).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(poll).toHaveBeenCalledTimes(4)
    poller.stop()
  })

  it('finds a server started later, with no focus event at all', async () => {
    const { poller, poll } = setup([false, false, true])
    poller.start()
    await vi.advanceTimersByTimeAsync(46_000) // second miss
    await vi.advanceTimersByTimeAsync(45_000) // answers
    expect(poll).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5000) // back on the fast interval
    expect(poll).toHaveBeenCalledTimes(4)
    poller.stop()
  })

  it('re-probes on focus, no more often than the retry gap', async () => {
    const { poller, poll, focus, tick } = setup([false, true])
    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    focus.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1) // too soon after the first try
    tick(11_000)
    focus.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(2) // answered: fast interval resumes
    await vi.advanceTimersByTimeAsync(5000)
    expect(poll).toHaveBeenCalledTimes(3)
    poller.stop()
  })

  it('ignores a hidden-tab visibility event and stops listening after stop()', async () => {
    const { poller, poll, vis, focus, tick } = setup([false])
    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    tick(11_000)
    vis.visibilityState = 'hidden'
    vis.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1)
    poller.stop()
    vis.visibilityState = 'visible'
    focus.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(100_000)
    expect(poll).toHaveBeenCalledTimes(1)
  })
})
