// realtimeRefetch.ts -- which queries a lab-wide "something changed" signal
// refetches (useRealtimeSync's invalidateAll). Every query but the version
// poll itself, unless it opts out with `meta: { labChangeRefetch: false }`:
// a query that is lab-wide, mounted in every tab and fresh on its own terms
// (the #156 pulse pill) would otherwise re-run its counts in every member's
// tab on every write anywhere in the lab.
/**
 * How often one tab may run the lab-wide refetch. Every write anywhere fires it,
 * and one refetch on the Dashboard is dozens of queries; a PB run of 50 writes
 * used to mean 50 of them, and D1 rate limits on 10-second windows of resource
 * use (PB #9033).
 */
export const LAB_REFETCH_WINDOW_MS = 5_000

/**
 * The first call runs at once; calls inside the window that follows collapse to
 * one run when it ends, so the last change is never missed.
 */
export function coalesceCalls(fn: () => void, windowMs: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  const open = () => {
    timer = setTimeout(() => {
      timer = null
      if (pending) {
        pending = false
        fn()
        open()
      }
    }, windowMs)
  }
  return {
    call: () => {
      if (timer !== null) { pending = true; return }
      fn()
      open()
    },
    cancel: () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending = false
    },
  }
}

export function refetchesOnLabChange(query: { queryKey: readonly unknown[]; meta?: Record<string, unknown> }): boolean {
  if (query.queryKey[0] === '_version') return false
  return query.meta?.labChangeRefetch !== false
}
