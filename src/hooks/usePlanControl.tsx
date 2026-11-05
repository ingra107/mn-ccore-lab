// usePlanControl -- the Plan button and its status line (components/today/PlanButton.tsx
// renders them). Starts a live week-planning session (the week-plan-session
// skill in Peripheral Brain) through the same Quick Chat launch as @quickchat:
// executeLaunchCommand posts /api/launch-log, then fires the URI on a computer
// or queues for the home laptop on a phone.
//
// PI only, like POST /api/launch-log: a member, or a viewer whose PI status is
// not known yet, gets nothing, and no request is made.
//
// State comes from the newest launch row carrying PLAN_SEED
// (lib/planLaunch.ts), polled every 30s while queued and not otherwise. A
// second press while queued does nothing.

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuth } from './useAuth'
import { useRunLaunch } from './useLaunchCommands'
import { PLAN_SEED, newestPlanRow, planButtonState, type LaunchRow } from '../lib/planLaunch'
import { nowInstant, parseDbUtc } from '../lib/time'

const PLAN_KEY = ['launch-log', 'plan'] as const
const POLL_MS = 30_000

/** `weekPlanned`: the week a press would plan already has a plan, so the button
 *  reads Replan rather than Plan week (lib/planLaunch.ts). */
export function usePlanControl({ weekPlanned = false }: { weekPlanned?: boolean } = {}) {
  // The owner only, as usePlanRowWeek: plan rows are assigned to him, so another PI's
  // list never holds one and the button would read Plan week forever.
  const { isPi, piResolved, canShowAllProjects } = useAuth().user
  const active = isPi && piResolved && canShowAllProjects
  const qc = useQueryClient()
  const run = useRunLaunch()
  const q = useQuery({
    queryKey: PLAN_KEY,
    queryFn: async () => newestPlanRow((await fetchApi<LaunchRow[]>('/api/launch-log')).data),
    enabled: active,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const d = query.state.data
      return d && planButtonState(d, nowInstant()).kind === 'queued' ? POLL_MS : false
    },
  })
  const row = q.data ?? null
  const [now, setNow] = useState(() => nowInstant())
  const [pressing, setPressing] = useState(false)

  // A queued row expires with no refetch and no data change: wake once at
  // expires_at so the button turns to "Plan again" on time.
  const expiresAt = row && row.status === 'pending' ? row.expires_at : null
  useEffect(() => {
    if (!expiresAt) return
    const wait = parseDbUtc(expiresAt).getTime() - new Date(nowInstant()).getTime()
    // Already past: re-read the clock on the next tick (a stale `now` would
    // still read Queued); otherwise wake just after expires_at.
    const id = setTimeout(() => setNow(nowInstant()), wait > 0 ? wait + 500 : 0)
    return () => clearTimeout(id)
  }, [expiresAt, row?.id])

  if (!active) return { buttonEl: null, noteEl: null }

  const state = planButtonState(row, now, weekPlanned)
  // isLoadingError: the read failed and there is no row in hand, so a queued
  // launch could be hiding behind it. A failed background refetch with a row
  // already read keeps that row (isError would drop it).
  const unreadable = q.isLoadingError
  const enabled = !q.isPending && !unreadable && state.kind !== 'queued' && !pressing

  const press = async () => {
    if (!enabled) return
    setPressing(true)
    await run({ tag: 'quickchat', seed: PLAN_SEED }, {})
    setPressing(false)
    await qc.invalidateQueries({ queryKey: PLAN_KEY })
  }

  const buttonEl = (
    <button
      type="button"
      className={`tk-btn tk-sm${enabled ? '' : ' tk-off'}`}
      data-testid="plan-button"
      data-state={unreadable ? 'unreadable' : state.kind}
      disabled={!enabled}
      data-tip={state.note || unreadable ? undefined : `${weekPlanned ? 'Replan' : 'Plan'} the week with Claude, live`}
      onClick={(e) => { e.stopPropagation(); void press() }}
      style={{ marginLeft: 'auto' }}
    >
      {pressing ? 'Starting...' : state.label}
    </button>
  )
  const noteEl = unreadable ? (
    <p className="tk-plan-err" role="alert" data-testid="plan-note" style={{ margin: '0 2px 6px' }}>
      Couldn't check the last plan request.{' '}
      <button
        type="button"
        data-testid="plan-retry"
        className="tk-plan-retry"
        onClick={(e) => { e.stopPropagation(); void q.refetch() }}
      >
        Try again
      </button>
    </p>
  ) : state.note ? (
    <p
      className={state.kind === 'queued' ? 'tk-plan-why' : 'tk-plan-err'}
      role={state.kind === 'queued' ? undefined : 'alert'}
      data-testid="plan-note"
      style={{ margin: '0 2px 6px' }}
    >
      {state.note}
    </p>
  ) : null
  return { buttonEl, noteEl }
}

