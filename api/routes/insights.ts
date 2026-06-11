import type { Env } from '../helpers';
import { json } from '../helpers';

// UTC-safe YYYY-MM-DD from a Date object (pure UTC integer arithmetic).
// Avoids .toISOString().split/.slice lint ban (R21).
function isoDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Cross-Project Insight Engine ──────────────────────────────
// Analyzes D1 project data to surface connections Nick might miss.

interface InsightEdge {
  from: string
  to: string
  fromTitle: string
  toTitle: string
  reason: string
  strength: number
}

// Domain-specific keyword groups for research topic matching
const KEYWORD_GROUPS: { keywords: string[]; label: string }[] = [
  { keywords: ['clif', 'common longitudinal'], label: 'CLIF' },
  { keywords: ['ventilat', 'mechanical ventilation', 'intubat'], label: 'ventilation' },
  { keywords: ['sepsis', 'septic'], label: 'sepsis' },
  { keywords: ['mortality', 'death', 'survival'], label: 'mortality' },
  { keywords: ['icu', 'intensive care', 'critical care', 'critically ill'], label: 'ICU' },
  { keywords: ['survey', 'questionnaire'], label: 'survey methods' },
  { keywords: ['causal', 'causal inference', 'propensity'], label: 'causal inference' },
  { keywords: ['machine learning', 'ml ', 'deep learning', 'prediction model'], label: 'ML/AI' },
  { keywords: ['disparit', 'equity', 'racial', 'socioeconomic'], label: 'disparities' },
  { keywords: ['covid', 'sars-cov', 'pandemic'], label: 'COVID-19' },
  { keywords: ['ards', 'acute respiratory distress'], label: 'ARDS' },
  { keywords: ['tracheostom', 'trach'], label: 'tracheostomy' },
  { keywords: ['quality', 'quality improvement'], label: 'quality' },
  { keywords: ['biomarker', 'inflammatory marker'], label: 'biomarkers' },
  { keywords: ['phenotyp', 'subphenotyp', 'endotyp'], label: 'phenotyping' },
]

function findMatchingKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  const matches: string[] = []
  for (const group of KEYWORD_GROUPS) {
    for (const kw of group.keywords) {
      if (lower.includes(kw)) {
        matches.push(group.label)
        break
      }
    }
  }
  return matches
}

