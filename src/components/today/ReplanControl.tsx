// ReplanControl -- the Re-plan button and its status line, shared by This
// week (an answered plan covers today) and Planned today (none does), so a
// week with no plan can still ask for one (2026-11-01, the build's
// BETTER-IDEA, coordinator-approved). One state for both places:
// lib/weekPlan.ts replanButtonState over the latest request row.
//
// The button is pressable exactly when a press can land: the Worker replaces
// every pending row the state reads as "Try again" (api/lib/week-plan-replan.ts
// REPLACEABLE_SQL). If a press is still refused (a 409 replan_pending raced in,
// or any other error), the button stays disabled with the reason shown until
// the request row changes, so it never looks pressable and does nothing.

import { useState } from 'react'
import type { TaskRow } from '../../lib/api'
import { newestWaitingWeekPlan } from '../../lib/taskGrouping'
import { useWeekPlanNow } from '../../hooks/useWeekPlanNow'
import { replanButtonState, useReplan } from '../../lib/weekPlan'

export function useReplanControl(allTasks: readonly TaskRow[], active = true) {
  // active=false: no request, no button (a member's Planned today).
  const replan = useReplan(active)
  const [pressing, setPressing] = useState(false)
  const [refused, setRefused] = useState<{ key: string; text: string } | null>(null)
  const latest = replan.latest
  const key = latest === undefined ? 'unknown' : latest === null ? 'none' : `${latest.id}:${latest.status}:${latest.claimed}`
  const now = useWeekPlanNow(allTasks)
  const button = replanButtonState(latest, newestWaitingWeekPlan(allTasks, now) !== null, replan.error)
  const blocked = refused !== null && refused.key === key
  const enabled = button.enabled && !pressing && !blocked

  const press = async () => {
    setPressing(true)
    const r = await replan.press()
    setPressing(false)
    if (r.ok) { setRefused(null); return }
    setRefused({
      key,
      text: r.pending
        ? 'A re-plan is already queued or running. Its result will show here.'
        : `Not re-planned: ${r.error}`,
    })
  }

  if (!active || replan.forbidden) return { buttonEl: null, noteEl: null }

  const buttonEl = (
    <button
      type="button"
      className={`tk-btn tk-sm${enabled ? '' : ' tk-off'}`}
      data-testid="replan"
      data-state={blocked ? 'refused' : button.kind}
      disabled={!enabled}
      title={(blocked ? refused?.text : button.note) ??'Re-plan today through Sunday from what is still open'}
      onClick={(e) => { e.stopPropagation(); if (enabled) void press() }}
      style={{ marginLeft: 'auto' }}
    >
      {pressing ? 'Asking...' : button.label}
    </button>
  )
  const text = blocked ? refused?.text ?? null : button.note
  const bad = blocked || (button.kind === 'ready' && button.failed) || (button.kind === 'queued' && button.stuck)
  const noteEl = text ? (
    <p className={bad ? 'tk-plan-err' : 'tk-plan-why'} role={blocked ? 'alert' : undefined} data-testid="replan-note" style={{ margin: '0 2px 6px' }}>
      {text}
    </p>
  ) : null
  return { buttonEl, noteEl }
}
