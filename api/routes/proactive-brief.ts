import type { Env } from '../helpers';
import { json, error } from '../helpers';

// GET /api/proactive-brief — morning brief with overdue, due-today, stale, milestones
export async function handleProactiveBrief(request: Request, env: Env): Promise<Response> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const [overdueResult, dueTodayResult, staleResult, milestonesResult] = await Promise.all([
      // Overdue tasks: due_date < today AND not done
      env.DB.prepare(
        `SELECT * FROM tasks
         WHERE due_date < ? AND status != 'done' AND completed = 0 AND deleted_at IS NULL
         ORDER BY priority DESC, due_date ASC`
      ).bind(today).all(),

      // Due today
      env.DB.prepare(
        `SELECT * FROM tasks
         WHERE due_date = ? AND status != 'done' AND completed = 0 AND deleted_at IS NULL
         ORDER BY priority DESC`
      ).bind(today).all(),

      // Stale projects: projects with no task activity in 14 days
      env.DB.prepare(
        `SELECT p.id, p.title, p.status, MAX(t.updated_at) as last_activity
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
         WHERE p.status IN ('active', 'Active')
         GROUP BY p.id
         HAVING last_activity IS NULL OR last_activity < ?
         ORDER BY last_activity ASC`
      ).bind(fourteenDaysAgo).all(),

      // Upcoming milestones (next 7 days) — check grant_milestones table
      env.DB.prepare(
        `SELECT * FROM grant_milestones
         WHERE due_date >= ? AND due_date <= ? AND completed_at IS NULL
         ORDER BY due_date ASC`
      ).bind(today, sevenDaysFromNow).all().catch(() => ({ results: [] })),
    ]);

    const overdue = overdueResult.results || [];
    const dueToday = dueTodayResult.results || [];
    const staleProjects = staleResult.results || [];
    const milestones = milestonesResult.results || [];

    // Suggested focus = highest priority overdue task
    const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    const suggestedFocus = overdue.length > 0
      ? overdue.sort((a: any, b: any) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0))[0]
      : dueToday.length > 0 ? dueToday[0] : null;

    // Generate human-readable bullets
    const bullets: string[] = [];
    if (overdue.length > 0) bullets.push(`${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need attention`);
    if (dueToday.length > 0) bullets.push(`${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`);
    if (staleProjects.length > 0) bullets.push(`${staleProjects.length} project${staleProjects.length > 1 ? 's' : ''} with no activity in 14+ days`);
    if (milestones.length > 0) bullets.push(`${milestones.length} milestone${milestones.length > 1 ? 's' : ''} coming up this week`);
    if (bullets.length === 0) bullets.push('All clear — no urgent items');

    return json({
      data: {
        overdue_count: overdue.length,
        due_today_count: dueToday.length,
        stale_projects: staleProjects,
        upcoming_milestones: milestones,
        suggested_focus: suggestedFocus,
        bullets,
      },
    });
  } catch (e: any) {
    return error(`Proactive brief failed: ${e.message}`, 500);
  }
}
