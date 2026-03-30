import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/pi/analytics — PI-only leadership dashboard data
export async function handlePIAnalytics(env: Env): Promise<Response> {
  const [commitmentStats, responseTime, menteeVelocity, grantPipeline, teamEngagement] = await Promise.all([
    // Commitment completion rate
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status != 'done' AND due_date < date('now') THEN 1 ELSE 0 END) as overdue
      FROM commitments
    `).first(),

    // Average time to first response on project updates (proxy for engagement)
    env.DB.prepare(`
      SELECT
        COUNT(*) as total_updates,
        AVG(CASE WHEN EXISTS (
          SELECT 1 FROM comments c WHERE c.project_id = pu.project_id AND c.created_at > pu.created_at
        ) THEN 1 ELSE 0 END) as response_rate
      FROM project_updates pu
      WHERE pu.created_at > datetime('now', '-90 days')
    `).first(),

    // Mentee publication velocity (papers per person per year)
    env.DB.prepare(`
      SELECT tm.slug, tm.name, COUNT(p.id) as pub_count
      FROM team_members tm
      LEFT JOIN publications p ON p.author_slugs LIKE '%' || tm.slug || '%'
      WHERE tm.member_type IN ('trainee', 'fellow', 'resident') OR tm.role LIKE '%Fellow%' OR tm.role LIKE '%Resident%'
      GROUP BY tm.slug
    `).all(),

    // Grant pipeline status
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN proposed = 1 THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN proposed = 0 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN proposed = 0 THEN total_funding ELSE 0 END) as active_funding
      FROM grants
    `).first(),

    // Team engagement (activity per person last 30 days)
    env.DB.prepare(`
      SELECT actor as slug, COUNT(*) as actions
      FROM activity_log
      WHERE timestamp > datetime('now', '-30 days') AND actor IS NOT NULL
      GROUP BY actor
      ORDER BY actions DESC
    `).all(),
  ]);

  return json({
    data: {
      commitments: commitmentStats,
      responseMetrics: responseTime,
      menteeVelocity: menteeVelocity.results || [],
      grantPipeline: grantPipeline,
      teamEngagement: teamEngagement.results || [],
    },
  });
}
