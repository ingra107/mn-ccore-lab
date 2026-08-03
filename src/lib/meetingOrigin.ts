// meetingOrigin — one place that answers "did this task come out of a meeting,
// and can I get to that meeting?"
//
// #108. Nick: "we need to just make it so when things come from meetings we know
// they come from meetings that is important."
//
// ⚠️ THE TWO QUESTIONS ARE SEPARATE, AND CONFLATING THEM IS WHY NOTHING RENDERED.
//
// `meeting_title` does not exist on the `tasks` table — it is produced by
// `LEFT JOIN meetings m ON t.meeting_id = m.id` in api/routes/tasks.ts. But
// `tasks.meeting_id` and `meetings.id` are DIFFERENT ID SPACES: meetings are
// keyed `mtg-YYYY-MM-DD-<hash>`, while tasks carry `cal-<...>` (calendar
// extraction) or `mtg_<compact-timestamp>` (meeting approval). Measured against
// prod on 2026-08-03: of 152 tasks with a meeting_id, only 8 join successfully,
// and all 8 are from one April meeting — every recent one dangles.
//
// Five UI surfaces gated their meeting badge on that NULL title, so all five
// silently showed nothing. Hence: the FACT of meeting origin comes from fields
// that always exist (`source` / `meeting_id`); only the NAME and the LINK depend
// on the join. Gating the href on a resolved title makes a dead link
// unrepresentable — the link appears exactly when it works.

import { PATHS } from '../constants/paths'

/**
 * Task `source` values that mean "this came out of a meeting".
 *
 * `meeting_extraction` (meeting notes → tasks) and `meeting_approval` (the
 * calendar-approval lane) are the two the live pipeline writes today; plain
 * `meeting` is the older value still on ~23 rows. A check for only `'meeting'`
 * — which is what TaskCard used to do — misses every task the current pipeline
 * creates.
 */
export const MEETING_SOURCES: ReadonlySet<string> = new Set([
  'meeting',
  'meeting_extraction',
  'meeting_approval',
])

/** The subset of task fields this module reads. Structural so the dashboard / MyItems row shapes fit too. */
export interface MeetingOriginFields {
  source?: string | null
  meeting_id?: string | null
  meeting_title?: string | null
  /**
   * The CANONICAL meetings.id, resolved server-side by api/lib/meeting-ref.
   * Present only when the meeting was actually identified, which is exactly the
   * condition for rendering a link. `meeting_id` is the raw stored value and is
   * NOT a safe link target — it dangles on most rows.
   */
  meeting_ref?: string | null
  meeting_date?: string | null
}

/** True when the task originated in a meeting. Never depends on the fragile join. */
export function isFromMeeting(task: MeetingOriginFields): boolean {
  return Boolean(task.meeting_id) || MEETING_SOURCES.has(task.source ?? '')
}

/**
 * The meeting's display name, or null when the join did not resolve.
 *
 * Capture titles are often prefixed ("Meeting: CLIFathon 2026 [pending approval]");
 * we keep the part before the first colon, matching the existing TaskCard idiom.
 */
export function meetingTitleFor(task: MeetingOriginFields): string | null {
  const raw = task.meeting_title?.trim();
  if (!raw) return null;
  const head = raw.split(':')[0].trim();
  return head || raw;
}

/**
 * Href to the meeting page, or null when we cannot prove it would resolve.
 *
 * Targets `meeting_ref` — the canonical id the server resolved — NEVER the raw
 * `meeting_id`, which belongs to a different id space on most rows and would
 * 404. Falling back to `meeting_id` here is the one change that would
 * reintroduce dead links, so it is deliberately not done.
 */
export function meetingHrefFor(task: MeetingOriginFields): string | null {
  const ref = task.meeting_ref?.trim();
  if (!ref) return null;
  return PATHS.meeting(ref);
}

/**
 * The label for the meeting tag: the name, plus the date when we have it —
 * "Nick/Adams Meeting · Jul 31". Falls back to the bare phrase when the meeting
 * could not be identified, so the ORIGIN is still stated.
 */
export function meetingLabelFor(task: MeetingOriginFields): string {
  const title = meetingTitleFor(task);
  if (!title) return 'From a meeting';
  const d = task.meeting_date?.slice(0, 10);
  if (!d) return title;
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return title;
  // Built from parts — `new Date('2026-07-31')` is UTC midnight and prints as
  // the 30th in every western zone.
  const when = new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${title} · ${when}`;
}