// GET /api/insights/connections — full cross-project analysis
export async function handleInsightConnections(env: Env): Promise<Response> {
  // Fetch all active projects with their details
  // Note: team_members column does not exist in projects table; team membership
  // is inferred from `pi` field and from shared task assignees.
  const projects = await env.DB.prepare(
    `SELECT slug, title, description, category, pi, stage
     FROM projects
     WHERE status != 'Archived'
     ORDER BY title ASC`
  ).all<{
    slug: string
    title: string
    description: string | null
    category: string | null
    pi: string | null
    stage: string | null
  }>()

  const rows = projects.results || []
  const edges: InsightEdge[] = []
  const seen = new Set<string>()

  function addEdge(from: string, to: string, fromTitle: string, toTitle: string, reason: string, strength: number) {
    const key = [from, to].sort().join('::') + '::' + reason
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from, to, fromTitle, toTitle, reason, strength })
  }

  // 1. Shared team members — fall back to PI only since projects table has no team_members column
  const teamMap = new Map<string, { slug: string; title: string; members: string[] }>()
  for (const p of rows) {
    const members: string[] = []
    if (p.pi) members.push(p.pi)
    teamMap.set(p.slug, { slug: p.slug, title: p.title, members: [...new Set(members)] })
  }

  const teamEntries = [...teamMap.values()]
  for (let i = 0; i < teamEntries.length; i++) {
    for (let j = i + 1; j < teamEntries.length; j++) {
      const a = teamEntries[i]
      const b = teamEntries[j]
      const shared = a.members.filter((m) => b.members.includes(m))
      if (shared.length > 0) {
        // PI overlap is weaker signal than shared team members (PI is on most projects)
        const piOnly = shared.length === 1 && (shared[0] === a.members[0] || shared[0] === b.members[0])
        const strength = piOnly ? 0.3 : Math.min(0.9, shared.length * 0.3)
        addEdge(
          a.slug, b.slug, a.title, b.title,
          `Shared team: ${shared.join(', ')}`,
          strength
        )
      }
    }
  }

  // 2. Same category + similar stage
  const categoryGroups = new Map<string, typeof rows>()
  for (const p of rows) {
    if (!p.category) continue
    if (!categoryGroups.has(p.category)) categoryGroups.set(p.category, [])
    categoryGroups.get(p.category)!.push(p)
  }

  for (const [_cat, group] of categoryGroups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (a.stage && b.stage && a.stage === b.stage) {
          addEdge(
            a.slug, b.slug, a.title, b.title,
            `Same category & stage (${a.stage})`,
            0.4
          )
        }
      }
    }
  }

  // 3. Keyword matching in titles + descriptions
  const projectKeywords = new Map<string, { slug: string; title: string; keywords: string[] }>()
  for (const p of rows) {
    const text = [p.title, p.description || ''].join(' ')
    const kws = findMatchingKeywords(text)
    if (kws.length > 0) {
      projectKeywords.set(p.slug, { slug: p.slug, title: p.title, keywords: kws })
    }
  }

  const kwEntries = [...projectKeywords.values()]
  for (let i = 0; i < kwEntries.length; i++) {
    for (let j = i + 1; j < kwEntries.length; j++) {
      const a = kwEntries[i]
      const b = kwEntries[j]
      const shared = a.keywords.filter((k) => b.keywords.includes(k))
      if (shared.length > 0) {
        addEdge(
          a.slug, b.slug, a.title, b.title,
          `Shared topics: ${shared.join(', ')}`,
          Math.min(0.8, shared.length * 0.25)
        )
      }
    }
  }

  // 4. Shared linked papers
  const paperLinks = await env.DB.prepare(
    `SELECT paper_id, project_slug FROM paper_project_links`
  ).all<{ paper_id: string; project_slug: string }>()

  const paperToProjects = new Map<string, string[]>()
  for (const link of (paperLinks.results || [])) {
    if (!paperToProjects.has(link.paper_id)) paperToProjects.set(link.paper_id, [])
    paperToProjects.get(link.paper_id)!.push(link.project_slug)
  }

  for (const [_paperId, projectSlugs] of paperToProjects) {
    if (projectSlugs.length < 2) continue
    for (let i = 0; i < projectSlugs.length; i++) {
      for (let j = i + 1; j < projectSlugs.length; j++) {
        const a = rows.find((r) => r.slug === projectSlugs[i])
        const b = rows.find((r) => r.slug === projectSlugs[j])
        if (a && b) {
          addEdge(
            a.slug, b.slug, a.title, b.title,
            'Shared literature',
            0.6
          )
        }
      }
    }
  }

  // Sort by strength descending, deduplicate strongest per pair
  const pairBest = new Map<string, InsightEdge[]>()
  for (const edge of edges) {
    const pairKey = [edge.from, edge.to].sort().join('::')
    if (!pairBest.has(pairKey)) pairBest.set(pairKey, [])
    pairBest.get(pairKey)!.push(edge)
  }

  // Combine edges per pair — aggregate reasons, take max strength
  const combined: InsightEdge[] = []
  for (const [_, pairEdges] of pairBest) {
    const best = pairEdges.reduce((a, b) => (a.strength > b.strength ? a : b))
    const allReasons = pairEdges.map((e) => e.reason)
    const combinedStrength = Math.min(1, pairEdges.reduce((sum, e) => sum + e.strength, 0))
    combined.push({
      ...best,
      reason: allReasons.join(' | '),
      strength: combinedStrength,
    })
  }

  combined.sort((a, b) => b.strength - a.strength)

  return json({
    data: combined,
    count: combined.length,
  })
}

