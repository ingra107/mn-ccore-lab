// A poller for a service that may not be running (the local pomodoro server).
//
// While the service answers, poll on an interval. After the first unanswered
// poll, stop: a dead localhost call costs a console CORS error and a request
// on every tick, on every page view, for as long as the tab is open. Try again
// only when the user comes back to the tab (focus / visible), and no more often
// than `retryGapMs`.

export interface ReachabilityPollerOptions {
  /** One probe. Resolves true when the service answered, false when it did not. */
  poll: () => Promise<boolean>
  /** Gap between polls while the service answers. */
  intervalMs: number
  /** Least gap between retries after it stopped answering. */
  retryGapMs: number
  /** Where focus and visibility events come from. Default: window / document. */
  focusTarget?: EventTarget
  visibilityTarget?: EventTarget & { visibilityState?: string }
  now?: () => number
}

export interface ReachabilityPoller {
  start: () => void
  stop: () => void
  /** Probe now (after a start/stop action), whatever state the poller is in. */
  probe: () => Promise<boolean>
}

export function createReachabilityPoller(opts: ReachabilityPollerOptions): ReachabilityPoller {
  const now = opts.now ?? Date.now
  const focusTarget = opts.focusTarget ?? (typeof window !== 'undefined' ? window : undefined)
  const visibilityTarget = opts.visibilityTarget ?? (typeof document !== 'undefined' ? document : undefined)
  let timer: ReturnType<typeof setInterval> | null = null
  let running = false
  let lastAttempt = -Infinity

  const clearTimer = () => {
    if (timer !== null) { clearInterval(timer); timer = null }
  }

  const probe = async (): Promise<boolean> => {
    lastAttempt = now()
    const ok = await opts.poll()
    if (!running) return ok
    if (ok) {
      if (timer === null) timer = setInterval(() => { void probe() }, opts.intervalMs)
    } else {
      clearTimer()
    }
    return ok
  }

  const onReturn = () => {
    if (!running || timer !== null) return
    if (visibilityTarget?.visibilityState === 'hidden') return
    if (now() - lastAttempt < opts.retryGapMs) return
    void probe()
  }

  return {
    start() {
      if (running) return
      running = true
      focusTarget?.addEventListener('focus', onReturn)
      visibilityTarget?.addEventListener('visibilitychange', onReturn)
      void probe()
    },
    stop() {
      running = false
      clearTimer()
      focusTarget?.removeEventListener('focus', onReturn)
      visibilityTarget?.removeEventListener('visibilitychange', onReturn)
    },
    probe,
  }
}
