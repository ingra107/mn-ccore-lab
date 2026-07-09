// api/lib/lifecycle-activity.ts — turn a task/project create/update mutation
// into quiet activity_entries "system"/"completion" lines (lifecycle
// provenance). Rides the existing postActivityEntry primitive at the
// applyInsert / applyUpdate chokepoints in mutations.ts — mirroring the
// transition-guarded advanceProjectMovement side-effect. No schema change.
//
// Design ref: docs/superpowers/specs/2026-07-09-activity-log-provenance-design.md
// Plan:       docs/superpowers/plans/2026-07-09-activity-log-provenance-impl.md
//
// The pure descriptor helpers (describeOrigin / createEvent / taskChangeEvents /
// projectChangeEvents) are DB-free and fully unit-tested. emitLifecycleActivity
// is the side-effect that wires them to postActivityEntry (Task 2/3).

import type { Env, AuthUser } from '../helpers';
import { actorSlug } from '../helpers';
import { postActivityEntry } from './activity-entry';
// Type-only import — erased at compile, so no runtime cycle with mutations.ts
// (which imports emitLifecycleActivity as a value).
import type { Mutation } from '../routes/mutations';

export type LifecycleEvent = { event: string; kind: 'system' | 'completion'; body: string };

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

/**
 * Creation-only origin qualifier, derived from existing row signals. Never
 * emits a raw column value — just a short human phrase. Returns '' for
 * manual/unknown (no qualifier).
 */
export function describeOrigin(row: Record<string, unknown>): string {
  const source = str(row.source);
  if (str(row.meeting_id) || source === 'meeting' || source === 'meeting_approval') {
    return ' · from a meeting';
  }
  if (str(row.email_link) || str(row.source_thread_id) || str(row.inbox_event_id) || source === 'email') {
    return ' · email-derived';
  }
  if (source === 'mobile' || source === 'pwa') return ' · via mobile';
  return '';
}

/** Prettify an enum/slug value for display ('in_progress' → 'in progress'). */
function human(s: unknown): string {
  return String(s ?? 'none').replace(/_/g, ' ');
}

export function createEvent(
  table: 'tasks' | 'projects',
  payload: Record<string, unknown>,
): LifecycleEvent {
  if (table === 'projects') {
    const cat = str(payload.category);
    return { event: 'created', kind: 'system', body: `Created this project${cat ? ` · ${cat}` : ''}` };
  }
  return { event: 'created', kind: 'system', body: `Created this task${describeOrigin(payload)}` };
}

/** True when the patch asserts task completion (status='done' or completed truthy). */
function patchAssertsDone(patch: Record<string, unknown>): boolean {
  return patch.status === 'done' || patch.completed === 1 || patch.completed === true;
}
function rowIsDone(row: Record<string, unknown>): boolean {
  return row.status === 'done' || row.completed === 1 || row.completed === true;
}

const TASK_DUE_FIELDS = ['due_date', 'deadline'] as const;

/**
 * Context for change-body formatting that needs values the pure diff can't
 * derive (e.g. the human project NAME — the stored project_id is the typed
 * proj_* PK, which must never leak into a team-visible body).
 */
export interface ChangeContext {
  projectName?: string | null;
}

export function taskChangeEvents(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  ctx: ChangeContext = {},
): LifecycleEvent[] {
  const out: LifecycleEvent[] = [];

  // Completion is a special-cased status transition — ONE line, and it
  // suppresses a duplicate "Status → done". An idempotent re-stamp of an
  // already-done task (wasDone && nowDone, status unchanged) emits nothing.
  const wasDone = rowIsDone(before);
  const nowDone = patchAssertsDone(patch);
  let statusHandled = false;
  if (!wasDone && nowDone) {
    out.push({ event: 'completed', kind: 'completion', body: 'Completed' });
    statusHandled = true;
  } else if (wasDone && 'status' in patch && patch.status !== 'done' && !patchAssertsDone(patch)) {
    out.push({ event: 'reopened', kind: 'system', body: 'Reopened' });
    statusHandled = true;
  }

  // Status (non-completion transition).
  if (!statusHandled && 'status' in patch && str(patch.status) && patch.status !== before.status) {
    out.push({ event: 'status', kind: 'system', body: `Status: ${human(before.status)} → ${human(patch.status)}` });
  }

  // Assignee.
  if ('assignee' in patch && patch.assignee !== before.assignee) {
    const to = str(patch.assignee);
    const from = str(before.assignee);
    out.push({
      event: 'assignee', kind: 'system',
      body: !to ? 'Unassigned' : !from ? `Assigned to @${to}` : `Reassigned @${from} → @${to}`,
    });
  }

  // Project move — NEVER emit the raw typed project_id; use the resolved name.
  if ('project_id' in patch && patch.project_id !== before.project_id) {
    const to = str(patch.project_id);
    out.push({
      event: 'project', kind: 'system',
      body: to ? `Moved to ${ctx.projectName ?? 'another project'}` : 'Removed from project',
    });
  }

  // Due / deadline (first tracked date field that changed).
  for (const f of TASK_DUE_FIELDS) {
    if (f in patch && patch[f] !== before[f]) {
      const to = str(patch[f]);
      const label = f === 'deadline' ? 'Deadline' : 'Due date';
      out.push({ event: 'due', kind: 'system', body: to ? `${label} set to ${to}` : `${label} cleared` });
      break;
    }
  }

  // Priority.
  if ('priority' in patch && str(patch.priority) && patch.priority !== before.priority) {
    out.push({ event: 'priority', kind: 'system', body: `Priority: ${human(before.priority)} → ${human(patch.priority)}` });
  }

  return out;
}

