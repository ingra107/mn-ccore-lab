import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { AlertTriangle, CalendarPlus, CheckCircle2, Circle } from 'lucide-react'
import ChartCard from '../ui/ChartCard'
import StatRow from '../ui/StatRow'
import DueLabel from '../DueLabel'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import { isOverdue } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import { PRIORITY_COLORS, isProjectActive } from '../../lib/taskConstants'
import { isTaskDone } from '../../lib/taskGrouping'
import { taskShortLabel } from '../../lib/displayNames'
import { MANUSCRIPTS_PAGE_KINDS } from '../../lib/products'
import { stageCountLabel, type ProductStageCount } from '../../lib/projectStage'
import { rampBar, BAR_TRACK } from '../../lib/tealRamp'
import { formatCurrency } from '../../lib/labReports'
import { RANGE_WEEKS, useRangeParam } from '../../hooks/useWeekParam'
import { useInsightConnections } from '../../hooks/useApiData'
import type { PIDashboardData } from '../../hooks/usePIDashboard'
import type { InsightsDashboardData } from '../../hooks/useInsightsDashboard'
import type { VelocityWeek } from '../../hooks/useWeekStats'
import type { TaskRow } from '../../lib/api'
import { RangePills } from './TeamBlocks'

// The Pipeline tab's blocks: what moved this week, where the work stands, and
// the PI-only reads (stalled projects, grants, connections). The same fact
// appears once: Overdue links to the filtered Tasks list and its first five
// tasks sit beside it; products are counted on ONE scope (active projects).

const dim = { color: 'var(--muted)' } as const
const cnt = (n: number): number | undefined => (n > 0 ? n : undefined)

// ── This week ──────────────────────────────────────────────

interface WeekStatsView {
  completed: number; created: number; overdue: number
  completedPrior: number; createdPrior: number; overduePrior: number
}

