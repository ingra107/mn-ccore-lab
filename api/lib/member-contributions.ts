// member-contributions.ts -- the ONE list of a member's contributions.
//
// The member page shows two numbers about the same person: the contribution
// score card (/api/analytics/contributions) and the "N contributions in the
// last 90 days" heatmap (/api/activity/heatmap?slug=). They used to query
// different rows: the score credited a completed task only to whoever CLICKED
// done (completed_by), the heatmap to its assignee too, plus every raw
// activity_log action. Casey's page read "0 contribution score" above
// "9 contributions" because all 12 of her completed tasks were ticked off by
// Nick (prod check 2026-10-11). Both endpoints now read this list, so the two
// cannot disagree about what counted.
//
// A contribution is: a task assigned to or completed by the member that got
// done; a project update or comment they posted (dismissed threads excluded);
// a decision they made; a meeting where they added an agenda item.

import type { Env } from '../helpers';

export type ContributionType = 'task' | 'update' | 'comment' | 'decision' | 'meeting';
export const CONTRIBUTION_TYPES: readonly ContributionType[] = ['task', 'update', 'comment', 'decision', 'meeting'];

export interface ContributionEvent {
  type: ContributionType;
  /** The event's timestamp or date as stored ('YYYY-MM-DD...' first). */
  at: string;
}

/** Every contribution by `slug` strictly after `since` (an ISO timestamp or a
 *  'YYYY-MM-DD' date; compared as text, which orders both forms). */
export async function memberContributionEvents(env: Env, slug: string, since: string): Promise<ContributionEvent[]> {
  const like = slug;
  const [tasks, updates, comments, decisions, meetings] = await Promise.all([
    // Credit the assignee as well as whoever clicked done: a PI ticking off a
    // trainee's task does not make it the PI's contribution alone.
    env.DB.prepare(
      "SELECT completed_at AS at FROM tasks WHERE completed = 1 AND completed_at IS NOT NULL AND completed_at > ? AND (assignee = ? OR instr(lower(completed_by), lower(?)) > 0)"
    ).bind(since, slug, like).all(),

    // project updates -> activity_entries kind='update', entity_type='project'
    env.DB.prepare(
      "SELECT created_at AS at FROM activity_entries WHERE entity_type='project' AND kind='update' AND hidden_at IS NULL AND instr(lower(actor_slug), lower(?)) > 0 AND created_at > ?"
    ).bind(like, since).all(),

    // comments -> activity_entries kind='comment'; day comments are not contributions (section 3.2).
    env.DB.prepare(
      "SELECT created_at AS at FROM activity_entries WHERE kind='comment' AND entity_type != 'day' AND hidden_at IS NULL AND instr(lower(actor_slug), lower(?)) > 0 AND created_at > ?"
    ).bind(like, since).all(),

    env.DB.prepare(
      "SELECT created_at AS at FROM hub_decisions WHERE instr(lower(decided_by), lower(?)) > 0 AND created_at > ?"
    ).bind(like, since).all(),

    env.DB.prepare(
      "SELECT DISTINCT m.date AS at FROM meetings m INNER JOIN agenda_items ai ON m.id = ai.meeting_id WHERE instr(lower(ai.added_by), lower(?)) > 0 AND m.date > ?"
    ).bind(like, since.slice(0, 10)).all(),
  ]);

  const out: ContributionEvent[] = [];
  const add = (type: ContributionType, rows: unknown[] | undefined) => {
    for (const r of (rows ?? []) as { at: string | null }[]) if (r.at) out.push({ type, at: r.at });
  };
  add('task', tasks.results);
  add('update', updates.results);
  add('comment', comments.results);
  add('decision', decisions.results);
  add('meeting', meetings.results);
  return out;
}

/** Contributions per calendar day ('YYYY-MM-DD' -> count), the heatmap's shape. */
export function contributionsByDay(events: readonly ContributionEvent[]): Record<string, number> {
  const byDay: Record<string, number> = {};
  for (const e of events) {
    const day = e.at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }
  return byDay;
}
