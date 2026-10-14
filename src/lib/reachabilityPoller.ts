// A poller for a service that may not be running (the local pomodoro server).
//
// While the service answers, poll on `intervalMs`. After a miss, poll on the
// slow `backoffMs` instead: a dead localhost call costs a console CORS error
// and a request, so it must not run every few seconds, but it must not stop
// either, or starting the server later would leave the control disabled on a
// tab that never loses focus. A tab that regains focus or becomes visible
// re-probes at once (no more often than `retryGapMs`).

export interface ReachabilityPollerOptions {
  /** One probe. Resolves true when the service answered, false when it did not. */
  poll: () => Promise<boolean>
  /** Gap between polls while the service answers. */
  intervalMs: number
  /** Slow gap between polls while it is not answering. */
  backoffMs: number
  /** Least gap between focus/visibility re-probes while it is not answering. */
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
  let timerMs = 0
  let running = false
  let lastAttempt = -Infinity
  let up = true

  const setPeriod = (ms: number) => {
    if (timer !== null && timerMs === ms) return
    if (timer !== null) clearInterval(timer)
    timerMs = ms
    timer = setInterval(() => { void probe() }, ms)
  }

  const probe = async (): Promise<boolean> => {
    lastAttempt = now()
    const ok = await opts.poll()
    if (!running) return ok
    up = ok
    setPeriod(ok ? opts.intervalMs : opts.backoffMs)
    return ok
  }

  const onReturn = () => {
    if (!running || up) return
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
      if (timer !== null) { clearInterval(timer); timer = null }
      focusTarget?.removeEventListener('focus', onReturn)
      visibilityTarget?.removeEventListener('visibilitychange', onReturn)
    },
    probe,
  }
}
