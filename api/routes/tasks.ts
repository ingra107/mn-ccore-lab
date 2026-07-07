import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, isPiRequest, resolveActor, assertProjectVisible, projectRefToCanonical } from '../helpers';
import { filterFixtures } from '../lib/fixtures';
import { ctToday } from '../lib/ct-date';
import { nowInstant } from '../lib/time';
import { applyMutation } from './mutations';
// TASK_SELECT_COLS moved to api/lib/task-cols.ts so helpers.ts (safeTaskRow)
// can import it without creating a circular dependency.
// Fix 5: removed dead re-export — callers import directly from ../lib/task-cols
// or via api/helpers.ts which already re-exports it (zero callers used this path).
import { TASK_SELECT_COLS, TASK_SELECT_COLS_TYPED } from '../lib/task-cols';
import { postActivityEntry, activityVisibilityGate } from '../lib/activity-entry';
import { TASK_ALLOWED_FIELDS } from '../../pb-schema/pb_schema/generated/route-field-lists.generated.ts';

// ── Fix 3: guardTaskProject ────────────────────────────────────────────────────
//
// Consolidates the repeated pattern:
//   SELECT project_id FROM tasks WHERE id=?  →  assertProjectVisible
// used in 6 task-subresource handlers. Returns { block: Response, projectId: null }
// when the caller is denied, or { block: null, projectId } when allowed. Callers
// can reuse `projectId` downstream (e.g. the @hermes path in handleAddTaskComment
// previously did a second identical SELECT).
async function guardTaskProject(
  env: Env,
  request: Request,
  taskId: string,
): Promise<{ block: Response; projectId: null } | { block: null; projectId: string | null }> {
  const task = await env.DB.prepare(
    'SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL'
  ).bind(taskId).first<{ project_id: string | null }>();
  if (!task) {
    return { block: error('Task not found', 404), projectId: null };
  }
  if (task.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id);
    if (block) return { block, projectId: null };
  }
  return { block: null, projectId: task.project_id ?? null };
}

// PB §2D (2026-06-10): derive a task's Gmail-thread deep link from its
// source_thread_id at create time. The exact URL string is a PB contract —
// backfill_email_links.py + invariant I40 pin this format — so keep both task
// mint paths (handleCreateTask, handleMobileTasksToHub) producing it identically.
function gmailThreadUrl(threadId: string | null | undefined): string | null {
  return threadId ? `https://mail.google.com/mail/u/1/#inbox/${threadId}` : null;
}

// GET /api/tasks/overdue-count?assignee= — lightweight counts for sidebar badge.
// Returns { count: <overdue>, unseen: <unacknowledged> }. `unseen` (2026-06-11,
// Slack-style seen model) = open tasks the assignee hasn't OPENED yet
// (acknowledged_at IS NULL — auto-ack fires on first view; self-created tasks
// are born acknowledged). Both counts exclude soft-deleted rows (deleted_at
// guard added same date — deleted overdue tasks previously inflated the badge).
export async function handleOverdueCount(url: URL, env: Env): Promise<Response> {
  const assignee = url.searchParams.get('assignee')
  const today = ctToday()
  let query = `SELECT
    SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) as count,
    SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END) as unseen
    FROM tasks WHERE completed = 0 AND deleted_at IS NULL`
  const params: string[] = [today]
  if (assignee) { query += ' AND assignee = ?'; params.push(assignee) }
  const result = await env.DB.prepare(query).bind(...params).first<{ count: number | null; unseen: number | null }>()
  return json({ data: { count: result?.count ?? 0, unseen: result?.unseen ?? 0 } })
}

// GET /api/tasks?assignee=&status=&priority=&project=&meeting=&completed=&source=
//
// 2026-04-28 (schema-v51): when ?seq_after=N is present, switches to
// sync-cursor mode: filters seq > N, orders by seq ASC, applies limit
// (default 2000). Canonical pull path for brain.db's hub.py post-cutover.
// updated_since/created_since remain for back-compat. seq_after wins.
//
// Fix 2a: canSeePb=false (non-PI callers) filters out tasks belonging to
// Peripheral Brain category projects. Mirrors the pattern in handleGetRecentTaskUpdates.
export async function handleGetTasks(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const assignee = url.searchParams.get('assignee');
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const project = url.searchParams.get('project');
  const meetingId = url.searchParams.get('meeting') || url.searchParams.get('meeting_id');
  const completed = url.searchParams.get('completed');
  const source = url.searchParams.get('source');
  const updatedSince = url.searchParams.get('updated_since');
  const createdSince = url.searchParams.get('created_since');
  const seqAfterRaw = url.searchParams.get('seq_after');
  const limitRaw = url.searchParams.get('limit');
  // Sync pipelines need to see soft-deletes to mirror them into brain.db.
  // Default: hide deleted tasks (existing UI contract). Opt-in via flag.
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  // Sync pipelines also need to see QA fixtures to detect their status.
  // UI views never want them (R4-P1-01).
  const includeFixtures = url.searchParams.get('include_fixtures') === '1' || includeDeleted;

  // A2 (Slice C, 2026-06-08): ?wire=typed returns the raw stored `proj_*` PK in
  // project_id (TASK_SELECT_COLS_TYPED) instead of the COALESCE slug form used by
  // the browser. Gated to authenticated/PI callers only (canSeePb) — a public
  // browser request never receives raw PKs. The sync pull path (hub.py seq_after
  // cursor) uses this to store the canonical typed PK in brain.db's local cache.
  const wireTyped = url.searchParams.get('wire') === 'typed' && canSeePb;
  const selectCols = wireTyped ? TASK_SELECT_COLS_TYPED : TASK_SELECT_COLS;

  const deletedFilter = includeDeleted ? '1=1' : 't.deleted_at IS NULL';
  // Fix 2a: mirror the PB exclusion pattern from handleGetRecentTaskUpdates.
  // Non-PI callers must not see tasks that belong to Peripheral Brain projects.
  const pbExclusion = canSeePb ? '' : ` AND (t.project_id IS NULL OR t.project_id NOT IN (
    SELECT id FROM projects WHERE category = 'Peripheral Brain'
    UNION SELECT slug FROM projects WHERE category = 'Peripheral Brain'
  ))`;
  let query = `SELECT ${selectCols}, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE ${deletedFilter}${pbExclusion}`;
  const params: (string | number)[] = [];

  if (seqAfterRaw !== null) {
    const seqAfter = Number.parseInt(seqAfterRaw, 10);
    if (!Number.isFinite(seqAfter) || seqAfter < 0) {
      return error('seq_after must be a non-negative integer', 400);
    }
    query += ' AND t.seq > ?';
    params.push(seqAfter);
  }

  if (assignee) { query += ' AND t.assignee = ?'; params.push(assignee); }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  // Direction 1 (2026-06-05): tasks.project_id STORES the typed proj_* PK, but
  // callers filter by slug (projectOptions use p.slug). Resolve the ref to its
  // typed PK and match either form — the typed-PK majority via the resolved id,
  // and any legacy slug-stored task row via the raw value. Accepts an id param
  // too (the subquery's `id = ?` arm). See api/lib/task-cols.ts.
  if (project) {
    query += ' AND (t.project_id = (SELECT id FROM projects WHERE slug = ? OR id = ? LIMIT 1) OR t.project_id = ?)';
    params.push(project, project, project);
  }
  if (meetingId) { query += ' AND t.meeting_id = ?'; params.push(meetingId); }
  if (source) { query += ' AND t.source = ?'; params.push(source); }
  if (completed !== null && completed !== undefined) {
    query += ' AND t.completed = ?';
    params.push(completed === 'true' ? 1 : 0);
  }
  if (updatedSince) { query += ' AND t.updated_at > ?'; params.push(updatedSince); }
  if (createdSince) { query += ' AND t.created_at > ?'; params.push(createdSince); }

  if (seqAfterRaw !== null) {
    const limit = limitRaw ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 2000, 1), 5000) : 2000;
    query += ' ORDER BY t.seq ASC LIMIT ?';
    params.push(limit);
  } else {
    query += ' ORDER BY t.completed ASC, t.due_date ASC, t.created_at DESC';
  }

  const result = await env.DB.prepare(query).bind(...params).all();
  const rows = filterFixtures(result.results, 'title', includeFixtures);
  return json({ data: rows, count: rows.length });
}

