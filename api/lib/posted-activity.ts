// posted-activity.ts -- what people SAID in the Hub, read from its one store.
//
// A comment or a note/update typed on a task or a project lives in
// activity_entries (postActivityEntry). It used to be written a second time to
// activity_log as an "echo" row ("Commented on task", "Posted note on ..."), so
// every lab-wide reader of activity_log saw it, and every reader that also read
// activity_entries counted it twice (Lab pulse, 2026-10-11). The echo is gone.
// Readers that want "everything that happened in the lab" take activity_log for
// the audit trail (creates, status changes, deletes, meetings) and ask THIS
// module for the posts, so one post shows once.
//
// The echo also leaked: it quoted the first 100 characters of a private (@me)
// note into a feed that has no visibility column. These reads carry the gate.

import type { Env } from '../helpers';
import { activityHiddenClause, type ActivityVisibilityGate } from './activity-entry';

/** A row in the shape of activity_log, which is what /api/activity serves. */
export interface PostedActivityRow {
  id: string;
  type: 'comment' | 'task_update' | 'project_update';
  description: string;
  actor: string | null;
  related_id: string;
  related_type: 'task' | 'project';
  timestamp: string;
}

// Root posts a person typed on a task or project. Replies are the thread under
// a post, the AI's answers are not posted by a person, and a day or meeting
// entry is not a task or project event; none of them was ever echoed.
const POSTED_WHERE =
  `ae.kind IN ('comment', 'update') AND ae.entity_type IN ('task', 'project')
   AND ae.parent_id IS NULL AND ae.actor_slug != 'claude-ai'`;

/** Same rule as the gate used by the feeds, for a count nobody reads rows from. */
const TEAM_ONLY: ActivityVisibilityGate = { clause: `ae.visibility = 'team'`, binds: [] };

interface PostedOptions {
  gate: ActivityVisibilityGate;
  limit: number;
  actor?: string | null;
  /** Only posts created strictly after this (text compare, date or timestamp). */
  since?: string | null;
}

export async function postedActivityRows(env: Env, opts: PostedOptions): Promise<PostedActivityRow[]> {
  const where = [POSTED_WHERE, opts.gate.clause];
  const binds: (string | number)[] = [...opts.gate.binds];
  if (opts.actor) { where.push('ae.actor_slug = ?'); binds.push(opts.actor); }
  if (opts.since) { where.push('ae.created_at > ?'); binds.push(opts.since); }
  binds.push(opts.limit);
  const res = await env.DB.prepare(
    `SELECT ae.id, ae.kind, ae.entity_type, ae.entity_id, ae.actor_slug, ae.body, ae.created_at,
            t.title AS task_title, p.title AS project_title, p.slug AS project_slug
       FROM activity_entries ae
       LEFT JOIN tasks t ON ae.entity_type = 'task' AND t.id = ae.entity_id
       LEFT JOIN projects p ON ae.entity_type = 'project' AND p.id = ae.entity_id
      WHERE ${activityHiddenClause('ae')} AND ${where.join(' AND ')}
      ORDER BY ae.created_at DESC, ae.id DESC LIMIT ?`,
  ).bind(...binds).all<{
    id: string; kind: string; entity_type: 'task' | 'project'; entity_id: string; actor_slug: string | null;
    body: string; created_at: string; task_title: string | null; project_title: string | null; project_slug: string | null;
  }>();

  return (res.results ?? []).map((r) => {
    const snippet = r.body.trim().slice(0, 100);
    if (r.kind === 'comment') {
      return {
        id: r.id, type: 'comment', actor: r.actor_slug, related_id: r.entity_id, related_type: r.entity_type, timestamp: r.created_at,
        description: r.entity_type === 'task' ? 'Commented on task' : `Commented on "${r.project_title ?? r.entity_id}"`,
      };
    }
    return r.entity_type === 'task'
      ? {
          id: r.id, type: 'task_update', actor: r.actor_slug, related_id: r.entity_id, related_type: 'task', timestamp: r.created_at,
          description: `Posted note on "${r.task_title || r.entity_id}": "${snippet}"`,
        }
      : {
          id: r.id, type: 'project_update', actor: r.actor_slug, related_id: r.entity_id, related_type: 'project', timestamp: r.created_at,
          description: `Posted update on ${r.project_slug ?? r.entity_id}: "${snippet}"`,
        };
  });
}

/** Team-visible posts per day (YYYY-MM-DD -> count) since a date. */
export async function postedCountsByDay(env: Env, since: string): Promise<Record<string, number>> {
  const res = await env.DB.prepare(
    `SELECT DATE(ae.created_at) AS date, COUNT(*) AS count FROM activity_entries ae
      WHERE ${POSTED_WHERE} AND ${activityHiddenClause('ae')} AND ${TEAM_ONLY.clause} AND ae.created_at >= ?
      GROUP BY DATE(ae.created_at)`,
  ).bind(since).all<{ date: string; count: number }>();
  const out: Record<string, number> = {};
  for (const r of res.results ?? []) out[r.date] = r.count;
  return out;
}

/** Distinct authors of team-visible posts since a timestamp. */
export async function postedAuthorsSince(env: Env, since: string): Promise<string[]> {
  const res = await env.DB.prepare(
    `SELECT DISTINCT ae.actor_slug AS slug FROM activity_entries ae
      WHERE ${POSTED_WHERE} AND ${activityHiddenClause('ae')} AND ${TEAM_ONLY.clause} AND ae.created_at > ?`,
  ).bind(since).all<{ slug: string }>();
  return (res.results ?? []).map((r) => r.slug).filter(Boolean);
}

/** Count of team-visible posts since a date. */
export async function postedCountSince(env: Env, since: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM activity_entries ae
      WHERE ${POSTED_WHERE} AND ${activityHiddenClause('ae')} AND ${TEAM_ONLY.clause} AND ae.created_at > ?`,
  ).bind(since).first<{ c: number }>();
  return row?.c ?? 0;
}

/** The gate for a read with no caller identity (a count, a prep list): team posts only. */
export const TEAM_POSTS_ONLY = TEAM_ONLY;
