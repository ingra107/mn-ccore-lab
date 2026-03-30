import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/team/:slug/contributions?period=90
export async function handleContributions(slug: string, url: URL, env: Env): Promise<Response> {
  const days = parseInt(url.searchParams.get('period') || '90', 10);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  const [tasks, updates, comments, decisions, meetings, publications] = await Promise.all([
    // Tasks completed
    env.DB.prepare(
      "SELECT id, title, description, project_id, completed_at, priority FROM tasks WHERE completed_by LIKE ? AND completed = 1 AND completed_at > ? ORDER BY completed_at DESC"
    ).bind(`%${slug}%`, cutoff).all(),

    // Project updates authored
    env.DB.prepare(
      "SELECT id, project_id, content, update_type, created_at FROM project_updates WHERE author LIKE ? AND created_at > ? ORDER BY created_at DESC"
    ).bind(`%${slug}%`, cutoff).all(),

    // Comments made
    env.DB.prepare(
      "SELECT id, content, created_at FROM comments WHERE author_id LIKE ? AND created_at > ? ORDER BY created_at DESC"
    ).bind(`%${slug}%`, cutoff).all(),

    // Decisions involved in
    env.DB.prepare(
      "SELECT id, title, rationale, outcome_status, created_at FROM decision_log WHERE decided_by LIKE ? AND created_at > ? ORDER BY created_at DESC"
    ).bind(`%${slug}%`, cutoff).all(),

    // Meetings attended (via agenda items added)
    env.DB.prepare(
      "SELECT DISTINCT m.id, m.title, m.date FROM meetings m INNER JOIN agenda_items ai ON m.id = ai.meeting_id WHERE ai.added_by LIKE ? AND m.date > ? ORDER BY m.date DESC"
    ).bind(`%${slug}%`, cutoff.split('T')[0]).all(),

    // Publications in period
    env.DB.prepare(
      "SELECT id, title, journal, pub_date FROM publications WHERE author_slugs LIKE ? AND pub_date > ? ORDER BY pub_date DESC"
    ).bind(`%${slug}%`, cutoff.split('T')[0]).all(),
  ]);

  return json({
    data: {
      tasks: tasks.results || [],
      updates: updates.results || [],
      comments: comments.results || [],
      decisions: decisions.results || [],
      meetings: meetings.results || [],
      publications: publications.results || [],
      summary: {
        tasks_completed: (tasks.results || []).length,
        updates_posted: (updates.results || []).length,
        comments_made: (comments.results || []).length,
        decisions_made: (decisions.results || []).length,
        meetings_contributed: (meetings.results || []).length,
        publications: (publications.results || []).length,
      },
    },
  });
}