// POST /api/tasks/:id/status — change task status (todo/in_progress/done/blocked/waiting_external)
export async function handleUpdateTaskStatus(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  // T1.1: PB-visibility gate. Mirrors handleGetTaskComments / handlePostTaskUpdate
  // — non-PI callers cannot mutate tasks attached to Peripheral Brain projects.
  // API-key callers (PB sync, Hermes) pass via isPiRequest=true.
  const guard = await guardTaskProject(env, request, id);
  if (guard.block) return guard.block;

  const body = await request.json() as { status: string };
  if (!body.status || !['todo', 'in_progress', 'done', 'blocked', 'waiting_external'].includes(body.status)) {
    return error('status must be one of: todo, in_progress, done, blocked, waiting_external', 400);
  }

  const item = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ title: string; description: string; assignee: string; assigned_by: string | null }>();
  if (!item) return error('Task not found', 404);

  const completed = body.status === 'done' ? 1 : 0;
  const completedAt = completed ? nowInstant() : null;
  const completedBy = completed ? user.email : null;

  const mutResult = await applyMutation(env, {
    table: 'tasks',
    record_id: id,
    op: 'update',
    patch: {
      status: body.status,
      completed,
      completed_at: completedAt,
      completed_by: completedBy,
    },
    route: 'handleUpdateTaskStatus',
    user,
  });
  if (mutResult.status !== 'accepted' && mutResult.status !== 'merged_clean') {
    return error(`mutation rejected: ${mutResult.status} — ${mutResult.reason ?? ''}`, 409);
  }

  await logActivity(env, 'task', `${body.status === 'done' ? 'Completed' : `Status → ${body.status}`}: "${item.title || item.description}"`, user.email, id, 'task');

  // Notify assigner when task is completed
  if (completed && item.assigned_by) {
    try {
      const assignerSlug = actorSlug(item.assigned_by);
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), assignerSlug, 'update', 'task', id, `${user.name || user.email} completed a task`, (item.title || item.description).slice(0, 200), `/portal/my-tasks?open=${id}`).run();
    } catch (e) { console.error('Failed to create completion notification:', e); }
  }

  const updated = await env.DB.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.id = ?`).bind(id).first();
  return json({ data: updated });
}

// GET /api/tasks/:id — fetch a single task by primary key.
// Applies the same deleted_at IS NULL filter as the list endpoint so
// a task visible in GET /api/tasks?limit=500 is always reachable here.
// mechanic I5: previously no GET-by-PK route existed — direct lookups
// returned 404 for every task regardless of status.
// Fix 2b: assertProjectVisible guards PB-category task visibility for non-PI callers.
// T1.4: request is now NON-optional. The previous optional signature created
// a silent-bypass footgun — any internal caller that forgot to pass the
// request would skip the PB gate entirely. Single call site in api/index.ts
// already passes R(c).
export async function handleGetTask(id: string, env: Env, request: Request): Promise<Response> {
  const task = await env.DB.prepare(
    `SELECT ${TASK_SELECT_COLS}, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE t.id = ? AND t.deleted_at IS NULL`
  ).bind(id).first<Record<string, unknown> & { project_id?: string | null }>();
  if (!task) return error('Task not found', 404);
  // Gate on PB visibility before returning the task row.
  if (task.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id as string);
    if (block) return block;
  }
  return json({ data: task });
}

// GET /api/action-items and POST /api/action-items/:id/toggle (handleActionItems,
// handleToggleTask) were retired in T19 (#547) — the action_items table has had
// no writes since ~2026-03-30 (POST /api/action-items aliased to handleCreateTask
// before this sprint) and every reader has converted to the tasks model. The
// action_items TABLE stays (rollback net, one cycle) — see schema-v96 backfill.

// POST /api/tasks/:id — update task fields
// Generated from schema_dsl §6 — see pb-schema/pb_schema/generated/route-field-lists.generated.ts / backlog #225 A1.
export { TASK_ALLOWED_FIELDS };
const VALID_GROUP_OVERRIDES = new Set(['deep', 'priorities', 'quick', 'pb', 'etl']);
// plan_slot vocabulary: 'right_now' | 'strip' | 'between-<n>' (<n> a non-negative
// integer timeline-gap index). Parametric (between-<n>) so it's value-guarded here,
// NOT via the enum-domain trigger. NULL/'' clears the slot. Mirrors group_override's
// posture (a Hub write-boundary guard, 400 on junk).
const VALID_PLAN_SLOT_RE = /^(right_now|strip|between-\d+)$/;
const TASK_REQUIRED_FIELDS = new Set(['status', 'priority', 'assignee']);

export async function handleUpdateTask(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  // T1.1: PB-visibility gate. Non-PI callers cannot mutate tasks attached
  // to Peripheral Brain projects. API-key callers pass via isPiRequest=true.
  const guard = await guardTaskProject(env, request, id);
  if (guard.block) return guard.block;

  const body = await request.json() as Record<string, unknown>;

  // Validate assignee slug exists (same guard as create — Suite 8 propagation).
  if (typeof body.assignee === 'string' && body.assignee !== 'claude-ai') {
    const member = await env.DB.prepare('SELECT 1 FROM team_members WHERE slug = ? LIMIT 1').bind(body.assignee).first();
    if (!member) return error(`Unknown assignee "${body.assignee}". Must match team_members.slug.`, 400);
  }
  // Resolve project_id to canonical slug (accept id OR slug). Bogus → NULL.
  // Pattern D: use projectRefToCanonical from helpers (dedup of inline resolver).
  if (typeof body.project_id === 'string' && body.project_id) {
    body.project_id = await projectRefToCanonical(env, body.project_id);
  }
  // Validate group_override is one of the canonical group keys (or null/empty
  // = clear override + return to auto-classification).
  if ('group_override' in body) {
    const v = body.group_override;
    if (v === '' || v === undefined) body.group_override = null;
    else if (v !== null && (typeof v !== 'string' || !VALID_GROUP_OVERRIDES.has(v))) {
      return error(`Invalid group_override "${v}". Must be one of deep/priorities/quick/pb/etl or null.`, 400);
    }
  }
  // Validate plan_slot (Workstream B). '' / undefined = clear; null = clear;
  // otherwise must match right_now | strip | between-<n>. 400 on junk so an
  // optimistic Today plan-write surfaces an error instead of silently reverting.
  if ('plan_slot' in body) {
    const v = body.plan_slot;
    if (v === '' || v === undefined) body.plan_slot = null;
    else if (v !== null && (typeof v !== 'string' || !VALID_PLAN_SLOT_RE.test(v))) {
      return error(`Invalid plan_slot "${v}". Must be right_now, strip, between-<n>, or null.`, 400);
    }
  }
  // Validate plan_start_min (Today timeline task-blocks Phase 2). '' / undefined
  // = clear (NULL = planned-but-not-time-positioned); null = clear; otherwise an
  // integer minutes-since-midnight in [0, 1439]. 400 on junk so an optimistic
  // drag-to-time write surfaces an error instead of silently reverting.
  if ('plan_start_min' in body) {
    const v = body.plan_start_min;
    if (v === '' || v === undefined) body.plan_start_min = null;
    else if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1439)) {
      return error(`Invalid plan_start_min "${v}". Must be an integer 0..1439 (minutes since midnight) or null.`, 400);
    }
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of TASK_ALLOWED_FIELDS) {
    if (field in body) {
      // AM-1 (SEC-T0-5): protected field present-but-null/empty is a hard 400,
      // not a silent skip. The old `continue` dropped the bad value but applied
      // the rest of the patch, so the client's optimistic status/priority/
      // assignee edit silently reverted with no error surfaced.
      if (TASK_REQUIRED_FIELDS.has(field) && (body[field] === null || body[field] === undefined || body[field] === '')) {
        return error(`Protected field "${field}" on tasks cannot be null or empty`, 400);
      }
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  // Handle status -> completed sync.
  // If the client explicitly passed completed / completed_at / completed_by,
  // those were already pushed via TASK_ALLOWED_FIELDS above — don't clobber.
  // Only auto-derive from status when the client didn't supply them.
  if ('status' in body) {
    const isDone = body.status === 'done';
    if (!('completed' in body)) {
      updates.push('completed = ?');
      params.push(isDone ? 1 : 0);
    }
    // completed_at and completed_by: set on done, CLEAR on reopen.
    // The previous isDone-only guard left stale completed_at/completed_by on
    // rows that were reopened via handleUpdateTask (single-item update path).
    // Bulk paths (bulkAction/status, bulkAction/uncomplete) already null both
    // fields unconditionally — this makes the single-item path symmetric.
    if (!('completed_at' in body)) {
      updates.push('completed_at = ?');
      params.push(isDone ? nowInstant() : null);
    }
    if (!('completed_by' in body)) {
      updates.push('completed_by = ?');
      params.push(isDone ? user.email : null);
    }
  }

  // source_thread_id + email_link move as a derived pair on UPDATE, mirroring
  // both create paths (gmailThreadUrl at :525 / :1400). The Gmail Apps Script
  // morning run stamps source_thread_id onto matched EXISTING tasks through
  // this route — without the paired derivation those rows carry a thread id
  // with no Gmail link (caught live by PB invariant I40 on the first real
  // Apps Script morning after the create-path fix, 2026-06-11).
  if ('source_thread_id' in body && !('email_link' in body)) {
    updates.push('email_link = ?');
    params.push(gmailThreadUrl(typeof body.source_thread_id === 'string' && body.source_thread_id ? body.source_thread_id : null));
  }

  if (updates.length === 0) return error('No valid fields to update', 400);

  // D22 (2026-05-22): snapshot the current assignee before mutation so we can
  // emit a typed 'assignee_change' event when it genuinely changes. Fetch only
  // when body.assignee is present — avoids an extra query on unrelated updates.
  const prevAssignee = typeof body.assignee === 'string'
    ? await env.DB.prepare('SELECT assignee FROM tasks WHERE id = ?').bind(id).first<{ assignee: string | null }>()
    : null;

  // Build patch from the collected updates/params (fields already validated against TASK_ALLOWED_FIELDS,
  // including auto-derived completed/completed_at/completed_by from the status sync block above).
  // Re-key from the updates[] + params[] parallel arrays back to a patch object.
  const patchRecord: Record<string, unknown> = {};
  let paramIdx = 0;
  for (const setClause of updates) {
    const col = setClause.split(' = ')[0].trim();
    patchRecord[col] = params[paramIdx++];
  }

  const updateMutResult = await applyMutation(env, {
    table: 'tasks',
    record_id: id,
    op: 'update',
    patch: patchRecord,
    route: 'handleUpdateTask',
    user,
  });
  if (updateMutResult.status !== 'accepted' && updateMutResult.status !== 'merged_clean') {
    return error(`mutation rejected: ${updateMutResult.status} — ${updateMutResult.reason ?? ''}`, 409);
  }

  // D22: emit typed event only when assignee genuinely changed.
  if (prevAssignee !== null && body.assignee !== prevAssignee.assignee) {
    await logActivity(env, 'assignee_change', `Assignee: ${prevAssignee.assignee ?? '—'} → ${body.assignee as string}`, user.email, id, 'task');
  }

  const updated = await env.DB.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.id = ?`).bind(id).first();
  if (!updated) return error('Task not found', 404);
  return json({ data: updated });
}

