// shared/meetingAudience.ts -- who a meeting is for (schema-v122, 2026-10-09).
//
// meetings.audience is 'private' (the default: owner, attendees and members of
// a project granted the meeting see it) or 'lab' (every signed-in member sees
// it). The read rule is api/lib/table-scope.ts meetingRule; this file is the
// ONE vocabulary and the ONE list of lab series, imported by the API (the
// INSERT in api/routes/meetings.ts upsertMeeting, the /meta flip guard), the
// v122 backfill generator (scripts/meetings-122-plan.ts) and the UI, so the
// three cannot drift.
//
// Lab series, set automatically by title at INSERT (Nick, 2026-10-09: MNCCORE
// biweekly, Pulmonary HSR group, AND CLIF WG weekly). A later title edit never
// re-derives audience; the owner or Nick flips it by hand.
//
// Patterns are ANCHORED on the whole normalized title, never a prefix: the
// retired PB "MN-CCORE: " prefix sat on every consult title until 2026-05-29,
// so "MN-CCORE: Sarah Kesler Consult" must stay private. Normalizer: lowercase,
// "mn-ccore" -> "mnccore", every run of non-alphanumerics -> one space, trim.
// Fixture: the 73 prod titles of 2026-10-09 (24 lab: 12 MNCCORE, 7 HSR, 5 CLIF
// WG), src/lib/__tests__/meetingAudience.test.ts.

export const MEETING_AUDIENCES = ['private', 'lab'] as const
export type MeetingAudience = (typeof MEETING_AUDIENCES)[number]

export function isMeetingAudience(v: unknown): v is MeetingAudience {
  return typeof v === 'string' && (MEETING_AUDIENCES as readonly string[]).includes(v)
}

export type LabSeries = 'mnccore' | 'pulm-hsr' | 'clif-wg'

const MONTH = '(january|february|march|april|may|june|july|august|september|october|november|december)'

const LAB_SERIES: ReadonlyArray<readonly [LabSeries, RegExp]> = [
  ['mnccore', new RegExp(`^(mnccore )?mnccore( biweekly)?( meeting)?( ${MONTH} \\d{1,2} \\d{4})?$`)],
  ['pulm-hsr', /^(mnccore )?pulmonary hsr group meeting$/],
  ['clif-wg', /^(mnccore )?clif wg weekly( meeting)?$/],
]

/** The title as the series patterns read it. */
export function normalizeSeriesTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/mn-ccore/g, 'mnccore')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Which lab series a meeting title belongs to, or null. */
export function labSeriesKey(title: string | null | undefined): LabSeries | null {
  if (!title) return null
  const t = normalizeSeriesTitle(title)
  for (const [key, re] of LAB_SERIES) if (re.test(t)) return key
  return null
}

export function isLabSeriesTitle(title: string | null | undefined): boolean {
  return labSeriesKey(title) !== null
}

/** The audience a NEW meeting row of this title starts with. */
export function initialAudience(title: string | null | undefined): MeetingAudience {
  return isLabSeriesTitle(title) ? 'lab' : 'private'
}
