import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react'
import ChartCard from '../ui/ChartCard'
import StatRow from '../ui/StatRow'
import SegmentedToggle from '../ui/SegmentedToggle'
import ActivityHeatmap from '../ActivityHeatmap'
import EmptyState from '../EmptyState'
import EmptyStateArt from '../EmptyStateArt'
import { FaceDisc } from '../today/skin'
import { getPersonInfo } from '../../data/team'
import { PATHS } from '../../constants/paths'
import { isOverdueWork } from '../../lib/taskStats'
import { addDays, mondayOf } from '../../lib/isoWeek'
import { buildLeadershipInsights, commitmentRate } from '../../lib/labReports'
import { rampBar, BAR_TRACK } from '../../lib/tealRamp'
import { useRangeParam, RANGES } from '../../hooks/useWeekParam'
import type { PIDashboardData } from '../../hooks/usePIDashboard'
import type { InsightsDashboardData } from '../../hooks/useInsightsDashboard'
import type { TaskRow } from '../../lib/api'

// The Team tab's blocks. Everything that names a person is PI-only (Nick: an
// individual metric is the PI's alone); a member sees the lab's own totals, the
// open-task counts Analytics always showed them, and the lab heatmap.

const dim = { color: 'var(--muted)' } as const

/** Shown where a PI-only block would be, for a PI whose read failed. */
export function BlockUnavailable({ forbidden, what }: { forbidden?: boolean; what: string }) {
  return (
    <p className="text-sm" style={dim}>
      {forbidden ? `${what} is visible to PIs only. If this is a mistake, check that your account has PI privileges.` : `${what} is not available right now.`}
    </p>
  )
}

// ── Leadership insights (PI) ───────────────────────────────