// POST /api/tasks — create new task
export async function handleCreateTask(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    title?: string; description: string; assignee: string;
    meeting_id?: string; project_id?: string; due_date?: string;
    priority?: string; source?: string; status?: string;
    key_link_1?: string | null; key_link_1_desc?: string | null;
    key_link_2?: string | null; key_link_2_desc?: string | null;
    key_link_3?: string | null; key_link_3_desc?: string | null;
    // 2026-04-20 Airtable Funeral Phase 1 (schema v47): richer fields
    // sent by gmail-airtable.js Apps Script + peripheral-brain-mobile PWA.
    // Previously only stored in Airtable; now stored structured in Hub.
    // (`notes` dropped from the wire 2026-06-10 — pb-schema 0.4.0.)
    effort?: string | null;
    short_title?: string | null;
    source_thread_id?: string | null;
    related_message_ids?: string | null;
    // Meeting Accept/Decline (schema-v90, 2026-06-25): PB sets 'pending' on
    // create; Accept/Decline buttons patch to 'accepted'/'declined' later.
    approval_status?: 'pending' | 'accepted' | 'declined' | null;
  };
  if (!body.description || !body.assignee) return error('description and assignee required', 400);

  // Validate assignee exists in team_members — reject bogus slugs before
  // they pollute the DB. Deep-audit Suite 8 found 'not_a_real_person_xyz'
  // was accepted as-is. Hub-created-only slug 'claude-ai' is allowed for
  // the Hermes AI pipeline (writes tasks back via the API key path).
  if (body.assignee !== 'claude-ai') {
    const member = await env.DB.prepare('SELECT 1 FROM team_members WHERE slug = ? LIMIT 1').bind(body.assignee).first();
    if (!member) return error(`Unknown assignee "${body.assignee}". Must match team_members.slug.`, 400);
  }
  // Validate project_id if provided — match by slug OR id. Leave NULL on
  // bogus input (don't reject the whole create since project link is
  // optional on tasks).
  // Pattern D: use projectRefToCanonical from helpers (dedup of inline resolver).
  let resolvedProjectId: string | null = body.project_id ?? null;
  if (resolvedProjectId) {
    const canonical = await projectRefToCanonical(env, resolvedProjectId);
    if (!canonical) {
      console.warn(`Task create: unknown project_id "${resolvedProjectId}" — storing as NULL`);
    }
    resolvedProjectId = canonical;
  }

  const id = generateId('task');  // A1.2: typed ULID
  const title = body.title || body.description;
  const source = body.source || (body.meeting_id ? 'meeting' : 'manual');
  const priority = body.priority || 'medium';

  // Validate status if provided (R10 vocab)
  const status = body.status && ['todo', 'in_progress', 'done', 'blocked', 'waiting_external'].includes(body.status)
    ? body.status : 'todo';

  // Co-fill completion triad so the insert is internally consistent from birth.
  // assertCompletionTriad enforces status='done' <=> completed=1 <=> completed_at present;
  // the insert payload must satisfy this invariant, not rely on downstream defaults.
  const isInsertDone = status === 'done';

  const createMutResult = await applyMutation(env, {
    table: 'tasks',
    record_id: id,
    op: 'insert',
    payload: {
      title,
      description: body.description,
      assignee: body.assignee,
      assigned_by: user.email,
      meeting_id: body.meeting_id ?? null,
      project_id: resolvedProjectId,
      due_date: body.due_date ?? null,
      deadline: body.deadline ?? null,
      priority,
      status,
      source,
      completed: isInsertDone ? 1 : 0,
      completed_at: isInsertDone ? nowInstant() : null,
      completed_by: isInsertDone ? user.email : null,
      key_link_1: body.key_link_1 ?? null,
      key_link_1_desc: body.key_link_1_desc ?? null,
      key_link_2: body.key_link_2 ?? null,
      key_link_2_desc: body.key_link_2_desc ?? null,
      key_link_3: body.key_link_3 ?? null,
      key_link_3_desc: body.key_link_3_desc ?? null,
      effort: body.effort ?? null,
      short_title: body.short_title ?? null,
      source_thread_id: body.source_thread_id ?? null,
      related_message_ids: body.related_message_ids ?? null,
      // Meeting Accept/Decline (schema-v90, 2026-06-25): pass through from
      // request body so PB-created meeting_approval tasks land with 'pending'.
      approval_status: body.approval_status ?? null,
      // PB §2D (2026-06-10): every source_thread_id-bearing task is minted
      // HERE (Apps Script "Email Tasks") — derive the Gmail-thread link at
      // create so PB's backfill_email_links.py + invariant I40 can retire.
      email_link: gmailThreadUrl(body.source_thread_id),
    },
    route: 'handleCreateTask',
    user,
  });
  if (createMutResult.status !== 'accepted') {
    return error(`mutation rejected: ${createMutResult.status} — ${createMutResult.reason ?? ''}`, 409);
  }

  // #523: applyInsert's I18 (title, project_id) dedup can adopt an EXISTING
  // row instead of inserting `id` — canonical_payload.id is the row that
  // actually represents this create afterward. Without this, a dedup hit
  // silently returned {data: null} below (the SELECT ... WHERE id = ? found
  // nothing, since `id` was never inserted). This route has no pre-check of
  // its own (unlike handleMobileTasksToHub) — every direct-route/Gmail create
  // relies on this to be correct.
  const resultId = (createMutResult.canonical_payload?.id as string | undefined) ?? id;

  await logActivity(env, 'task', `Created task: "${title}" → ${body.assignee}`, user.email, resultId, 'task');

  // Notify assignee if it's someone else
  try {
    const assignee = body.assignee;
    const authorSlug = actorSlug(user.email);
    if (assignee && assignee !== authorSlug) {
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        generateId(),
        assignee,
        'assignment',
        'task',
        resultId,
        `${user.name || user.email} assigned you a task`,
        title.slice(0, 200),
        `/portal/my-tasks?open=${resultId}`,
      ).run();

      // Email notification (fire-and-forget, only if Resend configured)
      if (env.RESEND_API_KEY) {
        const { sendEmail, taskAssignmentEmail } = await import('../lib/email');
        const member = await env.DB.prepare('SELECT name, email FROM team_members WHERE slug = ?').bind(assignee).first<{ name: string; email: string | null }>();
        if (member) {
          const email = taskAssignmentEmail(user.name || user.email, title, resultId);
          email.to = member.email || `${assignee}@umn.edu`;
          sendEmail(env.RESEND_API_KEY, email).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('Failed to create assignment notification:', e);
  }

  const created = await env.DB.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.id = ?`).bind(resultId).first();
  return json({ data: created }, 201);
}

// GET /api/tasks/:id/comments
// Projection over activity_entries (kind='comment') preserving the legacy
// task_comments response shape (id, task_id, author_slug, content, created_at)
// so the frontend + PB's process_hub_comments.py consume it unmodified.
export async function handleGetTaskComments(taskId: string, request: Request, env: Env): Promise<Response> {
  // Fix 3: guardTaskProject consolidates the repeated SELECT+assertProjectVisible pattern.
  const guard = await guardTaskProject(env, request, taskId);
  if (guard.block) return guard.block;
  const vis = await activityVisibilityGate(request, env);
  const result = await env.DB.prepare(
    `SELECT id, entity_id AS task_id, actor_slug AS author_slug, body AS content, created_at
     FROM activity_entries
     WHERE entity_type = 'task' AND entity_id = ? AND kind = 'comment' AND ${vis.clause}
     ORDER BY created_at DESC, id DESC`
  ).bind(taskId, ...vis.binds).all();
  return json({ data: result.results || [] });
}

// POST /api/tasks/:id/comments
// Writes through the unified postActivityEntry() primitive (kind='comment').
// That primitive owns @me/visibility, @mention notifications (preserving
// source_type='task_comment'), and the @hermes dispatch + placeholder — so this
// handler is now just actor resolution + the activity_log echo + response shaping.
export async function handleAddTaskComment(taskId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; author_slug?: string; visibility?: string };
  if (!body.content?.trim()) return error('content required', 400);

  // Fix 3: guardTaskProject replaces the two duplicate SELECTs that were here:
  // one for the gate and one for the @hermes project_id lookup below.
  // projectId is reused (passed to postActivityEntry), eliminating a round-trip.
  const guard = await guardTaskProject(env, request, taskId);
  if (guard.block) return guard.block;
  const taskProjectId = guard.projectId;

  // AM-2: validate/canonicalize author_slug; impersonation requires PI/service.
  // claude-ai (Hermes) is always allowed by resolveActor.
  const actor = await resolveActor(env, user, body.author_slug, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const authorSlug = actor.slug;

  const posted = await postActivityEntry({
    env,
    user,
    entityType: 'task',
    entityId: taskId,
    kind: 'comment',
    body: body.content,
    actorSlug: authorSlug,
    visibility: body.visibility === 'author' ? 'author' : undefined,
    taskProjectId,
  });
  if (!posted.ok) return error(posted.error, posted.status);

  await logActivity(env, 'comment', `Commented on task`, authorSlug, taskId, 'task');

  // Preserve the legacy task_comments response shape for existing callers.
  const r = posted.row;
  const created = {
    id: r.id,
    task_id: r.entity_id,
    author_slug: r.actor_slug,
    content: r.body,
    created_at: r.created_at,
  };
  // Surface the artifact at-source key_link outcome (top-level, mirroring the
  // create-path's `linkSkipped`) so a non-zero slots_full is a visible signal.
  return json({ data: created, ...(posted.linkSkipped ? { linkSkipped: posted.linkSkipped } : {}) }, 201);
}

// GET /api/tasks/:id/activity — the UNIFIED feed (Design C, v77).
// All activity_entries for the task (every kind), visibility-gated, newest-first.
// This is the endpoint the frontend will adopt, replacing the 3-way client merge.
export async function handleGetTaskActivity(taskId: string, request: Request, env: Env): Promise<Response> {
  // Fix 3: guardTaskProject consolidates the repeated SELECT+assertProjectVisible pattern.
  const guard = await guardTaskProject(env, request, taskId);
  if (guard.block) return guard.block;
  const vis = await activityVisibilityGate(request, env);
  const result = await env.DB.prepare(
    `SELECT id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, created_at
     FROM activity_entries
     WHERE entity_type = 'task' AND entity_id = ? AND ${vis.clause}
     ORDER BY created_at DESC, id DESC`
  ).bind(taskId, ...vis.binds).all();
  return json({ data: result.results || [] });
}

// GET /api/tasks/:id/detail — fan-out for TodayPage/UnifiedMyTasks task detail drawer.
// Returns { why, updates, subtasks, blocks } in a single round-trip so the
// drawer doesn't have to do four parallel fetches. Read-only.
//
// T2.2 (2026-05-28): route through guardTaskProject for visibility + existence.
// Previously inlined the SELECT(id, description, project_id) + 404 + assertProjectVisible
// triad. Now the existence/visibility checks go through the helper (consistent
// with handleGetTaskComments / handleGetTaskUpdates / handlePostTaskUpdate);
// the description read still happens inline because the helper only returns
// project_id. One extra SELECT, but the read path is rare (detail-drawer
// fan-out) and the consistency win removes a duplication footgun.
export async function handleGetTaskDetail(taskId: string, request: Request, env: Env): Promise<Response> {
  const guard = await guardTaskProject(env, request, taskId);
  if (guard.block) return guard.block;

  // Updates merge activity_entries (Design C, v77 — author-written notes/comments,
  // visibility-gated) with legacy activity_log system rows that have meaningful
  // actor + summary. The activity_entries read covers ALL kinds; the noteUpdates
  // mapping below renders them as kind:'note'.
  const vis = await activityVisibilityGate(request, env);
  const [updatesRes, activityRes, subtasksRes, blocksRes] = await Promise.all([
    env.DB.prepare(
      `SELECT id, body AS content, actor_slug AS author_slug, update_type, created_at
       FROM activity_entries
       WHERE entity_type = 'task' AND entity_id = ? AND ${vis.clause}
       ORDER BY created_at DESC, id DESC LIMIT 20`
    ).bind(taskId, ...vis.binds).all(),
    env.DB.prepare(
      "SELECT id, actor, type, description, timestamp FROM activity_log WHERE related_id = ? AND related_type = 'task' ORDER BY timestamp DESC LIMIT 20"
    ).bind(taskId).all(),
    env.DB.prepare(
      'SELECT id, title, completed FROM task_subtasks WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC'
    ).bind(taskId).all().catch(() => ({ results: [] as Array<Record<string, unknown>> })),
    // "blocks" = other tasks whose blocked_by mentions this id. blocked_by is
    // a free-text column (sometimes single id, sometimes comma-list); LIKE
    // matches both shapes safely.
    env.DB.prepare(
      "SELECT id, title FROM tasks WHERE deleted_at IS NULL AND blocked_by LIKE ? AND id != ? LIMIT 10"
    ).bind(`%${taskId}%`, taskId).all(),
  ]);

  type UpdateRow = { id: string; content: string; author_slug: string | null; update_type: string | null; created_at: string };
  type ActivityRow = { id: string; actor: string | null; type: string; description: string | null; timestamp: string };

  const noteUpdates = (updatesRes.results as UpdateRow[]).map((u) => ({
    id: u.id,
    when: u.created_at,
    who: u.author_slug ?? 'system',
    text: u.content,
    kind: 'note' as const,
  }));
  // De-dupe the "Posted note on X: Y" echo. handlePostTaskUpdate writes the
  // note into task_updates AND logs a `task_update` activity row quoting the
  // same content. Both sources merge into this one drawer feed, so the note
  // rendered twice (once as kind:'note', once as kind:'event'). The activity
  // echo stays a legitimate ENTRY on the global ActivityPage timeline and the
  // task-scoped /activity feed (TaskActivityFeed) — it's only redundant HERE,
  // where the real note already appears. Filtering at read also retroactively
  // suppresses legacy echo rows already persisted in activity_log.
  const eventUpdates = (activityRes.results as ActivityRow[])
    .filter((a) => a.description && a.type !== 'task_update')
    .map((a) => ({
      id: a.id,
      when: a.timestamp,
      who: a.actor ?? 'system',
      text: a.description || a.type,
      kind: 'event' as const,
    }));
  // Merge by recency — both ordered DESC already, so a stable sort is fine.
  const updates = [...noteUpdates, ...eventUpdates]
    .sort((a, b) => (a.when > b.when ? -1 : a.when < b.when ? 1 : 0))
    .slice(0, 30);

  return json({
    data: {
      updates,
      subtasks: subtasksRes.results ?? [],
      blocks: blocksRes.results ?? [],
    },
  });
}

// POST /api/tasks/batch — batch update tasks
export async function handleBatchUpdateTasks(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    ids: string[]
    action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete' | 'status'
    value?: string
  }

  if (!body.ids?.length || !body.action) {
    return error('ids and action required', 400)
  }

  const applied: string[] = []
  const failed: { id: string; reason: string }[] = []

  switch (body.action) {
    case 'complete': {
      const completedAt = nowInstant()
      for (const id of body.ids) {
        try {
          const mutResult = await applyMutation(env, {
            table: 'tasks',
            record_id: id,
            op: 'update',
            patch: { status: 'done', completed: 1, completed_at: completedAt, completed_by: user.email },
            route: 'handleBatchUpdateTasks/complete',
            user,
          })
          if (mutResult.status === 'accepted' || mutResult.status === 'merged_clean') {
            applied.push(id)
          } else {
            const reason = `${mutResult.status} — ${mutResult.reason ?? ''}`
            console.error(`bulkAction complete failed for ${id}: ${reason}`)
            failed.push({ id, reason })
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e)
          console.error(`bulkAction complete threw for ${id}: ${reason}`)
          failed.push({ id, reason })
        }
      }
      break
    }

    case 'uncomplete': {
      for (const id of body.ids) {
        try {
          const mutResult = await applyMutation(env, {
            table: 'tasks',
            record_id: id,
            op: 'update',
            patch: { status: 'todo', completed: 0, completed_at: null, completed_by: null },
            route: 'handleBatchUpdateTasks/uncomplete',
            user,
          })
          if (mutResult.status === 'accepted' || mutResult.status === 'merged_clean') {
            applied.push(id)
          } else {
            const reason = `${mutResult.status} — ${mutResult.reason ?? ''}`
            console.error(`bulkAction uncomplete failed for ${id}: ${reason}`)
            failed.push({ id, reason })
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e)
          console.error(`bulkAction uncomplete threw for ${id}: ${reason}`)
          failed.push({ id, reason })
        }
      }
      break
    }

    case 'status': {
      if (!body.value || !['todo', 'in_progress', 'done', 'blocked', 'waiting_external'].includes(body.value)) {
        return error('value must be one of: todo, in_progress, done, blocked, waiting_external', 400)
      }
      const statusPatch: Record<string, unknown> = body.value === 'done'
        ? { status: 'done', completed: 1, completed_at: nowInstant(), completed_by: user.email }
        : { status: body.value, completed: 0, completed_at: null, completed_by: null }
      for (const id of body.ids) {
        try {
          const mutResult = await applyMutation(env, {
            table: 'tasks',
            record_id: id,
            op: 'update',
            patch: statusPatch,
            route: 'handleBatchUpdateTasks/status',
            user,
          })
          if (mutResult.status === 'accepted' || mutResult.status === 'merged_clean') {
            applied.push(id)
          } else {
            const reason = `${mutResult.status} — ${mutResult.reason ?? ''}`
            console.error(`bulkAction status failed for ${id}: ${reason}`)
            failed.push({ id, reason })
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e)
          console.error(`bulkAction status threw for ${id}: ${reason}`)
          failed.push({ id, reason })
        }
      }
      break
    }

    case 'assign': {
      if (!body.value) return error('value (assignee) required for assign action', 400)
      if (body.value !== 'claude-ai') {
        const member = await env.DB.prepare('SELECT 1 FROM team_members WHERE slug = ? LIMIT 1').bind(body.value).first()
        if (!member) return error(`Unknown assignee "${body.value}". Must match team_members.slug.`, 400)
      }
      // Bulk-fetch prior assignees in one query to avoid N+1 and enable typed
      // assignee_change activity events (parity with the single-task update path
      // at ~line 277). Map is keyed by task id.
      const assignPrev = new Map<string, string | null>()
      {
        const ph = body.ids.map(() => '?').join(',')
        const rows = await env.DB.prepare(`SELECT id, assignee FROM tasks WHERE id IN (${ph})`).bind(...body.ids).all<{ id: string; assignee: string | null }>()
        for (const r of (rows.results || [])) assignPrev.set(r.id, r.assignee)
      }
      for (const id of body.ids) {
        try {
          const mutResult = await applyMutation(env, {
            table: 'tasks',
            record_id: id,
            op: 'update',
            patch: { assignee: body.value },
            route: 'handleBatchUpdateTasks/assign',
            user,
          })
          if (mutResult.status === 'accepted' || mutResult.status === 'merged_clean') {
            applied.push(id)
            // Emit typed assignee_change only when the value actually changed.
            if (body.value !== assignPrev.get(id)) {
              await logActivity(env, 'assignee_change', `Assignee: ${assignPrev.get(id) ?? '—'} → ${body.value}`, user.email, id, 'task')
            }
          } else {
            const reason = `${mutResult.status} — ${mutResult.reason ?? ''}`
            console.error(`bulkAction assign failed for ${id}: ${reason}`)
            failed.push({ id, reason })
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e)
          console.error(`bulkAction assign threw for ${id}: ${reason}`)
          failed.push({ id, reason })
        }
      }
      break
    }

    case 'priority': {
      if (!body.value || !['low', 'medium', 'high', 'urgent'].includes(body.value)) {
        return error('value must be one of: low, medium, high, urgent', 400)
      }
      for (const id of body.ids) {
        try {
          const mutResult = await applyMutation(env, {
            table: 'tasks',
            record_id: id,
            op: 'update',
            patch: { priority: body.value },
            route: 'handleBatchUpdateTasks/priority',
            user,
          })
          if (mutResult.status === 'accepted' || mutResult.status === 'merged_clean') {
            applied.push(id)
          } else {
            const reason = `${mutResult.status} — ${mutResult.reason ?? ''}`
            console.error(`bulkAction priority failed for ${id}: ${reason}`)
            failed.push({ id, reason })
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e)
          console.error(`bulkAction priority threw for ${id}: ${reason}`)
          failed.push({ id, reason })
        }
      }
      break
    }

    case 'delete': {
      for (const id of body.ids) {
        try {
          const mutResult = await applyMutation(env, {
            table: 'tasks',
            record_id: id,
            op: 'delete',
            route: 'handleBatchUpdateTasks/delete',
            user,
          })
          if (mutResult.status === 'accepted' || mutResult.status === 'merged_clean') {
            applied.push(id)
          } else {
            const reason = `${mutResult.status} — ${mutResult.reason ?? ''}`
            console.error(`bulkAction delete failed for ${id}: ${reason}`)
            failed.push({ id, reason })
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e)
          console.error(`bulkAction delete threw for ${id}: ${reason}`)
          failed.push({ id, reason })
        }
      }
      // Cascade-clean notifications pointing at deleted tasks so orphans
      // don't accumulate (deep-audit 12.L found 151 stale notifs).
      // Note: done after mutations so IDs are valid at cascade time.
      const placeholders = body.ids.map(() => '?').join(',')
      try {
        await env.DB.prepare(
          `DELETE FROM notifications WHERE source_type IN ('task','task_comment') AND source_id IN (${placeholders})`
        ).bind(...body.ids).run()
      } catch (e) {
        console.error('cascade-clean notifications failed:', e)
      }
      break
    }
  }

  await logActivity(env, 'task', `Bulk ${body.action}: ${body.ids.length} tasks`, user.email, null, null)

  return json({ data: { ok: failed.length === 0, count: applied.length, applied, failed } })
}

// /api/tasks/sync-bulk: deleted 2026-05-12 — all task writes through /api/mutations. Codex system audit #8.

// POST /api/tasks/:id/delete — soft-delete a single task (mirrors handleDeleteProject).
//
// Parity with POST /api/projects/:slug/delete (projects.ts:478). Soft-deletes
// via tasks.deleted_at (schema v22) so sync_d1_pull can mirror the tombstone
// into brain.db without physical row loss. Idempotent: re-deleting an already-
// deleted task returns 200 with `idempotent: true`.
//
// Cascade:
//   - DELETE task_comments WHERE task_id = ?
//   - DELETE task_updates WHERE task_id = ?
//   - DELETE task_subtasks WHERE task_id = ?
//   - DELETE notifications WHERE source_type IN ('task','task_comment') AND source_id = ?
//
// Mirrors the batch-delete notification cleanup added for audit 12.L. Subtasks
// and task_updates are hard-deleted since they're UI-only artefacts of this task
// (no external sync to brain.db / Airtable).
export async function handleDeleteTask(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  // T1.1: PB-visibility gate. Non-PI callers cannot soft-delete tasks attached
  // to Peripheral Brain projects. API-key callers (sync) pass via isPiRequest.
  //
  // Inline (rather than guardTaskProject) because the idempotent re-delete
  // path needs to read already-soft-deleted rows; guardTaskProject's
  // `deleted_at IS NULL` filter would 404 on the second call and break the
  // documented idempotent: true return.
  const existing = await env.DB.prepare(
    'SELECT id, title, description, deleted_at, project_id FROM tasks WHERE id = ?'
  ).bind(id).first<{ id: string; title: string | null; description: string | null; deleted_at: string | null; project_id: string | null }>();

  if (!existing) {
    return error('Task not found', 404);
  }

  // T1.1: PB-visibility gate on the parent project. Done AFTER the existence
  // probe (so 404 is preserved as the correctness signal) but BEFORE the
  // idempotent return + cascade — non-PI must not be able to confirm or alter
  // PB-task lifecycle.
  if (existing.project_id) {
    const block = await assertProjectVisible(request, env, existing.project_id);
    if (block) return block;
  }

  const label = existing.title || existing.description || id;

  // Check idempotency BEFORE cascade: already soft-deleted?
  // Pre-fix this ran AFTER the cascade, so a retry would re-delete already-
  // cleaned child rows even when the task was already marked deleted_at.
  if (existing.deleted_at) {
    await logActivity(env, 'task_delete', `Deleted task (idempotent): ${label}`, user.email, id, 'task');
    return json({ data: { deleted: id, title: label, idempotent: true } });
  }

  // Cascade-clean child rows. task_subtasks carries a task_id FK-by-convention
  // (not enforced). Notifications cleanup mirrors the batch-delete path (12.L).
  // task_comments/task_updates dropped (schema-v78, 2026-06-10).
  try {
    // Design C (v77): unified-timeline rows for this task.
    await env.DB.prepare("DELETE FROM activity_entries WHERE entity_type = 'task' AND entity_id = ?").bind(id).run();
    try { await env.DB.prepare('DELETE FROM task_subtasks WHERE task_id = ?').bind(id).run(); } catch { /* table may not exist */ }
    await env.DB.prepare(
      "DELETE FROM notifications WHERE source_type IN ('task','task_comment') AND source_id = ?"
    ).bind(id).run();
  } catch (e) {
    console.error('task cascade-clean failed:', e);
  }

  // Soft-delete via applyMutation — stamps last_mutation_id + records in processed_mutations.
  const deleteMutResult = await applyMutation(env, {
    table: 'tasks',
    record_id: id,
    op: 'delete',
    route: 'handleDeleteTask',
    user,
  });
  if (deleteMutResult.status !== 'accepted' && deleteMutResult.status !== 'merged_clean') {
    return error(`mutation rejected: ${deleteMutResult.status} — ${deleteMutResult.reason ?? ''}`, 409);
  }

  await logActivity(env, 'task_delete', `Deleted task: ${label}`, user.email, id, 'task');

  return json({ data: { deleted: id, title: label } });
}

// POST /api/tasks/:id/acknowledge — closed-loop task acknowledgment (aviation CRM pattern)
//
// acknowledged_at / acknowledged_by are Hub-internal CRM fields (assignee receipts,
// notifications) — HUB_ONLY: no brain.db column and the PB outbox never emits them.
// As of pb-schema 0.4.0 (8fc11923, 2026-06-10) they ARE in the tasks wire contract,
// which let HUB-7 route this write through applyMutation (last_mutation_id
// stamped). No raw UPDATE remains here; route_no_raw_writes.test.ts guards
// this function like any other.
export async function handleAcknowledgeTask(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ title: string; description: string; assignee: string; assigned_by: string | null; acknowledged_at: string | null; project_id: string | null }>();
  if (!task) return error('Task not found', 404);

  // T1.1: PB-visibility gate. Non-PI callers cannot acknowledge tasks attached
  // to Peripheral Brain projects. Done AFTER existence probe (404 preserved)
  // and BEFORE idempotent already_acknowledged shortcut so non-PI cannot
  // confirm a PB-task acknowledgement state.
  if (task.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id);
    if (block) return block;
  }

  if (task.acknowledged_at) {
    return json({ data: { already_acknowledged: true, acknowledged_at: task.acknowledged_at } });
  }

  // Accept body.slug override for server-side / API-key callers who aren't
  // logged in as the acknowledging user (e.g. deep-audit tests, backfills,
  // Hermes). Falls back to the authenticated user's slug otherwise.
  let overrideSlug: string | null = null;
  try {
    const body = await request.json() as { slug?: string } | undefined;
    if (body?.slug && typeof body.slug === 'string') overrideSlug = body.slug.trim() || null;
  } catch { /* no body or non-JSON — fine */ }

  const now = nowInstant();
  const acknowledgedBy = overrideSlug ?? actorSlug(user.email);

  // HUB-7 (2026-06-10): route through applyMutation so last_mutation_id is
  // stamped. Unblocked by pb-schema 0.4.0, which added
  // acknowledged_at/acknowledged_by to the tasks wire contract.
  const ackMutResult = await applyMutation(env, {
    table: 'tasks',
    record_id: id,
    op: 'update',
    patch: { acknowledged_at: now, acknowledged_by: acknowledgedBy },
    route: 'handleAcknowledgeTask',
    user,
  });
  if (ackMutResult.status !== 'accepted' && ackMutResult.status !== 'merged_clean') {
    return error(`mutation rejected: ${ackMutResult.status} — ${ackMutResult.reason ?? ''}`, 409);
  }

  await logActivity(env, 'task', `Acknowledged: "${task.title || task.description}"`, user.email, id, 'task');

  // Notify the assigner that the task was acknowledged. Skip self-acks:
  // with auto-acknowledge-on-view (2026-06-11) this fires on every first open,
  // and a self-assigned task would otherwise notify the opener about their own
  // glance — the exact noise loop the seen-model removes.
  if (task.assigned_by && actorSlug(task.assigned_by) !== actorSlug(user.email)) {
    try {
      const assignerSlug = actorSlug(task.assigned_by);
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), assignerSlug, 'update', 'task', id, `${user.name || user.email} opened the task you assigned`, (task.title || task.description).slice(0, 200), `/portal/my-tasks?open=${id}`).run();
    } catch (e) { console.error('Failed to create acknowledge notification:', e); }
  }

  const updated = await env.DB.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.id = ?`).bind(id).first();
  return json({ data: updated });
}

