/**
 * meeting-ref — resolve a task's `meeting_id` to a real `meetings.id`.
 *
 * #108 follow-up. Nick: "i would LOVE if the from a meeting with the icon was
 * the link or had the short name and date and it was itself a URL hyperlink to
 * the full meeting."
 *
 * ⚠️ THE PROBLEM: `tasks.meeting_id` and `meetings.id` are DIFFERENT ID SPACES.
 * Meetings are keyed `mtg-YYYY-MM-DD-<hash>`. Tasks carry whichever id the lane
 * that created them minted:
 *   - `cal-20260731T1300-nickadams-meeting`  (meeting_extraction — calendar id)
 *   - `mtg_20260731T182205`                  (meeting_approval — PB timestamp id)
 *   - `mtg-2026-07-31-acc249c0`              (canonical — joins natively)
 *
 * Measured against prod 2026-08-03: of 152 tasks with a meeting_id, only 8 join
 * on equality, and all 8 come from a single April meeting. So the plain
 * `LEFT JOIN meetings ON t.meeting_id = m.id` yields NULL for ~95% of them, and
 * every UI that gated on the joined title silently rendered nothing.
 *
 * Every one of those ids embeds the meeting's DATE, and the `cal-` form also
 * embeds a slug of its title. That is enough to resolve most of them without
 * touching the data. This is a read-side bridge, deliberately conservative: it
 * returns null rather than guess, because a wrong link is worse than none.
 *
 * The durable fix is to make the writers mint the canonical id; this bridge is
 * what makes the link work for everything already written.
 */

export interface MeetingLike {
  id: string;
  title: string | null;
  date: string | null;
}

/**
 * Lowercase dashed slug, mirroring how a `cal-` id encodes a title.
 *
 * Two variants, because the encoder lives in another repo and we only have its
 * OUTPUT to go on. Real sample: "Nick/Adams Meeting" → `nickadams-meeting`, so
 * that encoder DROPS punctuation rather than treating it as a word separator.
 * Rather than bet the resolution on one observation, we generate both readings
 * and match either — punctuation-dropped ("nickadams-meeting") and
 * punctuation-as-separator ("nick-adams-meeting").
 */
export function slugifyTitle(title: string): string {
  // Punctuation dropped — matches the observed encoder.
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** The permissive variant: punctuation treated as a word separator. */
export function slugifyTitleLoose(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * The civil date encoded in a task's meeting_id, or null.
 *
 * `mtg-2026-07-31-...` → 2026-07-31 (already civil)
 * `cal-20260731T1300-...` / `mtg_20260731T182205` → 2026-07-31 (compact)
 */
export function deriveMeetingDate(meetingId: string): string | null {
  const civil = meetingId.match(/^mtg-(\d{4}-\d{2}-\d{2})/);
  if (civil) return civil[1];
  const compact = meetingId.match(/^(?:cal-|mtg_)(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

/** The title slug embedded in a `cal-<timestamp>-<slug>` id, or null. */
export function deriveTitleSlug(meetingId: string): string | null {
  const m = meetingId.match(/^cal-\d{8}(?:T\d{3,4})?-(.+)$/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Resolve a task's meeting_id to a canonical meetings.id, or null.
 *
 * Ladder, most to least certain:
 *   1. exact id match
 *   2. only one meeting that day
 *   3. same day AND the title slug matches
 * Anything else returns null — an ambiguous day with no title signal is not a
 * link we are willing to render.
 */
export function resolveMeetingRef(
  meetingId: string | null | undefined,
  meetings: MeetingLike[],
): MeetingLike | null {
  if (!meetingId) return null;

  const exact = meetings.find((m) => m.id === meetingId);
  if (exact) return exact;

  const date = deriveMeetingDate(meetingId);
  if (!date) return null;

  const sameDay = meetings.filter((m) => m.date === date);
  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0];

  const slug = deriveTitleSlug(meetingId);
  if (!slug) return null;

  const slugsOf = (m: MeetingLike) =>
    m.title ? [slugifyTitle(m.title), slugifyTitleLoose(m.title)] : [];

  const exactTitle = sameDay.filter((m) => slugsOf(m).includes(slug));
  // Only accept an UNAMBIGUOUS title match — two meetings that slugify the same
  // give us no way to choose, and a wrong link is worse than none.
  if (exactTitle.length === 1) return exactTitle[0];
  if (exactTitle.length > 1) return null;

  // The embedded slug is TRUNCATED at a fixed width, so a longer title never
  // matches exactly: "LHS Ambulatory Discovery - SME Discussion" is carried as
  // `lhs-ambulatory-discovery`, and "Pulmonary HSR Group Meeting" as
  // `pulmonary-hsr-group-meet`. Fall back to a PREFIX match, still requiring it
  // to pick exactly one meeting that day. Guarded by a minimum length so a stubby
  // slug cannot prefix-match half the calendar.
  if (slug.length < 8) return null;
  const prefixed = sameDay.filter((m) => slugsOf(m).some((s) => s.startsWith(slug)));
  return prefixed.length === 1 ? prefixed[0] : null;
}
