import { useEffect, useState } from 'react'
import { nextWeekPlanExpiry } from '../lib/taskGrouping'
import { nowInstant } from '../lib/time'
import type { TaskRow } from '../lib/api'

// The clock newestWaitingWeekPlan reads (Re-plan, 2026-11-01). Its answer can
// change with no data change: an offer stops asking at its expires_at, when
// the Worker starts refusing it (question_expired). Tasks do not refetch on
// window focus (App.tsx), so a Today tab left open across Monday 00:00 would
// keep the gold "Plan your week" row and its count. This returns a `now` that
// moves just past the next live offer's expires_at, so every caller (the
// card, its count, Re-plan) re-renders then. Use it as the nowIso argument and
// as a memo dependency.

/** setTimeout's largest delay (2^31 - 1 ms, about 24.8 days); a longer one
 *  fires at once. A far expiry re-arms after this many ms. */
export const MAX_TIMEOUT_MS = 2_147_483_647

export function useWeekPlanNow(tasks: readonly TaskRow[]): string {
  const [now, setNow] = useState<string>(() => nowInstant())
  const next = nextWeekPlanExpiry(tasks, now)
  useEffect(() => {
    if (next === null) return
    const delay = Math.min(Math.max(0, next - Date.now()), MAX_TIMEOUT_MS)
    const id = setTimeout(() => setNow(nowInstant()), delay)
    return () => clearTimeout(id)
  }, [next, now])
  return now
}
