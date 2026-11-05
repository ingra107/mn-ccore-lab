// api/lib/task-watchers.ts -- the notifications a task's watchers get (Nick,
// 2026-11-05: someone added to a task "can see and edit this task, and is
// notified when it changes"). The access itself is taskRule in table-scope.ts.
//
// Three moments, all written as the assignee's are (type 'update', a task
// source, taskLinkFor as the link), so no new notification type exists and the
// delete cascade on source_type IN ('task','task_comment') cleans them up:
//   added     one note to each person newly listed.
//   changed   a real edit of a field a person would call the task changing. The
//             panel saves on every blur, so at most one UNREAD note per person
//             per task: read it and the next edit raises another.
//   entry     a team comment or update: one each, the assignee's rule (no @me,
//             not the author, not someone the caller already told).
// The person who made the change is never told. A failed note is logged and
// never fails the write it followed.

import type { Env } from '../helpers';
import { generateId } from '../helpers';
import { taskLinkFor } from '../../shared/taskLink';
import { parseWatchers } from '../../shared/watchers';

/** The columns whose edit counts as the task changing. Plan placement, seen
 *  state and sort are the viewer's own desk, and watchers has its own note. */
export const WATCHED_TASK_FIELDS = [
  'title', 'description', 'status', 'priority', 'assignee', 'due_date', 'deadline', 'project_id', 'waiting_on',
] as const;

const INSERT_COLS = 'id, recipient_slug, type, source_type, source_id, title, body, link';

interface Actor { slug?: string | null; name?: string | null; email?: string | null }
const actorName = (a: Actor) => a.name || a.email || 'Someone';
const short = (s: string | null | undefined, n: number) => (s ?? '').slice(0, n);

/** The watched fields this patch really changes, compared with the stored row. */
export function watchedFieldsChanged(prior: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  return WATCHED_TASK_FIELDS.filter((f) => f in patch && (patch[f] ?? null) !== (prior[f] ?? null));
}

/** One note each to the people this write newly listed. */
export async function notifyWatchersAdded(
  env: Env,
  task: { id: string; title: string | null },
  before: unknown,
  after: unknown,
  actor: Actor,
): Promise<string[]> {
  const had = new Set(parseWatchers(before));
  const added = parseWatchers(after).filter((s) => !had.has(s));
  const recipients = added.filter((s) => s !== actor.slug);
  if (recipients.length === 0) return added;
  try {
    const stmt = env.DB.prepare(`INSERT INTO notifications (${INSERT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    await env.DB.batch(recipients.map((slug) => stmt.bind(
      generateId(), slug, 'update', 'task', task.id,
      `${actorName(actor)} added you to a task`,
      `You can see and edit "${short(task.title, 180)}", and are notified when it changes.`,
      taskLinkFor(task.id),
    )));
  } catch (e) {
    console.error('notifyWatchersAdded failed:', e);
  }
  return added;
}

/**
 * An edit: at most one unread note per person per task. `skip` is anyone the
 * caller has already told in this write.
 */
export async function notifyWatchersChanged(
  env: Env,
  tasks: Array<{ id: string; title: string | null; watchers: unknown }>,
  actor: Actor,
  skip: readonly string[] = [],
): Promise<void> {
  try {
    const stmt = env.DB.prepare(
      `INSERT INTO notifications (${INSERT_COLS})
       SELECT ?, ?, 'update', 'task', ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM notifications
                           WHERE recipient_slug = ? AND type = 'update' AND source_type = 'task' AND source_id = ? AND read = 0)`,
    );
    const statements = tasks.flatMap((t) => parseWatchers(t.watchers)
      .filter((slug) => slug !== actor.slug && !skip.includes(slug))
      .map((slug) => stmt.bind(
        generateId(), slug, t.id,
        `${actorName(actor)} changed a task you watch`,
        short(t.title, 200),
        taskLinkFor(t.id),
        slug, t.id,
      )));
    if (statements.length === 0) return;
    await env.DB.batch(statements);
  } catch (e) {
    console.error('notifyWatchersChanged failed:', e);
  }
}

/** A team comment or update: the assignee's rule, one note each. The assignee
 *  and whoever was mentioned have their own note, so nobody hears twice. */
export async function notifyWatchersOfEntry(
  env: Env,
  args: { taskId: string; kind: 'comment' | 'update'; body: string; actor: Actor; mentioned: readonly string[] },
): Promise<void> {
  try {
    const row = await env.DB.prepare('SELECT assignee, title, watchers FROM tasks WHERE id = ? AND deleted_at IS NULL')
      .bind(args.taskId).first<{ assignee: string | null; title: string | null; watchers: string | null }>();
    const recipients = parseWatchers(row?.watchers)
      .filter((slug) => slug !== args.actor.slug && slug !== row?.assignee && !args.mentioned.includes(slug));
    if (recipients.length === 0) return;
    const verb = args.kind === 'comment' ? 'commented on' : 'posted an update on';
    const title = `${actorName(args.actor)} ${verb} "${short(row?.title ?? 'a task you watch', 80)}"`;
    const stmt = env.DB.prepare(`INSERT INTO notifications (${INSERT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    await env.DB.batch(recipients.map((slug) => stmt.bind(
      generateId(), slug, 'update', args.kind === 'comment' ? 'task_comment' : 'task', args.taskId,
      title, args.body.slice(0, 200), taskLinkFor(args.taskId),
    )));
  } catch (e) {
    console.error('notifyWatchersOfEntry failed:', e);
  }
}
