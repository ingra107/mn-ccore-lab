import type { Env } from '../helpers';
import { json, error } from '../helpers';
import { GRANT_BUCKET_SQL } from './grant-bucket';

// A trainee: the member types the dashboard counts as trainees, or a role that
// names one. One definition for the dashboard and the Lab pulse routes below.
const TRAINEE_SQL = `(tm.member_type IN ('trainee', 'fellow', 'resident')
  OR tm.role LIKE '%Fellow%' OR tm.role LIKE '%Resident%' OR tm.role LIKE '%Student%')`;

// ── GET /api/analytics/pi-dashboard ─────────────────────────
// Returns all computed metrics for the PI leadership dashboard
// The per-person engagement rows are PI-only (Nick, 2026-10-11): a member gets
// the dashboard with that list empty. The page's tab is hidden from them
// already; this is the server half.
export async function handlePIDashboard(env: Env, isPi = false): Promise<Response> {
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

    // Mentee publication velocity — papers with yearly rate.
    // P6-B7: LIKE '%slug%' causes false positives (e.g. "lee"⊂"mcleery").
    // Use quoted-value pattern '%"slug"%' which matches JSON array elements exactly.
    // author_slugs is stored as a JSON array string: ["slug1","slug2",...].
    env.DB.prepare(`
      SELECT tm.slug, tm.name, COUNT(p.id) as pub_count,
        MIN(p.year) as first_year,
        MAX(p.year) as latest_year
      FROM team_members tm
      LEFT JOIN publications p ON p.author_slugs LIKE '%"' || tm.slug || '"%'
      WHERE ${TRAINEE_SQL}
      GROUP BY tm.slug
    `).all(),

    // Grant pipeline status
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'proposed' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN total_funding ELSE 0 END) as active_funding
      FROM grants
    `).first(),

    // Team engagement: composite score per member (last 30 days).
    // Excludes 'anonymous' bucket (CLI / system / unauthed events) — they
    // dominate the leaderboard and leave real members at 0.
    env.DB.prepare(`
      SELECT actor as slug,
        COUNT(*) as total_actions,
        SUM(CASE WHEN type = 'comment' THEN 1 ELSE 0 END) as comments,
        SUM(CASE WHEN type = 'update' OR type = 'project_update' THEN 1 ELSE 0 END) as updates,
        SUM(CASE WHEN type = 'task_completed' THEN 1 ELSE 0 END) as completions
      FROM activity_log
      WHERE timestamp > datetime('now', '-30 days')
        AND actor IS NOT NULL
        AND actor != 'anonymous'
        AND actor != 'system'
        AND actor != ''
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

    // Counts come from the status-derived bucket (GRANT_BUCKET_SQL, grant-bucket.ts),
    // not the `proposed` flag: 'submitted' = bucket 'proposed', 'active' = bucket 'active'.
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'proposed' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN 1 ELSE 0 END) as active
      FROM grants
    `).first(),

    // Projects by stage. R10 standardized projects.status to lowercase
    // ('active'); pre-fix this was 'Active' and silently returned 0 rows.
    env.DB.prepare(`
      SELECT stage, COUNT(*) as count
      FROM projects
      WHERE status = 'active'
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

  // Response time: last 90 days against the 90 before
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
      teamEngagement: isPi ? engagementScores : [],
      pubsByQuarter: (pubsByQuarter.results || []) as Array<{ year: number; quarter: string; count: number }>,
      grantsFunnel: grantsFunnel || { submitted: 0, active: 0 },
      projectsByStage: (projectsByStage.results || []) as Array<{ stage: string; count: number }>,
    },
  });
}

// ── Lab pulse (Nick, 2026-10-11) ───────────────────────────
// Three PI-only routes behind the "Lab pulse" section of PI Analytics and the
// one line on Today. Each answers 403 to a non-PI before it reads a row: the
// route DSL's auth:'pi' is documentation, so the gate is in the handler, the
// way /api/pb/* and /api/insights/dashboard do it (isPiRequest, resolved once
// per request into c.get('isPi')). They read lab-wide (index.ts labWideEnv) and
// return counts, months, priorities and member slugs/names only: never a
// project name or slug, a task id or a task title (lab-pulse-gate.test.ts pins it).

const PI_ONLY = () => error('Forbidden — PI access only', 403);

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const round1 = (n: number) => +n.toFixed(1);

