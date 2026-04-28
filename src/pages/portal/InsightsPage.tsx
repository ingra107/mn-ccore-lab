import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { TrendingUp, Activity, AlertTriangle, FlaskConical, AlertCircle, Users, BookOpen, Award, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import EmptyStateArt from '../../components/EmptyStateArt'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { TableContainer } from '../../components/table'
import InlineDatePicker from '../../components/InlineDatePicker'
import MetricCard from '../../components/MetricCard'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { getPersonInfo } from '../../data/team'
import { PATHS } from '../../constants/paths'
import { usePageMeta } from '../../hooks/usePageMeta'

interface DashboardData {
  week: string
  metrics: {
    // INS-05: each metric carries an 8-week trailing sparkline (oldest first).
    // Empty/flat arrays for snapshot-only metrics where historical reconstruction
    // isn't feasible.
    stalledProjects: { count: number; deltaWoW: number; sparkline?: number[] }
    tasksPerPerson: { avg: number; total: number; distribution: { slug: string; count: number }[]; sparkline?: number[] }
    manuscriptsInRevision: { count: number; awaitingReplyOver7d: number; sparkline?: number[] }
    grantsInPipeline: { count: number; daysToNextDeadline: number | null; sparkline?: number[] }
  }
  workloadHeatmap: { slug: string; days: { mon: number; tue: number; wed: number; thu: number; fri: number } }[]
  pipelineFunnel: { stage: string; count: number }[]
  velocityScatter: { slug: string; title: string; daysSinceUpdate: number; openTasks: number; isOutlier: boolean }[]
  stalledRegistry: { slug: string; title: string; daysIdle: number; openTasks: number }[]
}

const STAGE_FILL: Record<string, string> = {
  'Idea': 'var(--stage-fill-idea)',
  'Data Collection': 'var(--stage-fill-data-collection)',
  'Data Analysis': 'var(--stage-fill-analysis)',
  'Writing': 'var(--stage-fill-writing)',
  'Review': 'var(--stage-fill-review)',
  'Submitted': 'var(--stage-fill-submitted)',
  'Published': 'var(--stage-fill-published)',
}

// INS-04: bump / shift an ISO-week string by N weeks. Returns the new YYYY-Www.
function shiftIsoWeek(weekStr: string, deltaWeeks: number): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekStr)
  if (!m) return weekStr
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Mon = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1)))
  const monOfRequested = new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000)
  const shifted = new Date(monOfRequested.getTime() + deltaWeeks * 7 * 86400000)
  // Re-derive ISO week from shifted Monday.
  const date = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function currentIsoWeek(): string {
  const d = new Date()
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export default function InsightsPage() {
  usePageMeta('Operational Insights | MN-CCORE', 'Where attention should go this week.')

  // INS-04: ?week=YYYY-Www in URL → historical view; absent → current.
  const [searchParams, setSearchParams] = useSearchParams()
  const weekParam = searchParams.get('week') || undefined
  const queryClient = useQueryClient()

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['insights', 'operational', weekParam ?? 'current'],
    queryFn: async () => {
      const url = weekParam ? `/api/insights/dashboard?week=${encodeURIComponent(weekParam)}` : '/api/insights/dashboard'
      const res = await fetch(url)
      if (res.status === 403) {
        throw new Error('PI-only')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { data: DashboardData }
      return body.data
    },
    staleTime: 5 * 60 * 1000,
  })

  // INS-04: prev/next chevrons. "next" disabled when already on current week.
  const onPrev = () => {
    const base = data?.week ?? weekParam ?? currentIsoWeek()
    const target = shiftIsoWeek(base, -1)
    setSearchParams({ week: target })
  }
  const onNext = () => {
    const base = data?.week ?? weekParam ?? currentIsoWeek()
    const target = shiftIsoWeek(base, +1)
    if (target > currentIsoWeek()) {
      // Don't go beyond current — clear the param to land on default.
      setSearchParams({})
      return
    }
    setSearchParams({ week: target })
  }
  const onResetCurrent = () => setSearchParams({})
  // INS-03: refresh button — invalidate the cache for whatever week we're on.
  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['insights', 'operational', weekParam ?? 'current'] })
    refetch()
  }
  const isCurrent = !weekParam || (data && data.week === currentIsoWeek())

  if (isLoading) return <div className="content-container"><TextSkeleton lines={12} /></div>

  if (isError) {
    return (
      <div className="content-container">
        <PageHeader icon={<TrendingUp size={20} />} title="Operational Insights" />
        <EmptyState
          icon={<AlertTriangle size={40} />}
          title="PI access required"
          subtitle="Operational insights are visible to PIs only. If this is a mistake, check that your account has PI privileges."
        />
      </div>
    )
  }

  if (!data) return null

  const headerActions = (
    <div className="flex items-center" style={{ gap: 6 }}>
      <button
        type="button"
        onClick={onPrev}
        title="Previous week"
        aria-label="Previous week"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          color: 'var(--slate)',
          cursor: 'pointer',
        }}
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!!isCurrent}
        title={isCurrent ? 'Already on current week' : 'Next week'}
        aria-label="Next week"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          color: 'var(--slate)',
          cursor: isCurrent ? 'default' : 'pointer',
          opacity: isCurrent ? 0.4 : 1,
        }}
      >
        <ChevronRight size={14} />
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={onResetCurrent}
          title="Jump to current week"
          style={{
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--teal)',
            background: 'transparent',
            border: '1px solid var(--teal)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          Today
        </button>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        title="Refresh"
        aria-label="Refresh insights"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--teal)',
          background: 'transparent',
          border: '1px solid var(--teal)',
          borderRadius: 'var(--radius-md)',
          cursor: isFetching ? 'default' : 'pointer',
          opacity: isFetching ? 0.7 : 1,
        }}
      >
        <RefreshCw
          size={12}
          style={{
            transition: 'transform 0.6s ease',
            transform: isFetching ? 'rotate(360deg)' : 'none',
          }}
        />
        {isFetching ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '6rem' }}>
        <PageHeader
          icon={<TrendingUp size={20} />}
          title="Operational Insights"
          subtitle={`Hub aggregation · ${data.week}${isCurrent ? '' : ' (historical)'}`}
          actions={headerActions}
        />

        {/* Metric hero row — INS-06: shared MetricCard primitive. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--sp-md)',
            marginBottom: 'var(--sp-2xl)',
          }}
        >
          <MetricCard
            icon={AlertCircle}
            label="Stalled projects (14d+)"
            value={data.metrics.stalledProjects.count}
            color={data.metrics.stalledProjects.count > 0 ? 'var(--maroon)' : 'var(--teal)'}
            // INS-18: was using gold (Rule 59 = AI). Stalled is severity, not AI.
            previous={data.metrics.stalledProjects.count - data.metrics.stalledProjects.deltaWoW}
            previousLabel="vs last week"
            sparklineData={data.metrics.stalledProjects.sparkline}
          />
          <MetricCard
            icon={Users}
            label="Open tasks per person"
            value={data.metrics.tasksPerPerson.avg}
            color="var(--teal)"
            subtitle={`${data.metrics.tasksPerPerson.total} total`}
            sparklineData={data.metrics.tasksPerPerson.sparkline}
          />
          <MetricCard
            icon={BookOpen}
            label="Manuscripts in revision"
            value={data.metrics.manuscriptsInRevision.count}
            // INS-18: dropped gold accent. Use neutral slate; reserve gold for AI.
            color="var(--slate)"
            subtitle={
              data.metrics.manuscriptsInRevision.awaitingReplyOver7d > 0
                ? `${data.metrics.manuscriptsInRevision.awaitingReplyOver7d} awaiting reply >7d`
                : undefined
            }
            sparklineData={data.metrics.manuscriptsInRevision.sparkline}
          />
          <MetricCard
            icon={Award}
            label="Grants in pipeline"
            value={data.metrics.grantsInPipeline.count}
            // INS-18: dropped gold accent. Maroon when deadline tight, slate otherwise.
            color={
              data.metrics.grantsInPipeline.daysToNextDeadline !== null && data.metrics.grantsInPipeline.daysToNextDeadline < 14
                ? 'var(--maroon)'
                : 'var(--slate)'
            }
            subtitle={
              data.metrics.grantsInPipeline.daysToNextDeadline !== null
                ? `Next deadline in ${data.metrics.grantsInPipeline.daysToNextDeadline}d`
                : undefined
            }
            sparklineData={data.metrics.grantsInPipeline.sparkline}
          />
        </div>

        {/* Workload + funnel row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 'var(--sp-md)',
            marginBottom: 'var(--sp-2xl)',
          }}
        >
          <WorkloadHeatmap rows={data.workloadHeatmap} />
          <PipelineFunnel rows={data.pipelineFunnel} />
        </div>

        {/* Velocity scatter */}
        <VelocityScatter rows={data.velocityScatter} />

        {/* Stalled registry */}
        <div style={{ marginTop: 'var(--sp-2xl)' }}>
          <SectionHeader icon={<AlertTriangle size={14} />} label="Critical stalled project registry" count={data.stalledRegistry.length} />
          <StalledRegistry rows={data.stalledRegistry} />
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center" style={{ gap: 8, marginBottom: 'var(--sp-sm)' }}>
      <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{icon}</span>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0, letterSpacing: '0.02em' }}>{label}</h2>
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 11, color: 'var(--slate)', opacity: 0.85, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </span>
      )}
    </div>
  )
}

