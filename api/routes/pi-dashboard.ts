import type { Env } from '../helpers';
import { json, error } from '../helpers';
import { GRANT_BUCKET_SQL } from './grants';

// A trainee: the member types the dashboard counts as trainees, or a role that
// names one. One definition for the dashboard and the Lab pulse routes below.
const TRAINEE_SQL = `(tm.member_type IN ('trainee', 'fellow', 'resident')
  OR tm.role LIKE '%Fellow%' OR tm.role LIKE '%Resident%' OR tm.role LIKE '%Student%')`;

// ── GET /api/analytics/pi-dashboard ─────────────────────────
// Returns all computed metrics for the PI leadership dashboard
// The per-person engagement rows are PI-only (Nick, 2026-10-11): a member gets
// the dashboard with that list empty. The page's tab is hidden from them
// already; this is the server half.
export async function handlePIDashboard(env: Env, isPi = false, wideEnv: Env = env): Promise<Response> {
  const [
    engagement,
    rt,
    commitmentStats,
    menteeVelocity,
    grantPipeline,
    pubsByQuarter,
    grantsFunnel,
    projectsByStage,
  ] = await Promise.all([
    isPi ? computeEngagement(wideEnv) : Promise.resolve(null),
    isPi ? computeResponseTime(wideEnv, new Date()) : Promise.resolve(null),
    // Commitment completion rate
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status != 'done' AND due_date < date('now') THEN 1 ELSE 0 END) as overdue
      FROM commitments
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

    // Grant pipeline status: the grant products (routes/grants.ts), the same
    // bucket the Grants page shows; funding is the awards' amount_usd.
    env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'proposed' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN COALESCE(p.amount_usd, 0) ELSE 0 END) as active_funding
      FROM products p
      JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage
      JOIN projects pr ON pr.id = p.project_id AND pr.deleted_at IS NULL
      WHERE p.deleted_at IS NULL AND p.kind IN ('grant_application', 'award', 'honor')
    `).first(),

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

    // Counts come from the data-derived bucket (GRANT_BUCKET_SQL, routes/grants.ts):
    // 'submitted' = bucket 'proposed', 'active' = bucket 'active'.
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'proposed' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN 1 ELSE 0 END) as active
      FROM products p
      JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage
      JOIN projects pr ON pr.id = p.project_id AND pr.deleted_at IS NULL
      WHERE p.deleted_at IS NULL AND p.kind IN ('grant_application', 'award', 'honor')
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

  // Engagement and response time are the Lab pulse definitions (computeEngagement /
  // computeResponseTime below), one helper each so the dashboard and the Lab pulse
  // routes cannot drift. PI-only: a member gets an empty list and zeros.
  const engagementScores = engagement ? engagement.members
    .filter((m) => m.active)
    .map((m) => ({
      slug: m.slug,
      actions: m.total,
      comments: m.comments,
      updates: m.updates,
      completions: m.completions,
      score: m.score,
    })) : [];

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

  const responseMetrics = {
    median_days: rt?.overall.median_days ?? 0,
    median_days_recent: rt?.summary.median_days ?? 0,
    median_days_prior: rt?.summary.prior_median_days ?? 0,
    trend: !rt ? 'insufficient_data'
      : rt.summary.trend === 'faster' ? 'improving'
      : rt.summary.trend === 'slower' ? 'slowing'
      : rt.summary.trend === 'flat' ? 'stable' : 'insufficient_data',
    total_tasks: rt?.overall.completed ?? 0,
  };

  const res = json({
    data: {
      commitments: commitmentStats || { total: 0, completed: 0, overdue: 0 },
      responseMetrics,
      menteeVelocity: velocityRows,
      grantPipeline: grantPipeline || { total: 0, pending: 0, active: 0, active_funding: 0 },
      teamEngagement: engagementScores,
      pubsByQuarter: (pubsByQuarter.results || []) as Array<{ year: number; quarter: string; count: number }>,
      grantsFunnel: grantsFunnel || { submitted: 0, active: 0 },
      projectsByStage: (projectsByStage.results || []) as Array<{ stage: string; count: number }>,
    },
  });
  // Lab-wide numbers for the PI: no shared or edge cache may keep them.
  return isPi ? noStore(res) : res;
}

// ── Lab pulse (Nick, 2026-10-11) ───────────────────────────
// Three PI-only routes behind the "Lab pulse" section of PI Analytics and the
// one line on Today. Each answers 403 to a non-PI before it reads a row: the
// route DSL's auth:'pi' is documentation, so the gate is in the handler, the
// way /api/pb/* and /api/insights/dashboard do it (isPiRequest, resolved once
// per request into c.get('isPi')). They read lab-wide (index.ts labWideEnv) and
// return counts, months, priorities and member slugs/names only: never a
// project name or slug, a task id or a task title (lab-pulse-gate.test.ts pins it).

// These bodies are computed on the unscoped handle for one caller, so no shared
// or edge cache may keep them (precedent: insights.ts; health-unscoped.test.ts).
const noStore = (res: Response): Response => {
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
};
const PI_ONLY = () => noStore(error('Forbidden — PI access only', 403));

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

  return noStore(json({ data: { mentees: menteeRows, perYear, pace: { per_year: round1(pace), last_year: c(1), earlier_per_year: round1(earlier), trend } } }));
}

// ── GET /api/analytics/response-time ───────────────────────
// Days from a task being made to it being done, as a MEDIAN (a few year-old
// tasks closed in a clean-up would drag a mean). TEAM tasks only (Nick,
// 2026-10-11): assigned to someone other than nick-ingraham, and not closed
// within 24 hours of being made (a quick capture is closed in the same breath
// and says nothing about the team). Not deleted, not a milestone or question.
// `summary` compares the last 90 days with the 90 before and flags a sample
// under 5 tasks (`small_sample`); `monthly` is the last 12 months;
// `byPriority` the last 6, same filter.
const SMALL_SAMPLE = 5;
export async function handleResponseTime(env: Env, isPi: boolean, now = new Date()): Promise<Response> {
  if (!isPi) return PI_ONLY();
  return noStore(json({ data: await computeResponseTime(env, now) }));
}

// The one definition of "days to done", shared by response-time and the
// pi-dashboard's response metrics. `overall` is the whole 365-day window.
async function computeResponseTime(env: Env, now: Date) {
  const done = await env.DB.prepare(`
    SELECT priority,
      substr(completed_at, 1, 7) as month,
      julianday(completed_at) - julianday(created_at) as days,
      julianday(?1) - julianday(completed_at) as age
    FROM tasks
    WHERE completed = 1 AND completed_at IS NOT NULL AND created_at IS NOT NULL
      AND deleted_at IS NULL AND COALESCE(kind, 'task') = 'task'
      AND assignee != '' AND assignee != 'nick-ingraham' AND assignee != 'claude-ai'
      AND assignee NOT IN (SELECT slug FROM team_members WHERE member_type = 'ai' AND slug IS NOT NULL)
      AND julianday(completed_at) - julianday(created_at) >= 1
      AND julianday(?1) - julianday(completed_at) BETWEEN 0 AND 365
    LIMIT 50000
  `).bind(now.toISOString()).all();
  const rows = (done.results || []) as Array<{ priority: string | null; month: string; days: number; age: number }>;
  const all = rows.map((r) => r.days);

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

  // `monthly` is the current month and the eleven before it, so a month label
  // never appears twice (a 365-day window reaches into the same month a year ago).
  // UTC month, the same clock as substr(completed_at,1,7) above, so the window edge and the row buckets agree.
  // eslint-disable-next-line local/time-discipline -- UTC month on purpose: rows are bucketed by substr(completed_at,1,7), a UTC string
  const [cy, cm] = now.toISOString().slice(0, 7).split('-').map(Number);
  const back = cy * 12 + (cm - 1) - 11;
  const first = `${Math.floor(back / 12)}-${String((back % 12) + 1).padStart(2, '0')}`;

  return {
    overall: { median_days: med(all), completed: all.length },
    summary: {
      median_days: med(recent),
      prior_median_days: med(prior),
      completed: recent.length,
      prior_completed: prior.length,
      small_sample: recent.length < SMALL_SAMPLE,
      trend,
    },
    monthly: [...monthMap.entries()].filter(([month]) => month >= first).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, xs]) => ({ month, completed: xs.length, median_days: med(xs) })),
    byPriority: [...prioMap.entries()]
      .map(([priority, xs]) => ({ priority, count: xs.length, median_days: med(xs) }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── GET /api/analytics/team-engagement ─────────────────────
// Who did anything in the Hub in the last 30 days, against the 30 before.
// Per-person numbers and the score are the PI's alone. A member is a
// team_members row with an email, not the AI. A member is ACTIVE (Nick,
// 2026-10-11) if, in the window, ANY of: a task ASSIGNED to them was completed
// (tasks.assignee; completed_by is the clicker, and the Hub stamps the PI on
// nearly every close), they authored a comment or update, or they opened
// something in the Hub. Comments and updates come from activity_entries only
// (kind comment/update, source_table NULL = typed by a person, not a PB progress
// note, gardener or meeting row; hidden rows left out). Comments and
// updates are stored only in activity_entries (no activity_log echo since
// 2026-10-11; older echo rows remain, so never read both). The 30/60-day counts never reach before the
// P2-A cutover (2026-06-10), but the 180-day collaborator gate and the 365-day
// last_active DO, and the P2-A backfill rows carry source_table='activity_log'
// (so the NULL filter skips them): a collaborator active only Apr-Jun 2026 drops
// out of the denominator until about mid-December. Rows posted
// through Nick's own session (PB automation under nick-ingraham) count as his:
// that touches only his row. Opening is entity_seen
// (POST /api/seen on every detail open), the only durable per-person
// "was here" mark: it keeps ONE row per entity holding the LATEST view, so a
// person seen in both windows shows only in the newer one and the prior count
// can only undercount. There is no login table. `total` is comments + updates
// + completions; opening counts toward `active` but not `total` or `score`.
export async function handleTeamEngagement(env: Env, isPi: boolean): Promise<Response> {
  if (!isPi) return PI_ONLY();
  return noStore(json({ data: await computeEngagement(env) }));
}

// The one definition of "active" and "score", shared by team-engagement and
// the pi-dashboard's per-person list so the two cannot drift.
async function computeEngagement(env: Env) {
  const [team, authored, done, seen] = await Promise.all([
    env.DB.prepare(`
      SELECT slug, name, member_type FROM team_members
      WHERE slug IS NOT NULL AND slug != 'claude-ai'
        AND email IS NOT NULL AND email != ''
        AND COALESCE(member_type, '') != 'ai'
    `).all(),
    env.DB.prepare(`
      SELECT slug,
        MAX(ts) as last_active,
        SUM(CASE WHEN datetime(ts) > datetime('now', '-30 days') AND t = 'comment' THEN 1 ELSE 0 END) as comments,
        SUM(CASE WHEN datetime(ts) > datetime('now', '-30 days') AND t != 'comment' THEN 1 ELSE 0 END) as updates,
        SUM(CASE WHEN datetime(ts) > datetime('now', '-60 days') AND datetime(ts) <= datetime('now', '-30 days') THEN 1 ELSE 0 END) as prior_total,
        MAX(CASE WHEN datetime(ts) > datetime('now', '-180 days') THEN 1 ELSE 0 END) as recent
      FROM (
        SELECT actor_slug as slug, created_at as ts, kind as t
        FROM activity_entries
        WHERE kind IN ('comment', 'update') AND source_table IS NULL AND hidden_at IS NULL
          AND datetime(created_at) > datetime('now', '-365 days')
      )
      GROUP BY slug
    `).all(),
    env.DB.prepare(`
      SELECT assignee as slug,
        SUM(CASE WHEN datetime(completed_at) > datetime('now', '-30 days') THEN 1 ELSE 0 END) as completions,
        SUM(CASE WHEN datetime(completed_at) <= datetime('now', '-30 days') THEN 1 ELSE 0 END) as prior_completions,
        MAX(completed_at) as last_done
      FROM tasks
      WHERE completed = 1 AND datetime(completed_at) > datetime('now', '-60 days')
        AND deleted_at IS NULL AND COALESCE(kind, 'task') = 'task'
      GROUP BY assignee
    `).all(),
    env.DB.prepare(`
      SELECT viewer_slug as slug, MAX(last_seen_at) as last_seen,
        MAX(CASE WHEN datetime(last_seen_at) > datetime('now', '-30 days') THEN 1 ELSE 0 END) as now_seen,
        MAX(CASE WHEN datetime(last_seen_at) > datetime('now', '-60 days') AND datetime(last_seen_at) <= datetime('now', '-30 days') THEN 1 ELSE 0 END) as prior_seen
      FROM entity_seen
      WHERE datetime(last_seen_at) > datetime('now', '-180 days')
      GROUP BY viewer_slug
    `).all(),
  ]);

  const doneBy = new Map<string, { completions: number; prior_completions: number; last_done: string | null }>();
  for (const r of (done.results || []) as Array<{ slug: string; completions: number; prior_completions: number; last_done: string | null }>) {
    doneBy.set(r.slug, r);
  }
  const seenBy = new Map<string, { last_seen: string; now_seen: number; prior_seen: number }>();
  for (const r of (seen.results || []) as Array<{ slug: string; last_seen: string; now_seen: number; prior_seen: number }>) seenBy.set(r.slug, r);

  const byActor = new Map<string, {
    last_active: string | null; comments: number; updates: number; prior_total: number; recent: number
  }>();
  for (const r of (authored.results || []) as Array<{ slug: string; last_active: string | null; comments: number; updates: number; prior_total: number; recent: number }>) {
    byActor.set(r.slug, r);
  }

  // Who counts in "N of M": people who use the Hub. Faculty and senior-mentor
  // collaborators (member_type 'faculty' / 'senior_mentor', the directory's own
  // groups, team.ts MEMBER_TYPES) are advisers who mostly never sign in, so one
  // counts only if they authored something or opened something in the last 180
  // days, or had a task finished in the last 60 (the window the task query
  // reads). Every other type (director, research_team, and the trainee types
  // fellow/resident/trainee that TRAINEE_SQL names) always counts. A
  // collaborator who never acts is left out of both the list and the denominator.
  const byActorRecent = (slug: string) => (byActor.get(slug)?.recent ?? 0) > 0 || seenBy.has(slug);
  const COLLABORATOR = new Set(['faculty', 'senior_mentor']);
  const roster = ((team.results || []) as Array<{ slug: string; name: string; member_type: string | null }>).filter((m) =>
    !COLLABORATOR.has(m.member_type ?? '') || byActorRecent(m.slug) || doneBy.has(m.slug));
  const members = roster.map((m) => {
    const a = byActor.get(m.slug);
    const d = doneBy.get(m.slug);
    const v = seenBy.get(m.slug);
    const comments = a?.comments ?? 0;
    const updates = a?.updates ?? 0;
    const completions = d?.completions ?? 0;
    const total = comments + updates + completions;
    const priorTotal = (a?.prior_total ?? 0) + (d?.prior_completions ?? 0);
    const last = [a?.last_active, d?.last_done, v?.last_seen].filter((x): x is string => !!x).sort().pop() ?? null;
    return {
      slug: m.slug,
      name: m.name,
      total,
      comments,
      updates,
      completions,
      opened: !!v?.now_seen,
      active: total > 0 || !!v?.now_seen,
      prior_active: priorTotal > 0 || !!v?.prior_seen,
      score: comments * 3 + updates * 2 + completions,
      prior_total: priorTotal,
      trend: total > priorTotal ? 'up' : total < priorTotal ? 'down' : 'flat',
      last_active: last,
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const active = members.filter((m) => m.active).length;
  const priorActive = members.filter((m) => m.prior_active).length;
  return {
    members,
    active,
    of: members.length,
    prior_active: priorActive,
    trend: active > priorActive ? 'up' as const : active < priorActive ? 'down' as const : 'flat' as const,
  };
}
