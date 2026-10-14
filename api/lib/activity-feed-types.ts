// activity-feed-types.ts -- which activity_log rows a person-facing feed shows.
//
// activity_log is two things at once: what people did (created a task, moved a
// deadline, logged a meeting) and the machine audit trail ("Bulk sync: 1
// created, 0 updated", "activity_entries f9ad0a66... deleted", "Deleted links
// record link_01M..."). The meeting prep page learned to keep only the first
// (G5-5); the Overview card and /portal/activity read /api/activity, which had
// no such rule, and kept printing table names and hex ids (O2B, 2026-10-14).
// Both build their WHERE from the one helper below.
//
// Every type a Hub writer logs is in exactly one of the three lists below.
// meetings.prep-series.test.ts scans api/ for every way a type reaches
// activity_log -- a literal logActivity type, a `prefix_${x}` template, an
// idempotentDelete activityCategory, and a type passed as a variable (each
// such call site is named in the test with the values it can take) -- and
// fails on a type in no list, so a new writer forces the choice. mutations.ts
// logs `mut.table`; those types are in no list and stay out of every feed,
// which is the safe side.

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

/** `text` ends with `suffix`, without LIKE. D1 refuses a LIKE pattern over
 *  50 bytes ("LIKE or GLOB pattern too complex", code 7500), so a pattern built
 *  from row data ('% ' || related_id || ' deleted') turns a long id into a
 *  500 on the whole feed. better-sqlite3's limit is 50,000 bytes, so no local
 *  test can see it; activity-feed-types.test.ts bans the shape instead. */
function endsWith(text: string, suffix: string): string {
  return `substr(${text}, -length(${suffix})) = ${suffix}`;
}

/** Same-type machine rows, cut by their description: 'Bulk sync' (PB's
 *  session push), Nick's raw captures ('PB capture:'), and the old
 *  idempotentDelete text '<table> <id> deleted' (it names the row by id; the
 *  writer says "Deleted <thing>" since 2026-10-14). 'Bulk complete/delete/
 *  assign: N tasks' stays: a person did that (tasks.ts bulk actions). */
function machineDescriptionExclude(col: string): string {
  const d = `${col}.description`;
  const r = `${col}.related_id`;
  return `${d} NOT LIKE 'Bulk sync%' AND ${d} NOT LIKE 'PB capture:%'` +
    ` AND NOT (${r} IS NOT NULL AND (${endsWith(d, `' ' || ${r} || ' deleted'`)} OR ${endsWith(d, `' ' || ${r} || ' soft-deleted'`)}))`;
}

/** WHERE clause for the meeting prep's Recent activity (people's main events). */
export function prepActivityWhere(col = 'a'): string {
  return `${col}.type IN (${inList(PREP_ACTIVITY_TYPES)}) AND ${machineDescriptionExclude(col)}`;
}

/** WHERE clause for the lab feed (/api/activity: Overview, Activity page, Pulse). */
export function labFeedWhere(col = 'a'): string {
  return `${col}.type IN (${inList([...PREP_ACTIVITY_TYPES, ...DETAIL_ACTIVITY_TYPES])}) AND ${machineDescriptionExclude(col)}`;
}
