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

  let query = 'SELECT t.*, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE t.deleted_at IS NULL';
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

  query += ' ORDER BY t.completed ASC, t.due_date ASC, t.created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/tasks/:id/status — change task status (todo/in_progress/done/blocked)
export async function handleUpdateTaskStatus(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { status: string };
  if (!body.status || !['todo', 'in_progress', 'done', 'blocked'].includes(body.status)) {
    return error('status must be one of: todo, in_progress, done, blocked', 400);
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
      ).bind(generateId(), assignerSlug, 'update', 'task', id, `${user.name || user.email} completed a task`, (item.title || item.description).slice(0, 200), '/tasks').run();
    } catch (e) { console.error('Failed to create completion notification:', e); }
  }

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/action-items/:id/toggle — backward compat (toggles done/todo)
export async function handleToggleTask(id: string, user: AuthUser, env: Env): Promise<Response> {
  const item = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ completed: number; title: string; description: string }>();
  if (!item) return error('Task not found', 404);

  const newCompleted = item.completed ? 0 : 1;
  const newStatus = newCompleted ? 'done' : 'todo';
  await env.DB.prepare(
    "UPDATE tasks SET status = ?, completed = ?, completed_at = ?, completed_by = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newStatus, newCompleted, newCompleted ? new Date().toISOString() : null, newCompleted ? user.email : null, id).run();

  await logActivity(env, 'task', `${newCompleted ? 'Completed' : 'Reopened'}: "${item.title || item.description}"`, user.email, id, 'task');

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/tasks/:id — update task fields
export async function handleUpdateTask(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const allowedFields = ['title', 'description', 'assignee', 'assigned_by', 'due_date', 'priority', 'status', 'project_id', 'meeting_id', 'blocked_by'];
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (field in body) {
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
    priority?: string; source?: string;
  };
  if (!body.description || !body.assignee) return error('description and assignee required', 400);

  const id = generateId();
  const title = body.title || body.description;
  const source = body.source || (body.meeting_id ? 'meeting' : 'manual');
  const priority = body.priority || 'medium';

  await env.DB.prepare(
    'INSERT INTO tasks (id, title, description, assignee, assigned_by, meeting_id, project_id, due_date, priority, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, title, body.description, body.assignee, user.email, body.meeting_id ?? null, body.project_id ?? null, body.due_date ?? null, priority, source).run();

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
        '/tasks'
      ).run();
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
  const body = await request.json() as { content: string };
  if (!body.content?.trim()) return error('content required', 400);

  const id = generateId();
  const authorSlug = actorSlug(user.email);

  await env.DB.prepare(
    'INSERT INTO task_comments (id, task_id, author_slug, content) VALUES (?, ?, ?, ?)'
  ).bind(id, taskId, authorSlug, body.content.trim()).run();

  await logActivity(env, 'comment', `Commented on task`, authorSlug, taskId, 'task');

  // Create notifications for @mentions
  try {
    const mentions = parseMentions(body.content);
    for (const slug of mentions) {
      if (slug === authorSlug) continue;
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), slug, 'mention', 'task_comment', id, `${user.name || user.email} mentioned you`, body.content.trim().slice(0, 200), '/tasks').run();
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
    action: 'complete' | 'uncomplete' | 'assign' | 'priority' | 'delete'
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

    case 'assign':
      if (!body.value) return error('value (assignee) required for assign action', 400)
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
        'INSERT OR REPLACE INTO tasks (id, meeting_id, project_id, title, description, assignee, assigned_by, due_date, priority, status, source, completed, completed_at, completed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        t.id, t.meeting_id ?? null, t.project_id ?? null,
        t.title, t.description ?? null, t.assignee,
        t.assigned_by ?? null, t.due_date ?? null,
        t.priority ?? 'medium', t.status ?? 'todo',
        t.source ?? 'sync', t.completed ?? 0,
        t.completed_at ?? null, t.completed_by ?? null,
        t.created_at ?? null
      )
    );
    await env.DB.batch(stmts);
    inserted += batch.length;
  }

  await logActivity(env, 'sync', `Bulk sync: ${inserted} tasks loaded from brain.db`, user.email, null, null);

  return json({ data: { ok: true, inserted } });
}

// POST /api/tasks/:id/acknowledge — closed-loop task acknowledgment (aviation CRM pattern)
export async function handleAcknowledgeTask(id: string, user: AuthUser, env: Env): Promise<Response> {
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ title: string; description: string; assignee: string; assigned_by: string | null; acknowledged_at: string | null }>();
  if (!task) return error('Task not found', 404);

  if (task.acknowledged_at) {
    return json({ data: { already_acknowledged: true, acknowledged_at: task.acknowledged_at } });
  }

  const now = new Date().toISOString();
  const acknowledgedBy = actorSlug(user.email);

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
      ).bind(generateId(), assignerSlug, 'update', 'task', id, `${user.name || user.email} acknowledged a task`, (task.title || task.description).slice(0, 200), '/tasks').run();
    } catch (e) { console.error('Failed to create acknowledge notification:', e); }
  }

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
}
