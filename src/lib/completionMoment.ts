// completionMoment — the completion moment (color-back pick 5, Nick 2026-10-11).
//
// The box fills teal the instant a task is ticked (optimistic UI, rule 8). The
// MOMENT -- a fading ring on the box, "done this week" counting up and its rule
// lighting for a beat -- fires only once the Hub has ACCEPTED the write. Teal
// means progress, and progress that has not landed is not progress yet.
//
// One store, fed from the three task-completion mutations in
// hooks/mutations/useTaskMutations.ts (status, update, bulk): onMutate calls
// beginCompletion, onSuccess settleCompletion(..., true), onError
// settleCompletion(..., false). Every surface that completes a task goes
// through one of those three hooks, so the moment fires wherever a task is
// completed without any surface wiring it.
//
// Under prefers-reduced-motion the moment is instant: no ring, the count jumps.

import { useEffect, useState, useSyncExternalStore } from 'react'

interface Snapshot {
  /** Completions sent to the Hub and not yet answered. */
  pending: ReadonlySet<string>
  /** Pending, plus accepted within the last beat: a list that drops done rows
   *  keeps these in place (sunk, box filled) so the moment has somewhere to play. */
  settling: ReadonlySet<string>
  /** Bumped once per accepted completion. */
  seq: number
}

const pending = new Set<string>()
/** Accepted within the last LINGER_MS. */
const lingering = new Set<string>()
/** id -> when the Hub accepted its completion (performance.now ms) and the seq it got. */
const confirmed = new Map<string, { seq: number; at: number }>()
let seq = 0
let snapshot: Snapshot = { pending: new Set(), settling: new Set(), seq: 0 }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { pending: new Set(pending), settling: new Set([...pending, ...lingering]), seq }
  listeners.forEach((l) => l())
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** A completion was sent to the Hub. */
export function beginCompletion(ids: readonly string[]) {
  if (ids.length === 0) return
  ids.forEach((id) => pending.add(id))
  emit()
}

/** The Hub answered. `accepted` false = the write failed and the cache rolls back. */
export function settleCompletion(ids: readonly string[], accepted: boolean) {
  if (ids.length === 0) return
  for (const id of ids) {
    pending.delete(id)
    if (accepted) {
      seq += 1
      confirmed.set(id, { seq, at: now() })
      lingering.add(id)
      setTimeout(() => { if (lingering.delete(id)) emit() }, LINGER_MS)
    }
  }
  emit()
}

/**
 * Settle a batch write (POST /api/tasks/batch). That route answers HTTP 200
 * even when it refuses some ids: `{ data: { applied: [...], failed: [...] } }`.
 * Only ids in `applied` are accepted; every other id sent is settled as a
 * failure. A response without an `applied` list accepts nothing.
 */
export function settleBatchCompletion(sent: readonly string[], response: unknown) {
  if (sent.length === 0) return
  const applied = (response as { data?: { applied?: unknown } } | null | undefined)?.data?.applied
  const ok = new Set(Array.isArray(applied) ? applied.filter((x): x is string => typeof x === 'string') : [])
  settleCompletion(sent.filter((id) => ok.has(id)), true)
  settleCompletion(sent.filter((id) => !ok.has(id)), false)
}

/** How long an accepted completion stays "settling": the ring's length plus a
 *  short rest so the filled box is seen before the row leaves. */
const LINGER_MS = 1100

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const getSnapshot = () => snapshot

export function useCompletionMoments(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const RING_MS = 600

/** A completion accepted within the last beat, not yet seen by this box. */
function freshAcceptance(taskId: string | undefined, seen: number | undefined): number | null {
  if (!taskId || !lingering.has(taskId)) return null
  const c = confirmed.get(taskId)
  return c && c.seq !== seen ? c.seq : null
}

/**
 * True for one beat after the Hub accepts THIS task's completion. The box uses
 * it to play the fading ring. A box that mounts just after the acceptance (Today
 * re-renders the sunk card) still gets it. Never true under reduced motion.
 */
export function useCompletionRing(taskId: string | undefined): boolean {
  const { seq: storeSeq } = useCompletionMoments()
  const [st, setSt] = useState(() => {
    const ring = prefersReducedMotion() ? null : freshAcceptance(taskId, undefined)
    return { storeSeq, taskId, seen: taskId ? confirmed.get(taskId)?.seq : undefined, ring }
  })

  // Adjust state during render when the store or the box's task changes.
  if (st.storeSeq !== storeSeq || st.taskId !== taskId) {
    const fresh = freshAcceptance(taskId, st.taskId === taskId ? st.seen : undefined)
    setSt({
      storeSeq,
      taskId,
      seen: taskId ? confirmed.get(taskId)?.seq : undefined,
      ring: fresh != null && !prefersReducedMotion() ? fresh : st.ring,
    })
  }

  useEffect(() => {
    if (st.ring == null) return
    const t = setTimeout(() => setSt((s) => ({ ...s, ring: null })), RING_MS)
    return () => clearTimeout(t)
  }, [st.ring])

  return st.ring != null
}

const COUNT_MS = 420
const BEAT_MS = 900

/**
 * A count that moves up only on an accepted completion: it eases from the old
 * value to the new one and reports `beat` for about a second so the stat's rule
 * can light. Any other change (first load, a reopen, a refetch) just shows the
 * new value. Reduced motion: the value jumps and nothing lights.
 */
export function useConfirmedCount(value: number): { display: number; beat: boolean } {
  const { seq: storeSeq } = useCompletionMoments()
  const [prev, setPrev] = useState({ value, seq: storeSeq })
  const [anim, setAnim] = useState<{ from: number; to: number; key: number } | null>(null)
  const [shown, setShown] = useState<{ key: number; n: number } | null>(null)

  // Adjust state during render when the inputs change (no effect round-trip).
  if (prev.value !== value || prev.seq !== storeSeq) {
    setPrev({ value, seq: storeSeq })
    if (value > prev.value && storeSeq !== prev.seq && !prefersReducedMotion()) {
      setAnim({ from: prev.value, to: value, key: storeSeq })
    } else if (anim) {
      setAnim(null)
    }
  }

  useEffect(() => {
    if (!anim) return
    let raf = 0
    const start = now()
    const step = () => {
      const p = Math.min((now() - start) / COUNT_MS, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown({ key: anim.key, n: Math.round(anim.from + (anim.to - anim.from) * eased) })
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const done = setTimeout(() => setAnim(null), BEAT_MS)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [anim])

  if (!anim) return { display: value, beat: false }
  const n = shown && shown.key === anim.key ? shown.n : anim.from
  return { display: n, beat: true }
}

/** Test-only: forget every pending and confirmed completion. */
export function __resetCompletionMoments() {
  pending.clear()
  lingering.clear()
  confirmed.clear()
  seq = 0
  emit()
}
