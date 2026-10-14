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
      poll, intervalMs: 5000, retryGapMs: 60_000, focusTarget: focus, visibilityTarget: vis, now: () => clock,
    })
    return { poller, poll, focus, vis, tick: (ms: number) => { clock += ms } }
  }

  it('keeps polling on the interval while the service answers', async () => {
    const { poller, poll } = setup([true])
    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(poll).toHaveBeenCalledTimes(3)
    poller.stop()
  })

  it('stops after the first unanswered poll', async () => {
    const { poller, poll } = setup([false])
    poller.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(poll).toHaveBeenCalledTimes(1)
    poller.stop()
  })

  it('retries on focus, no more often than the retry gap', async () => {
    const { poller, poll, focus, tick } = setup([false, false, true])
    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    focus.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1) // too soon after the first try
    tick(61_000)
    focus.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(2) // retried, still down
    tick(61_000)
    focus.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(3) // answered: interval resumes
    await vi.advanceTimersByTimeAsync(5000)
    expect(poll).toHaveBeenCalledTimes(4)
    poller.stop()
  })

  it('ignores a hidden-tab visibility event and stops listening after stop()', async () => {
    const { poller, poll, vis, focus, tick } = setup([false])
    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    tick(61_000)
    vis.visibilityState = 'hidden'
    vis.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1)
    poller.stop()
    vis.visibilityState = 'visible'
    focus.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1)
  })
})
