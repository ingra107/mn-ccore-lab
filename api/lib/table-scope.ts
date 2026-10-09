// table-scope.ts -- who may read which rows, per table (#145).
//
// Every table in the migration chain is listed here, once. table-scope.test.ts
// replays the chain (prodSchemaDb) and fails when a table exists that this
// list does not classify, or this list names a table the chain dropped, so a
// new table cannot reach a request without someone deciding its rule.
//
//   lab     every member reads every row (no change from before #145).
//   scoped  a person or nobody reads the rows `where(viewer)` admits; null
//           means "this viewer is not restricted on this table". `key` is the
//           column viewer-db uses to stop an UPDATE/DELETE from reaching a
//           row the viewer cannot read. `dependsOn` lists the scoped tables
//           the rule reads, so viewer-db emits those CTEs first.
//
// Rules run inside `SELECT * FROM main.<t> AS <t> WHERE <rule>`, so a rule
// names its own columns as `<t>.<col>` and reaches another scoped table by
// its bare name (which then reads that table's CTE).
//
// Lane A (this cut): meetings and the rows that hang off a meeting. Everything
// else is `lab`. Lane B scopes projects, tasks and their families.

import type { ScopedViewer } from './viewer-db'

export const HUB_TABLES = [
  '_meta', 'activity_entries', 'activity_log', 'agenda_items', 'agent_knowledge', 'ai_requests',
  'artifact_tags', 'artifact_versions', 'artifacts', 'bug_reports', 'commitments',
  'conference_submissions', 'contributions', 'day_capacity', 'deadline_dependencies', 'decisions',
  'digest_comments', 'dispatch_queue', 'entity_seen', 'expertise_tags', 'file_activity_daily',
  'file_attachments', 'grant_milestones', 'grants', 'hub_decisions', 'hub_pomodoro_slots', 'ideas',
  'inbox', 'inbox_events', 'kg_entities', 'kg_relation_type_registry', 'kg_relations', 'lab_answers',
  'lab_questions', 'lab_settings', 'launch_log', 'links', 'manuscript_revisions', 'meetings',
  'member_featured_publications', 'memory_facts', 'mentee_milestones', 'milestones',
  'narrative_projects', 'nih_grants', 'notifications', 'open_science_resources', 'paper_project_links',
  'pb_sessions', 'pomodoro_sessions', 'processed_mutations', 'project_dependencies',
  'project_documents', 'project_publications', 'project_state_log', 'projects', 'publications',
  'pubmed_sync_log', 'reactions', 'regulatory_items', 'research_digest', 'research_narratives',
  'reviewer_comments', 'schema_migrations', 'sessions', 'submission_events', 'task_files',
  'task_handoffs', 'task_subtasks', 'tasks', 'team_members', 'trainee_milestones', 'trajectories',
  'user_calendar_events', 'user_calendar_feeds', 'watchlist', 'workflow_templates',
] as const

export type HubTable = (typeof HUB_TABLES)[number]

export type Scope =
  | { readonly kind: 'lab' }
  | {
      readonly kind: 'scoped'
      readonly key: string
      readonly dependsOn: readonly HubTable[]
      readonly where: (v: ScopedViewer) => string | null
    }

const LAB: Scope = { kind: 'lab' }

/**
 * A meeting is visible to its owner (owner_slug, stamped server-side from the
 * creator's session, schema-v119) and to a member its attendee list names
 * EXACTLY: the member's slug, or the member's whole email address (case
 * folded). Never by email prefix or local part: an external `nate@stanford.edu`
 * is not nate-mesfin (shared/attendees.ts). Tags (project slugs) confer
 * nothing; a 1:1 that discussed a project is not the project's. A PI person
 * sees every meeting. Nobody sees none.
 */
function meetingRule(v: ScopedViewer): string | null {
  if (v.kind === 'person' && v.pi) return null
  if (v.kind !== 'person') return '0'
  const ids = [...new Set([v.slug, v.email].filter((s) => s.length > 0))]
  return `(meetings.owner_slug = ${sqlList([v.slug])} OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(meetings.attendees) THEN meetings.attendees ELSE '[]' END) att `
    + `WHERE att.type = 'text' AND lower(att.value) IN (${sqlList(ids)})))`
}

function sqlList(values: string[]): string {
  return values.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')
}

