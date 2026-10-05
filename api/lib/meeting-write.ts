// api/lib/meeting-write.ts -- the attendee normalizer every meetings writer
// uses (#551, #2225).
//
// Writers of meetings.attendees, all in api/routes/meetings.ts:
//   - upsertMeeting (POST /api/meetings: the PB debrief push and the
//     Meetings.tsx dialog; POST /api/meetings/prep-from-event: the Prep pill)
//   - handleUpdateMeetingMeta (POST /api/meetings/:id/meta: the picker)
// The type only reaches part of this. upsertMeeting's input field
// `MeetingUpsert.attendees` is typed NormalizedAttendees, and the only
// constructor is normalizeAttendees below, so a caller of upsertMeeting cannot
// hand it a raw list without a cast. A D1 bind is `unknown[]`, though, so a
// writer that prepares its own SQL (as handleUpdateMeetingMeta does) is held
// to normalization by convention and review, not by tsc. Level 2; D1's TEXT
// column cannot refuse a raw email.
//
// The rule itself lives in shared/attendees.ts so the attendance picker
// applies the same one when it compares stored values to team slugs.

import type { Env } from '../helpers'
import { buildAttendeeLookup, resolveAttendeeList } from '../../shared/attendees'

declare const normalizedBrand: unique symbol

/** A resolved attendee list. Constructed only by normalizeAttendees. */
export type NormalizedAttendees = readonly string[] & { readonly [normalizedBrand]: true }

/**
 * Per value: exact team_members.email match -> slug; a known slug stays;
 * every other value is kept (emails lower-cased). Deduped, order kept.
 * A non-array input normalizes to an empty list.
 */
export async function normalizeAttendees(env: Env, values: unknown): Promise<NormalizedAttendees> {
  const list = Array.isArray(values) ? values : []
  if (list.length === 0) return [] as unknown as NormalizedAttendees
  // Deterministic order: when two rows share an email, buildAttendeeLookup
  // keeps the FIRST, so a reviewed member (auto_created = 0) wins over an
  // auto-provisioned one, then the older row, then the slug.
  const rows = await env.DB.prepare(
    'SELECT slug, email FROM team_members WHERE slug IS NOT NULL ORDER BY auto_created ASC, created_at ASC, slug ASC'
  ).all<{ slug: string; email: string | null }>()
  const lookup = buildAttendeeLookup(rows.results ?? [])
  return resolveAttendeeList(list, lookup) as unknown as NormalizedAttendees
}

/** JSON text for the column; an empty list is NULL (absent), never '[]'. */
export function attendeesColumnValue(attendees: NormalizedAttendees): string | null {
  return attendees.length > 0 ? JSON.stringify(attendees) : null
}