// GET /api/task-updates/recent — bulk fetch recent task updates (for sync pull)
//
// Design C (v77): projection over activity_entries (kind='update'), preserving
// the legacy task_updates row shape (id, task_id, author_slug, content,
// update_type, created_at) so PB's pull stays unmodified.
//
// 2026-04-28 (Codex review fix): when ?since= is present, ORDER BY ASC so
// brain.db pull_task_updates can paginate forward without losing rows when
// volume between pulls exceeds limit. DESC kept for UI-style "newest 100".
// Phase 1b-B: canSeePb=false for non-PI callers — filter out updates for PB-project tasks.
// A server-to-server (canSeePb) caller sees author-only rows too; a non-PB
// caller is gated to visibility='team' (PB exclusion already removes Nick's PB
// tasks, but the visibility gate also covers @me notes on shared-project tasks).
export async function handleGetRecentTaskUpdates(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '100')
  const since = url.searchParams.get('since') // ISO timestamp for delta sync
  // Mirror the category filter from search/activity for non-PI callers.
  // activity_entries stores project_id directly, but keep the join-shape filter
  // for parity with the prior task_updates path (entity_id is the task id).
  const pbExclusion = canSeePb ? '' : ` AND (entity_id NOT IN (
    SELECT t.id FROM tasks t
    WHERE t.project_id IN (
      SELECT id FROM projects WHERE category = 'Peripheral Brain'
      UNION SELECT slug FROM projects WHERE category = 'Peripheral Brain'
    )
  )) AND visibility = 'team'`
  const cols = `id, entity_id AS task_id, actor_slug AS author_slug, body AS content, update_type, created_at`
  let query = `SELECT ${cols} FROM activity_entries WHERE entity_type = 'task' AND kind = 'update'`
  const binds: unknown[] = []
  if (since) {
    query += ` AND created_at > ?${pbExclusion}`
    binds.push(since)
    query += ' ORDER BY created_at ASC, id ASC LIMIT ?'
  } else {
    query += `${pbExclusion} ORDER BY created_at DESC, id DESC LIMIT ?`
  }
  binds.push(Math.min(limit, 500))
  const stmt = env.DB.prepare(query)
  const result = await (binds.length === 2 ? stmt.bind(binds[0], binds[1]) : stmt.bind(binds[0])).all()
  return json({ data: result.results || [], count: result.results?.length || 0 })
}

