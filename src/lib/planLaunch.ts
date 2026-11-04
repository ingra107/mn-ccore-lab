// The Plan button's state, read from launch_log (api/routes/launch-log.ts).
//
// Pressing Plan posts a Quick Chat launch whose seed names the
// week-plan-session skill. A queued launch (a phone, or "send to home") waits
// for the home laptop; the daemon never writes status 'expired', so a pending
// row that outlives expires_at is judged here and the button offers a second
// press. Timestamps are SQLite datetime('now'): bare UTC, parsed by parseDbUtc.

import { parseDbUtc } from './time'

/** Stored raw by POST /api/launch-log (which trims it), and matched against
 *  the stored row, so it must stay trimmed. It must not start with '/': the
 *  claim prepends a page header. */
export const PLAN_SEED = 'Use the week-plan-session skill to plan with me.'

export interface LaunchRow {
  id: string
  tag: string
  seed: string
  origin: string
  status: string
  created_at: string
  expires_at: string | null
}

export interface PlanButtonState {
  kind: 'ready' | 'queued' | 'failed' | 'expired'
  label: string
  note: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The newest launch row that carries the plan seed, or null. Reads created_at
 *  rather than trusting the order the rows arrive in. */
export function newestPlanRow(rows: readonly LaunchRow[]): LaunchRow | null {
  let best: LaunchRow | null = null
  for (const r of rows) {
    if (r.tag !== 'quickchat' || r.seed !== PLAN_SEED) continue
    if (best === null || parseDbUtc(r.created_at).getTime() > parseDbUtc(best.created_at).getTime()) best = r
  }
  return best
}

const READY: PlanButtonState = { kind: 'ready', label: 'Plan', note: null }

/** `now` is an ISO instant (time.ts nowInstant). */
export function planButtonState(row: LaunchRow | null, now: string): PlanButtonState {
  if (row === null) return READY
  const t = new Date(now).getTime()
  const mobile = row.origin === 'mobile'
  if (row.status === 'failed') {
    // A failure from days ago is not news.
    if (t - parseDbUtc(row.created_at).getTime() > DAY_MS) return READY
    return { kind: 'failed', label: 'Plan again', note: 'The last plan session failed to start. Press Plan to try again.' }
  }
  if (row.status === 'expired') {
    if (t - parseDbUtc(row.created_at).getTime() > DAY_MS) return READY
    return expired(mobile)
  }
  if (row.status !== 'pending') {
    // launched or completed: a computer launch opens its session at once, and a
    // claimed phone launch is already running.
    return READY
  }
  const expires = parseDbUtc(row.expires_at).getTime()
  // An unreadable expires_at is treated as past: never a button stuck on Queued.
  if (Number.isNaN(expires) || t >= expires) return expired(mobile)
  return {
    kind: 'queued',
    label: 'Queued',
    note: mobile ? 'Queued on your home laptop. It starts when that laptop is on.' : 'Starting on this computer. It should open in a moment.',
  }
}

function expired(mobile: boolean): PlanButtonState {
  return {
    kind: 'expired',
    label: 'Plan again',
    note: mobile
      ? 'The last request expired before your home laptop picked it up. Press Plan to try again.'
      : 'The last request expired before it started. Press Plan to try again.',
  }
}
