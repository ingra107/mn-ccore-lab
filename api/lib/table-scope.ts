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
//           column (or primary-key columns) viewer-db uses to stop an
//           UPDATE/DELETE from reaching a row the viewer cannot read.
//           `dependsOn` lists the scoped tables the rule reads; viewer-db
//           emits their CTEs (transitively) first.
//
// Rules run inside `SELECT * FROM main.<t> AS <t> WHERE <rule>`, so a rule
// names its own columns as `<t>.<col>` and reaches another scoped table by
// its bare name (which then reads that table's CTE). A rule that must see a
// table WHOLE (membership itself) names it `main.<t>`: rule text is ours,
// never a route's, so viewer-db's main. refusal does not apply to it.
//
// Lane A: meetings and the rows that hang off a meeting.
// Lane B: projects by membership (project_members, schema-v120), tasks by
// their project or by the person they name, and every table whose rows belong
// to a project, a task or an entity. Membership is the one default rule for
// every person, a PI included (Nick, 2026-10-08). Only the site admin's
// "show all projects" switch (viewer.allProjects) lifts it. The PB key never
// reaches this file (viewer-db returns the raw handle for it).
//
// 2026-10-09 (Nick): project membership is the ONLY visibility rule for
// projects. The 'Peripheral Brain' category no longer hides anything from a
// person; it is a label. A PB project stays private because Nick is its only
// member (the schema-v120 join triggers skip PB projects, so assigning a PB
// task to someone does not make them a member).
//
// Meetings (schema-v122, Nick 2026-10-09) have their own rule, meetingRule
// below: owner, attendee, lab audience, or member of a project the meeting was
// GRANTED to (meeting_project_grants). meetings.tags (projects discussed)
// confers nothing. No PI or admin arm: Nick's "show all projects" switch does
// not reach meetings ("No, never").

import type { ScopedViewer } from './viewer-db'

export const HUB_TABLES = [
  '_meta', 'activity_entries', 'activity_log', 'activity_thread_seen', 'agenda_items', 'agent_knowledge', 'ai_requests',
  'artifact_tags', 'artifact_versions', 'artifacts', 'bug_reports', 'commitments',
  'conference_submissions', 'contributions', 'day_capacity', 'deadline_dependencies', 'decisions',
  'digest_comments', 'dispatch_queue', 'entity_seen', 'expertise_tags', 'file_activity_daily',
  'file_attachments', 'grant_milestones', 'grants', 'hub_decisions', 'hub_errors', 'hub_pomodoro_slots', 'ideas',
  'inbox', 'inbox_events', 'kg_entities', 'kg_relation_type_registry', 'kg_relations', 'lab_answers',
  'lab_questions', 'lab_settings', 'launch_log', 'links', 'manuscript_revisions', 'meeting_project_grants', 'meetings',
  'member_featured_publications', 'memory_facts', 'mentee_milestones', 'milestones',
  'narrative_projects', 'nih_grants', 'notifications', 'open_science_resources', 'paper_project_links',
  'pb_sessions', 'pomodoro_sessions', 'processed_mutations', 'project_dependencies',
  'project_documents', 'project_members', 'project_publications', 'project_state_log', 'projects',
  'publications', 'pubmed_sync_log', 'reactions', 'regulatory_items', 'research_digest',
  'research_narratives', 'reviewer_comments', 'schema_migrations', 'sessions', 'submission_events',
  'task_files', 'task_handoffs', 'task_subtasks', 'tasks', 'team_members', 'trainee_milestones',
  'trajectories', 'user_calendar_events', 'user_calendar_feeds', 'watchlist', 'workflow_templates',
] as const

export type HubTable = (typeof HUB_TABLES)[number]

export type Scope =
  | { readonly kind: 'lab' }
  | {
      readonly kind: 'scoped'
      readonly key: string | readonly string[]
      readonly dependsOn: readonly HubTable[]
      readonly where: (v: ScopedViewer) => string | null
    }

const LAB: Scope = { kind: 'lab' }

function sqlList(values: string[]): string {
  return values.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')
}

/** The viewer's slug and (when it has one) email, as a SQL IN-list. */
function idList(v: ScopedViewer): string {
  if (v.kind !== 'person') return "''"
  return sqlList([...new Set([v.slug, v.email].filter((s) => s.length > 0))])
}

