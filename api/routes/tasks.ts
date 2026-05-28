import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, parseMentions, actorSlug, isPiRequest, resolveActor, safeTaskRow, assertProjectVisible, projectRefToCanonical } from '../helpers';
import { filterFixtures } from '../lib/fixtures';
import { ctToday } from '../lib/ct-date';
import { nowInstant } from '../lib/time';
import { applyMutation } from './mutations';
// TASK_SELECT_COLS moved to api/lib/task-cols.ts so helpers.ts (safeTaskRow)
// can import it without creating a circular dependency.
import { TASK_SELECT_COLS } from '../lib/task-cols';
export { TASK_SELECT_COLS } from '../lib/task-cols';

// GET /api/tasks/overdue-count?assignee= — lightweight count for sidebar badge
export async function handleOverdueCount(url: URL, env: Env): Promise<Response> {
  const assignee = url.searchParams.get('assignee')
  const today = ctToday()
  let query = 'SELECT COUNT(*) as count FROM tasks WHERE completed = 0 AND due_date < ?'
  const params: string[] = [today]
  if (assignee) { query += ' AND assignee = ?'; params.push(assignee) }
  const result = await env.DB.prepare(query).bind(...params).first<{ count: number }>()
  return json({ data: { count: result?.count ?? 0 } })
}

// GET /api/tasks?assignee=&status=&priority=&project=&meeting=&completed=&source=
//
// 2026-04-28 (schema-v51): when ?seq_after=N is present, switches to
// sync-cursor mode: filters seq > N, orders by seq ASC, applies limit
// (default 2000). Canonical pull path for brain.db's hub.py post-cutover.
// updated_since/created_since remain for back-compat. seq_after wins.
export async function handleGetTasks(url: URL, env: Env): Promise<Response> {
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

  const deletedFilter = includeDeleted ? '1=1' : 't.deleted_at IS NULL';
  let query = `SELECT ${TASK_SELECT_COLS}, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE ${deletedFilter}`;
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
  if (project) { query += ' AND t.project_id = ?'; params.push(project); }
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
      ).bind(generateId(), assignerSlug, 'update', 'task', id, `${user.name || user.email} completed a task`, (item.title || item.description).slice(0, 200), `/tasks?open=${id}`).run();
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
export async function handleGetTask(id: string, env: Env): Promise<Response> {
  const task = await env.DB.prepare(
    `SELECT ${TASK_SELECT_COLS}, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE t.id = ? AND t.deleted_at IS NULL`
  ).bind(id).first();
  if (!task) return error('Task not found', 404);
  return json({ data: task });
}

// GET /api/action-items — query the action_items table (meeting action items, NOT tasks)
export async function handleActionItems(url: URL, env: Env): Promise<Response> {
  const assignee = url.searchParams.get('assignee');
  const completed = url.searchParams.get('completed');

  let query = 'SELECT a.*, m.title as meeting_title, m.date as meeting_date FROM action_items a LEFT JOIN meetings m ON a.meeting_id = m.id WHERE 1=1';
  const params: (string | number)[] = [];

  if (assignee) { query += ' AND a.assignee = ?'; params.push(assignee); }
  if (completed === '0') { query += ' AND a.completed = 0'; }
  else if (completed === '1') { query += ' AND a.completed = 1'; }

  query += ' ORDER BY a.created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [] });
}

