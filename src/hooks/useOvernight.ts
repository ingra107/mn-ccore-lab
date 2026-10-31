// useOvernight -- what PB changed since a window start, for Nick's Overnight card.
//
// GET /api/receipts/overnight is Nick-only on the server (403 for anyone else).
// A 403 resolves to null, not an error: the card renders nothing for a viewer
// who is not Nick. Any other failure throws, so the card says it could not
// load and never shows an empty list for a broken fetch.
// Contract: PB Context/Decisions/2026-10-30-receipts-and-headless-process.md.

import { keepPreviousData, useQuery } from '@tanstack/react-query'

export type OvernightKind = 'change' | 'failure' | 'left_for_nick'

export interface OvernightLine {
  id: string
  run_id: string
  action_id: string
  kind: OvernightKind
  entity_type: string | null
  entity_id: string | null
  op: string | null
  fields_before: Record<string, unknown> | null
  fields_after: Record<string, unknown> | null
  landed_version: number | null
  source_ref: string | null
  summary: string
  inverse_kind: string
  inverse_reason: string | null
  undoable: boolean
  undone_at: string | null
  undo_line_id: string | null
  created_at: string
  seen: boolean
}

export interface OvernightCounts {
  change: number
  failure: number
  left_for_nick: number
  undone: number
  unseen: number
}

export interface OvernightRun {
  run_id: string
  lane: string
  machine: string
  origin: string
  started_at: string
  finished_at: string | null
  seen_at: string | null
  state: 'open' | 'ok' | 'failed'
  counts: OvernightCounts
  lines: OvernightLine[]
  more_lines: boolean
  next_after: string | null
}

export interface OvernightLane {
  lane: string
  runs: number
  changes: number
  failures: number
  left_for_nick: number
  unseen_runs: number
  unseen_lines: number
}

export interface OvernightResponse {
  since: string
  lane: string | null
  runs: OvernightRun[]
  lanes: OvernightLane[]
  next_cursor: string | null
}

export interface OvernightLinesPage {
  run_id: string
  lines: OvernightLine[]
  next_after: string | null
}

export const OVERNIGHT_KEY = ['receipts-overnight'] as const

/** More lines of one run (the first 50 ride with the run). */
export async function fetchRunLines(runId: string, after: string): Promise<OvernightLinesPage> {
  const res = await fetch(`/api/receipts/overnight?run=${encodeURIComponent(runId)}&after=${encodeURIComponent(after)}`)
  if (!res.ok) throw new Error(`overnight lines ${res.status}`)
  return await res.json() as OvernightLinesPage
}

export function useOvernight(since: string, lane: string | null, enabled: boolean) {
  return useQuery<OvernightResponse | null>({
    queryKey: [...OVERNIGHT_KEY, since, lane],
    queryFn: async () => {
      const qs = new URLSearchParams({ since, limit: '100' })
      if (lane) qs.set('lane', lane)
      const res = await fetch(`/api/receipts/overnight?${qs}`)
      if (res.status === 403) return null
      if (!res.ok) throw new Error(`overnight ${res.status}`)
      return await res.json() as OvernightResponse
    },
    enabled,
    placeholderData: keepPreviousData, // a lane switch keeps the card drawn while the new lane loads
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

export type UndoResult =
  | { ok: true; undoLineId: string }
  | { ok: false; code: 'changed_since' | 'already_undone' | 'not_reversible' | 'failed'; message: string }

/** POST one line's Undo. A 409 carries its code; anything else is 'failed'. */
export async function undoLine(lineId: string): Promise<UndoResult> {
  let res: Response
  try {
    res = await fetch(`/api/receipts/lines/${encodeURIComponent(lineId)}/undo`, { method: 'POST' })
  } catch {
    return { ok: false, code: 'failed', message: 'Undo failed' }
  }
  if (res.ok) {
    const body = await res.json().catch(() => ({})) as { undo_line_id?: string }
    return { ok: true, undoLineId: body.undo_line_id ?? '' }
  }
  if (res.status === 409) {
    const body = await res.json().catch(() => ({})) as { code?: string; error?: string }
    const code = body.code === 'changed_since' || body.code === 'already_undone' || body.code === 'not_reversible' ? body.code : 'failed'
    return { ok: false, code, message: body.error ?? 'Undo refused' }
  }
  return { ok: false, code: 'failed', message: 'Undo failed' }
}

export async function postSeen(until: string): Promise<void> {
  const res = await fetch('/api/receipts/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ until }),
  })
  if (!res.ok) throw new Error(`seen ${res.status}`)
}
