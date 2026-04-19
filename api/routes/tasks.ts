import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, parseMentions, actorSlug } from '../helpers';

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
  // Sync pipelines need to see soft-deletes to mirror them into brain.db.
  // Default: hide deleted tasks (existing UI contract). Opt-in via flag.
  const includeDeleted = url.searchParams.get('include_deleted') === '1';

  const deletedFilter = includeDeleted ? '1=1' : 't.deleted_at IS NULL';
  let query = `SELECT t.*, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE ${deletedFilter}`;
  const params: (string | number)[] = [];

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

  query += ' ORDER BY t.completed ASC, t.due_date ASC, t.created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
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

  await env.DB.prepare(
    "UPDATE tasks SET status = ?, completed = ?, completed_at = ?, completed_by = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(body.status, completed, completedAt, completedBy, id).run();

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
        const nextId = generateId();
        // Note: recurrence + recurrence_parent_id columns not yet in D1 schema (pending schema v35).
        // Insert without those columns until migration is applied.
        await env.DB.prepare(
          `INSERT INTO tasks (id, title, description, assignee, project_id, due_date, priority, status, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', 'recurrence', datetime('now'), datetime('now'))`
        ).bind(nextId, fullTask?.title, fullTask?.description || '', fullTask?.assignee || '', fullTask?.project_id || null, nextDue, fullTask?.priority || 'medium').run();
      }
    } catch (e) { console.error('Failed to create recurring task:', e); }
  }

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
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
    await env.DB.prepare(
      "UPDATE tasks SET status = ?, completed = ?, completed_at = ?, completed_by = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(newStatus, newCompleted, newCompleted ? new Date().toISOString() : null, newCompleted ? user.email : null, id).run();
  }

  await logActivity(env, 'task', `${newCompleted ? 'Completed' : 'Reopened'}: "${item.description}"`, user.email, id, table === 'action_items' ? 'action_item' : 'task');

  const updated = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return json({ data: updated });
}

// POST /api/tasks/:id — update task fields
// Hoisted to module scope — avoids allocation per request
const TASK_ALLOWED_FIELDS = new Set(['title', 'description', 'description_json', 'assignee', 'assigned_by', 'due_date', 'priority', 'status', 'project_id', 'meeting_id', 'blocked_by', 'key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc', 'key_link_3', 'key_link_3_desc']);
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

  // Handle status -> completed sync
  if ('status' in body) {
    const isDone = body.status === 'done';
    updates.push('completed = ?');
    params.push(isDone ? 1 : 0);
    if (isDone) {
      updates.push('completed_at = ?', 'completed_by = ?');
      params.push(new Date().toISOString(), user.email);
    }
  }

  if (updates.length === 0) return error('No valid fields to update', 400);

  updates.push("updated_at = datetime('now')");
  params.push(id);
  await env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

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

  const id = generateId();
  const title = body.title || body.description;
  const source = body.source || (body.meeting_id ? 'meeting' : 'manual');
  const priority = body.priority || 'medium';

  // Validate status if provided (R10 vocab)
  const status = body.status && ['todo', 'in_progress', 'done', 'blocked', 'waiting_external'].includes(body.status)
    ? body.status : 'todo';

  await env.DB.prepare(
    'INSERT INTO tasks (id, title, description, assignee, assigned_by, meeting_id, project_id, due_date, priority, status, source, key_link_1, key_link_1_desc, key_link_2, key_link_2_desc, key_link_3, key_link_3_desc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, title, body.description, body.assignee, user.email,
    body.meeting_id ?? null, resolvedProjectId, body.due_date ?? null,
    priority, status, source,
    body.key_link_1 ?? null, body.key_link_1_desc ?? null,
    body.key_link_2 ?? null, body.key_link_2_desc ?? null,
    body.key_link_3 ?? null, body.key_link_3_desc ?? null,
  ).run();

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

  // Create notifications for @mentions
  try {
    const mentions = parseMentions(body.content);
    for (const slug of mentions) {
      if (slug === authorSlug) continue;
      // source_id references the TASK (what the user cares about), not the
      // comment row id — clicking the notification takes them to the task
      // detail panel via ?open=. Found via deep-audit Suite 4.
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), slug, 'mention', 'task_comment', taskId, `${user.name || user.email} mentioned you`, body.content.trim().slice(0, 200), `/tasks?open=${taskId}`).run();
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

  const placeholders = body.ids.map(() => '?').join(',')

  switch (body.action) {
    case 'complete':
      await env.DB.prepare(
        `UPDATE tasks SET status = 'done', completed = 1, completed_at = datetime('now'), completed_by = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).bind(user.email, ...body.ids).run()
      break

    case 'uncomplete':
      await env.DB.prepare(
        `UPDATE tasks SET status = 'todo', completed = 0, completed_at = NULL, completed_by = NULL, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).bind(...body.ids).run()
      break

    case 'status':
      if (!body.value || !['todo', 'in_progress', 'done', 'blocked', 'waiting_external'].includes(body.value)) {
        return error('value must be one of: todo, in_progress, done, blocked, waiting_external', 400)
      }
      if (body.value === 'done') {
        await env.DB.prepare(
          `UPDATE tasks SET status = 'done', completed = 1, completed_at = datetime('now'), completed_by = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
        ).bind(user.email, ...body.ids).run()
      } else {
        await env.DB.prepare(
          `UPDATE tasks SET status = ?, completed = 0, completed_at = NULL, completed_by = NULL, updated_at = datetime('now') WHERE id IN (${placeholders})`
        ).bind(body.value, ...body.ids).run()
      }
      break

    case 'assign':
      if (!body.value) return error('value (assignee) required for assign action', 400)
      if (body.value !== 'claude-ai') {
        const member = await env.DB.prepare('SELECT 1 FROM team_members WHERE slug = ? LIMIT 1').bind(body.value).first()
        if (!member) return error(`Unknown assignee "${body.value}". Must match team_members.slug.`, 400)
      }
      await env.DB.prepare(
        `UPDATE tasks SET assignee = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).bind(body.value, ...body.ids).run()
      break

    case 'priority':
      if (!body.value || !['low', 'medium', 'high', 'urgent'].includes(body.value)) {
        return error('value must be one of: low, medium, high, urgent', 400)
      }
      await env.DB.prepare(
        `UPDATE tasks SET priority = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).bind(body.value, ...body.ids).run()
      break

    case 'delete':
      await env.DB.prepare(
        `UPDATE tasks SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).bind(...body.ids).run()
      // Cascade-clean notifications pointing at deleted tasks so orphans
      // don't accumulate (deep-audit 12.L found 151 stale notifs).
      try {
        await env.DB.prepare(
          `DELETE FROM notifications WHERE source_type IN ('task','task_comment') AND source_id IN (${placeholders})`
        ).bind(...body.ids).run()
      } catch (e) {
        console.error('cascade-clean notifications failed:', e)
      }
      break
  }

  await logActivity(env, 'task', `Bulk ${body.action}: ${body.ids.length} tasks`, user.email, null, null)

  return json({ data: { ok: true, count: body.ids.length } })
}