function WorkloadHeatmap({ rows }: { rows: DashboardData['workloadHeatmap'] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const ta = a.days.mon + a.days.tue + a.days.wed + a.days.thu + a.days.fri
    const tb = b.days.mon + b.days.tue + b.days.wed + b.days.thu + b.days.fri
    return tb - ta
  }), [rows])

  const cellColor = (n: number): string => {
    if (n === 0) return 'rgba(255,255,255,0.03)'
    if (n <= 3) return 'color-mix(in oklch, var(--stage-fill-data-collection) 30%, transparent)'
    if (n <= 8) return 'color-mix(in oklch, var(--stage-fill-data-collection) 60%, transparent)'
    return 'var(--stage-fill-data-collection)'
  }
  const days: ('mon'|'tue'|'wed'|'thu'|'fri')[] = ['mon', 'tue', 'wed', 'thu', 'fri']
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

  return (
    <div style={{ padding: 'var(--sp-lg)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <SectionHeader icon={<Activity size={14} />} label="Workload heatmap" count={sorted.length} />
      {sorted.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.85, margin: 0 }}>
          No tasks scheduled for the current week.
        </p>
      ) : (
        <>
          <div role="grid" aria-label="Tasks due this week per member per weekday" style={{ display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', gap: 4, alignItems: 'center' }}>
            <span aria-hidden="true" />
            {labels.map((l) => (
              <span key={l} role="columnheader" style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.7, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {l}
              </span>
            ))}
            {sorted.map((row) => {
              const person = getPersonInfo(row.slug)
              return (
                <>
                  <span key={`${row.slug}-name`} role="rowheader" style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                    {person.name}
                  </span>
                  {days.map((d) => (
                    <div
                      key={`${row.slug}-${d}`}
                      role="gridcell"
                      aria-label={`${person.name}: ${d}: ${row.days[d]} open tasks`}
                      style={{
                        height: 22,
                        borderRadius: 'var(--radius-sm)',
                        background: cellColor(row.days[d]),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        color: row.days[d] >= 4 ? '#fff' : 'var(--slate)',
                        fontWeight: 500,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.days[d] > 0 ? row.days[d] : ''}
                    </div>
                  ))}
                </>
              )
            })}
          </div>
          <div className="flex items-center" style={{ gap: 12, marginTop: 12, fontSize: 10, color: 'var(--slate)', opacity: 0.85 }}>
            <span>Legend:</span>
            {[
              ['low (1-3)', 'color-mix(in oklch, var(--stage-fill-data-collection) 30%, transparent)'],
              ['med (4-8)', 'color-mix(in oklch, var(--stage-fill-data-collection) 60%, transparent)'],
              ['high (9+)', 'var(--stage-fill-data-collection)'],
            ].map(([label, bg]) => (
              <span key={label} className="flex items-center" style={{ gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 'var(--radius-sm)', background: bg }} />
                {label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PipelineFunnel({ rows }: { rows: DashboardData['pipelineFunnel'] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div style={{ padding: 'var(--sp-lg)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <SectionHeader icon={<FlaskConical size={14} />} label="Pipeline funnel" />
      <div className="flex flex-col" style={{ gap: 6 }}>
        {rows.map((r) => {
          const pct = (r.count / max) * 100
          return (
            <div
              key={r.stage}
              role="img"
              aria-label={`${r.stage}: ${r.count} projects`}
              className="flex items-center"
              style={{ gap: 8 }}
            >
              <span style={{ flex: '0 0 110px', fontSize: 11, color: 'var(--slate)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {r.stage}
              </span>
              <div style={{ flex: 1, height: 22, position: 'relative', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: STAGE_FILL[r.stage] ?? 'var(--stage-fill-idea)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 8,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {r.count > 0 ? r.count : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VelocityScatter({ rows }: { rows: DashboardData['velocityScatter'] }) {
  const maxX = Math.max(60, ...rows.map((r) => r.daysSinceUpdate))
  const maxY = Math.max(10, ...rows.map((r) => r.openTasks))
  const w = 700
  const h = 240
  const padL = 36
  const padB = 28

  return (
    <div style={{ padding: 'var(--sp-lg)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
      <SectionHeader icon={<TrendingUp size={14} />} label="Project velocity outliers" count={rows.filter(r => r.isOutlier).length} />
      <p style={{ fontSize: 11, color: 'var(--slate)', opacity: 0.85, margin: '0 0 12px' }}>
        x = days since last update · y = open task count · maroon = outlier (&gt;30d OR &gt;10 tasks)
      </p>
      <div style={{ overflow: 'auto' }}>
        <svg width={w} height={h} role="img" aria-label="Project velocity scatter chart">
          {/* axes */}
          <line x1={padL} y1={h - padB} x2={w - 8} y2={h - padB} stroke="var(--border-subtle)" />
          <line x1={padL} y1={8} x2={padL} y2={h - padB} stroke="var(--border-subtle)" />
          {/* points */}
          {rows.map((r) => {
            const cx = padL + (r.daysSinceUpdate / maxX) * (w - padL - 16)
            const cy = (h - padB) - (r.openTasks / maxY) * (h - padB - 16)
            return (
              <circle
                key={r.slug}
                cx={cx}
                cy={cy}
                r={r.isOutlier ? 5 : 3}
                fill={r.isOutlier ? 'var(--maroon)' : 'var(--teal)'}
                opacity={r.isOutlier ? 0.9 : 0.7}
              >
                <title>{`${r.title} — ${r.daysSinceUpdate}d, ${r.openTasks} open`}</title>
              </circle>
            )
          })}
        </svg>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 11, color: 'var(--slate)', cursor: 'pointer' }}>Show as table</summary>
        <table style={{ marginTop: 8, fontSize: 12, width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--slate)' }}>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Project</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Days idle</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Open tasks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} style={{ color: r.isOutlier ? 'var(--maroon)' : 'var(--ink)' }}>
                <td style={{ padding: '4px 8px' }}>{r.title}</td>
                <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.daysSinceUpdate}</td>
                <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.openTasks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function StalledRegistry({ rows }: { rows: DashboardData['stalledRegistry'] }) {
  const queryClient = useQueryClient()
  const { showSuccess } = useToast()
  const { user } = useAuth()
  // INS-02: per-row pending follow-up date. Defaults to +3d when row's Set
  // follow-up button is first clicked; user can edit via InlineDatePicker
  // before confirming. Map keyed by project slug.
  const defaultDueStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return d.toISOString().slice(0, 10)
  }, [])
  const [pendingDates, setPendingDates] = useState<Record<string, string>>({})
  const followUp = useMutation({
    mutationFn: async (project: { slug: string; title: string; dueStr: string }) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Follow up on stalled project: ${project.title}`,
          assignee: emailToSlug(user?.email) || 'nick-ingraham',
          project_id: project.slug,
          priority: 'high',
          due_date: project.dueStr,
          status: 'todo',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      showSuccess('Follow-up task created')
      // Reset that row's date so re-click starts at default again.
      setPendingDates((prev) => {
        const { [variables.slug]: _drop, ...rest } = prev
        return rest
      })
    },
  })

  const dueFor = (slug: string) => pendingDates[slug] ?? defaultDueStr
  const setDueFor = (slug: string, value: string | null) => {
    if (!value) return
    setPendingDates((prev) => ({ ...prev, [slug]: value }))
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<EmptyStateArt variant="tasks" title="All caught up" />}
        title="No stalled projects"
        subtitle="Every active project has had a project_update within the last 14 days."
      />
    )
  }

  return (
    <TableContainer>
      <div className="hidden sm:grid" style={{ gridTemplateColumns: 'minmax(220px, 3fr) 90px 90px 140px 130px', padding: 'var(--sp-sm) var(--sp-xl)', borderBottom: '1px solid var(--border-subtle)' }}>
        {['Project', 'Days idle', 'Open tasks', 'Follow-up date', 'Action'].map((label) => (
          <span key={label} style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--slate)', opacity: 0.55, letterSpacing: '0.06em', fontWeight: 500 }}>
            {label}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.slug}
          className="hidden sm:grid"
          style={{
            gridTemplateColumns: 'minmax(220px, 3fr) 90px 90px 140px 130px',
            padding: 'var(--sp-md) var(--sp-xl)',
            borderBottom: '1px solid var(--border-subtle)',
            alignItems: 'center',
            color: 'var(--ink)',
            fontSize: 13,
          }}
        >
          <Link to={PATHS.project(r.slug)} style={{ color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.title}
          </Link>
          <span style={{ color: 'var(--maroon)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {r.daysIdle}d
          </span>
          <span style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>
            {r.openTasks}
          </span>
          <InlineDatePicker
            value={dueFor(r.slug)}
            onChange={(d) => setDueFor(r.slug, d)}
          />
          <button
            type="button"
            onClick={() => followUp.mutate({ slug: r.slug, title: r.title, dueStr: dueFor(r.slug) })}
            disabled={followUp.isPending}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--teal)',
              background: 'transparent',
              border: '1px solid var(--teal)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              width: 'fit-content',
            }}
          >
            + Set follow-up
          </button>
        </div>
      ))}
      {/* Mobile fallback — single-column stack */}
      {rows.map((r) => (
        <div
          key={`m-${r.slug}`}
          className="sm:hidden"
          style={{ padding: 'var(--sp-md)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <Link to={PATHS.project(r.slug)} style={{ color: 'var(--ink)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            {r.title}
          </Link>
          <div className="flex items-center" style={{ gap: 12, marginTop: 4, fontSize: 11 }}>
            <span style={{ color: 'var(--maroon)', fontWeight: 600 }}>{r.daysIdle}d idle</span>
            <span style={{ color: 'var(--slate)' }}>{r.openTasks} tasks</span>
          </div>
          <div className="flex items-center" style={{ gap: 8, marginTop: 6 }}>
            <InlineDatePicker
              value={dueFor(r.slug)}
              onChange={(d) => setDueFor(r.slug, d)}
            />
            <button
              onClick={() => followUp.mutate({ slug: r.slug, title: r.title, dueStr: dueFor(r.slug) })}
              disabled={followUp.isPending}
              style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, color: 'var(--teal)', background: 'transparent', border: '1px solid var(--teal)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            >
              + Set follow-up
            </button>
          </div>
        </div>
      ))}
    </TableContainer>
  )
}