// GET /api/task-comments/recent — cross-task feed for activity drawers / digest
// AND the PB /process collector (scripts/process_hub_comments.py).
//
// T2.8 (2026-05-28): extracted from an inline handler in api/index.ts so the
// /api/task-comments/recent registration is a one-liner alongside
// /api/task-updates/recent. PB filter mirrors handleGetRecentTaskUpdates'
// non-PI exclusion (join task_comments → tasks → projects), with LEFT JOINs
// so orphan task_comments still surface (no project link → no PB risk).
//
// 2026-06-10 (TODAY.md-parity build): the row shape now joins the parent task's
// title (`task_title`) so the PB collector can render an actionable digest
// without an N+1 task lookup, and — when `since` is present (cursor/sync mode) —
// orders created_at ASC with an id tiebreak so the collector can advance its
// SyncCursor monotonically and never skip a row at a page boundary. The no-since
// UI case keeps DESC ("give me the N newest") for back-compat with existing
// activity-drawer callers.
export async function handleGetRecentTaskComments(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);
  const since = url.searchParams.get('since');
  // canSeePb (server-to-server / PB collector) sees author-only rows too; a
  // non-PB caller is gated to visibility='team' AND non-PB-category projects.
  const pbFilter = canSeePb
    ? ''
    : " AND (p.category IS NULL OR p.category != 'Peripheral Brain') AND ae.visibility = 'team'";
  // Design C (v77): projection over activity_entries (kind='comment') preserving
  // the legacy row shape (id, task_id, author_slug, content, created_at,
  // task_title) so the PB /process collector consumes it unmodified. The
  // `since` cursor stays backward-compatible with a plain timestamp, upgraded
  // internally to a compound (created_at, id) forward-cursor so a page boundary
  // sharing a created_at can't skip a row.
  const cols = `ae.id, ae.entity_id AS task_id, ae.actor_slug AS author_slug, ae.body AS content, ae.created_at, t.title AS task_title`;
  // Optional compound cursor: ?since=<created_at>&since_id=<id> advances past
  // the exact (created_at,id) the collector last saw. Plain ?since=<created_at>
  // still works (since_id defaults empty → pure created_at > ?).
  const sinceId = url.searchParams.get('since_id');
  let q: string;
  let result;
  if (since) {
    const cursorClause = sinceId
      ? '(ae.created_at > ? OR (ae.created_at = ? AND ae.id > ?))'
      : 'ae.created_at > ?';
    q = `SELECT ${cols} FROM activity_entries ae
       LEFT JOIN tasks t ON ae.entity_id = t.id
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
       WHERE ae.entity_type = 'task' AND ae.kind = 'comment' AND ${cursorClause}${pbFilter}
       ORDER BY ae.created_at ASC, ae.id ASC LIMIT ?`;
    result = sinceId
      ? await env.DB.prepare(q).bind(since, since, sinceId, limit).all()
      : await env.DB.prepare(q).bind(since, limit).all();
  } else {
    q = `SELECT ${cols} FROM activity_entries ae
       LEFT JOIN tasks t ON ae.entity_id = t.id
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
       WHERE ae.entity_type = 'task' AND ae.kind = 'comment'${pbFilter}
       ORDER BY ae.created_at DESC, ae.id DESC LIMIT ?`;
    result = await env.DB.prepare(q).bind(limit).all();
  }
  return json({ data: result.results || [] });
}