export function LeadershipInsightsBlock({ data, isLoading }: { data?: PIDashboardData; isLoading: boolean }) {
  const insights = useMemo(() => (data ? buildLeadershipInsights(data) : []), [data])
  const icons = { good: CheckCircle2, warning: AlertTriangle, info: Lightbulb } as const
  const colors = { good: 'var(--sk-t3)', warning: 'var(--job-stale)', info: 'var(--sk-t3)' } as const
  const fills = {
    good: 'var(--sk-line)',
    warning: 'color-mix(in srgb, var(--job-stale) 8%, transparent)',
    info: 'var(--sk-line)',
  } as const
  return (
    <ChartCard title="Leadership insights" count="PI only">
      {insights.length > 0 ? (
        <div className="flex flex-col gap-3">
          {insights.map((insight, i) => {
            const Icon = icons[insight.type]
            return (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: fills[insight.type] }}>
                <Icon size={16} style={{ color: colors[insight.type], flexShrink: 0, marginTop: 1 }} />
                <p className="text-sm" style={{ color: 'var(--ink)', lineHeight: 1.5 }}>{insight.text}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-center py-4 text-sm" style={dim}>
          {isLoading ? 'Loading' : 'Not enough data to generate insights yet'}
        </p>
      )}
    </ChartCard>
  )
}

// ── Workload ───────────────────────────────────────────────

interface WorkloadRow { slug: string; open: number; done: number; total: number; overdue: number }

/**
 * Open tasks per person. A PI gets every person with their done/total and
 * overdue counts, each row a link to Tasks filtered to that person; a member
 * gets the top eight open counts, as Analytics always showed them. The open
 * counts and the average come from the server's Insights read when it is there
 * (the PI's), and from the task list otherwise.
 */
export function WorkloadBlock({ isPi, tasks, insights }: { isPi: boolean; tasks: TaskRow[]; insights?: InsightsDashboardData }) {
  const rows = useMemo<WorkloadRow[]>(() => {
    const map = new Map<string, WorkloadRow>()
    const row = (slug: string) => {
      let r = map.get(slug)
      if (!r) { r = { slug, open: 0, done: 0, total: 0, overdue: 0 }; map.set(slug, r) }
      return r
    }
    for (const t of tasks) {
      const r = row(t.assignee)
      r.total++
      if (t.completed) r.done++
      else {
        r.open++
        if (isOverdueWork(t)) r.overdue++
      }
    }
    if (isPi && insights) {
      for (const r of map.values()) r.open = 0
      for (const d of insights.metrics.tasksPerPerson.distribution) row(d.slug).open = d.count
    }
    return [...map.values()].filter((r) => (isPi ? r.total > 0 || r.open > 0 : r.open > 0)).sort((a, b) => b.open - a.open || b.total - a.total)
  }, [tasks, insights, isPi])

  const shown = isPi ? rows : rows.slice(0, 8)
  const max = Math.max(1, ...shown.map((r) => r.open))
  const openTotal = tasks.filter((t) => !t.completed).length
  const m = insights?.metrics.tasksPerPerson

  return (
    <ChartCard
      title="Workload"
      count={m ? `${m.avg} open per person · ${m.total} total` : 'Open tasks per person'}
    >
      <div className="flex flex-col gap-2">
        {shown.map((r) => {
          const person = getPersonInfo(r.slug)
          const body = (
            <>
              <div style={{ width: 22, height: 22, flexShrink: 0 }}>
                <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={22} decorative />
              </div>
              <span className="text-[12px] w-28 truncate" style={{ color: 'var(--ink)' }}>{person.name.split(' ')[0]}</span>
              <div className="flex-1 h-3.5 rounded overflow-hidden" style={{ backgroundColor: BAR_TRACK }}>
                <div className="h-full rounded" style={{ width: `${Math.max((r.open / max) * 100, r.open > 0 ? 4 : 0)}%`, transition: 'width 300ms ease', ...rampBar(1) }} />
              </div>
              <span className="text-[11px] w-6 text-right tabular-nums font-medium" style={{ color: 'var(--sk-t2)' }}>{r.open}</span>
              {isPi && (
                <>
                  <span className="text-[11px] w-14 text-right tabular-nums" style={{ color: 'var(--sk-t3)' }} title="Done of all tasks">{r.done}/{r.total}</span>
                  <span className="text-[10px] w-16 text-right tabular-nums" style={{ color: r.overdue > 0 ? 'var(--job-overdue)' : 'transparent' }}>{r.overdue > 0 ? `${r.overdue} overdue` : '-'}</span>
                </>
              )}
            </>
          )
          return isPi ? (
            <Link
              key={r.slug}
              to={`${PATHS.tasks}?assignee=${encodeURIComponent(r.slug)}`}
              className="flex items-center gap-2 rounded-md hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
              style={{ color: 'inherit', textDecoration: 'none' }}
              title={`${person.name}: ${r.open} open tasks · open Tasks filtered to ${person.name}`}
              aria-label={`${person.name}: ${r.open} open tasks`}
            >
              {body}
            </Link>
          ) : (
            <div key={r.slug} className="flex items-center gap-2">{body}</div>
          )
        })}
        {shown.length === 0 && <p className="text-center py-6 text-sm" style={dim}>No task data yet</p>}
      </div>
      <p className="text-[11px] mt-3" style={dim}>{openTotal} pending of {tasks.length} total tasks</p>
    </ChartCard>
  )
}

// ── Forecast (PI) ──────────────────────────────────────────

/** Tasks due per person for this week and the three after, Monday weeks; the selected week's weekdays sit under it. */
export function ForecastBlock({ tasks, insights, unavailable }: { tasks: TaskRow[]; insights?: InsightsDashboardData; unavailable?: ReactNode }) {
  const [byDay, setByDay] = useState(false)
  const { members, weeks } = useMemo(() => {
    const thisMonday = mondayOf(new Date())
    const wk = [0, 1, 2, 3].map((i) => {
      const start = addDays(thisMonday, i * 7)
      return { label: i === 0 ? 'This week' : i === 1 ? 'Next week' : `Week ${i + 1}`, start, end: addDays(start, 7) }
    })
    const memberMap = new Map<string, number[]>()
    for (const t of tasks) {
      if (t.completed || !t.due_date) continue
      const due = new Date(t.due_date + 'T12:00:00')
      const wi = wk.findIndex((w) => due >= w.start && due < w.end)
      if (wi < 0) continue
      if (!memberMap.has(t.assignee)) memberMap.set(t.assignee, [0, 0, 0, 0])
      memberMap.get(t.assignee)![wi]++
    }
    const list = [...memberMap.entries()]
      .map(([slug, counts]) => ({ slug, counts, total: counts.reduce((a, b) => a + b, 0) }))
      .filter((m) => m.total > 0)
      .sort((a, b) => b.total - a.total)
    return { members: list, weeks: wk }
  }, [tasks])

  const cell = (count: number) => (
    count === 0 ? 'var(--border-subtle)'
      : count <= 2 ? 'color-mix(in srgb, var(--job-accent) 12%, transparent)'
      : count <= 5 ? 'color-mix(in srgb, var(--job-accent) 25%, transparent)'
      : 'color-mix(in srgb, var(--job-accent) 40%, transparent)'
  )
  const daily = insights ? [...insights.workloadHeatmap].sort((a, b) => dayTotal(b.days) - dayTotal(a.days)) : []

  return (
    <ChartCard title="Forecast" count="Tasks due, 4 weeks · PI only">
      {members.length === 0 ? (
        <EmptyState compact icon={<EmptyStateArt variant="tasks" title="No tasks" />} title="No dated open tasks in the next four weeks" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(4, 1fr)', gap: 2 }}>
          <div />
          {weeks.map((w) => (
            <div key={w.label} className="text-center text-[11px] pb-2" style={{ color: 'var(--sk-t3)' }}>{w.label}</div>
          ))}
          {members.map(({ slug, counts }) => {
            const person = getPersonInfo(slug)
            return (
              <div key={slug} style={{ display: 'contents' }}>
                <div className="flex items-center gap-2 pr-2" style={{ height: 36 }}>
                  <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={22} decorative />
                  <span className="text-[11px] truncate" style={{ color: 'var(--ink)' }}>{person.name.split(' ')[0]}</span>
                </div>
                {counts.map((count, wi) => (
                  <div
                    key={wi}
                    className="flex items-center justify-center rounded"
                    style={{ background: cell(count), height: 36, fontSize: 13, fontWeight: count > 5 ? 600 : 500, color: count === 0 ? 'var(--sk-t3)' : 'var(--sk-t1)' }}
                  >
                    {count}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {!insights && unavailable && <div className="mt-4">{unavailable}</div>}
      {insights && (
        <div className="mt-4">
          <button type="button" className="tk-btn tk-sm" aria-expanded={byDay ? 'true' : 'false'} onClick={() => setByDay((v) => !v)}>
            {byDay ? 'Hide' : 'Show'} weekdays for {insights.week}
          </button>
          {byDay && (
            <WeekdayGrid rows={daily} />
          )}
        </div>
      )}
    </ChartCard>
  )
}

type Days = InsightsDashboardData['workloadHeatmap'][number]['days']
const dayTotal = (d: Days) => d.mon + d.tue + d.wed + d.thu + d.fri

function WeekdayGrid({ rows }: { rows: InsightsDashboardData['workloadHeatmap'] }) {
  const keys: (keyof Days)[] = ['mon', 'tue', 'wed', 'thu', 'fri']
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const cellColor = (n: number): string => {
    if (n === 0) return 'var(--border-subtle)'
    if (n <= 3) return 'color-mix(in oklch, var(--stage-fill-data-collection) 30%, transparent)'
    if (n <= 8) return 'color-mix(in oklch, var(--stage-fill-data-collection) 60%, transparent)'
    return 'var(--stage-fill-data-collection)'
  }
  if (rows.length === 0) return <p className="text-sm mt-3" style={dim}>No tasks scheduled for that week</p>
  return (
    <div className="mt-3">
      <div role="grid" aria-label="Tasks due this week per member per weekday" style={{ display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', gap: 'var(--sp-xs)', alignItems: 'center' }}>
        <span aria-hidden="true" />
        {labels.map((l) => (
          <span key={l} role="columnheader" className="text-center text-[11px]" style={{ color: 'var(--sk-t3)' }}>{l}</span>
        ))}
        {rows.map((row) => {
          const person = getPersonInfo(row.slug)
          return (
            <div key={row.slug} style={{ display: 'contents' }}>
              <Link
                to={PATHS.teamMember(row.slug)}
                role="rowheader"
                className="text-xs truncate pr-2"
                style={{ color: 'var(--ink)', textDecoration: 'none' }}
                title={`Open ${person.name}'s profile`}
              >
                {person.name.split(' ')[0]}
              </Link>
              {keys.map((d) => (
                <div
                  key={d}
                  role="gridcell"
                  aria-label={`${person.name}: ${d}: ${row.days[d]} open tasks`}
                  className="flex items-center justify-center"
                  style={{ height: 22, borderRadius: 'var(--radius-sm)', background: cellColor(row.days[d]), fontSize: 10, color: row.days[d] >= 4 ? '#fff' : 'var(--sk-t2)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.days[d] > 0 ? row.days[d] : ''}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Commitments (PI) ───────────────────────────────────────

function CompletionRing({ rate, size = 120 }: { rate: number; size?: number }) {
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (rate / 100) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--sk-t1)" strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  )
}

export function CommitmentsBlock({ data }: { data?: PIDashboardData }) {
  const c = data?.commitments
  const rate = c ? commitmentRate(c) : 0
  return (
    <ChartCard title="Commitments" count="PI only">
      <div className="flex items-center gap-8 flex-wrap">
        <div className="relative flex-shrink-0">
          <CompletionRing rate={rate} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{rate}%</span>
            <span className="text-[10px]" style={{ color: 'var(--slate)' }}>kept</span>
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm mb-3" style={{ color: 'var(--ink)', lineHeight: 1.5 }}>
            You kept <strong style={{ color: 'var(--sk-t1)' }}>{c?.completed || 0}</strong> of <strong>{c?.total || 0}</strong> promises to your team.
          </p>
          <StatRow
            stats={[
              { label: 'Completed', value: c?.completed || 0 },
              { label: 'Total', value: c?.total || 0 },
              { label: 'Overdue', value: c?.overdue || 0, rule: 'o' },
            ]}
          />
        </div>
      </div>
    </ChartCard>
  )
}

// ── Activity ───────────────────────────────────────────────

const RANGE_DAYS = { '7d': 30, '4w': 90, '3m': 180, 'all': 365 } as const

export function RangePills() {
  const { range, setRange } = useRangeParam()
  return (
    <SegmentedToggle
      ariaLabel="Range"
      value={range}
      onChange={setRange}
      options={RANGES.map((r) => ({ value: r, label: r === 'all' ? 'All' : r.toUpperCase() }))}
    />
  )
}

/** The lab's activity this week (with last week's delta and an 8-week line) and the lab heatmap. */
export function ActivityBlock({ stats }: { stats: { activityCount: number; activityPrior: number; spark: number[] } }) {
  const { range } = useRangeParam()
  return (
    <ChartCard title="Lab activity" right={<RangePills />}>
      <StatRow stats={[{ label: 'Activity', value: stats.activityCount, previous: stats.activityPrior, previousLabel: 'vs last week', spark: stats.spark }]} />
      <div className="mt-4">
        <ActivityHeatmap days={RANGE_DAYS[range]} />
      </div>
    </ChartCard>
  )
}

// ── Lab progress (members) ─────────────────────────────────

/** What a non-PI sees where the PI blocks sit: the lab's totals, no individual metrics. */
export function LabProgressBlock({ completed, pending }: { completed: number; pending: number }) {
  return (
    <ChartCard title="Lab progress this week">
      <div className="text-center py-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-3xl font-bold" style={{ color: 'var(--job-accent)' }}>{completed}</span>
          <span className="text-sm" style={{ color: 'var(--slate)' }}>tasks completed</span>
        </div>
        <p className="text-xs" style={dim}>{pending} still pending across the lab</p>
      </div>
      <div className="text-center pt-3 mt-3" style={{ borderTop: '1px dashed var(--sk-line)' }}>
        <p style={{ fontSize: 'var(--value-size)', color: 'var(--muted)' }}>Individual performance metrics are visible to PIs only</p>
      </div>
    </ChartCard>
  )
}