// ── GET /api/analytics/mentee-velocity ─────────────────────
// Trainee publication pace. `perYear` counts each published paper once, even
// when two trainees are on it; `pace` is the mean of the last three COMPLETE
// calendar years, `trend` compares the latest complete year with the two
// before it. `mentees` is the per-trainee list.
export async function handleMenteeVelocity(env: Env, isPi: boolean, now = new Date()): Promise<Response> {
  if (!isPi) return PI_ONLY();
  const year = now.getUTCFullYear();

  // P6-B7: use quoted-value LIKE pattern to avoid slug substring false positives.
  const [mentees, papers] = await Promise.all([
    env.DB.prepare(`
      SELECT tm.slug, tm.name, p.year, COUNT(p.id) as count
      FROM team_members tm
      LEFT JOIN publications p ON p.author_slugs LIKE '%"' || tm.slug || '"%'
      WHERE ${TRAINEE_SQL}
      GROUP BY tm.slug, p.year
      ORDER BY tm.name, p.year
    `).all(),
    env.DB.prepare(`
      SELECT p.year, COUNT(*) as count
      FROM publications p
      WHERE LOWER(p.status) = 'published' AND p.year >= ?
        AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE ${TRAINEE_SQL} AND p.author_slugs LIKE '%"' || tm.slug || '"%'
        )
      GROUP BY p.year
    `).bind(year - 4).all(),
  ]);

  const byMentee = new Map<string, { name: string; years: Array<{ year: number; count: number }> }>();
  for (const row of (mentees.results || []) as Array<{ slug: string; name: string; year: number | null; count: number }>) {
    if (!byMentee.has(row.slug)) byMentee.set(row.slug, { name: row.name, years: [] });
    if (row.year) byMentee.get(row.slug)!.years.push({ year: row.year, count: row.count });
  }
  const menteeRows = [...byMentee.entries()].map(([slug, info]) => ({
    slug,
    name: info.name,
    years: info.years,
    total: info.years.reduce((s, y) => s + y.count, 0),
  }));

  const counts = new Map<number, number>();
  for (const r of (papers.results || []) as Array<{ year: number; count: number }>) counts.set(r.year, r.count);
  const perYear = Array.from({ length: 5 }, (_, i) => {
    const y = year - 4 + i;
    return { year: y, count: counts.get(y) ?? 0, partial: y === year };
  });

  const c = (back: number) => perYear[4 - back].count; // back=1 is last year
  const pace = (c(1) + c(2) + c(3)) / 3;
  const earlier = (c(2) + c(3)) / 2;
  const total = perYear.reduce((s, r) => s + r.count, 0);
  const trend = total === 0 ? 'insufficient_data'
    : c(1) > earlier ? 'up' : c(1) < earlier ? 'down' : 'flat';

  return json({ data: { mentees: menteeRows, perYear, pace: { per_year: round1(pace), last_year: c(1), earlier_per_year: round1(earlier), trend } } });
}

// ── GET /api/analytics/response-time ───────────────────────
// Days from a task being made to it being done, as a MEDIAN (a few year-old
// tasks closed in a clean-up would drag a mean). Real tasks only: not deleted,
// not a milestone or question. `summary` compares the last 90 days with the 90
// before; `monthly` is the last 12 months; `byPriority` the last 6.
export async function handleResponseTime(env: Env, isPi: boolean): Promise<Response> {
  if (!isPi) return PI_ONLY();
  const done = await env.DB.prepare(`
    SELECT priority,
      substr(completed_at, 1, 7) as month,
      julianday(completed_at) - julianday(created_at) as days,
      julianday('now') - julianday(completed_at) as age
    FROM tasks
    WHERE completed = 1 AND completed_at IS NOT NULL AND created_at IS NOT NULL
      AND deleted_at IS NULL AND COALESCE(kind, 'task') = 'task'
      AND julianday(completed_at) >= julianday(created_at)
      AND julianday('now') - julianday(completed_at) BETWEEN 0 AND 365
    LIMIT 50000
  `).all();
  const rows = (done.results || []) as Array<{ priority: string | null; month: string; days: number; age: number }>;

  const monthMap = new Map<string, number[]>();
  const prioMap = new Map<string, number[]>();
  const recent: number[] = [];
  const prior: number[] = [];
  const push = (m: Map<string, number[]>, k: string, v: number) => {
    const xs = m.get(k);
    if (xs) xs.push(v); else m.set(k, [v]);
  };
  for (const r of rows) {
    push(monthMap, r.month, r.days);
    if (r.age <= 182) push(prioMap, r.priority || 'none', r.days);
    if (r.age <= 90) recent.push(r.days);
    else if (r.age <= 180) prior.push(r.days);
  }

  const med = (xs: number[]) => round1(median(xs) ?? 0);
  const trend = recent.length === 0 || prior.length === 0 ? 'insufficient_data'
    : med(recent) < med(prior) ? 'faster' : med(recent) > med(prior) ? 'slower' : 'flat';

  return json({
    data: {
      summary: {
        median_days: med(recent),
        prior_median_days: med(prior),
        completed: recent.length,
        prior_completed: prior.length,
        trend,
      },
      monthly: [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([month, xs]) => ({ month, completed: xs.length, median_days: med(xs) })),
      byPriority: [...prioMap.entries()]
        .map(([priority, xs]) => ({ priority, count: xs.length, median_days: med(xs) }))
        .sort((a, b) => b.count - a.count),
    },
  });
}

