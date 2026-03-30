import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/team/:slug/trajectory
export async function handleTrajectory(slug: string, env: Env): Promise<Response> {
  // Parallel queries for all trajectory data
  const [publications, taskStats, projectHistory, milestones] = await Promise.all([
    // Publications where this person is an author
    env.DB.prepare(
      "SELECT id, title, journal, pub_date, doi FROM publications WHERE authors LIKE ? ORDER BY pub_date DESC"
    ).bind(`%${slug}%`).all(),

    // Task completion stats by month (last 12 months)
    env.DB.prepare(`
      SELECT strftime('%Y-%m', completed_at) as month, COUNT(*) as completed
      FROM tasks WHERE completed_by LIKE ? AND completed = 1 AND completed_at > datetime('now', '-12 months')
      GROUP BY month ORDER BY month
    `).bind(`%${slug}%`).all(),

    // Projects this person is involved in (as assignee on tasks)
    env.DB.prepare(`
      SELECT DISTINCT p.id, p.title, p.slug, p.stage, p.status, p.category
      FROM projects p
      INNER JOIN tasks t ON t.project_id = p.id
      WHERE t.assignee LIKE ?
    `).bind(`%${slug}%`).all(),

    // Milestones on their projects
    env.DB.prepare(`
      SELECT m.id, m.title, m.due_date, m.status, m.project_id, p.title as project_title
      FROM milestones m
      INNER JOIN projects p ON p.id = m.project_id
      INNER JOIN tasks t ON t.project_id = p.id
      WHERE t.assignee LIKE ?
      GROUP BY m.id
      ORDER BY m.due_date
    `).bind(`%${slug}%`).all(),
  ]);

  return json({
    data: {
      publications: publications.results || [],
      taskStats: taskStats.results || [],
      projects: projectHistory.results || [],
      milestones: milestones.results || [],
    },
  });
}