const PROJECT_STATUS_DONE = new Set(['done']);

export function projectChangeEvents(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): LifecycleEvent[] {
  const out: LifecycleEvent[] = [];

  // Stage.
  if ('stage' in patch && str(patch.stage) && patch.stage !== before.stage) {
    out.push({ event: 'stage', kind: 'system', body: `Stage: ${human(before.stage)} → ${human(patch.stage)}` });
  }

  // Status — a transition INTO done is a completion; other transitions are system.
  if ('status' in patch && str(patch.status) && patch.status !== before.status) {
    const to = String(patch.status);
    if (PROJECT_STATUS_DONE.has(to) && !PROJECT_STATUS_DONE.has(String(before.status ?? ''))) {
      out.push({ event: 'status', kind: 'completion', body: 'Marked done' });
    } else {
      out.push({ event: 'status', kind: 'system', body: `Status: ${human(before.status)} → ${human(to)}` });
    }
  }

  return out;
}

/**
 * Fire lifecycle activity for a create (before=null) or update (before=row) on a
 * tasks/projects mutation. Writes each derived event as an activity_entries
 * system/completion row via postActivityEntry, team-visible, side-effects off,
 * idempotent per `${mutation_id}:${event}`.
 *
 * NEVER throws — a lifecycle-entry failure must not fail the underlying mutation
 * (the whole body is wrapped; callers also guard). Mirrors the transition-guarded
 * advanceProjectMovement side-effect in mutations.ts.
 */
export async function emitLifecycleActivity(
  env: Env,
  mut: Mutation,
  user: AuthUser,
  before: Record<string, unknown> | null,
): Promise<void> {
  try {
    if (mut.table !== 'tasks' && mut.table !== 'projects') return;
    const entityType: 'task' | 'project' = mut.table === 'tasks' ? 'task' : 'project';
    const actor = actorSlug(user?.email ?? '') || 'nick-ingraham';

    let events: LifecycleEvent[] = [];
    if (mut.op === 'insert' && before === null) {
      events = [createEvent(mut.table, (mut.payload ?? {}) as Record<string, unknown>)];
    } else if ((mut.op === 'update' || mut.op === 'append') && before) {
      const patch = (mut.patch ?? {}) as Record<string, unknown>;
      if (mut.table === 'tasks') {
        // Resolve the target project's human NAME when the task moved — the
        // stored project_id is the typed proj_* PK, which must never leak into
        // a team-visible body (CLAUDE.md tasks.project_id contract).
        let ctx: ChangeContext = {};
        if (
          'project_id' in patch &&
          patch.project_id !== before.project_id &&
          typeof patch.project_id === 'string' &&
          patch.project_id
        ) {
          try {
            const p = await env.DB.prepare('SELECT name FROM projects WHERE id = ? LIMIT 1')
              .bind(patch.project_id)
              .first<{ name: string | null }>();
            ctx = { projectName: p?.name ?? null };
          } catch {
            /* leave name null → neutral "another project" phrase */
          }
        }
        events = taskChangeEvents(before, patch, ctx);
      } else {
        events = projectChangeEvents(before, patch);
      }
    }
    if (events.length === 0) return;

    // Pre-derive project_id for a task entry to skip postActivityEntry's
    // existence SELECT (undefined for projects — postActivityEntry uses entityId).
    const taskProjectId =
      mut.table === 'tasks'
        ? ((before?.project_id ??
            (mut.payload as Record<string, unknown> | undefined)?.project_id ??
            null) as string | null)
        : undefined;

    for (const ev of events) {
      const r = await postActivityEntry({
        env,
        user,
        entityType,
        entityId: mut.record_id,
        kind: ev.kind,
        body: ev.body,
        actorSlug: actor,
        visibility: 'team',
        fireSideEffects: false,
        sourceTable: 'lifecycle',
        sourceId: `${mut.mutation_id}:${ev.event}`,
        metadata: { event: ev.event, lifecycle: true },
        ...(taskProjectId !== undefined ? { taskProjectId } : {}),
      });
      if (!r.ok) console.error('emitLifecycleActivity: postActivityEntry failed:', r.error);
    }
  } catch (e) {
    console.error('emitLifecycleActivity failed (non-fatal):', e);
  }
}
