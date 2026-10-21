/**
 * meeting-ref — the ONE join from a task's `meeting_id` to its `meetings` row.
 *
 * #108 follow-up. Nick: "i would LOVE if the from a meeting with the icon was
 * the link or had the short name and date and it was itself a URL hyperlink to
 * the full meeting."
 *
 * `tasks.meeting_id` holds one of three id forms:
 *   - `mtg-YYYY-MM-DD-<hash>`         a meetings.id (Hub-written)
 *   - `cal-<stamp>-<slug>`, hash8 ids  a meetings.source_id (the PB debrief
 *                                       pushes the meeting first, v95)
 *   - `mtg_<stamp>-<lane>`             a PB capture staging key (meeting-approval
 *                                       and meeting-match lanes); names no
 *                                       meetings row at all
 *
 * The first two join exactly below. The third gets NO meeting link: the read-time
 * bridge that guessed it from "the only meeting that day" (decorateMeetingRefs /
 * resolveMeetingRef) was deleted 2026-10-21 (PB backlog #1593). A capture staging
 * key is often a recording of a DIFFERENT meeting that day. On prod the bridge
 * linked 66 of the 152 mtg_ rows: 21 correctly (accepted approvals, each to its
 * own meeting) and 45 wrongly (40 declined approvals, 3 meeting_match questions,
 * 2 accepted approvals still waiting on a calendar match). Deleting it fixed the
 * 45 and blanked the 21, which Nick accepted ("Delete the bridge"). A task that
 * does not join keeps its meeting ORIGIN (meetingOrigin.isFromMeeting reads
 * source / meeting_id) and shows no link, because a wrong link is worse than none.
 *
 * Getting the 21 back the exact way (not built): when an accepted capture is
 * debriefed, record the resulting cal-/hash8 meeting id against the approval
 * task. That needs a new field, so it is a schema change (PB findings ledger).
 */

/**
 * The ONE task -> meeting join for task reads (#1593). A task's meeting_id is
 * the Hub id or, for everything the PB debrief writes, the meeting's calendar
 * `source_id` (v95, UNIQUE): the debrief pushes the meeting first with
 * source_id = the id it stamps on the tasks. Joining both resolves those rows
 * exactly, with no inference. `meeting_ref` is the joined `m.id`, so a link
 * never targets a source_id (handleGetMeeting looks up meetings.id only).
 *
 * Shape, on purpose: the ON clause pins `m.id` (the primary key) to ONE value,
 * picked by two indexed lookups -- the meetings row whose id is the task's
 * meeting_id, else the row whose source_id is. So a task can join at most one
 * meetings row by construction, even if one row's id ever equals another's
 * source_id (nothing in the schema forbids that), and the id match wins. It is
 * also index-only: `t.meeting_id IN (m.id, m.source_id)` scanned the whole
 * meetings table per task row, on the Hub's hottest read and the PB pull.
 * tasks.meeting-join.test.ts asserts both the one-row rule and the query plan.
 * Measured on prod 2026-10-14: 169 live tasks match by source_id, 0 by id.
 * A row the join misses has meeting_ref NULL, and nothing fills it in.
 */
export const TASK_MEETING_REF_SQL =
  '(COALESCE((SELECT id FROM meetings WHERE id = t.meeting_id), (SELECT id FROM meetings WHERE source_id = t.meeting_id)))';
export const TASK_MEETING_JOIN = `LEFT JOIN meetings m ON m.id = ${TASK_MEETING_REF_SQL}`;
export const TASK_MEETING_COLS = 'm.id AS meeting_ref, m.title AS meeting_title, m.date AS meeting_date';
