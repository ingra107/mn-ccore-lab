import type { Env } from '../helpers';
import { homeProductCols, homeProductJoin, projectDoneSql } from '../lib/project-home';
import { json } from '../helpers';
import { mayReadPerson } from '../lib/person-access';
import type { Viewer } from '../lib/viewer-db';

// GET /api/team/:slug/trajectory
export async function handleTrajectory(slug: string, env: Env, viewer: Viewer, isPi: boolean): Promise<Response> {
  // Publications are public. Completions, task metrics and assignments are one
  // person's activity: theirs and the PI's alone (Nick, 2026-10-11).
  if (!mayReadPerson(viewer, isPi, slug)) {
    const pubs = await env.DB.prepare(
      "SELECT id, title, journal, year, doi FROM publications WHERE authors LIKE ? ORDER BY year DESC"
    ).bind(`%${slug}%`).all();
    return json({
      data: {
        publications: pubs.results || [],
        taskStats: [],
        projects: [],
        milestones: [],
        taskMetrics: { total: 0, completed: 0, overdue: 0, avg_days: null },
        projectStages: [],
      },
      scope: 'public',
    });
  }

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
    // Each with its home product's kind and stage (contract phase step 1).
    env.DB.prepare(`
      SELECT DISTINCT p.id, p.title, p.slug, p.status, p.category, ${homeProductCols('p')}
      FROM projects p ${homeProductJoin('p')}
      INNER JOIN tasks t ON t.project_id = p.id
      WHERE t.assignee LIKE ?
    `).bind(`%${slug}%`).all(),

    // Milestones on their projects: milestone tasks on a project they have a
    // task on (grant_milestones, keyed by a grant id that was never a project
    // id, retired 2026-10-12).
    env.DB.prepare(`
      SELECT m.id, m.title, COALESCE(m.due_date, m.deadline) AS due_date, m.status, m.project_id, p.title as project_title
      FROM tasks m
      JOIN projects p ON p.id = m.project_id
      WHERE m.kind = 'milestone' AND m.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assignee LIKE ?)
      ORDER BY COALESCE(m.due_date, m.deadline)
    `).bind(`%${slug}%`).all(),

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

    // Project velocity: each unfinished project with days on its home
    // product's current rung (the product's own stage clock). Finished =
    // status done, or every live product terminal (contract phase step 1;
    // was status != 'Published', a status no project carries).
    env.DB.prepare(`
      SELECT DISTINCT p.id, p.title, p.slug, p.status, ${homeProductCols('p')},
        CAST(julianday('now') - julianday(COALESCE(h.stage_entered_at, p.updated_at)) AS INTEGER) as days_in_stage,
        CAST(julianday('now') - julianday(p.created_at) AS INTEGER) as total_days
      FROM projects p ${homeProductJoin('p')}
      INNER JOIN tasks t ON t.project_id = p.id
      WHERE t.assignee LIKE ? AND NOT ${projectDoneSql('p')}
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