// POST /api/action-items/:id/toggle — toggles done/todo on action_items
export async function handleToggleTask(id: string, user: AuthUser, env: Env): Promise<Response> {
  // Try action_items first, fall back to tasks
  let item = await env.DB.prepare('SELECT * FROM action_items WHERE id = ?').bind(id).first<{ completed: number; description: string }>();
  const table = item ? 'action_items' : 'tasks';
  if (!item) {
    item = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ completed: number; description: string }>();
  }
  if (!item) return error('Item not found', 404);

  const newCompleted = item.completed ? 0 : 1;
  const newStatus = newCompleted ? 'done' : 'todo';

  if (table === 'action_items') {
    await env.DB.prepare(
      "UPDATE action_items SET completed = ?, completed_at = ?, completed_by = ? WHERE id = ?"
    ).bind(newCompleted, newCompleted ? nowInstant() : null, newCompleted ? user.email : null, id).run();
  } else {
    // Route through applyMutation so last_mutation_id is stamped (Phase 3.1).
    const toggleMutResult = await applyMutation(env, {
      table: 'tasks',
      record_id: id,
      op: 'update',
      patch: {
        status: newStatus,
        completed: newCompleted,
        completed_at: newCompleted ? nowInstant() : null,
        completed_by: newCompleted ? user.email : null,
      },
      route: 'handleToggleTask',
      user,
    });
    if (toggleMutResult.status !== 'accepted' && toggleMutResult.status !== 'merged_clean') {
      return error(`mutation rejected: ${toggleMutResult.status} — ${toggleMutResult.reason ?? ''}`, 409);
    }
  }

  await logActivity(env, 'task', `${newCompleted ? 'Completed' : 'Reopened'}: "${item.description}"`, user.email, id, table === 'action_items' ? 'action_item' : 'task');

  // SEC-P2-01: use TASK_SELECT_COLS for tasks to exclude the private `notes`
  // column. safeTaskRow strips any remnant (defense-in-depth for test stubs
  // and any future SELECT * that slips in). action_items has no notes column.
  const raw = table === 'tasks'
    ? await env.DB.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.id = ?`).bind(id).first<Record<string, unknown>>()
    : await env.DB.prepare(`SELECT * FROM action_items WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  const updated = (raw && table === 'tasks') ? safeTaskRow(raw) : raw;
  return json({ data: updated });
}

// POST /api/tasks/:id — update task fields
// Hoisted to module scope — avoids allocation per request
// 2026-04-20 Airtable Funeral P2-1: added v47 fields (notes, effort,
// short_title, source_thread_id, related_message_ids) so Gmail Apps
// Script updateAirtableTasks → updateHubTasks can carry them through.
// 2026-04-21 I18 drift investigation: added completed_at, completed_by,
// completed so brain.db backfills can carry authentic historical
// timestamps (prior behavior stamped datetime('now') even when the
// client passed an explicit value from the local DB).
const TASK_ALLOWED_FIELDS = new Set(['title', 'description', 'description_json', 'assignee', 'assigned_by', 'due_date', 'deadline', 'priority', 'status', 'project_id', 'meeting_id', 'blocked_by', 'key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc', 'key_link_3', 'key_link_3_desc', 'notes', 'effort', 'short_title', 'source_thread_id', 'related_message_ids', 'completed', 'completed_at', 'completed_by', 'group_override',
  // W1 (schema-v55) operational metadata
  'waiting_on', 'promised_to', 'promise_date', 'next_checkin_date', 'nick_followup_date',
  'requires_nick_brain', 'estimated_minutes', 'deadline_type', 'next_artifact', 'inbox_event_id']);
const VALID_GROUP_OVERRIDES = new Set(['deep', 'priorities', 'quick', 'pb', 'etl']);
const TASK_REQUIRED_FIELDS = new Set(['status', 'priority', 'assignee']);

