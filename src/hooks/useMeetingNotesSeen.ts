import { useCallback, useEffect, useState } from 'react'
import { nowInstant } from '../lib/time'

const STORAGE_KEY = 'mnccore-meeting-notes-seen-v1'

export type SeenMap = Record<string, string>

function loadSeenMap(): SeenMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSeenMap(map: SeenMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch { /* noop */ }
}

export interface MeetingFreshnessInput {
  id: string
  notes?: string | null
  updated_at?: string | null
}

/** Pure — no React, no localStorage. Seeds one baseline entry per meeting
 *  from its own `updated_at` (falling back to `now` if missing). Exported
 *  standalone so the cold-start contract is testable without a DOM. */
export function seedBaseline(meetings: MeetingFreshnessInput[], now: () => string = nowInstant): SeenMap {
  const baseline: SeenMap = {}
  for (const m of meetings) {
    baseline[m.id] = m.updated_at || now()
  }
  return baseline
}

/** Pure — the freshness decision itself. `seenMap === null` means no
 *  baseline exists yet (pre-seed): always false, never a guess. A meeting
 *  absent from an established map is genuinely new (arrived after seeding). */
export function computeIsNew(seenMap: SeenMap | null, meeting: MeetingFreshnessInput): boolean {
  if (!seenMap) return false
  if (!meeting.notes || !meeting.notes.trim() || !meeting.updated_at) return false
  const lastSeen = seenMap[meeting.id]
  if (!lastSeen) return true
  return meeting.updated_at > lastSeen
}

// One in-flight seed fetch shared across ALL hook instances (Sidebar is
// always mounted alongside whichever meetings surface triggers cold start,
// so without module-level coalescing each instance would fire its own
// identical /api/meetings request). Reset on failure so a later mount retries.
let seedFetch: Promise<SeenMap> | null = null

function fetchBaseline(): Promise<SeenMap> {
  if (!seedFetch) {
    seedFetch = (async () => {
      const res = await fetch('/api/meetings')
      if (!res.ok) throw new Error(`meetings fetch ${res.status}`)
      const json = await res.json() as { data?: MeetingFreshnessInput[] }
      return seedBaseline(json.data || [])
    })().catch((err) => {
      seedFetch = null
      throw err
    })
  }
  return seedFetch
}

/**
 * Per-device "have I seen this meeting's current notes" tracker (v1,
 * localStorage-only — PB backlog #499 option b: no schema/API change).
 *
 * Cold start (no stored map at all — first-ever activation on this device):
 * fetches the live meetings list directly, deliberately bypassing any
 * page's already-mounted `useMeetingsApi()` query — that query's
 * `initialData` falls back to a small, months-stale static demo dataset
 * (`src/data/meetings.ts`, 6 rows) whenever the shared ['meetings'] cache
 * entry hasn't been freshly fetched yet, which would corrupt the one-time
 * baseline write with the wrong meeting set. This hook's own fetch has no
 * such fallback, so the seed is guaranteed to reflect real server state.
 * Only notes posted/updated after that baseline count as new, so
 * pre-existing history never badges on first activation. `isNew` returns
 * false while the baseline hasn't loaded yet (`seenMap === null`) rather
 * than guessing — the "badge the whole history" state is structurally
 * unreachable, not guarded against.
 */
export function useMeetingNotesSeen() {
  const [seenMap, setSeenMap] = useState<SeenMap | null>(loadSeenMap)

  useEffect(() => {
    if (seenMap !== null) return
    let cancelled = false
    fetchBaseline()
      .then((baseline) => {
        saveSeenMap(baseline) // idempotent across instances — same content
        if (!cancelled) setSeenMap(baseline)
      })
      .catch(() => { /* stay null; a later mount retries via the reset seedFetch */ })
    return () => { cancelled = true }
  }, [seenMap])

  const isNew = useCallback(
    (meeting: MeetingFreshnessInput) => computeIsNew(seenMap, meeting),
    [seenMap]
  )

  const markSeen = useCallback((meetingId: string, updatedAt?: string | null) => {
    setSeenMap((prev) => {
      const next = { ...(prev ?? {}), [meetingId]: updatedAt || nowInstant() }
      saveSeenMap(next)
      return next
    })
  }, [])

  return { isNew, markSeen }
}
