// meetings-119-plan.ts -- the pure half of the #145 Lane A data steps.
//
// Two one-time writes on prod `meetings`, each generated from a pre-image the
// operator exports, so the apply and its rollback name exact rows and exact
// old values (no predicate decides what changes at apply time):
//
//   1. owner backfill: every row with owner_slug NULL gets 'nick-ingraham'.
//      Until 2026-10-05 the PB debrief push (Nick's service key) was the only
//      writer, and every meeting write since then was Nick's (activity_log
//      type='meeting' actors: nick-ingraham only). Rollback sets those ids
//      back to NULL, and only where the value is still 'nick-ingraham'.
//   2. attendee re-normalization: attendee lists are normalized at write time
//      and then frozen, so a team email set on a member row AFTER a meeting
//      was written stays a raw email in it (Casey's eddin022@umn.edu x19,
//      Nate's mesfin@umn.edu x20). This runs the SAME resolver the writers use
//      (shared/attendees.ts resolveAttendeeList: exact email -> slug, nothing
//      by prefix, unknown values kept). Each UPDATE is guarded on the old text,
//      so a row edited since the export is left alone; the rollback is guarded
//      on the new text the same way.
//
// The CLI is scripts/backfill-119-meetings-owner.ts. Tested against the
// migrated schema in api/lib/meetings-119-plan.test.ts.

import { buildAttendeeLookup, resolveAttendeeList } from '../shared/attendees'

export const BACKFILL_OWNER = 'nick-ingraham'

export interface MeetingPreImage { id: string; owner_slug: string | null; attendees: string | null; created_at?: string | null; title?: string | null; date?: string | null }
export interface TeamRow { slug: string | null; email: string | null }

/** Rows from `wrangler d1 execute --json` output ([{ results: [...] }]) or a bare array. */
export function rowsFrom<T>(parsed: unknown): T[] {
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === 'object' && 'results' in parsed[0]) {
    return parsed.flatMap((p) => (p as { results: T[] }).results ?? [])
  }
  if (Array.isArray(parsed)) return parsed as T[]
  throw new Error('expected a JSON array of rows or wrangler --json output')
}

function lit(v: string | null): string {
  return v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`
}

export interface Plan { apply: string; rollback: string; count: number; detail: string[] }

/**
 * `windowStart` (an ISO/SQLite timestamp) marks the deploy window: an
 * owner-less row CREATED AT OR AFTER it was written while the new Worker was
 * live or rolling out, and may be a member's Prep meeting, so it is NOT
 * stamped nick-ingraham blind. It goes to `held` (by created_at) for review,
 * and is stamped only when its id is in `includeIds`.
 */
export function planOwnerBackfill(
  meetings: readonly MeetingPreImage[],
  opts: { windowStart?: string; includeIds?: readonly string[] } = {},
): Plan & { held: string[] } {
  const include = new Set(opts.includeIds ?? [])
  const unowned = meetings.filter((m) => m.owner_slug === null)
  const inWindow = (m: MeetingPreImage) => !!opts.windowStart && !!m.created_at && m.created_at >= opts.windowStart
  const held = unowned.filter((m) => inWindow(m) && !include.has(m.id))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((m) => `${m.created_at}  ${m.id}  ${m.date ?? ''}  ${m.title ?? ''}`)
  const ids = unowned.filter((m) => !inWindow(m) || include.has(m.id)).map((m) => m.id).sort()
  return {
    held,
    count: ids.length,
    detail: ids,
    apply: ids.map((id) => `UPDATE meetings SET owner_slug = ${lit(BACKFILL_OWNER)} WHERE id = ${lit(id)} AND owner_slug IS NULL;`).join('\n'),
    rollback: ids.map((id) => `UPDATE meetings SET owner_slug = NULL WHERE id = ${lit(id)} AND owner_slug = ${lit(BACKFILL_OWNER)};`).join('\n'),
  }
}

/**
 * `team` must be in the order normalizeAttendees reads it (auto_created ASC,
 * created_at ASC, slug ASC): when two rows share an email the FIRST wins.
 */
export function planAttendeeRenorm(meetings: readonly MeetingPreImage[], team: readonly TeamRow[]): Plan & { skipped: string[] } {
  const lookup = buildAttendeeLookup(team)
  const apply: string[] = []
  const rollback: string[] = []
  const detail: string[] = []
  const skipped: string[] = []
  for (const m of [...meetings].sort((a, b) => a.id.localeCompare(b.id))) {
    if (m.attendees === null) continue
    let parsed: unknown
    try { parsed = JSON.parse(m.attendees) } catch { skipped.push(`${m.id}: not JSON`); continue }
    if (!Array.isArray(parsed)) { skipped.push(`${m.id}: not an array`); continue }
    const after = resolveAttendeeList(parsed, lookup)
    const afterText = after.length > 0 ? JSON.stringify(after) : null
    if (afterText === m.attendees) continue
    if (afterText !== null && JSON.stringify(parsed) === afterText) continue
    apply.push(`UPDATE meetings SET attendees = ${lit(afterText)} WHERE id = ${lit(m.id)} AND attendees = ${lit(m.attendees)};`)
    rollback.push(afterText === null
      ? `UPDATE meetings SET attendees = ${lit(m.attendees)} WHERE id = ${lit(m.id)} AND attendees IS NULL;`
      : `UPDATE meetings SET attendees = ${lit(m.attendees)} WHERE id = ${lit(m.id)} AND attendees = ${lit(afterText)};`)
    detail.push(`${m.id}: ${m.attendees} -> ${afterText ?? 'NULL'}`)
  }
  return { apply: apply.join('\n'), rollback: rollback.join('\n'), count: apply.length, detail, skipped }
}