// GET /api/tasks/:id/updates — get task notes/updates
// Projection over activity_entries (kind='update') preserving the legacy
// task_updates shape (id, task_id, author_slug, content, update_type, created_at).
export async function handleGetTaskUpdates(taskId: string, request: Request, env: Env): Promise<Response> {
  // Fix 3: guardTaskProject consolidates the repeated SELECT+assertProjectVisible pattern.
  const guard = await guardTaskProject(env, request, taskId);
  if (guard.block) return guard.block;
  const vis = await activityVisibilityGate(request, env);
  const result = await env.DB.prepare(
    `SELECT id, entity_id AS task_id, actor_slug AS author_slug, body AS content, update_type, created_at
     FROM activity_entries
     WHERE entity_type = 'task' AND entity_id = ? AND kind = 'update' AND ${vis.clause}
     ORDER BY created_at DESC, id DESC`
  ).bind(taskId, ...vis.binds).all();
  return json({ data: result.results || [] });
}

// POST /api/tasks/:id/updates — post a task note/update
// Writes through postActivityEntry() (kind='update'). The primitive owns @me/
// visibility + @mention notifications (preserving source_type='task' for
// updates) + @hermes dispatch; this handler keeps actor resolution + the
// activity_log echo + response shaping.
export async function handlePostTaskUpdate(taskId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; update_type?: string; author_slug?: string; visibility?: string };
  if (!body.content?.trim()) return error('content required', 400);

  // Fix 3: guardTaskProject replaces the duplicate SELECT+assertProjectVisible.
  const guard = await guardTaskProject(env, request, taskId);
  if (guard.block) return guard.block;

  // AM-2: validate/canonicalize author_slug; impersonation requires PI/service.
  const actor = await resolveActor(env, user, body.author_slug, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const authorSlug = actor.slug;

  const posted = await postActivityEntry({
    env,
    user,
    entityType: 'task',
    entityId: taskId,
    kind: 'update',
    updateType: body.update_type ?? 'progress',
    body: body.content,
    actorSlug: authorSlug,
    visibility: body.visibility === 'author' ? 'author' : undefined,
    taskProjectId: guard.projectId,
  });
  if (!posted.ok) return error(posted.error, posted.status);

  // Look up task title for the activity_log echo (legacy global timeline row;
  // postActivityEntry does NOT touch activity_log).
  const task = await env.DB.prepare('SELECT title FROM tasks WHERE id = ?').bind(taskId).first<{ title: string }>();
  await logActivity(env, 'task_update', `Posted note on "${task?.title || taskId}": "${body.content.trim().slice(0, 100)}"`, authorSlug, taskId, 'task');

  // Preserve the legacy task_updates response shape for existing callers.
  const r = posted.row;
  const created = {
    id: r.id,
    task_id: r.entity_id,
    author_slug: r.actor_slug,
    content: r.body,
    update_type: r.update_type,
    created_at: r.created_at,
  };
  return json({ data: created }, 201);
}