export function ThisWeekBlock({ stats, sparks, tasks, health, stalled }: {
  stats: WeekStatsView
  sparks: { completed: number[]; created: number[]; overdue: number[] }
  tasks: TaskRow[]
  health?: { healthy: number; needs_attention?: number; at_risk?: number; critical?: number } | null
  /** PI only: the stalled-projects metric from the Insights read. */
  stalled?: InsightsDashboardData['metrics']['stalledProjects']
}) {
  const overdueTasks = useMemo(
    () => tasks.filter((t) => !isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)).slice(0, 5),
    [tasks],
  )
  const net = stats.completed - stats.created
  const atRisk = (health?.at_risk || 0) + (health?.critical || 0)
  return (
    <ChartCard title="This week">
      <StatRow
        stats={[
          { label: 'Completed', value: stats.completed, previous: stats.completedPrior, previousLabel: 'vs last week', spark: sparks.completed },
          { label: 'Created', value: stats.created, previous: stats.createdPrior, previousLabel: 'vs last week', spark: sparks.created },
          { label: 'Overdue', value: stats.overdue, rule: 'o', to: `${PATHS.myTasks}?filter=overdue`, previous: stats.overduePrior, previousLabel: 'vs last week', spark: sparks.overdue },
          ...(stalled
            ? [{ label: 'Stalled projects (14d+)', value: stalled.count, rule: 'u' as const, previous: stalled.count - stalled.deltaWoW, previousLabel: 'vs last week', spark: stalled.sparkline }]
            : []),
        ]}
      />
      {health && (
        <div className="mt-3 flex items-center gap-2 text-[11px] flex-wrap" style={dim}>
          <span>Lab health:</span>
          <span style={{ color: 'var(--sk-t2)' }}>{health.healthy} healthy</span>
          {(health.needs_attention || 0) > 0 && <span style={{ color: 'var(--job-stale)' }}>{health.needs_attention} need attention</span>}
          {atRisk > 0 && <span style={{ color: 'var(--job-stale)' }}>{atRisk} at risk</span>}
          <span>&middot;</span>
          <span>Net this week: {net > 0 ? '+' : ''}{net} tasks ({stats.completed} done, {stats.created} created)</span>
        </div>
      )}
      {stats.overdue > 0 ? (
        <div className="mt-4 pl-3" style={{ borderLeft: '3px solid var(--job-overdue)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle {...ICON_PROPS} size={14} style={{ color: 'var(--job-overdue)' }} />
            <h4 className="text-sm font-normal" style={{ color: 'var(--job-overdue)' }}>Attention required</h4>
            <span className="text-xs" style={dim}>{stats.overdue} overdue task{stats.overdue > 1 ? 's' : ''} need attention</span>
          </div>
          <div className="flex flex-col gap-1">
            {overdueTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
                <Circle {...ICON_PROPS} size={10} style={{ color: 'var(--job-overdue)', flexShrink: 0 }} />
                <span className="truncate">{taskShortLabel(t)}</span>
                {t.due_date && <DueLabel due={t.due_date} status={t.status} style={{ fontSize: '10px', flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-center">
          <CheckCircle2 size={24} style={{ color: 'var(--sk-t3)', margin: '0 auto 6px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>All caught up!</p>
          <p className="text-xs" style={dim}>No overdue tasks. Keep up the momentum.</p>
        </div>
      )}
    </ChartCard>
  )
}

// ── Portfolio ──────────────────────────────────────────────

export function PortfolioBlock({ projects, ideas, pi, insights }: {
  projects: Array<{ status?: string | null }>
  ideas: Array<{ status?: string | null }>
  /** PI only: the dashboard read and the Insights read. */
  pi?: PIDashboardData
  insights?: InsightsDashboardData
}) {
  const active = projects.filter((p) => isProjectActive(p.status)).length
  const liveIdeas = ideas.filter((i) => i.status !== 'archived').length
  const m = insights?.metrics
  return (
    <ChartCard title="Portfolio">
      <StatRow
        stats={[
          { label: 'Active projects', value: active, sub: `${projects.length} total` },
          { label: 'Research ideas', value: liveIdeas, sub: `${ideas.length} total` },
          ...(m ? [{
            label: 'Manuscripts in revision',
            value: m.manuscriptsInRevision.count,
            sub: m.manuscriptsInRevision.awaitingReplyOver7d > 0 ? `${m.manuscriptsInRevision.awaitingReplyOver7d} awaiting reply >7d` : undefined,
            spark: m.manuscriptsInRevision.sparkline,
          }] : []),
        ]}
      />
      {(pi || m) && (
        <StatRow
          stats={[
            ...(m ? [{
              label: 'Grants in pipeline',
              value: m.grantsInPipeline.count,
              rule: m.grantsInPipeline.daysToNextDeadline !== null && m.grantsInPipeline.daysToNextDeadline < 14 ? 'u' as const : undefined,
              sub: m.grantsInPipeline.daysToNextDeadline !== null ? `Next deadline in ${m.grantsInPipeline.daysToNextDeadline}d` : undefined,
              spark: m.grantsInPipeline.sparkline,
            }] : []),
            ...(pi ? [
              { label: 'Active funding', value: pi.grantPipeline.active_funding ? formatCurrency(pi.grantPipeline.active_funding) : '$0', sub: `${pi.grantPipeline.active || 0} active grants` },
              { label: 'Grants pending', value: pi.grantsFunnel.submitted || 0, sub: `${pi.grantsFunnel.active || 0} active` },
            ] : []),
          ]}
        />
      )}
    </ChartCard>
  )
}

// ── Products by stage ──────────────────────────────────────

/** Where a bar opens: the page that lists that kind of product. */
function funnelHref(kind: string): string {
  if (kind === 'manuscript') return PATHS.manuscripts
  if (MANUSCRIPTS_PAGE_KINDS.includes(kind)) return `${PATHS.manuscripts}?kind=${encodeURIComponent(kind)}`
  if (kind === 'grant_application' || kind === 'award' || kind === 'honor') return PATHS.grants
  return PATHS.projects
}

/**
 * Products of ACTIVE projects, by kind and stage, on the viewer's own project
 * handle. One scope for everyone: it is the scope /api/insights/dashboard
 * (pipelineFunnel) and /api/analytics/pi-dashboard (productsByStage) already
 * computed with one SQL, PRODUCT_STAGE_COUNTS_SQL("pr.status = 'active'").
 * Analytics counted every live product of every live project, so its numbers
 * included finished projects; they now match the PI's.
 */
export function ProductsByStageBlock({ rows }: { rows: ProductStageCount[] | undefined }) {
  const list = useMemo(() => rows ?? [], [rows])
  const lastOrdinal = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of list) m.set(r.kind, Math.max(m.get(r.kind) ?? 0, r.ordinal))
    return m
  }, [list])
  const max = Math.max(1, ...list.map((r) => r.count))
  return (
    <ChartCard title="Products by stage" count="Active projects">
      {rows === undefined ? (
        <p className="text-xs" style={dim}>Loading</p>
      ) : list.length === 0 ? (
        <p className="text-xs" style={dim}>No products on active projects yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((r) => {
            const label = stageCountLabel(r)
            const step = r.is_terminal ? 1 : Math.min(1, r.ordinal / Math.max(1, lastOrdinal.get(r.kind) ?? r.ordinal))
            return (
              <Link
                key={`${r.kind}:${r.stage}`}
                to={funnelHref(r.kind)}
                aria-label={`${label}: ${r.count} ${r.count === 1 ? 'product' : 'products'}`}
                className="flex items-center gap-2"
                style={{ color: 'inherit', textDecoration: 'none' }}
                title={`${label}: ${r.count}`}
              >
                <span className="text-[11px] text-right truncate" style={{ flex: '0 0 170px', color: 'var(--slate)' }}>{label}</span>
                <div className="flex-1 h-5 relative" style={{ background: BAR_TRACK, borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ width: `${(r.count / max) * 100}%`, minWidth: 4, height: '100%', borderRadius: 'var(--radius-sm)', ...rampBar(step) }} />
                </div>
                <span className="text-[11px] font-semibold text-right tabular-nums" style={{ flex: '0 0 36px', color: 'var(--sk-t2)' }}>{r.count}</span>
              </Link>
            )
          })}
        </div>
      )}
    </ChartCard>
  )
}

// ── Velocity ───────────────────────────────────────────────

const tooltipStyle = {
  background: 'var(--cream)',
  border: '1px solid var(--sk-line)',
  borderRadius: 'var(--radius-md)',
  fontSize: 12,
  color: 'var(--ink)',
} as const

/**
 * Completed against created per Monday week, for the range; the open tasks'
 * priority and age beside it. Days to done is a separate tile (SpeedTile):
 * one figure, one definition.
 */
export function VelocityBlock({ weeks, tasks }: { weeks: VelocityWeek[]; tasks: TaskRow[] }) {
  const { range } = useRangeParam()
  const shown = useMemo(() => weeks.slice(-RANGE_WEEKS[range]), [weeks, range])

  const byPriority = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) if (!t.completed) map.set(t.priority, (map.get(t.priority) || 0) + 1)
    return map
  }, [tasks])

  const ageBuckets = useMemo(() => {
    const now = new Date()
    const buckets = [
      { label: '<1w', max: 7, count: 0, fill: 'var(--sk-t3)' },
      { label: '1-2w', max: 14, count: 0, fill: 'var(--sk-t3)' },
      { label: '2-4w', max: 28, count: 0, fill: 'color-mix(in srgb, var(--job-stale) 55%, var(--sk-t3))' },
      { label: '1-2m', max: 60, count: 0, fill: 'var(--job-stale)' },
      { label: '2m+', max: Infinity, count: 0, fill: 'var(--job-stale)' },
    ]
    let older = 0
    for (const t of tasks) {
      if (t.completed || !t.created_at) continue
      const age = Math.floor((now.getTime() - parseDbUtc(t.created_at).getTime()) / 86400000)
      const bucket = buckets.find((b) => age < b.max) || buckets[buckets.length - 1]
      bucket.count++
      if (age > 28) older++
    }
    return { buckets, older }
  }, [tasks])

  return (
    <div className="flex flex-col gap-4">
      <ChartCard title="Task velocity" count={`Completed / created, ${shown.length} week${shown.length === 1 ? '' : 's'}`} right={<RangePills />} dense>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={shown} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="week" tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--ink)', fontWeight: 500 }} />
            <Bar dataKey="completed" fill="var(--job-accent)" radius={[4, 4, 0, 0]} name="Completed" />
            <Bar dataKey="created" fill="color-mix(in srgb, var(--job-accent) 45%, var(--sk-t3))" radius={[4, 4, 0, 0]} name="Created" opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Task age" count="Open tasks, by weeks old" dense>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={ageBuckets.buckets} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--ink)', fontWeight: 500 }} formatter={(value) => [value, 'Tasks']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Tasks">
                {ageBuckets.buckets.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] mt-3" style={dim}>{ageBuckets.older} tasks older than 4 weeks</p>
        </ChartCard>
        <ChartCard title="Active task priority">
          <div className="flex items-center gap-3 flex-wrap">
            {(['urgent', 'high', 'medium', 'low'] as const).map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: PRIORITY_COLORS[p] }} />
                <span className="text-xs capitalize" style={{ color: 'var(--ink)' }}>{p}</span>
                <span className="text-xs font-semibold" style={{ color: PRIORITY_COLORS[p] }}>{byPriority.get(p) || 0}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

