import { useAuth } from './useAuth'
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

/**
 * The week the gold Plan your week row asks about, null when no row shows. Planning is
 * the owner's alone and the plan rows are assigned to him, so another PI's list could
 * never show a plan and the row would never clear. canShowAllProjects is the server's
 * isSiteAdmin, the identity PACKET_OWNER uses (api/index.ts). isPi && piResolved is the
 * Plan button's own gate (hooks/usePlanControl.tsx), so the row never shows without its
 * button. `listIsOwn`: no plan row in a list means "not planned" only when the list is
 * the viewer's own and it loaded.
 */
export function usePlanRowWeek(tasks: readonly TaskRow[], listIsOwn: boolean): string | null {
  const { isPi, piResolved, canShowAllProjects } = useAuth().user
  const week = usePlanNudgeWeek(tasks)
  return listIsOwn && isPi && piResolved && canShowAllProjects ? week : null
}
