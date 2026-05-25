import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug } from '../helpers';
import { applyUpdate, type Mutation } from './mutations';
import { nowInstant } from '../lib/time';

interface HandoffRow {
  id: string
  task_id: string
  from_slug: string
  to_slug: string
  situation: string
  background: string | null
  assessment: string | null
  recommendation: string | null
  acknowledged: number
  acknowledged_at: string | null
  created_at: string
}

// GET /api/tasks/:id/handoffs — list handoffs for a task
export async function handleGetHandoffs(taskId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM task_handoffs WHERE task_id = ? ORDER BY created_at DESC'
  ).bind(taskId).all<HandoffRow>();

  return json({ data: result.results });
}

// POST /api/tasks/:id/handoffs — create handoff, reassign task, notify recipient
export async function handleCreateHandoff(taskId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    to_slug?: string
    situation?: string
    background?: string
    assessment?: string
    recommendation?: string
  };

  if (!body.to_slug?.trim()) {
    return error('to_slug is required', 400);
  }
  if (!body.situation?.trim()) {
    return error('situation is required', 400);
  }

  const fromSlug = actorSlug(user.email);
  const toSlug = body.to_slug.trim();
  // AM-2: to_slug is a destination team slug (not an actor identity). Validate
  // it against team_members so a handoff can't be created to a bogus slug
  // (which would silently lose the reassignment + notification). claude-ai is
  // a valid handoff target (Hermes), so it's exempt from the directory check.
  if (toSlug !== 'claude-ai') {
    const member = await env.DB.prepare('SELECT 1 FROM team_members WHERE slug = ? LIMIT 1').bind(toSlug).first();
    if (!member) return error(`Unknown to_slug "${toSlug}". Must match team_members.slug.`, 400);
  }
  const id = generateId();

  // Insert handoff record
  await env.DB.prepare(
    `INSERT INTO task_handoffs (id, task_id, from_slug, to_slug, situation, background, assessment, recommendation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    taskId,
    fromSlug,
    toSlug,
    body.situation.trim(),
    body.background?.trim() || null,
    body.assessment?.trim() || null,
    body.recommendation?.trim() || null,
  ).run();

  // Reassign the task to the new owner via the A3 mutation protocol so the
  // change picks up last_mutation_id stamping, seq advancement, and the
  // canonical-payload pipeline that brain.db pulls reconcile against.
  // Codex HUB-R1 fix (2026-04-30): was raw "UPDATE tasks SET assignee=...".
  const reassignMutId = `mut_${generateId()}`;
  const reassignMut: Mutation = {
    mutation_id: reassignMutId,
    origin_machine: 'hub',
    table: 'tasks',
    op: 'update',
    record_id: taskId,
    base_seq: null,
    base_row_hash: null,
    patch: { assignee: toSlug },
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  };
  await applyUpdate(env, reassignMut, user);

  // Create notification for recipient
  const task = await env.DB.prepare('SELECT title, description FROM tasks WHERE id = ?').bind(taskId).first<{ title: string; description: string }>();
  const taskLabel = task?.title || task?.description || 'a task';

  await env.DB.prepare(
    `INSERT INTO notifications (id, type, title, body, recipient_slug, source_id, source_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    generateId(),
    'handoff',
    `Task handed off to you`,
    `${fromSlug} handed off "${taskLabel}": ${body.situation.trim().slice(0, 200)}`,
    toSlug,
    taskId,
    'task',
  ).run();

  // Log activity
  await logActivity(env, 'task_handoff', `Handed off "${taskLabel}" to ${toSlug}`, fromSlug, taskId, 'task');

  const created = await env.DB.prepare('SELECT * FROM task_handoffs WHERE id = ?').bind(id).first<HandoffRow>();

  return json({ data: created }, 201);
}

// POST /api/handoffs/:id/acknowledge — mark handoff as acknowledged
export async function handleAcknowledgeHandoff(handoffId: string, user: AuthUser, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT * FROM task_handoffs WHERE id = ?'
  ).bind(handoffId).first<HandoffRow>();

  if (!existing) {
    return error('Handoff not found', 404);
  }

  if (existing.acknowledged) {
    return error('Already acknowledged', 400);
  }

  const actor = actorSlug(user.email);

  await env.DB.prepare(
    "UPDATE task_handoffs SET acknowledged = 1, acknowledged_at = datetime('now') WHERE id = ?"
  ).bind(handoffId).run();

  // Log activity
  await logActivity(env, 'handoff_acknowledged', `Acknowledged handoff from ${existing.from_slug}`, actor, existing.task_id, 'task');

  const updated = await env.DB.prepare('SELECT * FROM task_handoffs WHERE id = ?').bind(handoffId).first<HandoffRow>();

  return json({ data: updated });
}
