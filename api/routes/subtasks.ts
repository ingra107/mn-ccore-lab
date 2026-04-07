import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug } from '../helpers';

interface SubtaskRow {
  id: string
  task_id: string
  title: string
  completed: number
  completed_at: string | null
  completed_by: string | null
  sort_order: number
  created_at: string
}

// GET /api/tasks/:id/subtasks — list subtasks ordered by sort_order, then created_at
export async function handleGetSubtasks(taskId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).bind(taskId).all<SubtaskRow>();

  return json({ data: result.results });
}

// POST /api/tasks/:id/subtasks — create a subtask
export async function handleCreateSubtask(taskId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { title?: string };

  if (!body.title?.trim()) {
    return error('title is required', 400);
  }

  // Get max sort_order for this task
  const maxOrder = await env.DB.prepare(
    'SELECT MAX(sort_order) as max_order FROM task_subtasks WHERE task_id = ?'
  ).bind(taskId).first<{ max_order: number | null }>();

  const id = generateId();
  const sortOrder = (maxOrder?.max_order ?? -1) + 1;

  await env.DB.prepare(
    'INSERT INTO task_subtasks (id, task_id, title, sort_order) VALUES (?, ?, ?, ?)'
  ).bind(id, taskId, body.title.trim(), sortOrder).run();

  const created = await env.DB.prepare('SELECT * FROM task_subtasks WHERE id = ?').bind(id).first<SubtaskRow>();

  const actor = actorSlug(user.email);
  await logActivity(env, 'subtask_created', `Added subtask "${body.title.trim()}"`, actor, taskId, 'task');

  return json({ data: created }, 201);
}

// POST /api/subtasks/:id/toggle — toggle subtask completion
export async function handleToggleSubtask(subtaskId: string, user: AuthUser, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT * FROM task_subtasks WHERE id = ?'
  ).bind(subtaskId).first<SubtaskRow>();

  if (!existing) {
    return error('Subtask not found', 404);
  }

  const actor = actorSlug(user.email);
  const nowCompleted = existing.completed ? 0 : 1;
  const completedAt = nowCompleted ? new Date().toISOString() : null;
  const completedBy = nowCompleted ? actor : null;

  await env.DB.prepare(
    'UPDATE task_subtasks SET completed = ?, completed_at = ?, completed_by = ? WHERE id = ?'
  ).bind(nowCompleted, completedAt, completedBy, subtaskId).run();

  const updated = await env.DB.prepare('SELECT * FROM task_subtasks WHERE id = ?').bind(subtaskId).first<SubtaskRow>();

  const action = nowCompleted ? 'completed' : 'uncompleted';
  await logActivity(env, `subtask_${action}`, `${action === 'completed' ? 'Completed' : 'Uncompleted'} subtask "${existing.title}"`, actor, existing.task_id, 'task');

  return json({ data: updated });
}

// POST /api/subtasks/:id/delete — delete a subtask
export async function handleDeleteSubtask(subtaskId: string, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT * FROM task_subtasks WHERE id = ?'
  ).bind(subtaskId).first<SubtaskRow>();

  if (!existing) {
    return error('Subtask not found', 404);
  }

  await env.DB.prepare('DELETE FROM task_subtasks WHERE id = ?').bind(subtaskId).run();

  return json({ data: null, deleted: true });
}

// POST /api/tasks/:id/subtasks/reorder — reorder subtasks
export async function handleReorderSubtasks(taskId: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { ids?: string[] };

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return error('ids array is required', 400);
  }

  // Update sort_order for each subtask based on array position
  const stmts = body.ids.map((id, index) =>
    env.DB.prepare('UPDATE task_subtasks SET sort_order = ? WHERE id = ? AND task_id = ?')
      .bind(index, id, taskId)
  );

  await env.DB.batch(stmts);

  // Return updated list
  const result = await env.DB.prepare(
    'SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).bind(taskId).all<SubtaskRow>();

  return json({ data: result.results });
}