// ── meetings (Lane A) ────────────────────────────────────────────────────────

/** The ways a person can see a meeting, named (GET /api/meetings/:id/access reports them). */
export type MeetingArm = 'owner' | 'attendee' | 'lab' | 'project'

/**
 * The meeting rule's arms for one person, each a predicate over `meetings.*`.
 * Nick's rulings, 2026-10-09 (PB Context/Decisions/2026-10-09-hub-meeting-access.md):
 *   owner     owner_slug (stamped server-side from the creator's session, v119);
 *   attendee  the attendee list names the person EXACTLY (slug, or whole email,
 *             case folded; never an email prefix or local part: an external
 *             `nate@stanford.edu` is not nate-mesfin, shared/attendees.ts);
 *   lab       audience = 'lab' (schema-v122: the three lab series by title, or
 *             flipped by the owner or Nick): every member;
 *   project   the meeting is GRANTED to a live project the person is a member
 *             of (meeting_project_grants, v122; written only by the owner or
 *             Nick on the meeting page). Reads membership and grants whole
 *             (`main.`), as projectRule does, so meetings reads no other CTE.
 * meetings.tags (the projects a meeting DISCUSSED, schema-v72) is not an arm:
 * it is a free-text slug list PB refreshes on every push.
 * There is no PI arm and no admin arm. Nobody has no arms.
 */
export function meetingArms(v: ScopedViewer): { arm: MeetingArm; sql: string }[] {
  if (v.kind !== 'person') return []
  const slug = sqlList([v.slug])
  return [
    { arm: 'owner', sql: `meetings.owner_slug = ${slug}` },
    {
      arm: 'attendee',
      sql: `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(meetings.attendees) THEN meetings.attendees ELSE '[]' END) att `
        + `WHERE att.type = 'text' AND lower(att.value) IN (${idList(v)}))`,
    },
    { arm: 'lab', sql: `meetings.audience = 'lab'` },
    {
      arm: 'project',
      sql: 'EXISTS (SELECT 1 FROM main.meeting_project_grants g '
        + 'JOIN main.project_members pm ON pm.project_id = g.project_id '
        + 'JOIN main.projects gp ON gp.id = g.project_id '
        + `WHERE g.meeting_id = meetings.id AND pm.member_slug = ${slug} AND gp.deleted_at IS NULL)`,
    },
  ]
}

/** A meeting is visible when any arm holds. Never null: no viewer reads meetings whole. */
function meetingRule(v: ScopedViewer): string {
  const arms = meetingArms(v)
  return arms.length === 0 ? '0' : `(${arms.map((a) => a.sql).join(' OR ')})`
}

// ── projects and tasks (Lane B) ──────────────────────────────────────────────

/**
 * A project is visible to its members (project_members), and to no one else:
 * not a role, not the PI flag, not the project's category, not being a task's
 * assignee (the assignment trigger makes the assignee a member instead,
 * schema-v120). The site admin with "show all projects" on is not restricted.
 *
 * Nobody (an anonymous caller, a signed-in non-member on a public GET) is not
 * a person and has no membership. It reads projects only through the public
 * GETs' anonShapes, which expose `status` and counts alone (the public home
 * and /pulse count active projects); every non-public route refuses it before
 * its handler runs. For that count it keeps the pre-#145 cut, every project
 * outside the 'Peripheral Brain' bucket, so Nick's admin and personal projects
 * are not counted as lab work on the public site. That is the public
 * counter's rule, not a visibility rule for any person.
 */
function projectRule(v: ScopedViewer): string | null {
  if (v.kind === 'person' && v.allProjects) return null
  if (v.kind !== 'person') return `COALESCE(projects.category, '') <> 'Peripheral Brain'`
  return `projects.id IN (SELECT pm.project_id FROM main.project_members pm WHERE pm.member_slug = ${sqlList([v.slug])})`
}

/** True when project rows are filtered for this viewer (every rule below keys on it). */
const projectsScoped = (v: ScopedViewer) => projectRule(v) !== null

