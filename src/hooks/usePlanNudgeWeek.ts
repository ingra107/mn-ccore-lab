import { useEffect, useMemo, useState } from 'react'
import { planNudgeTargetWeek, planNudgeWeek } from '../lib/weekPlan'
import { nowInstant } from '../lib/time'
import type { TaskRow } from '../lib/api'

// The week the gold "Plan your week" row asks about. Its answer can change with
// no data change, at Sunday 00:00 and 16:00 Chicago, and tasks do not refetch on
// window focus (App.tsx), so a Today tab left open across Sunday afternoon still
// has to show the row. The target is checked each minute; the state is a week
// string, so React bails out and nothing re-renders until the week itself
// changes. An interval rather than a long timeout: a laptop that slept through
// the instant catches up on its next tick.

const CHECK_MS = 60_000

export function usePlanNudgeWeek(tasks: readonly TaskRow[]): string | null {
  const [target, setTarget] = useState(() => planNudgeTargetWeek(nowInstant()))
  useEffect(() => {
    const id = setInterval(() => setTarget(planNudgeTargetWeek(nowInstant())), CHECK_MS)
    return () => clearInterval(id)
  }, [])
  // `target` is the dep that re-reads the clock when the week turns.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => planNudgeWeek(tasks), [tasks, target])
}