// ── GET /api/analytics/team-engagement ─────────────────────
// Who did anything in the Hub in the last 30 days, against the 30 before.
// Per-person numbers and the score are the PI's alone. A member is a
// team_members row with an email, not the AI. `active` is members with at
// least one logged action or finished task; PB session and sync rows are the
// PI's automation, not activity, and are left out. Completions come from tasks
// (completed_by is the finisher's email on every Hub write path, matched to the
// member by email or slug), not from activity_log: nothing writes
// 'task_completed' there. A done task with a NULL completed_by (older or PB
// writes) belongs to no one and is not counted. A completion adds to `total`.
export async function handleTeamEngagement(env: Env, isPi: boolean): Promise<Response> {
  if (!isPi) return PI_ONLY();
  const [team, log, done] = await Promise.all([
    env.DB.prepare(`
      SELECT slug, name FROM team_members
      WHERE slug IS NOT NULL AND slug != 'claude-ai'
        AND email IS NOT NULL AND email != ''
        AND COALESCE(member_type, '') != 'ai'
    `).all(),
    env.DB.prepare(`
      SELECT actor as slug,
        MAX(timestamp) as last_active,
        SUM(CASE WHEN timestamp > datetime('now', '-30 days') THEN 1 ELSE 0 END) as total,
        SUM(CASE WHEN timestamp > datetime('now', '-30 days') AND type = 'comment' THEN 1 ELSE 0 END) as comments,
        SUM(CASE WHEN timestamp > datetime('now', '-30 days') AND type IN ('update', 'project_update') THEN 1 ELSE 0 END) as updates,
        SUM(CASE WHEN timestamp > datetime('now', '-60 days') AND timestamp <= datetime('now', '-30 days') THEN 1 ELSE 0 END) as prior_total
      FROM activity_log
      WHERE actor IS NOT NULL AND timestamp > datetime('now', '-365 days')
        AND COALESCE(type, '') NOT IN ('pb_session', 'sync')
      GROUP BY actor
    `).all(),
    env.DB.prepare(`
      SELECT tm.slug as slug,
        SUM(CASE WHEN t.completed_at > datetime('now', '-30 days') THEN 1 ELSE 0 END) as completions,
        SUM(CASE WHEN t.completed_at <= datetime('now', '-30 days') THEN 1 ELSE 0 END) as prior_completions,
        MAX(t.completed_at) as last_done
      FROM tasks t
      JOIN team_members tm ON lower(t.completed_by) IN (lower(tm.email), lower(tm.slug))
      WHERE t.completed = 1 AND t.completed_at > datetime('now', '-60 days')
        AND t.deleted_at IS NULL AND COALESCE(t.kind, 'task') = 'task'
      GROUP BY tm.slug
    `).all(),
  ]);

  const doneBy = new Map<string, { completions: number; prior_completions: number; last_done: string | null }>();
  for (const r of (done.results || []) as Array<{ slug: string; completions: number; prior_completions: number; last_done: string | null }>) {
    doneBy.set(r.slug, r);
  }

  const byActor = new Map<string, {
    last_active: string | null; total: number; comments: number; updates: number; prior_total: number
  }>();
  for (const r of (log.results || []) as Array<{ slug: string; last_active: string | null; total: number; comments: number; updates: number; prior_total: number }>) {
    byActor.set(r.slug, r);
  }

  const members = ((team.results || []) as Array<{ slug: string; name: string }>).map((m) => {
    const a = byActor.get(m.slug);
    const d = doneBy.get(m.slug);
    const completions = d?.completions ?? 0;
    const total = (a?.total ?? 0) + completions;
    const priorTotal = (a?.prior_total ?? 0) + (d?.prior_completions ?? 0);
    const last = [a?.last_active, d?.last_done].filter((x): x is string => !!x).sort().pop() ?? null;
    return {
      slug: m.slug,
      name: m.name,
      total,
      comments: a?.comments ?? 0,
      updates: a?.updates ?? 0,
      completions,
      score: (a?.comments ?? 0) * 3 + (a?.updates ?? 0) * 2 + completions,
      prior_total: priorTotal,
      trend: total > priorTotal ? 'up' : total < priorTotal ? 'down' : 'flat',
      last_active: last,
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const active = members.filter((m) => m.total > 0).length;
  const priorActive = members.filter((m) => m.prior_total > 0).length;
  return json({
    data: {
      members,
      active,
      of: members.length,
      prior_active: priorActive,
      trend: active > priorActive ? 'up' : active < priorActive ? 'down' : 'flat',
    },
  });
}