/** Every spelling of a visible project's reference: the typed id, and the legacy slug. */
// The slug arm stays because slug-keyed columns exist (contributions,
// lab_questions, hub_decisions, ai_requests, narrative_projects,
// paper_project_links carry project_slug, and legacy tasks may store a slug).
// It ignores any slug shaped like, or equal to, a project id: a slug that
// spells another project's id would otherwise make that project's id-keyed
// rows visible to whoever can see the slug's own project (the slug-spoof,
// api/lib/project-slug.ts). The write paths and schema-v121 refuse such a
// slug; this keeps a row that predates them inert.
const VISIBLE_PROJECT_REFS = '(SELECT id FROM projects UNION ALL SELECT slug FROM projects WHERE slug IS NOT NULL '
  + "AND lower(substr(slug, 1, 5)) <> 'proj_' AND slug NOT IN (SELECT id FROM main.projects))"

/** `col` names a visible project. NULL is not a project reference: callers decide. */
const inVisibleProject = (col: string) => `${col} IN ${VISIBLE_PROJECT_REFS}`

/**
 * A task is visible when its project is, or when it names the viewer: the
 * assignee, the person who assigned it (assigned_by holds an email, a slug,
 * 'anonymous' or NULL), or a watcher. That second arm is how a task with no
 * project reaches anyone at all (Nick's 417 project-less tasks are his as
 * assignee), and how a member removed from a project still sees the tasks
 * that are theirs to finish. It holds for every project, Peripheral Brain
 * included: a task Nick assigns someone is theirs to see, while its project
 * and the project's other tasks stay hidden. A task's meeting_id neither
 * grants nor narrows: project membership (or the task naming you) decides.
 */
function taskRule(v: ScopedViewer): string | null {
  if (!projectsScoped(v)) return null
  if (v.kind !== 'person') return '0'
  const ids = idList(v)
  const mine = `(tasks.assignee = ${sqlList([v.slug])} OR lower(COALESCE(tasks.assigned_by, '')) IN (${ids}) `
    + `OR (json_valid(tasks.watchers) AND EXISTS (SELECT 1 FROM json_each(tasks.watchers) w WHERE w.type = 'text' AND lower(w.value) IN (${ids}))))`
  return `(${inVisibleProject('tasks.project_id')} OR ${mine})`
}

/** A visible task's id. */
const VISIBLE_TASK_IDS = '(SELECT id FROM tasks)'

/** AND the non-null parts; null when nothing restricts (every part was null). */
function all(parts: (string | null)[]): string | null {
  const live = parts.filter((p): p is string => p !== null)
  return live.length === 0 ? null : live.length === 1 ? live[0] : `(${live.join(' AND ')})`
}

/** Rows that belong to one project through `col`. NULL `col` = not a project row, visible. */
function byProject(table: HubTable, col: string, key: string | readonly string[] = 'id', nullable = true): Scope {
  return {
    kind: 'scoped', key, dependsOn: ['projects'],
    where: (v) => {
      if (!projectsScoped(v)) return null
      const ref = `${table}.${col}`
      return nullable ? `(${ref} IS NULL OR ${inVisibleProject(ref)})` : inVisibleProject(ref)
    },
  }
}

/** Rows that belong to one task through `col`. */
function byTask(table: HubTable, col: string): Scope {
  return {
    kind: 'scoped', key: 'id', dependsOn: ['tasks'],
    where: (v) => (projectsScoped(v) ? `${table}.${col} IN ${VISIBLE_TASK_IDS}` : null),
  }
}

/**
 * The visibility of an (entity_type, entity_id) pair, as a CASE over the
 * types that name a scoped parent; any other type is not restricted here.
 * Meetings are scoped for every viewer, so there is always at least one arm.
 */
function entityVisible(v: ScopedViewer, typeCol: string, idCol: string, extra: Record<string, string> = {}): string {
  const arms = [`WHEN 'meeting' THEN ${idCol} IN (SELECT id FROM meetings)`]
  if (projectsScoped(v)) {
    arms.push(`WHEN 'project' THEN ${inVisibleProject(idCol)}`)
    arms.push(`WHEN 'task' THEN ${idCol} IN ${VISIBLE_TASK_IDS}`)
    for (const [type, pred] of Object.entries(extra)) arms.push(`WHEN '${type}' THEN ${pred}`)
  }
  return `(CASE COALESCE(${typeCol}, '') ${arms.join(' ')} ELSE 1 END)`
}

const ALL_PARENTS: readonly HubTable[] = ['meetings', 'projects', 'tasks']