// ── Publications output ────────────────────────────────────

export function PublicationsOutputBlock({ data }: { data?: PIDashboardData }) {
  const rows = data?.pubsByQuarter ?? []
  const chart = rows.map((q) => ({ label: `'${String(q.year).slice(2)}`, value: q.count }))
  return (
    <ChartCard title="Publications per year" count="Lab-wide, published">
      {chart.length > 0 ? (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chart} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--slate)', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--slate)', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--ink)', fontWeight: 500 }} formatter={(value) => [value, 'Publications']} />
            <Bar dataKey="value" fill="var(--job-accent)" radius={[4, 4, 0, 0]} name="Publications" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-center py-6 text-sm" style={dim}>No publication data</p>
      )}
    </ChartCard>
  )
}

// ── Connections ────────────────────────────────────────────

function reasonChip(reason: string): string {
  // The API joins reasons with ' | '. The strongest signal is the chip; the full string is the title.
  const first = reason.split(' | ')[0] ?? reason
  if (first.startsWith('Shared team')) return 'PI overlap'
  if (first.startsWith('Same category')) return 'category match'
  if (first.startsWith('Shared topics')) return 'topic'
  if (first.startsWith('Shared literature')) return 'shared paper'
  return first
}

/** Top-5 cross-project connections, each with a "Schedule sync" link. Replaces the Cross-Project Insights card. */
export function ConnectionsBlock() {
  const { data: connections = [], isLoading } = useInsightConnections()
  const top5 = connections.slice(0, 5)
  return (
    <ChartCard title="Cross-project connections" count={cnt(connections.length)}>
      {isLoading ? (
        <p className="text-xs m-0" style={dim}>Analyzing connections…</p>
      ) : top5.length === 0 ? (
        <p className="text-xs m-0" style={dim}>No cross-project connections detected yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {top5.map((edge, i) => {
            const syncHref = `${PATHS.meetings}?compose=1&projects=${encodeURIComponent(edge.from)},${encodeURIComponent(edge.to)}`
            return (
              <div
                key={`${edge.from}-${edge.to}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5"
                style={i < top5.length - 1 ? { borderBottom: '1px solid var(--sk-line)' } : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link to={PATHS.project(edge.from)} title={edge.fromTitle} className="text-xs font-medium truncate" style={{ color: 'var(--ink)', textDecoration: 'none', maxWidth: '40%' }}>{edge.fromTitle}</Link>
                    <span className="text-[10px]" style={{ color: 'var(--sk-t3)' }}>↔</span>
                    <Link to={PATHS.project(edge.to)} title={edge.toTitle} className="text-xs font-medium truncate" style={{ color: 'var(--ink)', textDecoration: 'none', maxWidth: '40%' }}>{edge.toTitle}</Link>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span title={edge.reason} className="text-[10px] px-1.5" style={{ background: 'var(--sk-line)', color: 'var(--sk-t2)', borderRadius: 'var(--radius-sm)' }}>{reasonChip(edge.reason)}</span>
                    <span className="text-[10px] tabular-nums" style={{ color: 'var(--sk-t3)' }}>{Math.round(edge.strength * 100)}%</span>
                  </div>
                </div>
                <Link
                  to={syncHref}
                  className="tk-btn tk-sm"
                  style={{ flexShrink: 0, textDecoration: 'none' }}
                  title={`Open Meetings to schedule a sync between ${edge.fromTitle} and ${edge.toTitle}`}
                >
                  <CalendarPlus {...ICON_PROPS} size={11} />
                  Schedule sync
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </ChartCard>
  )
}

// ── Velocity outliers (PI) ─────────────────────────────────

export function VelocityOutliersBlock({ rows }: { rows: InsightsDashboardData['velocityScatter'] }) {
  const navigate = useNavigate()
  // A never-updated project has no x value, so it is not plotted; the caption
  // counts it and the table lists it (G8-05: it used to sit at x=999).
  const plotted = rows.filter((r): r is typeof r & { daysSinceUpdate: number } => r.daysSinceUpdate !== null)
  const unplotted = rows.length - plotted.length
  const maxX = Math.max(60, ...plotted.map((r) => r.daysSinceUpdate))
  const maxY = Math.max(10, ...plotted.map((r) => r.openTasks))
  const w = 700
  const h = 240
  const padL = 36
  const padB = 28
  return (
    <ChartCard title="Project velocity outliers" count={cnt(rows.filter((r) => r.isOutlier).length)}>
      <p className="text-[11px] mb-3" style={dim}>
        x = days since last update · y = open task count · orange = outlier (&gt;30d OR &gt;10 tasks)
        {unplotted > 0 && ` · ${unplotted} never updated, not plotted`}
      </p>
      <div style={{ overflow: 'auto' }}>
        <svg width={w} height={h} role="img" aria-label="Project velocity scatter chart">
          <line x1={padL} y1={h - padB} x2={w - 8} y2={h - padB} stroke="var(--border-subtle)" />
          <line x1={padL} y1={8} x2={padL} y2={h - padB} stroke="var(--border-subtle)" />
          {plotted.map((r) => {
            const cx = padL + (r.daysSinceUpdate / maxX) * (w - padL - 16)
            const cy = (h - padB) - (r.openTasks / maxY) * (h - padB - 16)
            return (
              <circle
                key={r.slug}
                cx={cx}
                cy={cy}
                r={r.isOutlier ? 5 : 3}
                fill={r.isOutlier ? 'var(--job-stale)' : 'var(--job-accent)'}
                opacity={r.isOutlier ? 0.9 : 0.7}
                onClick={() => navigate(PATHS.project(r.slug))}
                style={{ cursor: 'pointer' }}
                role="link"
                aria-label={`${r.title} — ${r.daysSinceUpdate}d idle, ${r.openTasks} open. Open project.`}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(PATHS.project(r.slug)) } }}
              >
                <title>{`${r.title} — ${r.daysSinceUpdate}d, ${r.openTasks} open`}</title>
              </circle>
            )
          })}
        </svg>
      </div>
      <details className="mt-2">
        <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--slate)' }}>Show as table</summary>
        <table className="mt-2 text-xs w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-left" style={{ color: 'var(--slate)' }}>
              <th className="px-2 py-1 font-medium">Project</th>
              <th className="px-2 py-1 font-medium">Days idle</th>
              <th className="px-2 py-1 font-medium">Open tasks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} style={{ color: r.isOutlier ? 'var(--job-stale)' : 'var(--ink)' }}>
                <td className="px-2 py-1"><Link to={PATHS.project(r.slug)} style={{ color: 'inherit', textDecoration: 'none' }}>{r.title}</Link></td>
                <td className="px-2 py-1 tabular-nums">{r.daysSinceUpdate ?? 'no updates yet'}</td>
                <td className="px-2 py-1 tabular-nums">{r.openTasks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </ChartCard>
  )
}