// GET /api/insights/suggestions?project_id= — related projects for a given project
export async function handleInsightSuggestions(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id')
  if (!projectId) {
    return json({ data: [], count: 0 })
  }

  // Get full connections and filter for this project
  const connectionsResp = await handleInsightConnections(env)
  const connectionsData = await connectionsResp.json() as { data: InsightEdge[] }
  const all = connectionsData.data || []

  const related = all
    .filter((e) => e.from === projectId || e.to === projectId)
    .map((e) => ({
      slug: e.from === projectId ? e.to : e.from,
      title: e.from === projectId ? e.toTitle : e.fromTitle,
      reason: e.reason,
      strength: e.strength,
    }))
    .sort((a, b) => b.strength - a.strength)

  return json({
    data: related,
    count: related.length,
  })
}

// ── /api/insights/dashboard — operational insights (PI-only) ──
// GH #37 EPIC. All queries hit existing tables — no schema change.

interface DashboardMetrics {
  // sparkline arrays are 8-week trailing series, oldest first.
  // Empty array when historical reconstruction isn't feasible (snapshot-only metrics).
  stalledProjects: { count: number; deltaWoW: number; sparkline: number[] }
  tasksPerPerson: { avg: number; total: number; distribution: { slug: string; count: number }[]; sparkline: number[] }
  manuscriptsInRevision: { count: number; awaitingReplyOver7d: number; sparkline: number[] }
  grantsInPipeline: { count: number; daysToNextDeadline: number | null; sparkline: number[] }
}

interface DashboardResponse {
  week: string
  metrics: DashboardMetrics
  workloadHeatmap: { slug: string; days: { mon: number; tue: number; wed: number; thu: number; fri: number } }[]
  pipelineFunnel: { stage: string; count: number }[]
  velocityScatter: { slug: string; title: string; daysSinceUpdate: number; openTasks: number; isOutlier: boolean }[]
  stalledRegistry: { slug: string; title: string; daysIdle: number; openTasks: number }[]
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

// INS-04: parse a `YYYY-Www` ISO-week string into the Monday at 00:00 UTC of
// that week. Returns null on bad input. Used for archive UI navigation.
function isoWeekToMonday(weekStr: string): Date | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekStr)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  if (week < 1 || week > 53) return null
  // ISO-week 1 contains Jan 4 — find that week's Monday and offset.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7 // 1 (Mon) .. 7 (Sun)
  const week1Mon = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1)))
  return new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000)
}

const STALL_THRESHOLD_DAYS = 14
const SCATTER_OUTLIER_DAYS = 30
const SCATTER_OUTLIER_TASKS = 10