// POST /api/sync/mobile-tasks-to-hub — Airtable Funeral Phase 1 Blocker 2
// Accepts a batch of PWA-created mobile_* tasks and inserts them into the
// Hub D1 tasks table with source='mobile'. Returns id_map so the PWA can
// update its local D1 (replace mobile_* with Hub-assigned canonical ID).
//
// Schema v47 fields (notes, effort, short_title, source_thread_id,
// related_message_ids) accepted + stored structured. No lossy concat.
//
// Dedup rule: if a task with the same (title, project_id, assignee) is
// already in Hub D1 (completed=0, deleted_at IS NULL), skip creation
// and return its existing ID in the map. Prevents the same PWA batch
// re-creating duplicates on retry. project_id-aware as of 2026-05-04
// (Phase 1.4): different project + same title+assignee = NOT a duplicate.
// NULL project_id matches NULL project_id (use IS operator).
export async function handleMobileTasksToHub(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    tasks: Array<{
      id: string;                       // PWA-side mobile_* id
      title?: string;
      name?: string;                    // PWA legacy field name
      description?: string;
      due_date?: string | null;
      effort?: string | null;
      short_title?: string | null;
      completed?: 0 | 1 | boolean;
      priority?: string;
      project_id?: string | null;
      assignee?: string;
      source_thread_id?: string | null;
      related_message_ids?: string | null;
    }>;
  };

  if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
    return error('tasks array required', 400);
  }

  const id_map: Record<string, string> = {};
  const errors: string[] = [];
  let created = 0;
  let deduped = 0;

  for (const pwaTask of body.tasks) {
    if (!pwaTask.id || !pwaTask.id.startsWith('mobile_')) {
      errors.push(`skip non-mobile id: ${pwaTask.id}`);
      continue;
    }
    const title = pwaTask.title || pwaTask.name || '';
    // M5: `notes` is brain.db-only (not on the wire); `description` is the body
    // field. Fall back to title, never notes (the notes wire alias was retired
    // 2026-06-10, pb-schema 0.4.0 — PWA no longer sends it).
    const description = pwaTask.description || title;
    const assignee = pwaTask.assignee || 'nick-ingraham';

    if (!title.trim()) {
      errors.push(`skip empty-title: ${pwaTask.id}`);
      continue;
    }

    // Resolve project_id first (PWA may send brain.db slug or id).
    // Must be above the dedup query since project_id is now part of the dedup key.
    // Pattern D: use projectRefToCanonical from helpers (dedup of inline resolver).
    let resolvedProjectId: string | null = pwaTask.project_id ?? null;
    if (resolvedProjectId) {
      resolvedProjectId = await projectRefToCanonical(env, resolvedProjectId);
    }

    // Dedup: same (normalized title, project_id) already open in Hub? Converges
    // toward applyInsert's central I18 rule (title, project_id) — #523:
    // assignee dropped 2026-07-07. It never actually protected anything: even
    // when this pre-check missed (different assignee), the applyMutation call
    // below still runs applyInsert's own (title, project_id) dedup — which
    // does NOT consider assignee — so a cross-assignee same-title-project row
    // would merge there anyway. Scoping by assignee here just made this
    // pre-check miss cases the fallthrough caught regardless, with the
    // id_map/counter bug fixed below. lower(trim()) normalization is KEPT —
    // genuine tolerance for typed mobile input that the central rule's exact
    // `title = ?` doesn't provide. NULL project_id matches NULL via IS.
    const existing = await env.DB.prepare(
      'SELECT id FROM tasks WHERE lower(trim(title)) = lower(trim(?)) AND ((project_id IS NULL AND ? IS NULL) OR project_id = ?) AND completed = 0 AND deleted_at IS NULL LIMIT 1'
    ).bind(title, resolvedProjectId, resolvedProjectId).first<{ id: string }>();

    if (existing) {
      id_map[pwaTask.id] = existing.id;
      deduped++;
      continue;
    }

    const id = generateId('task');  // A1.2: typed ULID
    const completedInt = pwaTask.completed === true || pwaTask.completed === 1 ? 1 : 0;
    const status = completedInt ? 'done' : 'todo';
    const priority = pwaTask.priority || 'medium';

    try {
      const mobileMutResult = await applyMutation(env, {
        table: 'tasks',
        record_id: id,
        op: 'insert',
        payload: {
          title,
          description,
          assignee,
          assigned_by: user.email,
          project_id: resolvedProjectId,
          due_date: pwaTask.due_date ?? null,
          deadline: (pwaTask as Record<string, unknown>).deadline ?? null,
          priority,
          status,
          source: 'mobile',
          completed: completedInt,
          completed_at: completedInt ? nowInstant() : null,
          completed_by: completedInt ? user.email : null,
          effort: pwaTask.effort ?? null,
          short_title: pwaTask.short_title ?? null,
          source_thread_id: pwaTask.source_thread_id ?? null,
          related_message_ids: pwaTask.related_message_ids ?? null,
          // PB §2D: derive the Gmail-thread link at create (see handleCreateTask).
          email_link: gmailThreadUrl(pwaTask.source_thread_id),
        },
        route: 'handleMobileTasksToHub',
        user,
      });
      if (mobileMutResult.status !== 'accepted') {
        errors.push(`${pwaTask.id}: mutation ${mobileMutResult.status} — ${mobileMutResult.reason ?? ''}`);
        continue;
      }
      // #523: applyMutation's own I18 (title, project_id) dedup can still fire
      // here even after the pre-check above passes (e.g. a completed/status
      // triad drift on an older row) — canonical_payload.id is the row that
      // now represents this conceptual task, whether freshly inserted (= id)
      // or an existing row this insert merged onto instead. Preferring it
      // over the locally-generated `id` keeps id_map/created/deduped accurate
      // rather than pointing the PWA client at an id that was never written.
      const resultId = (mobileMutResult.canonical_payload?.id as string | undefined) ?? id;
      id_map[pwaTask.id] = resultId;
      if (resultId !== id) {
        deduped++;
      } else {
        created++;
        await logActivity(env, 'task', `Mobile→Hub: "${title.slice(0, 80)}"`, user.email, id, 'task');
      }
    } catch (e) {
      errors.push(`${pwaTask.id}: ${(e as Error).message || String(e)}`);
    }
  }

  return json({
    data: {
      id_map,
      created,
      deduped,
      errors,
      total_attempted: body.tasks.length,
    },
  }, errors.length > 0 && created === 0 ? 500 : 200);
}