export async function handleUpdateTask(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
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
    if (isDone && !('completed_at' in body)) {
      updates.push('completed_at = ?');
      params.push(nowInstant());
    }
    if (isDone && !('completed_by' in body)) {
      updates.push('completed_by = ?');
      params.push(user.email);
    }
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
    notes?: string | null;
    effort?: string | null;
    short_title?: string | null;
    source_thread_id?: string | null;
    related_message_ids?: string | null;
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
      key_link_1: body.key_link_1 ?? null,
      key_link_1_desc: body.key_link_1_desc ?? null,
      key_link_2: body.key_link_2 ?? null,
      key_link_2_desc: body.key_link_2_desc ?? null,
      key_link_3: body.key_link_3 ?? null,
      key_link_3_desc: body.key_link_3_desc ?? null,
      notes: body.notes ?? null,
      effort: body.effort ?? null,
      short_title: body.short_title ?? null,
      source_thread_id: body.source_thread_id ?? null,
      related_message_ids: body.related_message_ids ?? null,
    },
    route: 'handleCreateTask',
    user,
  });
  if (createMutResult.status !== 'accepted') {
    return error(`mutation rejected: ${createMutResult.status} — ${createMutResult.reason ?? ''}`, 409);
  }

  await logActivity(env, 'task', `Created task: "${title}" → ${body.assignee}`, user.email, id, 'task');

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
        id,
        `${user.name || user.email} assigned you a task`,
        title.slice(0, 200),
        `/tasks?open=${id}`,
      ).run();

      // Email notification (fire-and-forget, only if Resend configured)
      if (env.RESEND_API_KEY) {
        const { sendEmail, taskAssignmentEmail } = await import('../lib/email');
        const member = await env.DB.prepare('SELECT name, email FROM team_members WHERE slug = ?').bind(assignee).first<{ name: string; email: string | null }>();
        if (member) {
          const email = taskAssignmentEmail(user.name || user.email, title, id);
          email.to = member.email || `${assignee}@umn.edu`;
          sendEmail(env.RESEND_API_KEY, email).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('Failed to create assignment notification:', e);
  }

  const created = await env.DB.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.id = ?`).bind(id).first();
  return json({ data: created }, 201);
}

// GET /api/tasks/:id/comments
export async function handleGetTaskComments(taskId: string, request: Request, env: Env): Promise<Response> {
  // Phase 1b-B: if the task belongs to a PB-category project, block non-PI callers.
  const task = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL').bind(taskId).first<{ project_id: string | null }>();
  if (task?.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id);
    if (block) return block;
  }
  const result = await env.DB.prepare(
    'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC'
  ).bind(taskId).all();
  return json({ data: result.results || [] });
}

// POST /api/tasks/:id/comments
export async function handleAddTaskComment(taskId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; author_slug?: string };
  if (!body.content?.trim()) return error('content required', 400);

  const id = generateId();
  // AM-2: validate/canonicalize author_slug; impersonation requires PI/service.
  // claude-ai (Hermes) is always allowed by resolveActor.
  const actor = await resolveActor(env, user, body.author_slug, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const authorSlug = actor.slug;

  await env.DB.prepare(
    'INSERT INTO task_comments (id, task_id, author_slug, content) VALUES (?, ?, ?, ?)'
  ).bind(id, taskId, authorSlug, body.content.trim()).run();

  await logActivity(env, 'comment', `Commented on task`, authorSlug, taskId, 'task');

  // Create notifications for @mentions — batch one round-trip instead of
  // N serial inserts when a comment @-mentions multiple people.
  //
  // source_id references the TASK (what the user cares about), not the
  // comment row id — clicking the notification takes them to the task
  // detail panel via ?open=. Found via deep-audit Suite 4.
  try {
    const mentions = parseMentions(body.content).filter((slug) => slug !== authorSlug);
    if (mentions.length > 0) {
      const title = `${user.name || user.email} mentioned you`;
      const bodyPreview = body.content.trim().slice(0, 200);
      const link = `/tasks?open=${taskId}`;
      const stmt = env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      await env.DB.batch(
        mentions.map((slug) =>
          stmt.bind(generateId(), slug, 'mention', 'task_comment', taskId, title, bodyPreview, link)
        )
      );
    }
  } catch (e) { console.error('Failed to create task comment notifications:', e); }

  const created = await env.DB.prepare('SELECT * FROM task_comments WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// GET /api/tasks/:id/activity
export async function handleGetTaskActivity(taskId: string, request: Request, env: Env): Promise<Response> {
  // Phase 1b-B: if the task belongs to a PB-category project, block non-PI callers.
  const task = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL').bind(taskId).first<{ project_id: string | null }>();
  if (task?.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id);
    if (block) return block;
  }
  const result = await env.DB.prepare(
    "SELECT * FROM activity_log WHERE related_id = ? AND related_type = 'task' ORDER BY timestamp DESC LIMIT 20"
  ).bind(taskId).all();
  return json({ data: result.results || [] });
}

// GET /api/tasks/:id/detail — fan-out for TodayPage/UnifiedMyTasks task detail drawer.
// Returns { why, updates, subtasks, blocks } in a single round-trip so the
// drawer doesn't have to do four parallel fetches. Read-only.
export async function handleGetTaskDetail(taskId: string, request: Request, env: Env): Promise<Response> {
  // Pull the task itself for the "why" callout. P1: fall back to description's
  // first paragraph; a future column could replace this with a curated note.
  const task = await env.DB.prepare(
    'SELECT id, description, project_id FROM tasks WHERE id = ? AND deleted_at IS NULL'
  ).bind(taskId).first<{ id: string; description: string | null; project_id: string | null }>();
  if (!task) return error('Task not found', 404);

  // Phase 1b-B: if the task belongs to a PB-category project, block non-PI callers.
  if (task.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id);
    if (block) return block;
  }

  const description = task.description ?? '';
  const why = description.split(/\n\s*\n/)[0]?.trim().slice(0, 400) || null;

  // Updates merge task_updates (Phase 27 — author-written notes) with
  // activity_log entries that have meaningful actor + summary.
  const [updatesRes, activityRes, subtasksRes, blocksRes] = await Promise.all([
    env.DB.prepare(
      'SELECT id, content, author_slug, update_type, created_at FROM task_updates WHERE task_id = ? ORDER BY created_at DESC LIMIT 20'
    ).bind(taskId).all(),
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
  const eventUpdates = (activityRes.results as ActivityRow[])
    .filter((a) => a.description)
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
      why,
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
export async function handleDeleteTask(id: string, user: AuthUser, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT id, title, description, deleted_at FROM tasks WHERE id = ?'
  ).bind(id).first<{ id: string; title: string | null; description: string | null; deleted_at: string | null }>();

  if (!existing) {
    return error('Task not found', 404);
  }

  const label = existing.title || existing.description || id;

  // Cascade-clean child rows. task_comments / task_updates / task_subtasks all
  // carry a task_id FK-by-convention (not enforced). Leaving them orphans
  // bloats the DB and creates stale joins forever. Notifications cleanup
  // mirrors the batch-delete path (deep-audit 12.L).
  try {
    await env.DB.prepare('DELETE FROM task_comments WHERE task_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM task_updates WHERE task_id = ?').bind(id).run();
    try { await env.DB.prepare('DELETE FROM task_subtasks WHERE task_id = ?').bind(id).run(); } catch { /* table may not exist */ }
    await env.DB.prepare(
      "DELETE FROM notifications WHERE source_type IN ('task','task_comment') AND source_id = ?"
    ).bind(id).run();
  } catch (e) {
    console.error('task cascade-clean failed:', e);
  }

  // Idempotent: already-deleted returns accepted.
  if (existing.deleted_at) {
    await logActivity(env, 'task_delete', `Deleted task (idempotent): ${label}`, user.email, id, 'task');
    return json({ data: { deleted: id, title: label, idempotent: true } });
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
// Hub-only side-channel (codex Fix 4, 2026-05-11):
// acknowledged_at and acknowledged_by are intentionally NOT in TABLE_FIELDS['tasks']
// in mutations.ts and are NOT in the PB sync contract. These are Hub-UI-only fields
// used for local CRM workflow (assignee receipts, notifications); PB brain.db has no
// acknowledged_at column and the PB outbox never emits them.
// Decision: keep the direct UPDATE here; routing through applyMutation would require
// adding these fields to TABLE_FIELDS which would pollute the PB wire contract.
// The route_no_raw_writes.test.ts explicitly exempts this function.
export async function handleAcknowledgeTask(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ title: string; description: string; assignee: string; assigned_by: string | null; acknowledged_at: string | null }>();
  if (!task) return error('Task not found', 404);

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

  await env.DB.prepare(
    "UPDATE tasks SET acknowledged_at = ?, acknowledged_by = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(now, acknowledgedBy, id).run();

  await logActivity(env, 'task', `Acknowledged: "${task.title || task.description}"`, user.email, id, 'task');

  // Notify the assigner that the task was acknowledged
  if (task.assigned_by) {
    try {
      const assignerSlug = actorSlug(task.assigned_by);
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), assignerSlug, 'update', 'task', id, `${user.name || user.email} acknowledged a task`, (task.title || task.description).slice(0, 200), `/tasks?open=${id}`).run();
    } catch (e) { console.error('Failed to create acknowledge notification:', e); }
  }

  const updated = await env.DB.prepare(`SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.id = ?`).bind(id).first();
  return json({ data: updated });
}

// GET /api/task-updates/recent — bulk fetch recent task updates (for sync pull)
//
// 2026-04-28 (Codex review fix): when ?since= is present, ORDER BY ASC so
// brain.db pull_task_updates can paginate forward without losing rows when
// volume between pulls exceeds limit. DESC kept for UI-style "newest 100".
// Phase 1b-B: canSeePb=false for non-PI callers — filter out updates for PB-project tasks.
export async function handleGetRecentTaskUpdates(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '100')
  const since = url.searchParams.get('since') // ISO timestamp for delta sync
  // Mirror the category filter from search/activity for non-PI callers.
  // task_updates doesn't store project_id directly; join through tasks.
  const pbExclusion = canSeePb ? '' : ` AND (task_id NOT IN (
    SELECT t.id FROM tasks t
    WHERE t.project_id IN (
      SELECT id FROM projects WHERE category = 'Peripheral Brain'
      UNION SELECT slug FROM projects WHERE category = 'Peripheral Brain'
    )
  ))`
  let query = 'SELECT * FROM task_updates'
  const binds: unknown[] = []
  if (since) {
    query += ` WHERE created_at > ?${pbExclusion}`
    binds.push(since)
    query += ' ORDER BY created_at ASC, id ASC LIMIT ?'
  } else {
    query += ` WHERE 1=1${pbExclusion} ORDER BY created_at DESC LIMIT ?`
  }
  binds.push(Math.min(limit, 500))
  const stmt = env.DB.prepare(query)
  const result = await (binds.length === 2 ? stmt.bind(binds[0], binds[1]) : stmt.bind(binds[0])).all()
  return json({ data: result.results || [], count: result.results?.length || 0 })
}

// GET /api/tasks/:id/updates — get task notes/updates
export async function handleGetTaskUpdates(taskId: string, request: Request, env: Env): Promise<Response> {
  // Phase 1b-B: if the task belongs to a PB-category project, block non-PI callers.
  const task = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL').bind(taskId).first<{ project_id: string | null }>();
  if (task?.project_id) {
    const block = await assertProjectVisible(request, env, task.project_id);
    if (block) return block;
  }
  const result = await env.DB.prepare(
    'SELECT * FROM task_updates WHERE task_id = ? ORDER BY created_at DESC'
  ).bind(taskId).all();
  return json({ data: result.results || [] });
}

// POST /api/tasks/:id/updates — post a task note/update
export async function handlePostTaskUpdate(taskId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; update_type?: string; author_slug?: string };
  if (!body.content?.trim()) return error('content required', 400);

  const id = generateId();
  // AM-2: validate/canonicalize author_slug; impersonation requires PI/service.
  const actor = await resolveActor(env, user, body.author_slug, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const authorSlug = actor.slug;

  await env.DB.prepare(
    'INSERT INTO task_updates (id, task_id, author_slug, content, update_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, taskId, authorSlug, body.content.trim(), body.update_type ?? 'progress').run();

  // Look up task title for activity log
  const task = await env.DB.prepare('SELECT title FROM tasks WHERE id = ?').bind(taskId).first<{ title: string }>();
  await logActivity(env, 'task_update', `Posted note on "${task?.title || taskId}": "${body.content.trim().slice(0, 100)}"`, authorSlug, taskId, 'task');

  // Notify @mentions — single batched INSERT instead of N per-row inserts.
  try {
    const mentions = parseMentions(body.content).filter((slug) => slug !== authorSlug);
    if (mentions.length > 0) {
      const title = `${user.name || user.email} mentioned you in a task note`;
      const bodyPreview = body.content.trim().slice(0, 200);
      const link = `/tasks?open=${taskId}`;
      const stmt = env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      await env.DB.batch(
        mentions.map((slug) =>
          stmt.bind(generateId(), slug, 'mention', 'task', taskId, title, bodyPreview, link)
        )
      );
    }
  } catch (e) { console.error('Failed to create mention notification:', e); }

  const created = await env.DB.prepare('SELECT * FROM task_updates WHERE id = ?').bind(id).first();
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
      notes?: string | null;
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
    const description = pwaTask.description || pwaTask.notes || title;
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

    // Dedup: same (title, assignee, project_id) already open in Hub?
    // NULL project_id matches NULL project_id via IS operator.
    const existing = await env.DB.prepare(
      'SELECT id FROM tasks WHERE lower(trim(title)) = lower(trim(?)) AND assignee = ? AND ((project_id IS NULL AND ? IS NULL) OR project_id = ?) AND completed = 0 AND deleted_at IS NULL LIMIT 1'
    ).bind(title, assignee, resolvedProjectId, resolvedProjectId).first<{ id: string }>();

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
          notes: pwaTask.notes ?? null,
          effort: pwaTask.effort ?? null,
          short_title: pwaTask.short_title ?? null,
          source_thread_id: pwaTask.source_thread_id ?? null,
          related_message_ids: pwaTask.related_message_ids ?? null,
        },
        route: 'handleMobileTasksToHub',
        user,
      });
      if (mobileMutResult.status !== 'accepted') {
        errors.push(`${pwaTask.id}: mutation ${mobileMutResult.status} — ${mobileMutResult.reason ?? ''}`);
        continue;
      }
      id_map[pwaTask.id] = id;
      created++;

      await logActivity(env, 'task', `Mobile→Hub: "${title.slice(0, 80)}"`, user.email, id, 'task');
    } catch (e: any) {
      errors.push(`${pwaTask.id}: ${e.message || String(e)}`);
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