export async function handleInsightsDashboard(env: Env, weekArg?: string): Promise<Response> {
  // INS-04: optional `?week=YYYY-Www`. Defaults to current ISO week.
  // For non-current weeks we anchor the heatmap window to that week's Mon-Sun,
  // and the stalled / stalled-last counters to "as of end of that week."
  // Snapshot metrics (open tasks, manuscripts in revision, grants in pipeline)
  // remain current — no historical snapshot table exists yet.
  const today = new Date()
  const requestedMonday = weekArg ? isoWeekToMonday(weekArg) : null
  const isHistorical = requestedMonday !== null
  const week = isHistorical ? weekArg! : isoWeek(today)
  // Anchor for date math is "end of the requested week" (Sunday at end of day)
  // when historical, otherwise "now".
  const weekEndDate = isHistorical ? new Date(requestedMonday!.getTime() + 7 * 86400000) : null
  const weekEndIso = weekEndDate ? isoDateStr(weekEndDate) : null
  // SQLite date anchor: 'now' or a literal date string.
  const anchor = weekEndIso ? `'${weekEndIso}'` : `'now'`

  // 1. Stalled projects (no project activity_entries kind='update' in 14d), with WoW delta
  const stalledNow = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM projects p
     WHERE p.deleted_at IS NULL AND p.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM activity_entries ae
         WHERE ae.entity_type='project' AND ae.kind='update' AND ae.project_id = p.id
           AND ae.created_at > datetime(${anchor}, '-${STALL_THRESHOLD_DAYS} days')
       )`
  ).first<{ c: number }>()

  const stalledLast = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM projects p
     WHERE p.deleted_at IS NULL AND p.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM activity_entries ae
         WHERE ae.entity_type='project' AND ae.kind='update' AND ae.project_id = p.id
           AND ae.created_at > datetime(${anchor}, '-${STALL_THRESHOLD_DAYS + 7} days')
           AND ae.created_at <= datetime(${anchor}, '-7 days')
       )`
  ).first<{ c: number }>()

  // 2. Tasks per person (open only)
  const taskDistRes = await env.DB.prepare(
    `SELECT assignee, COUNT(*) as c FROM tasks
     WHERE deleted_at IS NULL AND completed = 0 AND assignee IS NOT NULL
     GROUP BY assignee ORDER BY c DESC`
  ).all<{ assignee: string; c: number }>()
  const distribution = (taskDistRes.results ?? []).map((r) => ({ slug: r.assignee, count: r.c }))
  const totalOpen = distribution.reduce((s, r) => s + r.count, 0)
  const memberCountRes = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM team_members WHERE active = 1`
  ).first<{ c: number }>()
  const memberCount = Math.max(1, memberCountRes?.c ?? 1)
  const avg = Math.round((totalOpen / memberCount) * 10) / 10

  // 3. Manuscripts in revision (projects whose stage = 'Revisions' or has a manuscript_revisions row open)
  const msRevRes = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM projects
     WHERE deleted_at IS NULL AND stage IN ('revisions', 'review')`
  ).first<{ c: number }>()
  const msAwaitingRes = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM manuscript_revisions
     WHERE status = 'awaiting_response'
       AND received_at < datetime('now', '-7 days')`
  ).first<{ c: number }>().catch(() => ({ c: 0 } as { c: number }))

  // 4. Grants pipeline + days to next deadline
  const grantsRes = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM nih_grants
     WHERE status NOT IN ('funded', 'withdrawn', 'rejected')`
  ).first<{ c: number }>().catch(() => ({ c: 0 } as { c: number }))
  const nextDeadlineRes = await env.DB.prepare(
    `SELECT julianday(deadline) - julianday('now') as d FROM nih_grants
     WHERE deadline IS NOT NULL AND deadline > date('now')
     ORDER BY deadline ASC LIMIT 1`
  ).first<{ d: number }>().catch(() => null)
  const daysToNextDeadline = nextDeadlineRes ? Math.max(0, Math.round(nextDeadlineRes.d)) : null

  // 5. Workload heatmap — tasks due this week (Sun-Sat), grouped by assignee × weekday.
  // Note: SQLite's `date('now','weekday N')` returns the next occurrence of that
  // weekday (or today if today matches). For a Sun-Sat current-week window we
  // anchor on `weekday 0` (next Sunday) and back up 6 days — so:
  //   start = next Sunday minus 6 days = previous Monday  ❌
  // Wait — `weekday 0` returns *next* Sunday (or today if Sun). To get the
  // start of the current week we want `weekday 0, -6 days` (Mon-of-this-week)
  // and end inclusive at `weekday 0` (Sat-of-this-week). Since the prior
  // implementation used `weekday 1, -7 days .. weekday 1` (always last week's
  // Mon-Sun), the corrected current-week range is `weekday 0, -6 days .. weekday 0, +1 day`
  // (Sun start through next-Sun-exclusive == Sat end inclusive).
  // For historical weeks, the heatmap window is the requested Mon-Sun. For
  // current week we anchor on `weekday 0` (next Sunday) per INS-01 fix.
  const heatmapRes = isHistorical
    ? await env.DB.prepare(
        `SELECT assignee,
           CAST(strftime('%w', due_date) AS INT) as dow,
           COUNT(*) as c
         FROM tasks
         WHERE deleted_at IS NULL AND completed = 0 AND assignee IS NOT NULL
           AND due_date IS NOT NULL
           AND due_date >= ?
           AND due_date < date(?, '+7 days')
         GROUP BY assignee, dow`
      ).bind(isoDateStr(requestedMonday!), isoDateStr(requestedMonday!))
        .all<{ assignee: string; dow: number; c: number }>()
    : await env.DB.prepare(
        `SELECT assignee,
           CAST(strftime('%w', due_date) AS INT) as dow,
           COUNT(*) as c
         FROM tasks
         WHERE deleted_at IS NULL AND completed = 0 AND assignee IS NOT NULL
           AND due_date IS NOT NULL
           AND due_date >= date('now', 'weekday 0', '-6 days')
           AND due_date < date('now', 'weekday 0', '+1 day')
         GROUP BY assignee, dow`
      ).all<{ assignee: string; dow: number; c: number }>()

  const heatmapMap = new Map<string, { mon: number; tue: number; wed: number; thu: number; fri: number }>()
  for (const r of heatmapRes.results ?? []) {
    const cur = heatmapMap.get(r.assignee) ?? { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }
    if (r.dow === 1) cur.mon = r.c
    else if (r.dow === 2) cur.tue = r.c
    else if (r.dow === 3) cur.wed = r.c
    else if (r.dow === 4) cur.thu = r.c
    else if (r.dow === 5) cur.fri = r.c
    heatmapMap.set(r.assignee, cur)
  }
  const workloadHeatmap = Array.from(heatmapMap.entries()).map(([slug, days]) => ({ slug, days }))

  // 6. Pipeline funnel
  const funnelRes = await env.DB.prepare(
    `SELECT stage, COUNT(*) as c FROM projects
     WHERE deleted_at IS NULL AND status = 'active' AND stage IS NOT NULL
     GROUP BY stage`
  ).all<{ stage: string; c: number }>()
  const STAGE_ORDER = ['idea', 'data_collection', 'data_analysis', 'writing', 'review', 'submitted', 'published']
  const funnelMap = new Map((funnelRes.results ?? []).map((r) => [r.stage, r.c]))
  const pipelineFunnel = STAGE_ORDER.map((stage) => ({ stage, count: funnelMap.get(stage) ?? 0 }))

  // 7. Velocity scatter + 8. stalled registry (single combined query)
  const scatterRes = await env.DB.prepare(
    `SELECT p.slug, p.title,
       MAX(ae.created_at) as last_update,
       (SELECT COUNT(*) FROM tasks t
          WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.completed = 0) as open_tasks
     FROM projects p
     LEFT JOIN activity_entries ae ON ae.entity_type='project' AND ae.kind='update' AND ae.project_id = p.id
     WHERE p.deleted_at IS NULL AND p.status = 'active'
     GROUP BY p.id, p.slug, p.title`
  ).all<{ slug: string; title: string; last_update: string | null; open_tasks: number }>()

  const anchorMs = isHistorical ? weekEndDate!.getTime() : Date.now()
  const velocityScatter = (scatterRes.results ?? []).map((r) => {
    const ms = r.last_update ? new Date(r.last_update).getTime() : 0
    const daysSinceUpdate = ms === 0 ? 999 : Math.max(0, Math.floor((anchorMs - ms) / 86400000))
    const isOutlier = daysSinceUpdate > SCATTER_OUTLIER_DAYS || r.open_tasks > SCATTER_OUTLIER_TASKS
    return { slug: r.slug, title: r.title, daysSinceUpdate, openTasks: r.open_tasks, isOutlier }
  })

  const stalledRegistry = velocityScatter
    .filter((p) => p.daysSinceUpdate >= STALL_THRESHOLD_DAYS)
    .map((p) => ({ slug: p.slug, title: p.title, daysIdle: p.daysSinceUpdate, openTasks: p.openTasks }))
    .sort((a, b) => b.daysIdle - a.daysIdle)

  // 9. INS-05: 8-week trailing sparklines.
  // Anchor = end of requested week (or today). Compute one offset per week:
  // week N = "as of (anchor - N*7 days)" snapshot.
  // - stalledProjects: count of active projects with no project_update in the
  //   14d preceding that snapshot date.
  // - tasksPerPerson: tasks COMPLETED in the 7-day window preceding that
  //   snapshot date (proxy for velocity — open-snapshots aren't reconstructable).
  // - manuscriptsInRevision: same query each week (no historical reconstruction
  //   without a snapshot table). We emit a flat series with the current count
  //   so the sparkline renders as a steady line rather than zeros.
  // - grantsInPipeline: same as manuscripts.
  const sparklineWindowEnds: string[] = []
  for (let i = 7; i >= 0; i--) {
    if (isHistorical) {
      const d = new Date(weekEndDate!.getTime() - i * 7 * 86400000)
      sparklineWindowEnds.push(isoDateStr(d))
    } else {
      // For "now"-anchored, use SQLite expression literal for the END of each
      // historical week. We compute via JS for consistency.
      const d = new Date(today.getTime() - i * 7 * 86400000)
      sparklineWindowEnds.push(isoDateStr(d))
    }
  }

  // Run the 8 stalled-snapshot queries in parallel.
  const stalledSparklinePromises = sparklineWindowEnds.map((endIso) =>
    env.DB.prepare(
      `SELECT COUNT(*) as c FROM projects p
       WHERE p.deleted_at IS NULL AND p.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM activity_entries ae
           WHERE ae.entity_type='project' AND ae.kind='update' AND ae.project_id = p.id
             AND ae.created_at > datetime(?, '-${STALL_THRESHOLD_DAYS} days')
             AND ae.created_at <= datetime(?, '+1 day')
         )`
    ).bind(endIso, endIso).first<{ c: number }>()
  )
  const stalledSparkRows = await Promise.all(stalledSparklinePromises).catch(() => [] as ({ c: number } | null)[])
  const stalledSparkline = stalledSparkRows.map((r) => r?.c ?? 0)

  // Tasks-completed velocity sparkline — 7d window ending each weekend.
  const tasksSparklinePromises = sparklineWindowEnds.map((endIso) =>
    env.DB.prepare(
      `SELECT COUNT(*) as c FROM tasks
       WHERE deleted_at IS NULL AND completed = 1
         AND updated_at > datetime(?, '-7 days')
         AND updated_at <= datetime(?, '+1 day')`
    ).bind(endIso, endIso).first<{ c: number }>().catch(() => ({ c: 0 } as { c: number }))
  )
  const tasksSparkRows = await Promise.all(tasksSparklinePromises)
  const tasksSparkline = tasksSparkRows.map((r) => r?.c ?? 0)

  // Manuscripts/grants sparklines: snapshot-only metrics. Emit a flat 8-point
  // series at the current count so the SVG renders a steady horizontal stroke
  // (better signal than empty / zeros and explicit about no historical signal).
  // When a snapshot table arrives later, fill these in.
  const msFlat = Array(8).fill(msRevRes?.c ?? 0)
  const grantsFlat = Array(8).fill(grantsRes?.c ?? 0)

  const body: DashboardResponse = {
    week,
    metrics: {
      stalledProjects: {
        count: stalledNow?.c ?? 0,
        deltaWoW: (stalledNow?.c ?? 0) - (stalledLast?.c ?? 0),
        sparkline: stalledSparkline,
      },
      tasksPerPerson: { avg, total: totalOpen, distribution, sparkline: tasksSparkline },
      manuscriptsInRevision: {
        count: msRevRes?.c ?? 0,
        awaitingReplyOver7d: msAwaitingRes?.c ?? 0,
        sparkline: msFlat,
      },
      grantsInPipeline: {
        count: grantsRes?.c ?? 0,
        daysToNextDeadline,
        sparkline: grantsFlat,
      },
    },
    workloadHeatmap,
    pipelineFunnel,
    velocityScatter,
    stalledRegistry,
  }

  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