/** Rows owned by a meeting follow the meeting: visible iff the meeting is. */
function meetingChild(table: HubTable, typeCol: string | null, idCol: string, alsoSourceId = false): Scope {
  const meetingIds = alsoSourceId
    ? '(SELECT id FROM meetings UNION ALL SELECT source_id FROM meetings WHERE source_id IS NOT NULL)'
    : '(SELECT id FROM meetings)'
  return {
    kind: 'scoped',
    key: 'id',
    dependsOn: ['meetings'],
    where: (v) => {
      if (meetingRule(v) === null) return null
      const owned = `${table}.${idCol} IN ${meetingIds}`
      return typeCol
        ? `(COALESCE(${table}.${typeCol}, '') <> 'meeting' OR ${owned})`
        : `(${table}.${idCol} IS NULL OR ${owned})`
    },
  }
}

export const TABLE_SCOPE: Record<HubTable, Scope> = {
  meetings: { kind: 'scoped', key: 'id', dependsOn: [], where: meetingRule },
  agenda_items: {
    kind: 'scoped', key: 'id', dependsOn: ['meetings'],
    where: (v) => (meetingRule(v) === null ? null : 'agenda_items.meeting_id IN (SELECT id FROM meetings)'),
  },
  hub_decisions: meetingChild('hub_decisions', null, 'meeting_id', true),
  // Quoted: scripts/check-activity-reads.mjs counts every bare mention of this
  // table outside a string literal as SQL its lexer missed.
  'activity_entries': meetingChild('activity_entries', 'entity_type', 'entity_id'),
  file_attachments: meetingChild('file_attachments', 'entity_type', 'entity_id'),
  // activity_log: a meeting's rows follow the meeting, and PB automation
  // rows (pb_session: 9,954 in prod; sync: 481) are the PI's alone. They are
  // PB's session log, not lab activity, and GET /api/activity served them to
  // every member (and, through its anonShape, to the logged-out /pulse kiosk).
  activity_log: {
    kind: 'scoped', key: 'id', dependsOn: ['meetings'],
    where: (v) => {
      if (v.kind === 'person' && v.pi) return null
      return `(COALESCE(activity_log.type, '') NOT IN ('pb_session', 'sync') AND `
        + `(COALESCE(activity_log.related_type, '') <> 'meeting' OR activity_log.related_id IN (SELECT id FROM meetings)))`
    },
  },

  _meta: LAB, agent_knowledge: LAB, ai_requests: LAB, artifact_tags: LAB, artifact_versions: LAB,
  artifacts: LAB, bug_reports: LAB, commitments: LAB, conference_submissions: LAB, contributions: LAB,
  day_capacity: LAB, deadline_dependencies: LAB, decisions: LAB, digest_comments: LAB, dispatch_queue: LAB,
  entity_seen: LAB, expertise_tags: LAB, file_activity_daily: LAB, grant_milestones: LAB, grants: LAB,
  hub_pomodoro_slots: LAB, ideas: LAB, inbox: LAB, inbox_events: LAB, kg_entities: LAB,
  kg_relation_type_registry: LAB, kg_relations: LAB, lab_answers: LAB, lab_questions: LAB,
  lab_settings: LAB, launch_log: LAB, links: LAB, manuscript_revisions: LAB,
  member_featured_publications: LAB, memory_facts: LAB, mentee_milestones: LAB, milestones: LAB,
  narrative_projects: LAB, nih_grants: LAB, notifications: LAB, open_science_resources: LAB,
  paper_project_links: LAB, pb_sessions: LAB, pomodoro_sessions: LAB, processed_mutations: LAB,
  project_dependencies: LAB, project_documents: LAB, project_publications: LAB, project_state_log: LAB,
  projects: LAB, publications: LAB, pubmed_sync_log: LAB, reactions: LAB, regulatory_items: LAB,
  research_digest: LAB, research_narratives: LAB, reviewer_comments: LAB, schema_migrations: LAB,
  sessions: LAB, submission_events: LAB, task_files: LAB, task_handoffs: LAB, task_subtasks: LAB,
  tasks: LAB, team_members: LAB, trainee_milestones: LAB, trajectories: LAB, user_calendar_events: LAB,
  user_calendar_feeds: LAB, watchlist: LAB, workflow_templates: LAB,
}