// POST /api/tasks/sync-bulk — bulk upsert tasks from brain.db sync
// Accepts array of tasks with their own IDs. Clears existing tasks first.
export async function handleSyncBulkTasks(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    tasks: Array<{
      id: string; title: string; description?: string | null;
      assignee: string; assigned_by?: string | null;
      due_date?: string | null; priority?: string;
      status?: string; source?: string;
      completed?: number; completed_at?: string | null;
      completed_by?: string | null; created_at?: string | null;
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
  let inserted = 0;

  for (let i = 0; i < body.tasks.length; i += BATCH_SIZE) {
    const batch = body.tasks.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(t =>
      env.DB.prepare(
        `INSERT INTO tasks (id, meeting_id, project_id, title, description, assignee, assigned_by, due_date, priority, status, source, completed, completed_at, completed_by, created_at, key_link_1, key_link_1_desc, key_link_2, key_link_2_desc, key_link_3, key_link_3_desc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           meeting_id = excluded.meeting_id,
           project_id = excluded.project_id,
           title = excluded.title,
           description = COALESCE(excluded.description, tasks.description),
           assignee = COALESCE(excluded.assignee, tasks.assignee),
           assigned_by = COALESCE(excluded.assigned_by, tasks.assigned_by),
           due_date = excluded.due_date,
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
           updated_at = datetime('now')`
      ).bind(
        t.id, t.meeting_id ?? null, t.project_id ?? null,
        t.title, t.description ?? null, t.assignee ?? null,
        t.assigned_by ?? null, t.due_date ?? null,
        // Enforce NOT-NULL on required fields — mirrors the single-task API guard (R9-8, DI-8).
        t.priority ?? 'medium', t.status ?? 'todo',
        t.source ?? 'sync', t.completed ?? 0,
        t.completed_at ?? null, t.completed_by ?? null,
        t.created_at ?? null,
        t.key_link_1 ?? null, t.key_link_1_desc ?? null,
        t.key_link_2 ?? null, t.key_link_2_desc ?? null,
        t.key_link_3 ?? null, t.key_link_3_desc ?? null
      )
    );
    await env.DB.batch(stmts);
    inserted += batch.length;
  }

  await logActivity(env, 'sync', `Bulk sync: ${inserted} tasks loaded from brain.db`, user.email, null, null);

  return json({ data: { ok: true, inserted } });
}

// POST /api/tasks/:id/acknowledge — closed-loop task acknowledgment (aviation CRM pattern)
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
export async function handleGetRecentTaskUpdates(url: URL, env: Env): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '100')
  const since = url.searchParams.get('since') // ISO timestamp for delta sync
  let query = 'SELECT * FROM task_updates'
  const binds: unknown[] = []
  if (since) {
    query += ' WHERE created_at > ?'
    binds.push(since)
  }
  query += ' ORDER BY created_at DESC LIMIT ?'
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

  // Notify @mentions
  const mentions = parseMentions(body.content);
  for (const slug of mentions) {
    if (slug !== authorSlug) {
      try {
        await env.DB.prepare(
          'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(generateId(), slug, 'mention', 'task', taskId, `${user.name || user.email} mentioned you in a task note`, body.content.trim().slice(0, 200), `/tasks?open=${taskId}`).run();
      } catch (e) { console.error('Failed to create mention notification:', e); }
    }
  }

  const created = await env.DB.prepare('SELECT * FROM task_updates WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
