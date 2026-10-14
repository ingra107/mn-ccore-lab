// activity-feed-types.ts -- which activity_log rows a person-facing feed shows.
//
// activity_log is two things at once: what people did (created a task, moved a
// deadline, logged a meeting) and the machine audit trail ("Bulk sync: 1
// created, 0 updated", "activity_entries f9ad0a66... deleted", "Deleted links
// record link_01M..."). The meeting prep page learned to keep only the first
// (G5-5); the Overview card and /portal/activity read /api/activity, which had
// no such rule, and kept printing table names and hex ids (O2B, 2026-10-14).
// Both now read their WHERE from here, so the two feeds cannot drift.
//
// Every type a Hub writer logs is in exactly one of the three lists below;
// meetings.prep-series.test.ts reads every logActivity call in api/ and fails on
// a type in none, so a new writer forces the choice. A type logged from a
// variable (mutations.ts logs `mut.table`) is in no list and stays out of every
// feed by default, which is the safe side.

/** People's events the meeting prep shows (and every other feed with them). */
export const PREP_ACTIVITY_TYPES = [
  // tasks
  'task', 'assignee_change', 'task_handoff', 'task_restore',
  // projects and their work
  'project', 'project_update', 'project_rename', 'pi_change', 'stage_change', 'milestone',
  'decision', 'decision_outcome', 'dependency_created', 'paper_link', 'document_link',
  'revision', 'revision_comment', 'submission', 'regulatory', 'conference',
  // people, meetings, ideas
  'meeting', 'member_added', 'mentee_milestone', 'idea', 'question', 'answer', 'answer_accepted',
];

/** People's events too fine-grained for the prep page; the lab feed shows them. */
export const DETAIL_ACTIVITY_TYPES = [
  'publication_link', 'publication_unlink', 'agenda',
  'task_delete', 'project_delete',
  'task_file_attach', 'task_file_delete', 'subtask_created', 'subtask_completed', 'subtask_uncompleted',
  'handoff_acknowledged', 'milestone_note', 'team_update', 'role_assignment',
];

/** Machine rows: syncs, digest bookkeeping, and deletes of rows that are not
 *  a person's work item (a dismissed comment, an inbox event). No feed shows them. */
export const MACHINE_ACTIVITY_TYPES = ['pb_session', 'sync', 'digest', 'activity', 'inbox_event'];

/** Logged by Hub writers, deliberately kept off the prep page. */
export const PREP_ACTIVITY_EXCLUDED = [...DETAIL_ACTIVITY_TYPES, ...MACHINE_ACTIVITY_TYPES];

const inList = (types: string[]) => types.map((t) => `'${t}'`).join(', ');

/** Same-type machine rows, cut by their description: bulk sync and bulk
 *  complete ('Bulk '), Nick's raw captures ('PB capture:'), and the old
 *  idempotentDelete text '<table> <id> deleted' (it names the row by id; the
 *  writer says "Deleted <thing>" since 2026-10-14). */
function machineDescriptionExclude(col: string): string {
  const d = `${col}.description`;
  const r = `${col}.related_id`;
  return `${d} NOT LIKE 'Bulk %' AND ${d} NOT LIKE 'PB capture:%'` +
    ` AND NOT (${r} IS NOT NULL AND (${d} LIKE '% ' || ${r} || ' deleted' OR ${d} LIKE '% ' || ${r} || ' soft-deleted'))`;
}

/** WHERE clause for the meeting prep's Recent activity (people's main events). */
export function prepActivityWhere(col = 'a'): string {
  return `${col}.type IN (${inList(PREP_ACTIVITY_TYPES)}) AND ${machineDescriptionExclude(col)}`;
}

/** WHERE clause for the lab feed (/api/activity: Overview, Activity page, Pulse). */
export function labFeedWhere(col = 'a'): string {
  return `${col}.type IN (${inList([...PREP_ACTIVITY_TYPES, ...DETAIL_ACTIVITY_TYPES])}) AND ${machineDescriptionExclude(col)}`;
}
