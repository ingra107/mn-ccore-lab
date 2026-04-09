import type { Env } from '../helpers';
import { json } from '../helpers';

// ── GET /api/analytics/pi-dashboard ─────────────────────────
// Returns all computed metrics for the PI leadership dashboard
export async function handlePIDashboard(env: Env): Promise<Response> {
  const [
    commitmentStats,
    responseTime,
    menteeVelocity,
    grantPipeline,
    teamEngagement,
    pubsByQuarter,
    grantsFunnel,
    projectsByStage,
  ] = await Promise.all([
    // Commitment completion rate
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status != 'done' AND due_date < date('now') THEN 1 ELSE 0 END) as overdue
      FROM commitments
    `).first(),

    // Average response time — task creation to completion
    env.DB.prepare(`
      SELECT
        COUNT(*) as total_tasks,
        AVG(CASE
          WHEN completed = 1 AND completed_at IS NOT NULL AND created_at IS NOT NULL
          THEN julianday(completed_at) - julianday(created_at)
          ELSE NULL
        END) as avg_days,
        AVG(CASE
          WHEN completed = 1 AND completed_at IS NOT NULL AND created_at IS NOT NULL
            AND completed_at > datetime('now', '-90 days')
          THEN julianday(completed_at) - julianday(created_at)
          ELSE NULL
        END) as avg_days_recent,
        AVG(CASE
          WHEN completed = 1 AND completed_at IS NOT NULL AND created_at IS NOT NULL
            AND completed_at BETWEEN datetime('now', '-180 days') AND datetime('now', '-90 days')
          THEN julianday(completed_at) - julianday(created_at)
          ELSE NULL
        END) as avg_days_prior
      FROM tasks
    `).first(),

    // Mentee publication velocity — papers with yearly rate
    env.DB.prepare(`
      SELECT tm.slug, tm.name, COUNT(p.id) as pub_count,
        MIN(p.year) as first_year,
        MAX(p.year) as latest_year
      FROM team_members tm
      LEFT JOIN publications p ON p.author_slugs LIKE '%' || tm.slug || '%'
      WHERE tm.member_type IN ('trainee', 'fellow', 'resident') OR tm.role LIKE '%Fellow%' OR tm.role LIKE '%Resident%' OR tm.role LIKE '%Student%'
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

    // Team engagement: composite score per member (last 30 days)
    env.DB.prepare(`
      SELECT actor as slug,
        COUNT(*) as total_actions,
        SUM(CASE WHEN type = 'comment' THEN 1 ELSE 0 END) as comments,
        SUM(CASE WHEN type = 'update' OR type = 'project_update' THEN 1 ELSE 0 END) as updates,
        SUM(CASE WHEN type = 'task_completed' THEN 1 ELSE 0 END) as completions
      FROM activity_log
      WHERE timestamp > datetime('now', '-30 days') AND actor IS NOT NULL
      GROUP BY actor
      ORDER BY total_actions DESC
    `).all(),

    // Publications per year (last 3 years)
    env.DB.prepare(`
      SELECT
        year,
        COUNT(*) as count
      FROM publications
      WHERE year >= (CAST(strftime('%Y', 'now') AS INTEGER) - 3)
        AND status = 'Published'
      GROUP BY year
      ORDER BY year
    `).all(),

    // Grants: submitted vs funded
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN proposed = 1 THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN proposed = 0 THEN 1 ELSE 0 END) as funded
      FROM grants
    `).first(),

    // Projects by stage
    env.DB.prepare(`
      SELECT stage, COUNT(*) as count
      FROM projects
      WHERE status = 'Active'
      GROUP BY stage
      ORDER BY count DESC
    `).all(),
  ]);

  // Compute engagement scores (composite)
  const engagementRows = (teamEngagement.results || []) as Array<{
    slug: string;
    total_actions: number;
    comments: number;
    updates: number;
    completions: number;
  }>;

  const maxActions = Math.max(...engagementRows.map(r => r.total_actions), 1);
  const engagementScores = engagementRows.map(row => ({
    slug: row.slug,
    actions: row.total_actions,
    comments: row.comments,
    updates: row.updates,
    completions: row.completions,
    score: Math.round(
      ((row.comments * 3 + row.updates * 2 + row.completions * 1) / Math.max(maxActions * 3, 1)) * 100
    ),
  }));

  // Compute mentee velocity with per-year rate
  const currentYear = new Date().getFullYear();
  const velocityRows = ((menteeVelocity.results || []) as Array<{
    slug: string;
    name: string;
    pub_count: number;
    first_year: number | null;
    latest_year: number | null;
  }>).map(row => {
    const years = row.first_year
      ? Math.max(currentYear - row.first_year, 1)
      : 1;
    return {
      slug: row.slug,
      name: row.name,
      pub_count: row.pub_count,
      rate: row.pub_count > 0 ? +(row.pub_count / years).toFixed(1) : 0,
      first_year: row.first_year,
    };
  });

  // Response time trend (6 month buckets)
  const rt = responseTime as {
    total_tasks: number;
    avg_days: number | null;
    avg_days_recent: number | null;
    avg_days_prior: number | null;
  } | null;

  const responseMetrics = {
    avg_days: rt?.avg_days ? +rt.avg_days.toFixed(1) : 0,
    avg_days_recent: rt?.avg_days_recent ? +rt.avg_days_recent.toFixed(1) : 0,
    avg_days_prior: rt?.avg_days_prior ? +rt.avg_days_prior.toFixed(1) : 0,
    trend: rt?.avg_days_recent && rt?.avg_days_prior
      ? (rt.avg_days_recent < rt.avg_days_prior ? 'improving' : rt.avg_days_recent > rt.avg_days_prior ? 'slowing' : 'stable')
      : 'insufficient_data',
    total_tasks: rt?.total_tasks || 0,
  };

  return json({
    data: {
      commitments: commitmentStats || { total: 0, completed: 0, overdue: 0 },
      responseMetrics,
      menteeVelocity: velocityRows,
      grantPipeline: grantPipeline || { total: 0, pending: 0, active: 0, active_funding: 0 },
      teamEngagement: engagementScores,
      pubsByQuarter: (pubsByQuarter.results || []) as Array<{ year: number; quarter: string; count: number }>,
      grantsFunnel: grantsFunnel || { submitted: 0, funded: 0 },
      projectsByStage: (projectsByStage.results || []) as Array<{ stage: string; count: number }>,
    },
  });
}

// ── GET /api/analytics/mentee-velocity ─────────────────────
// Per-mentee publication rates with monthly breakdown
export async function handleMenteeVelocity(env: Env): Promise<Response> {
  const mentees = await env.DB.prepare(`
    SELECT tm.slug, tm.name, p.year, COUNT(p.id) as count
    FROM team_members tm
    LEFT JOIN publications p ON p.author_slugs LIKE '%' || tm.slug || '%'
    WHERE (tm.member_type IN ('trainee', 'fellow', 'resident')
      OR tm.role LIKE '%Fellow%' OR tm.role LIKE '%Resident%' OR tm.role LIKE '%Student%')
    GROUP BY tm.slug, p.year
    ORDER BY tm.name, p.year
  `).all();

  // Group by mentee
  const byMentee = new Map<string, { name: string; years: Array<{ year: number; count: number }> }>();
  for (const row of (mentees.results || []) as Array<{ slug: string; name: string; year: number | null; count: number }>) {
    if (!byMentee.has(row.slug)) {
      byMentee.set(row.slug, { name: row.name, years: [] });
    }
    if (row.year) {
      byMentee.get(row.slug)!.years.push({ year: row.year, count: row.count });
    }
  }

  const data = [...byMentee.entries()].map(([slug, info]) => ({
    slug,
    name: info.name,
    years: info.years,
    total: info.years.reduce((s, y) => s + y.count, 0),
  }));

  return json({ data });
}

// ── GET /api/analytics/response-time ───────────────────────
// Task completion speed metrics with monthly trend
export async function handleResponseTime(env: Env): Promise<Response> {
  const monthly = await env.DB.prepare(`
    SELECT
      strftime('%Y-%m', completed_at) as month,
      COUNT(*) as completed,
      AVG(julianday(completed_at) - julianday(created_at)) as avg_days
    FROM tasks
    WHERE completed = 1 AND completed_at IS NOT NULL
      AND completed_at > datetime('now', '-12 months')
    GROUP BY month
    ORDER BY month
  `).all();

  const byPriority = await env.DB.prepare(`
    SELECT
      priority,
      COUNT(*) as count,
      AVG(julianday(completed_at) - julianday(created_at)) as avg_days
    FROM tasks
    WHERE completed = 1 AND completed_at IS NOT NULL
      AND completed_at > datetime('now', '-6 months')
    GROUP BY priority
  `).all();

  return json({
    data: {
      monthly: (monthly.results || []).map((r: any) => ({
        month: r.month,
        completed: r.completed,
        avg_days: r.avg_days ? +r.avg_days.toFixed(1) : 0,
      })),
      byPriority: (byPriority.results || []).map((r: any) => ({
        priority: r.priority,
        count: r.count,
        avg_days: r.avg_days ? +r.avg_days.toFixed(1) : 0,
      })),
    },
  });
}

// ── GET /api/analytics/team-engagement ─────────────────────
// Engagement scores per member with trend
export async function handleTeamEngagement(env: Env): Promise<Response> {
  const current = await env.DB.prepare(`
    SELECT actor as slug,
      COUNT(*) as total,
      SUM(CASE WHEN type = 'comment' THEN 1 ELSE 0 END) as comments,
      SUM(CASE WHEN type = 'update' OR type = 'project_update' THEN 1 ELSE 0 END) as updates,
      SUM(CASE WHEN type = 'task_completed' THEN 1 ELSE 0 END) as completions
    FROM activity_log
    WHERE timestamp > datetime('now', '-30 days') AND actor IS NOT NULL
    GROUP BY actor
  `).all();

  const prior = await env.DB.prepare(`
    SELECT actor as slug,
      COUNT(*) as total
    FROM activity_log
    WHERE timestamp BETWEEN datetime('now', '-60 days') AND datetime('now', '-30 days')
      AND actor IS NOT NULL
    GROUP BY actor
  `).all();

  const priorMap = new Map<string, number>();
  for (const row of (prior.results || []) as Array<{ slug: string; total: number }>) {
    priorMap.set(row.slug, row.total);
  }

  const data = ((current.results || []) as Array<{
    slug: string; total: number; comments: number; updates: number; completions: number;
  }>).map(row => {
    const priorTotal = priorMap.get(row.slug) || 0;
    const trend = row.total > priorTotal ? 'up' : row.total < priorTotal ? 'down' : 'flat';
    return {
      slug: row.slug,
      total: row.total,
      comments: row.comments,
      updates: row.updates,
      completions: row.completions,
      score: Math.round(row.comments * 3 + row.updates * 2 + row.completions),
      prior_total: priorTotal,
      trend,
    };
  });

  // Overall engagement trend
  const currentTotal = data.reduce((s, d) => s + d.total, 0);
  const priorTotal = [...priorMap.values()].reduce((s, v) => s + v, 0);

  return json({
    data: {
      members: data,
      overall: {
        current: currentTotal,
        prior: priorTotal,
        trend: currentTotal > priorTotal ? 'up' : currentTotal < priorTotal ? 'down' : 'flat',
      },
    },
  });
}

// ── GET /api/team/by-expertise?tag=X ───────────────────────
// Returns team members with a specific expertise tag
export async function handleTeamByExpertise(url: URL, env: Env): Promise<Response> {
  const tag = url.searchParams.get('tag');
  if (!tag) {
    return json({ data: [], error: 'tag parameter required' }, 400);
  }

  const results = await env.DB.prepare(`
    SELECT et.tag, et.confidence, et.source,
      tm.slug, tm.name, tm.role, tm.credentials, tm.photo_url, tm.bio
    FROM expertise_tags et
    JOIN team_members tm ON tm.slug = et.member_slug
    WHERE LOWER(et.tag) = LOWER(?)
    ORDER BY et.confidence DESC
  `).bind(tag).all();

  return json({ data: results.results || [] });
}
