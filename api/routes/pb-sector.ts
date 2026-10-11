import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, projectRefToCanonical } from '../helpers';
import { applyMutation } from './mutations';

// NOTE (2026-06-10): the PB Sector "Daily Plan" handlers (command-center,
// plan CRUD/reorder/promote/history, reflection, pomodoro) were retired —
// superseded by the synced task plan columns (tasks.planned_for/plan_slot/
// plan_rank, see src/lib/todayPlan.ts). The D1 tables (daily_plans,
// daily_reflections, hub_pomodoro_slots) were removed in schema-v78 (2026-06-14).
// What stays here: quick capture and the dispatch queue's add/pending half. The defer,
// dispatch/send and dispatch/complete handlers were archived 2026-10-11 (no caller; the
// completer skill is archived) to Archive/2026-10-11-pb-dispatch-drain/.

// POST /api/pb/capture — quick capture (task, idea, or note)
export async function handlePBCapture(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { text: string; type?: 'task' | 'idea' | 'note'; priority?: string; project?: string }
  if (!body.text?.trim()) return error('text required', 400)

  const type = body.type || 'task'
  // A1.2: type-conditional ID format. tasks get typed ULID; ideas stay hex
  // (ideas table not yet in CORE_TABLES sync).
  const id = type === 'task' ? generateId('task') : generateId()

  if (type === 'task') {
    let resolvedProjectId: string | null = null;
    if (body.project) {
      const p = await env.DB.prepare('SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1')
        .bind(body.project, body.project).first<{ id: string }>();
      resolvedProjectId = p ? p.id : null;
    }
    const captureMut = await applyMutation(env, {
      table: 'tasks',
      record_id: id,
      op: 'insert',
      payload: {
        title: body.text.trim(),
        description: body.text.trim(),
        assignee: 'nick-ingraham',
        priority: body.priority || 'medium',
        source: 'pb-sector',
        status: 'todo',
        project_id: resolvedProjectId,
      },
      route: 'handlePBCapture',
      user,
    });
    if (captureMut.status !== 'accepted') {
      return error(`mutation rejected: ${captureMut.status} — ${captureMut.reason ?? ''}`, 409);
    }
  } else if (type === 'idea') {
    await env.DB.prepare(
      'INSERT INTO ideas (id, title, submitted_by, status) VALUES (?, ?, ?, ?)'
    ).bind(id, body.text.trim(), 'nick-ingraham', 'new').run()
  } else {
    return error(`unsupported capture type: ${type}. Allowed: task, idea`, 400)
  }

  await logActivity(env, type, `PB capture: ${body.text.trim().slice(0, 100)}`, user.email, id, type)
  return json({ data: { id, type } }, 201)
}

// POST /api/pb/dispatch/add — add item to dispatch queue
export async function handleAddToDispatch(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    task_id?: string
    task_title?: string
    project_slug?: string
    comment: string
    comment_type?: 'action' | 'info'
  }
  if (!body.comment?.trim()) return error('comment required', 400)

  // Z3.2: canonicalize project_slug before insert so dispatch_queue stores a
  // stable canonical slug (not a raw id or stale alias).
  const canonicalProjectSlug = body.project_slug
    ? await projectRefToCanonical(env, body.project_slug)
    : null;

  const id = generateId()
  await env.DB.prepare(
    'INSERT INTO dispatch_queue (id, task_id, task_title, project_slug, comment, comment_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.task_id || null,
    body.task_title || null,
    canonicalProjectSlug,
    body.comment.trim(),
    body.comment_type || 'action'
  ).run()

  await logActivity(env, 'dispatch', `Queued for Claude: ${body.comment.trim().slice(0, 80)}`, user.email)
  return json({ data: { id } }, 201)
}

// GET /api/pb/dispatch/pending — get pending dispatch items
export async function handleGetPendingDispatch(env: Env): Promise<Response> {
  const items = await env.DB.prepare(
    "SELECT * FROM dispatch_queue WHERE status = 'pending' ORDER BY created_at ASC"
  ).all()
  return json({ data: items.results || [], count: (items.results || []).length })
}