export const TABLE_SCOPE: Record<HubTable, Scope> = {
  meetings: { kind: 'scoped', key: 'id', dependsOn: [], where: meetingRule },
  // Error text (schema-v123) can carry SQL, paths and other members' input.
  // No person and nobody reads a row: the rule is false for every scoped
  // viewer, so only a raw handle (the PB key's service viewer, and the
  // ledger's own flush in api/lib/error-ledger.ts) sees the table.
  hub_errors: { kind: 'scoped', key: ['fingerprint', 'day'], dependsOn: [], where: () => '0' },
  // A grant row is visible with its meeting (the pill row on the meeting page).
  meeting_project_grants: {
    kind: 'scoped', key: ['meeting_id', 'project_id'], dependsOn: ['meetings'],
    where: () => 'meeting_project_grants.meeting_id IN (SELECT id FROM meetings)',
  },
  agenda_items: {
    kind: 'scoped', key: 'id', dependsOn: ['meetings'],
    where: () => 'agenda_items.meeting_id IN (SELECT id FROM meetings)',
  },
  // A decision follows its meeting (by id or the PB source id) and, when it
  // names a project, that project.
  hub_decisions: {
    kind: 'scoped', key: 'id', dependsOn: ['meetings', 'projects'],
    where: (v) => all([
      '(hub_decisions.meeting_id IS NULL OR hub_decisions.meeting_id IN (SELECT id FROM meetings UNION ALL SELECT source_id FROM meetings WHERE source_id IS NOT NULL))',
      projectsScoped(v) ? `(hub_decisions.project_slug IS NULL OR ${inVisibleProject('hub_decisions.project_slug')})` : null,
    ]),
  },

  projects: { kind: 'scoped', key: 'id', dependsOn: [], where: projectRule },
  // Who is on a project you can see. A project you cannot see has no members you can see.
  project_members: {
    kind: 'scoped', key: ['project_id', 'member_slug'], dependsOn: ['projects'],
    where: (v) => (projectsScoped(v) ? 'project_members.project_id IN (SELECT id FROM projects)' : null),
  },
  tasks: { kind: 'scoped', key: 'id', dependsOn: ['projects'], where: taskRule },

  // Quoted: scripts/check-activity-reads.mjs counts every bare mention of this
  // table outside a string literal as SQL its lexer missed. A comment or
  // update follows its entity; a row with another entity type follows the
  // project it names, if any.
  'activity_entries': {
    kind: 'scoped', key: 'id', dependsOn: ALL_PARENTS,
    where: (v) => all([
      entityVisible(v, 'activity_entries.entity_type', 'activity_entries.entity_id'),
      projectsScoped(v)
        ? `(activity_entries.entity_type IN ('task', 'meeting', 'project') OR activity_entries.project_id IS NULL OR ${inVisibleProject('activity_entries.project_id')})`
        : null,
    ]),
  },
  // A file follows its entity. One exception: the morning-thought composer
  // records its files as entity 'task' keyed by the DAY (YYYY-MM-DD, no task
  // row; all 7 prod 'task' attachments on 2026-10-09 are this kind), and those
  // are their uploader's. uploaded_by is server-written: the uploader's slug
  // since AM-2, the local part of their email before it, so matching the
  // viewer's own local part here cannot be spoofed by a client.
  file_attachments: {
    kind: 'scoped', key: 'id', dependsOn: ALL_PARENTS,
    where: (v) => {
      const base = entityVisible(v, 'file_attachments.entity_type', 'file_attachments.entity_id')
      if (!projectsScoped(v) || v.kind !== 'person') return base
      const mine = [...new Set([v.slug, v.email, v.email.split('@')[0]].filter((s) => s.length > 0))]
      return `(${base} OR (file_attachments.entity_type = 'task' `
        + `AND file_attachments.entity_id GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' `
        + `AND lower(COALESCE(file_attachments.uploaded_by, '')) IN (${sqlList(mine)})))`
    },
  },
  // A reader's own place in a thread (schema-v122): their rows only, and only
  // on a thread root they can still see.
  activity_thread_seen: {
    kind: 'scoped', key: ['root_id', 'viewer_slug'], dependsOn: ['activity_entries'],
    // activity-hidden-exempt: an access rule, not a read of entries; a dismissed thread's marker stays its reader's
    where: (v) => (v.kind === 'person'
      ? `(activity_thread_seen.viewer_slug = ${sqlList([v.slug])} AND activity_thread_seen.root_id IN (SELECT id FROM activity_entries))`
      : '0'),
  },
  entity_seen: {
    kind: 'scoped', key: ['entity_type', 'entity_id', 'viewer_slug'], dependsOn: ALL_PARENTS,
    where: (v) => entityVisible(v, 'entity_seen.entity_type', 'entity_seen.entity_id'),
  },
  watchlist: {
    kind: 'scoped', key: 'id', dependsOn: ALL_PARENTS,
    where: (v) => entityVisible(v, 'watchlist.entity_type', 'watchlist.entity_id', {
      action_item: `watchlist.entity_id IN ${VISIBLE_TASK_IDS}`,
    }),
  },
  // A reaction on an activity entry (a project update or a comment) follows it.
  reactions: {
    kind: 'scoped', key: 'id', dependsOn: ['activity_entries'],
    // activity-hidden-exempt: an access rule, not a read of entries; a hidden (dismissed) entry's reactions stay its own
    where: () => '(reactions.target_id IN (SELECT id FROM activity_entries) OR reactions.target_id NOT IN (SELECT id FROM main.activity_entries))',
  },
  links: {
    kind: 'scoped', key: 'id', dependsOn: ['projects', 'tasks'],
    where: (v) => (projectsScoped(v)
      ? `(CASE links.owner_table WHEN 'projects' THEN ${inVisibleProject('links.owner_id')} WHEN 'tasks' THEN links.owner_id IN ${VISIBLE_TASK_IDS} ELSE 0 END)`
      : null),
  },
  // activity_log: a meeting's, project's or task's rows follow it, and PB
  // automation rows (pb_session: 9,954 in prod; sync: 481) are the PI's alone.
  // They are PB's session log, not lab activity, and GET /api/activity served
  // them to every member (and, through its anonShape, to the logged-out
  // /pulse kiosk).
  activity_log: {
    kind: 'scoped', key: 'id', dependsOn: ALL_PARENTS,
    where: (v) => {
      const arms = [`WHEN 'meeting' THEN activity_log.related_id IN (SELECT id FROM meetings)`]
      if (projectsScoped(v)) {
        arms.push(`WHEN 'project' THEN ${inVisibleProject('activity_log.related_id')}`)
        arms.push(`WHEN 'projects' THEN ${inVisibleProject('activity_log.related_id')}`)
        arms.push(`WHEN 'task' THEN activity_log.related_id IN ${VISIBLE_TASK_IDS}`)
        arms.push(`WHEN 'tasks' THEN activity_log.related_id IN ${VISIBLE_TASK_IDS}`)
      }
      return all([
        v.kind === 'person' && v.pi ? null : `COALESCE(activity_log.type, '') NOT IN ('pb_session', 'sync')`,
        // A row written with no related_type (handleCreateProject logs
        // type='project', related_id=<id>, related_type NULL) is typed by its
        // `type`, so "Created project: X" follows project X.
        `(CASE COALESCE(NULLIF(activity_log.related_type, ''), activity_log.type, '') ${arms.join(' ')} ELSE 1 END)`,
      ])
    },
  },

  // By project.
  conference_submissions: byProject('conference_submissions', 'project_id'),
  manuscript_revisions: byProject('manuscript_revisions', 'project_id', 'id', false),
  regulatory_items: byProject('regulatory_items', 'project_id', 'id', false),
  submission_events: byProject('submission_events', 'project_id', 'id', false),
  project_documents: byProject('project_documents', 'project_id', 'id', false),
  project_publications: byProject('project_publications', 'project_id', ['project_id', 'publication_id'], false),
  project_state_log: byProject('project_state_log', 'project_id', 'id', false),
  file_activity_daily: byProject('file_activity_daily', 'project_id'),
  milestones: byProject('milestones', 'project_id'),
  ideas: byProject('ideas', 'project_id'),
  inbox: byProject('inbox', 'project_id'),
  contributions: byProject('contributions', 'project_slug'),
  lab_questions: byProject('lab_questions', 'project_slug'),
  paper_project_links: byProject('paper_project_links', 'project_slug', 'id', false),
  narrative_projects: byProject('narrative_projects', 'project_slug', ['narrative_id', 'project_slug'], false),
  project_dependencies: {
    kind: 'scoped', key: 'id', dependsOn: ['projects'],
    where: (v) => (projectsScoped(v)
      ? `(${inVisibleProject('project_dependencies.from_project_id')} AND ${inVisibleProject('project_dependencies.to_project_id')})`
      : null),
  },
  reviewer_comments: {
    kind: 'scoped', key: 'id', dependsOn: ['manuscript_revisions'],
    where: (v) => (projectsScoped(v) ? 'reviewer_comments.revision_id IN (SELECT id FROM manuscript_revisions)' : null),
  },
  lab_answers: {
    kind: 'scoped', key: 'id', dependsOn: ['lab_questions'],
    where: (v) => (projectsScoped(v) ? 'lab_answers.question_id IN (SELECT id FROM lab_questions)' : null),
  },
  // An artifact follows its task and its project; a public artifact is public.
  artifacts: {
    kind: 'scoped', key: 'id', dependsOn: ['projects', 'tasks'],
    where: (v) => (projectsScoped(v)
      ? `(artifacts.visibility = 'public' OR ((artifacts.task_id IS NULL OR artifacts.task_id IN ${VISIBLE_TASK_IDS}) `
        + `AND (artifacts.project_id IS NULL OR ${inVisibleProject('artifacts.project_id')})))`
      : null),
  },
  artifact_tags: {
    kind: 'scoped', key: ['artifact_id', 'tag'], dependsOn: ['artifacts'],
    where: (v) => (projectsScoped(v) ? 'artifact_tags.artifact_id IN (SELECT id FROM artifacts)' : null),
  },
  artifact_versions: {
    kind: 'scoped', key: ['artifact_id', 'version'], dependsOn: ['artifacts'],
    where: (v) => (projectsScoped(v) ? 'artifact_versions.artifact_id IN (SELECT id FROM artifacts)' : null),
  },
  // An AI request follows the project it names and, when it came from a task, the task.
  ai_requests: {
    kind: 'scoped', key: 'id', dependsOn: ['projects', 'tasks'],
    where: (v) => (projectsScoped(v)
      ? `((ai_requests.project_slug IS NULL OR ${inVisibleProject('ai_requests.project_slug')}) `
        + `AND (COALESCE(ai_requests.source_type, '') <> 'task' OR ai_requests.source_id IN ${VISIBLE_TASK_IDS}))`
      : null),
  },
  commitments: {
    kind: 'scoped', key: 'id', dependsOn: ['projects', 'tasks'],
    where: (v) => (projectsScoped(v)
      // commitments.project is free text; '' is how a writer says "no
      // project", so it reads as NULL, not as a reference nobody can see.
      ? `((NULLIF(commitments.project, '') IS NULL OR ${inVisibleProject('commitments.project')}) `
        + `AND (commitments.task_id IS NULL OR commitments.task_id IN ${VISIBLE_TASK_IDS}))`
      : null),
  },

  // By task.
  task_files: byTask('task_files', 'task_id'),
  task_subtasks: byTask('task_subtasks', 'task_id'),
  task_handoffs: byTask('task_handoffs', 'task_id'),
  hub_pomodoro_slots: byTask('hub_pomodoro_slots', 'task_id'),

  _meta: LAB, agent_knowledge: LAB, bug_reports: LAB, day_capacity: LAB, deadline_dependencies: LAB,
  decisions: LAB, digest_comments: LAB, dispatch_queue: LAB, expertise_tags: LAB, grant_milestones: LAB,
  grants: LAB, inbox_events: LAB, kg_entities: LAB, kg_relation_type_registry: LAB, kg_relations: LAB,
  lab_settings: LAB, launch_log: LAB, member_featured_publications: LAB, memory_facts: LAB,
  mentee_milestones: LAB, nih_grants: LAB, notifications: LAB, open_science_resources: LAB,
  pb_sessions: LAB, pomodoro_sessions: LAB, processed_mutations: LAB, publications: LAB,
  pubmed_sync_log: LAB, research_digest: LAB, research_narratives: LAB, schema_migrations: LAB,
  sessions: LAB, team_members: LAB, trainee_milestones: LAB, trajectories: LAB, user_calendar_events: LAB,
  user_calendar_feeds: LAB, workflow_templates: LAB,
}
