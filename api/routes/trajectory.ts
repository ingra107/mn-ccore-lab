import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/team/:slug/trajectory
export async function handleTrajectory(slug: string, env: Env): Promise<Response> {
  // Parallel queries for all trajectory data
  const [publications, taskStats, projectHistory, milestones, taskMetrics, projectStages] = await Promise.all([
    // Publications where this person is an author
    env.DB.prepare(
      "SELECT id, title, journal, year, doi FROM publications WHERE authors LIKE ? ORDER BY year DESC"
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
      SELECT m.id, m.title, m.due_date, m.status, m.grant_id as project_id, p.title as project_title
      FROM grant_milestones m
      LEFT JOIN projects p ON p.id = m.grant_id
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE t.assignee LIKE ?
      GROUP BY m.id
      ORDER BY m.due_date
    `).bind(`%${slug}%`).all().catch(() => ({ results: [] })),

    // Task metrics: total, completed, overdue, avg days to complete
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN completed = 0 AND due_date IS NOT NULL AND due_date < date('now') THEN 1 ELSE 0 END) as overdue,
        AVG(CASE WHEN completed = 1 AND completed_at IS NOT NULL
          THEN julianday(completed_at) - julianday(created_at) ELSE NULL END) as avg_days_to_complete
      FROM tasks WHERE assignee LIKE ?
    `).bind(`%${slug}%`).all(),

    // Project velocity: each project with days in current stage
    env.DB.prepare(`
      SELECT DISTINCT p.id, p.title, p.slug, p.stage, p.status,
        CAST(julianday('now') - julianday(p.updated_at) AS INTEGER) as days_in_stage,
        CAST(julianday('now') - julianday(p.created_at) AS INTEGER) as total_days
      FROM projects p
      INNER JOIN tasks t ON t.project_id = p.id
      WHERE t.assignee LIKE ? AND p.status != 'Published'
      ORDER BY days_in_stage DESC
    `).bind(`%${slug}%`).all(),
  ]);

  // Extract task metrics from aggregate result
  const metricsRow = (taskMetrics.results || [])[0] as Record<string, unknown> | undefined;
  const taskMetricsData = {
    total: Number(metricsRow?.total ?? 0),
    completed: Number(metricsRow?.completed ?? 0),
    overdue: Number(metricsRow?.overdue ?? 0),
    avg_days: metricsRow?.avg_days_to_complete != null ? Math.round(Number(metricsRow.avg_days_to_complete)) : null,
  };

  return json({
    data: {
      publications: publications.results || [],
      taskStats: taskStats.results || [],
      projects: projectHistory.results || [],
      milestones: milestones.results || [],
      taskMetrics: taskMetricsData,
      projectStages: projectStages.results || [],
    },
  });
}
