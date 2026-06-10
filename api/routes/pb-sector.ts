import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, projectRefToCanonical } from '../helpers';
import { ctToday } from '../lib/ct-date';
import { nowInstant } from '../lib/time';
import { applyMutation } from './mutations';
import { postActivityEntry } from '../lib/activity-entry';

// NOTE (2026-06-10): the PB Sector "Daily Plan" handlers (command-center,
// plan CRUD/reorder/promote/history, reflection, pomodoro) were retired —
// superseded by the synced task plan columns (tasks.planned_for/plan_slot/
// plan_rank, see src/lib/todayPlan.ts). The D1 tables (daily_plans,
// daily_reflections, hub_pomodoro_slots) remain physically; drop is deferred.
// What stays here: quick capture, defer, and the dispatch queue (live Hermes lane).

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

// POST /api/pb/defer — defer a task to tomorrow/next week
export async function handlePBDefer(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { id: string; to: 'tomorrow' | 'next_week' | 'someday' }
  const dueDate = body.to === 'tomorrow' ? ctToday(1)
    : body.to === 'next_week' ? ctToday(7)
    : null

  const deferPatch: Record<string, unknown> = body.to === 'someday'
    ? { due_date: null, priority: 'low' }
    : { due_date: dueDate };

  const deferMut = await applyMutation(env, {
    table: 'tasks',
    record_id: body.id,
    op: 'update',
    patch: deferPatch,
    route: 'handlePBDefer',
    user,
  });
  if (deferMut.status !== 'accepted' && deferMut.status !== 'merged_clean') {
    return error(`mutation rejected: ${deferMut.status} — ${deferMut.reason ?? ''}`, 409);
  }

  return json({ data: { ok: true } })
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

// POST /api/pb/dispatch/send — mark all pending as dispatched
export async function handleSendDispatch(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const now = nowInstant()
  const pending = await env.DB.prepare(
    "SELECT * FROM dispatch_queue WHERE status = 'pending' ORDER BY created_at ASC"
  ).all()

  const items = (pending.results || []) as any[]
  if (items.length === 0) return json({ data: { dispatched: 0 } })

  // Mark all pending as dispatched
  await env.DB.prepare(
    "UPDATE dispatch_queue SET status = 'dispatched', dispatched_at = ? WHERE status = 'pending'"
  ).bind(now).run()

  await logActivity(env, 'dispatch', `Dispatched ${items.length} items to Claude`, user.email)
  return json({ data: { dispatched: items.length, items } })
}

// POST /api/pb/dispatch/complete — mark a dispatch item as completed
export async function handleCompleteDispatchItem(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { id: string; response?: string }
  if (!body.id) return error('id required', 400)

  const now = nowInstant()
  await env.DB.prepare(
    "UPDATE dispatch_queue SET status = 'completed', completed_at = ?, response = ? WHERE id = ?"
  ).bind(now, body.response || null, body.id).run()

  // If this item has a task_id, also post the response as a task comment.
  // Design C (v77): the AI answer lands in the unified timeline via
  // postActivityEntry(kind='comment', actor_slug='claude-ai'). fireSideEffects
  // is false — an AI reply that quotes @someone (or @hermes) must not re-fire
  // mention notifications or a recursive AI request.
  if (body.response) {
    const item = await env.DB.prepare('SELECT task_id FROM dispatch_queue WHERE id = ?').bind(body.id).first() as any
    if (item?.task_id) {
      await postActivityEntry({
        env,
        user: { email: 'claude-ai', name: 'Hermes' },
        entityType: 'task',
        entityId: item.task_id,
        kind: 'comment',
        body: body.response,
        actorSlug: 'claude-ai',
        fireSideEffects: false,
      })
    }
  }

  return json({ data: { ok: true } })
}
