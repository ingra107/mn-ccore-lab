// useActivityFeedQuery — the read half of a conversation feed (#125).
//
// DayActivityFeed and MeetingActivityFeed each carried the same skeleton: the query
// key, the `?include_hidden=1` fetch, the `{ data, hidden_count }` unwrap, and the
// poll-while-Hermes-is-thinking rule. It lives here once, so the second feed's
// copy of the poll rule cannot drift from the first.
//
// Poll rule (also used by ActivityThread's reply poll, the one that actually sees a
// threaded ask's placeholder): while any entry still carries the "Thinking…"
// placeholder, refetch every POLL_MS so Hermes's answer lands without a manual
// refresh. It gives up after POLL_CEILING_MS of waiting on the same placeholder(s).
// Without a ceiling, a dead listener leaves an ai_requests row pending forever and
// an open tab polls forever. A NEW placeholder (a fresh ask) starts a fresh wait, so
// giving up on a dead one never silences the next ask; the next window focus or
// navigation refetches as usual.

import { useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ActivityEntryItemRow } from '../components/activity/activityRender'
import { isHermesPending } from '../components/hermesPendingUtil'
import { activityQueryKey, type HermesLane } from '../lib/askHermes'

export const POLL_MS = 10_000
/** How long a feed keeps polling for an answer that has not arrived. */
export const POLL_CEILING_MS = 2 * 60_000

export interface ActivityFeed {
  entries: ActivityEntryItemRow[]
  hiddenCount: number
}

/** The wait in progress: which placeholders it is for, and since when. */
export interface PendingWait { key: string; since: number }

/**
 * The next refetch interval: POLL_MS while an answer is pending and the wait is
 * under the ceiling, otherwise false. `wait` is the caller's memory of the wait in
 * progress (null when none); the return carries the value to remember next time.
 * Pure, so the bound is testable without a clock.
 */
export function nextPollDecision(
  entries: ReadonlyArray<{ id: string; body: string }>,
  wait: PendingWait | null,
  now: number,
): { interval: number | false; wait: PendingWait | null } {
  const key = entries.filter((r) => isHermesPending(r.body)).map((r) => r.id).sort().join(',')
  if (!key) return { interval: false, wait: null }
  const current = wait && wait.key === key ? wait : { key, since: now }
  return { interval: now - current.since >= POLL_CEILING_MS ? false : POLL_MS, wait: current }
}

/** A `refetchInterval` body: poll while Hermes is thinking, up to the ceiling. */
export function useBoundedPendingPoll(): (entries: ReadonlyArray<{ id: string; body: string }>) => number | false {
  const wait = useRef<PendingWait | null>(null)
  return useCallback((entries) => {
    // eslint-disable-next-line local/time-discipline -- elapsed-time bound on a poll, not a stored or displayed instant
    const next = nextPollDecision(entries, wait.current, Date.now())
    wait.current = next.wait
    return next.interval
  }, [])
}

export function useActivityFeedQuery(opts: {
  lane: HermesLane
  id: string
  /** The feed's GET url, without the include_hidden suffix. */
  url: string
  showHidden: boolean
  enabled?: boolean
}) {
  const { lane, id, url, showHidden, enabled = true } = opts
  const pollInterval = useBoundedPendingPoll()
  return useQuery<ActivityFeed>({
    queryKey: [...activityQueryKey(lane, id), showHidden],
    queryFn: async () => {
      const res = await fetch(`${url}${showHidden ? '?include_hidden=1' : ''}`)
      if (!res.ok) return { entries: [], hiddenCount: 0 }
      const data = await res.json() as { data?: ActivityEntryItemRow[]; hidden_count?: number }
      return { entries: data.data || [], hiddenCount: data.hidden_count || 0 }
    },
    refetchInterval: (q) => pollInterval(q.state.data?.entries ?? []),
    staleTime: 5_000,
    enabled,
  })
}
