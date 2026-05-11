import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, parseMentions, actorSlug } from '../helpers';
import { filterFixtures } from '../lib/fixtures';
import { applyMutation } from './mutations';

// GET /api/tasks/overdue-count?assignee= — lightweight count for sidebar badge
export async function handleOverdueCount(url: URL, env: Env): Promise<Response> {
  const assignee = url.searchParams.get('assignee')
  const today = new Date().toISOString().split('T')[0]
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
export async function handleTasks(url: URL, env: Env): Promise<Response> {
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
  let query = `SELECT t.*, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE ${deletedFilter}`;
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
  const completedAt = completed ? new Date().toISOString() : null;
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

  // Auto-create next instance for recurring tasks
  if (completed) {
    try {
      const fullTask = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Record<string, unknown>>();
      const recurrence = fullTask?.recurrence as string | null;
      if (recurrence && recurrence !== 'none') {
        const currentDue = fullTask?.due_date as string | null;
        let nextDue: string | null = null;
        if (currentDue) {
          const d = new Date(currentDue + 'T12:00:00');
          switch (recurrence) {
            case 'daily': d.setDate(d.getDate() + 1); break;
            case 'weekly': d.setDate(d.getDate() + 7); break;
            case 'biweekly': d.setDate(d.getDate() + 14); break;
            case 'monthly': d.setMonth(d.getMonth() + 1); break;
          }
          nextDue = d.toISOString().split('T')[0];
        }
        const nextId = generateId('task');
        // Note: recurrence + recurrence_parent_id columns not yet in D1 schema (pending schema v35).
        // Insert without those columns until migration is applied.
        // Route through applyMutation so last_mutation_id is stamped (Phase 3.1).
        await applyMutation(env, {
          table: 'tasks',
          record_id: nextId,
          op: 'insert',
          payload: {
            title: fullTask?.title as string | undefined,
            description: (fullTask?.description as string) || '',
            assignee: (fullTask?.assignee as string) || '',
            project_id: (fullTask?.project_id as string) || null,
            due_date: nextDue,
            priority: (fullTask?.priority as string) || 'medium',
            status: 'todo',
            source: 'recurrence',
          },
          route: 'handleUpdateTaskStatus:recurrence',
          user,
        });
      }
    } catch (e) { console.error('Failed to create recurring task:', e); }
  }

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// GET /api/tasks/:id — fetch a single task by primary key.
// Applies the same deleted_at IS NULL filter as the list endpoint so
// a task visible in GET /api/tasks?limit=500 is always reachable here.
// mechanic I5: previously no GET-by-PK route existed — direct lookups
// returned 404 for every task regardless of status.
export async function handleGetTask(id: string, env: Env): Promise<Response> {
  const task = await env.DB.prepare(
    'SELECT t.*, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE t.id = ? AND t.deleted_at IS NULL'
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
    ).bind(newCompleted, newCompleted ? new Date().toISOString() : null, newCompleted ? user.email : null, id).run();
  } else {
    // Route through applyMutation so last_mutation_id is stamped (Phase 3.1).
    const toggleMutResult = await applyMutation(env, {
      table: 'tasks',
      record_id: id,
      op: 'update',
      patch: {
        status: newStatus,
        completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
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

  const updated = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
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
  if (typeof body.project_id === 'string' && body.project_id) {
    const proj = await env.DB.prepare('SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1').bind(body.project_id, body.project_id).first<{ id: string; slug: string | null }>();
    body.project_id = proj ? (proj.slug || proj.id) : null;
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
      if (TASK_REQUIRED_FIELDS.has(field) && (body[field] === null || body[field] === undefined || body[field] === '')) {
        continue;
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
      params.push(new Date().toISOString());
    }
    if (isDone && !('completed_by' in body)) {
      updates.push('completed_by = ?');
      params.push(user.email);
    }
  }

  if (updates.length === 0) return error('No valid fields to update', 400);

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

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
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
  let resolvedProjectId = body.project_id ?? null;
  if (resolvedProjectId) {
    const proj = await env.DB.prepare('SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1').bind(resolvedProjectId, resolvedProjectId).first<{ id: string; slug: string | null }>();
    if (!proj) {
      console.warn(`Task create: unknown project_id "${resolvedProjectId}" — storing as NULL`);
      resolvedProjectId = null;
    } else {
      // Store the slug form (that's what the existing code expects on read).
      resolvedProjectId = proj.slug || proj.id;
    }
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

  const created = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// GET /api/tasks/:id/comments
export async function handleGetTaskComments(taskId: string, env: Env): Promise<Response> {
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
  const authorSlug = body.author_slug?.trim() || actorSlug(user.email);

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
export async function handleGetTaskActivity(taskId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM activity_log WHERE related_id = ? AND related_type = 'task' ORDER BY timestamp DESC LIMIT 20"
  ).bind(taskId).all();
  return json({ data: result.results || [] });
}

// GET /api/tasks/:id/detail — fan-out for TodayPage/UnifiedMyTasks task detail drawer.
// Returns { why, updates, subtasks, blocks } in a single round-trip so the
// drawer doesn't have to do four parallel fetches. Read-only.
export async function handleGetTaskDetail(taskId: string, env: Env): Promise<Response> {
  // Pull the task itself for the "why" callout. P1: fall back to description's
  // first paragraph; a future column could replace this with a curated note.
  const task = await env.DB.prepare(
    'SELECT id, description FROM tasks WHERE id = ? AND deleted_at IS NULL'
  ).bind(taskId).first<{ id: string; description: string | null }>();
  if (!task) return error('Task not found', 404);

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

  switch (body.action) {
    case 'complete': {
      const completedAt = new Date().toISOString()
      for (const id of body.ids) {
        const mutResult = await applyMutation(env, {
          table: 'tasks',
          record_id: id,
          op: 'update',
          patch: { status: 'done', completed: 1, completed_at: completedAt, completed_by: user.email },
          route: 'handleBatchUpdateTasks/complete',
          user,
        })
        if (mutResult.status !== 'accepted' && mutResult.status !== 'merged_clean') {
          console.error(`bulkAction complete failed for ${id}: ${mutResult.status} — ${mutResult.reason ?? ''}`)
        }
      }
      break
    }

    case 'uncomplete': {
      for (const id of body.ids) {
        const mutResult = await applyMutation(env, {
          table: 'tasks',
          record_id: id,
          op: 'update',
          patch: { status: 'todo', completed: 0, completed_at: null, completed_by: null },
          route: 'handleBatchUpdateTasks/uncomplete',
          user,
        })
        if (mutResult.status !== 'accepted' && mutResult.status !== 'merged_clean') {
          console.error(`bulkAction uncomplete failed for ${id}: ${mutResult.status} — ${mutResult.reason ?? ''}`)
        }
      }
      break
    }

    case 'status': {
      if (!body.value || !['todo', 'in_progress', 'done', 'blocked', 'waiting_external'].includes(body.value)) {
        return error('value must be one of: todo, in_progress, done, blocked, waiting_external', 400)
      }
      const statusPatch: Record<string, unknown> = body.value === 'done'
        ? { status: 'done', completed: 1, completed_at: new Date().toISOString(), completed_by: user.email }
        : { status: body.value, completed: 0, completed_at: null, completed_by: null }
      for (const id of body.ids) {
        const mutResult = await applyMutation(env, {
          table: 'tasks',
          record_id: id,
          op: 'update',
          patch: statusPatch,
          route: 'handleBatchUpdateTasks/status',
          user,
        })
        if (mutResult.status !== 'accepted' && mutResult.status !== 'merged_clean') {
          console.error(`bulkAction status failed for ${id}: ${mutResult.status} — ${mutResult.reason ?? ''}`)
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
      for (const id of body.ids) {
        const mutResult = await applyMutation(env, {
          table: 'tasks',
          record_id: id,
          op: 'update',
          patch: { assignee: body.value },
          route: 'handleBatchUpdateTasks/assign',
          user,
        })
        if (mutResult.status !== 'accepted' && mutResult.status !== 'merged_clean') {
          console.error(`bulkAction assign failed for ${id}: ${mutResult.status} — ${mutResult.reason ?? ''}`)
        }
      }
      break
    }

    case 'priority': {
      if (!body.value || !['low', 'medium', 'high', 'urgent'].includes(body.value)) {
        return error('value must be one of: low, medium, high, urgent', 400)
      }
      for (const id of body.ids) {
        const mutResult = await applyMutation(env, {
          table: 'tasks',
          record_id: id,
          op: 'update',
          patch: { priority: body.value },
          route: 'handleBatchUpdateTasks/priority',
          user,
        })
        if (mutResult.status !== 'accepted' && mutResult.status !== 'merged_clean') {
          console.error(`bulkAction priority failed for ${id}: ${mutResult.status} — ${mutResult.reason ?? ''}`)
        }
      }
      break
    }

    case 'delete': {
      for (const id of body.ids) {
        const mutResult = await applyMutation(env, {
          table: 'tasks',
          record_id: id,
          op: 'delete',
          route: 'handleBatchUpdateTasks/delete',
          user,
        })
        if (mutResult.status !== 'accepted' && mutResult.status !== 'merged_clean') {
          console.error(`bulkAction delete failed for ${id}: ${mutResult.status} — ${mutResult.reason ?? ''}`)
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

  return json({ data: { ok: true, count: body.ids.length } })
}

// POST /api/tasks/sync-bulk — bulk upsert tasks from brain.db sync
// Accepts array of tasks with their own IDs. Clears existing tasks first.
// 2026-04-21: added stale-overwrite guard via `client_updated_at`. When the
// client provides its local brain.db `updated_at`, Hub compares on conflict
// and only overwrites if the client is at least as fresh as Hub's row. Prior
// behavior was last-writer-wins (line updated_at = datetime('now')) which
// let a stale machine clobber the peer's authoritative state (see I18
// drift investigation 2026-04-21).
/**
 * /api/sync/bulk-tasks — one-shot migration / mobile catch-up only.
 * Gated behind HUB_BULK_MIGRATION_MODE=1 env var as of 2026-05-04
 * (Phase 3.1 Step 7). Normal Hub UI / PB writes go through applyMutation.
 *
 * Use cases that legitimately need this path:
 * - mobile catch-up after offline period (PWA bulk import)
 * - one-shot migrations (e.g., backfill from external source)
 * - explicit `clear_existing` wipe-and-reload during recovery
 *
 * NOT a normal-operation path. If you find yourself reaching for this,
 * use applyMutation per-row instead.
 *
 * Mutation ledger gap (codex Fix 5, 2026-05-11):
 * Rows written here do NOT get processed_mutations entries. This is intentional:
 * bulk migration upserts are out-of-band bootstraps, not PB-origin mutations.
 * PB's cursor pull uses last_mutation_id — rows inserted here have
 * last_mutation_id=NULL and are excluded from pull diffs until a subsequent
 * /api/mutations write stamps them. Accepted trade-off for the migration escape
 * hatch. Decision: fix is moot while the gate remains on; document rather than
 * refactor.
 */
export async function handleSyncBulkTasks(request: Request, user: AuthUser, env: Env): Promise<Response> {
  if ((env as unknown as Record<string, string>).HUB_BULK_MIGRATION_MODE !== '1') {
    return error(
      'sync-bulk requires HUB_BULK_MIGRATION_MODE=1 (one-shot migrations only). ' +
      'Normal writes go through /api/mutations.',
      403,
    );
  }

  const body = await request.json() as {
    tasks: Array<{
      id: string; title: string; description?: string | null;
      assignee: string; assigned_by?: string | null;
      due_date?: string | null; priority?: string;
      status?: string; source?: string;
      completed?: number; completed_at?: string | null;
      completed_by?: string | null; created_at?: string | null;
      // Client-declared updated_at from brain.db. If provided AND Hub's row
      // is newer, the upsert is a no-op (preserves the peer's authoritative
      // state). If omitted, fallback behavior is last-writer-wins (back-
      // compat with pre-2026-04-21 callers).
      client_updated_at?: string | null;
      project_id?: string | null; meeting_id?: string | null;
      key_link_1?: string | null; key_link_1_desc?: string | null;
      key_link_2?: string | null; key_link_2_desc?: string | null;
      key_link_3?: string | null; key_link_3_desc?: string | null;
    }>;
    clear_existing?: boolean;
  };

  if (!body.tasks?.length) return error('tasks array required', 400);

  // Safety: require explicit clear flag
  if (body.clear_existing) {
    // Delete related data first (tables may not exist in all environments)
    try { await env.DB.prepare('DELETE FROM task_comments').run(); } catch { /* table may not exist */ }
    try { await env.DB.prepare('DELETE FROM task_subtasks').run(); } catch { /* table may not exist */ }
    await env.DB.prepare('DELETE FROM tasks').run();
  }

  // D1 batch: up to 100 statements per batch
  const BATCH_SIZE = 50;
  let inserted = 0;            // legacy field — total rows whose write was authoritative
  let rejectedStale = 0;       // CX-A2: rows the freshness guard no-op'd
  // 2026-04-26 Bug #1 fix — capture {client_id, hub_id} per row so PB sync_push
  // can mint a hub_slug alias on 200 instead of waiting for find_name_duplicate
  // to recover the mapping on the next pull. Hub upserts on the client-supplied
  // id, so in the steady state hub_id === client_id; when they diverge (Hub-UI
  // mint or pre-existing Hub row matched on a different id by future logic),
  // PB-side records the alias to lock identity.
  const ids: Array<{ client_id: string; hub_id: string }> = [];
  // CX-A2 (2026-04-28, Codex holistic-review): per-row status. Pre-fix the
  // route returned `inserted = batch.length` for every batch even when the
  // freshness guard (WHERE excluded.updated_at >= tasks.updated_at) caused
  // individual UPDATE branches to no-op. PB then marked all rows synced,
  // including the stale ones — silent data loss class identical to the
  // ones M5 closed elsewhere. This `results` array surfaces per-row outcome
  // so PB's IdentityBoundary.mark_synced_upsert refuses to mark the
  // rejected-stale rows synced (they replay on next push).
  //
  // Status semantics (matches PB scripts/db/sync/records.py::UpsertResult):
  //   - 'inserted'        — new row created
  //   - 'updated'         — existing row updated (freshness guard passed)
  //   - 'rejected_stale'  — freshness guard rejected (Hub row newer than
  //                         client_updated_at OR same-ts no-op)
  //   - 'error'           — write returned 0 changes for unknown reason
  //
  // Old PB clients read only `data.inserted` — additive, no break.
  const results: Array<{ client_id: string; status: string; reason?: string }> = [];

  for (let i = 0; i < body.tasks.length; i += BATCH_SIZE) {
    const batch = body.tasks.slice(i, i + BATCH_SIZE);

    // I18 dedup (2026-05-03): before the batch INSERT, check each task whose
    // id does NOT already exist in Hub (new rows only) for a same-(title,
    // project_id) active duplicate. If found, record it as 'deduped' and
    // exclude it from the batch. This closes the RC2 leak where two machines
    // push the same mechanic-triage Approve task with different PKs.
    //
    // Only checks tasks whose id isn't already in Hub (no point deduping an
    // UPDATE; the freshness guard handles that). We do one SELECT per novel
    // task title — acceptable since batch sizes are ≤50 and these are rare.
    //
    // Edge cases:
    //   - NULL project_id: two tasks with same title and null project_id ARE
    //     duplicates (the IS ? bind handles SQL NULL equality correctly).
    //   - deleted rows: excluded (deleted_at IS NOT NULL).
    //   - status='done': excluded — a completed task should not block a new
    //     open task of the same name.
    const placeholdersAll = batch.map(() => '?').join(',');
    const existingIds = await env.DB.prepare(
      `SELECT id FROM tasks WHERE id IN (${placeholdersAll})`
    ).bind(...batch.map(t => t.id)).all<{ id: string }>();
    const knownIds = new Set((existingIds.results || []).map(r => r.id));

    // deduped_ids: tasks excluded from the INSERT batch due to active dup found
    const dedupedInBatch = new Set<string>();
    for (const t of batch) {
      if (knownIds.has(t.id)) continue; // existing row — handled as UPDATE below
      if (!t.title) continue;
      const dup = await env.DB.prepare(
        `SELECT id FROM tasks WHERE title = ? AND project_id IS ? AND deleted_at IS NULL AND status != 'done' LIMIT 1`
      ).bind(t.title, t.project_id ?? null).first<{ id: string }>();
      if (dup && dup.id !== t.id) {
        dedupedInBatch.add(t.id);
        results.push({ client_id: t.id, status: 'deduped', reason: `active task with same (title, project_id) exists as ${dup.id}` });
        ids.push({ client_id: t.id, hub_id: dup.id });
      }
    }
    // Exclude deduped tasks from the INSERT/UPSERT batch
    const activeBatch = batch.filter(t => !dedupedInBatch.has(t.id));
    if (activeBatch.length === 0) continue;

    // Capture per-row pre-state so the post-batch readback can disambiguate
    // INSERT vs UPDATE-applied vs UPDATE-rejected-stale.
    const placeholders = activeBatch.map(() => '?').join(',');
    const preRows = await env.DB.prepare(
      `SELECT id, updated_at FROM tasks WHERE id IN (${placeholders})`
    ).bind(...activeBatch.map(t => t.id)).all<{ id: string; updated_at: string | null }>();
    const preState = new Map<string, string | null>(
      (preRows.results || []).map(r => [r.id, r.updated_at])
    );

    const stmts = activeBatch.map(t =>
      env.DB.prepare(
        // Bind client_updated_at as the last positional parameter. When NULL,
        // the guard falls through (new row or legacy client) and we write
        // datetime('now') for updated_at. When present, we use it as-is and
        // guard the UPDATE branch with a freshness check.
        `INSERT INTO tasks (id, meeting_id, project_id, title, description, assignee, assigned_by, due_date, deadline, priority, status, source, completed, completed_at, completed_by, created_at, key_link_1, key_link_1_desc, key_link_2, key_link_2_desc, key_link_3, key_link_3_desc, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
         ON CONFLICT(id) DO UPDATE SET
           meeting_id = excluded.meeting_id,
           project_id = excluded.project_id,
           title = excluded.title,
           description = COALESCE(excluded.description, tasks.description),
           assignee = COALESCE(excluded.assignee, tasks.assignee),
           assigned_by = COALESCE(excluded.assigned_by, tasks.assigned_by),
           due_date = excluded.due_date,
           deadline = excluded.deadline,
           priority = COALESCE(excluded.priority, tasks.priority),
           status = CASE
             WHEN excluded.status IN ('blocked', 'done') THEN excluded.status
             ELSE COALESCE(excluded.status, tasks.status)
           END,
           source = COALESCE(excluded.source, tasks.source),
           completed = excluded.completed,
           completed_at = excluded.completed_at,
           completed_by = excluded.completed_by,
           key_link_1 = excluded.key_link_1,
           key_link_1_desc = excluded.key_link_1_desc,
           key_link_2 = excluded.key_link_2,
           key_link_2_desc = excluded.key_link_2_desc,
           key_link_3 = excluded.key_link_3,
           key_link_3_desc = excluded.key_link_3_desc,
           updated_at = COALESCE(excluded.updated_at, datetime('now'))
         WHERE tasks.updated_at IS NULL
            OR excluded.updated_at IS NULL
            OR excluded.updated_at >= tasks.updated_at`
      ).bind(
        t.id, t.meeting_id ?? null, t.project_id ?? null,
        t.title, t.description ?? null, t.assignee ?? null,
        t.assigned_by ?? null, t.due_date ?? null,
        t.deadline ?? null,  // v51 (2026-04-26): tasks.deadline
        // Enforce NOT-NULL on required fields — mirrors the single-task API guard (R9-8, DI-8).
        t.priority ?? 'medium', t.status ?? 'todo',
        t.source ?? 'sync', t.completed ?? 0,
        t.completed_at ?? null, t.completed_by ?? null,
        t.created_at ?? null,
        t.key_link_1 ?? null, t.key_link_1_desc ?? null,
        t.key_link_2 ?? null, t.key_link_2_desc ?? null,
        t.key_link_3 ?? null, t.key_link_3_desc ?? null,
        t.client_updated_at ?? null
      )
    );
    await env.DB.batch(stmts);

    // CX-A2 readback: post-state has updated_at = excluded.updated_at iff
    // the freshness guard passed. Compare to (a) presence in preState and
    // (b) whether updated_at advanced.
    const postRows = await env.DB.prepare(
      `SELECT id, updated_at FROM tasks WHERE id IN (${placeholders})`
    ).bind(...activeBatch.map(t => t.id)).all<{ id: string; updated_at: string | null }>();
    const postState = new Map<string, string | null>(
      (postRows.results || []).map(r => [r.id, r.updated_at])
    );

    for (const t of activeBatch) {
      const post = postState.get(t.id);
      if (post === undefined) {
        // Row absent post-write — should not happen given INSERT ON CONFLICT,
        // but defensive (rolled-back by D1 internally for some reason).
        results.push({ client_id: t.id, status: 'error', reason: 'row_absent_post_write' });
        continue;
      }
      ids.push({ client_id: t.id, hub_id: t.id });
      const pre = preState.get(t.id);
      if (pre === undefined) {
        // Was absent before, present after → INSERT branch fired.
        inserted += 1;
        results.push({ client_id: t.id, status: 'inserted' });
        continue;
      }
      // Row existed before. Check whether updated_at advanced — if so, the
      // freshness-guard-passed UPDATE branch ran. If not, the WHERE clause
      // rejected the update (excluded.updated_at < tasks.updated_at) and
      // the row is unchanged.
      const sentTs = t.client_updated_at ?? null;
      if (post === pre) {
        // Updated_at didn't advance. Two interpretations:
        //   - Stale: client sent older client_updated_at, guard rejected.
        //   - Same-ts: client sent the exact same timestamp, no-op.
        // Both are 'rejected_stale' from the sync layer's perspective — PB
        // shouldn't mark these synced because Hub still holds whatever
        // state was there.
        rejectedStale += 1;
        results.push({
          client_id: t.id,
          status: 'rejected_stale',
          reason: sentTs && pre ? `client=${sentTs} hub=${pre}` : 'no_update_applied',
        });
      } else {
        inserted += 1;
        results.push({ client_id: t.id, status: 'updated' });
      }
    }
  }

  await logActivity(
    env,
    'sync',
    `Bulk sync: ${inserted}/${body.tasks.length} tasks applied (${rejectedStale} rejected stale)`,
    user.email, null, null,
  );

  // Response shape (additive, backwards-compat):
  //   data.inserted          — count of rows whose write was authoritative
  //                            (created or updated). Pre-CX-A2 clients read this.
  //   data.rejected_stale    — count rejected by freshness guard (CX-A2)
  //   data.ids               — per-row {client_id, hub_id} mapping (Bug #1 era)
  //   data.results           — per-row {client_id, status, reason?} (CX-A2)
  return json({ data: { ok: true, inserted, rejected_stale: rejectedStale, ids, results } });
}

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

  const now = new Date().toISOString();
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

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// GET /api/task-updates/recent — bulk fetch recent task updates (for sync pull)
//
// 2026-04-28 (Codex review fix): when ?since= is present, ORDER BY ASC so
// brain.db pull_task_updates can paginate forward without losing rows when
// volume between pulls exceeds limit. DESC kept for UI-style "newest 100".
export async function handleGetRecentTaskUpdates(url: URL, env: Env): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '100')
  const since = url.searchParams.get('since') // ISO timestamp for delta sync
  let query = 'SELECT * FROM task_updates'
  const binds: unknown[] = []
  if (since) {
    query += ' WHERE created_at > ?'
    binds.push(since)
    query += ' ORDER BY created_at ASC, id ASC LIMIT ?'
  } else {
    query += ' ORDER BY created_at DESC LIMIT ?'
  }
  binds.push(Math.min(limit, 500))
  const stmt = env.DB.prepare(query)
  const result = await (binds.length === 2 ? stmt.bind(binds[0], binds[1]) : stmt.bind(binds[0])).all()
  return json({ data: result.results || [], count: result.results?.length || 0 })
}

// GET /api/tasks/:id/updates — get task notes/updates
export async function handleGetTaskUpdates(taskId: string, env: Env): Promise<Response> {
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
  const authorSlug = body.author_slug?.trim() || actorSlug(user.email);

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
    let resolvedProjectId: string | null = pwaTask.project_id ?? null;
    if (resolvedProjectId) {
      const proj = await env.DB.prepare(
        'SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1'
      ).bind(resolvedProjectId, resolvedProjectId).first<{ id: string; slug: string | null }>();
      resolvedProjectId = proj ? (proj.slug || proj.id) : null;
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
          completed_at: completedInt ? new Date().toISOString() : null,
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
