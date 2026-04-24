import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Shield,
  Target,
  Users,
  BookOpen,
  DollarSign,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  LineChart,
  Printer,
  Copy,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import MetricCard from '../../components/MetricCard'
import EmptyState from '../../components/EmptyState'
import { CardSkeleton } from '../../components/LoadingSkeleton'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { getPersonInfo } from '../../data/team'
import Avatar from '../../components/Avatar'

// ── Types ──────────────────────────────────────────────────

interface PIDashboardData {
  commitments: {
    total: number
    completed: number
    overdue: number
  }
  responseMetrics: {
    avg_days: number
    avg_days_recent: number
    avg_days_prior: number
    trend: 'improving' | 'slowing' | 'stable' | 'insufficient_data'
    total_tasks: number
  }
  menteeVelocity: Array<{
    slug: string
    name: string
    pub_count: number
    rate: number
    first_year: number | null
  }>
  grantPipeline: {
    total: number
    pending: number
    active: number
    active_funding: number
  }
  teamEngagement: Array<{
    slug: string
    actions: number
    comments: number
    updates: number
    completions: number
    score: number
  }>
  pubsByQuarter: Array<{
    year: number
    quarter?: string
    count: number
  }>
  grantsFunnel: {
    submitted: number
    funded: number
  }
  projectsByStage: Array<{
    stage: string
    count: number
  }>
}

// ── Data hook ──────────────────────────────────────────────

function usePIDashboard() {
  return useQuery({
    queryKey: ['pi-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/pi-dashboard')
      if (!res.ok) throw new Error('Failed to fetch PI dashboard')
      const json = await res.json() as { data: PIDashboardData }
      return json.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── SVG Components ─────────────────────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

// Completion ring (reused from original)
function CompletionRing({ rate, size = 120 }: { rate: number; size?: number }) {
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (rate / 100) * circumference
  const color = rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--gold)' : 'var(--maroon)'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="var(--border-subtle)" strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  )
}

// Sparkline — inline SVG line chart
export function Sparkline({ values, width = 60, height = 24, color = 'var(--teal)' }: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const step = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Bar chart — Recharts bar chart for publications per quarter
function PubsBarChart({ data }: {
  data: Array<{ label: string; value: number }>
}) {
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={150}>
      <RechartsBarChart data={data} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
        <XAxis dataKey="label" tick={{ fill: 'var(--slate)', fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: 'var(--slate)', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--ink)',
          }}
          labelStyle={{ color: 'var(--ink)', fontWeight: 500 }}
          formatter={(value) => [value, 'Publications']}
        />
        <Bar dataKey="value" fill="var(--teal)" radius={[4, 4, 0, 0]} name="Publications" />
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}

// Stacked horizontal bar for projects by stage
function StackedBar({ segments, height = 28 }: {
  segments: Array<{ label: string; value: number; color: string }>
  height?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  let x = 0
  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {segments.map((seg, i) => {
          const w = (seg.value / total) * 100
          const el = (
            <rect
              key={i}
              x={x}
              y={0}
              width={w}
              height={height}
              rx={i === 0 ? 4 : 0}
              fill={seg.color}
              style={{ opacity: 0.85 }}
            />
          )
          x += w
          return el
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
            <span className="text-[10px]" style={{ color: 'var(--slate)' }}>
              {seg.label} ({seg.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Trend arrow component
export function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' | string }) {
  if (trend === 'up') return <ArrowUp size={12} style={{ color: 'var(--green)' }} />
  if (trend === 'down') return <ArrowDown size={12} style={{ color: 'var(--maroon)' }} />
  return <Minus size={12} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
}

// ── Main Component ─────────────────────────────────────────
// Route: /pi-analytics (also /pi/analytics) — C-07 audit: route verified renders real content.
// Widgets: commitment scorecard, response time, team engagement, mentee pub velocity, grant pipeline.

export default function PIAnalytics() {
  const { data, isLoading } = usePIDashboard()
  const [copied, setCopied] = useState(false)

  // Compute insights
  const insights = useMemo(() => {
    if (!data) return []
    const items: Array<{ text: string; type: 'good' | 'warning' | 'info' }> = []

    const commitRate = data.commitments.total > 0
      ? Math.round((data.commitments.completed / data.commitments.total) * 100)
      : 0
    if (commitRate >= 80) {
      items.push({ text: `Commitment completion rate is ${commitRate}% -- strong follow-through.`, type: 'good' })
    } else if (commitRate >= 50) {
      items.push({ text: `Commitment completion rate is ${commitRate}% -- room to improve.`, type: 'warning' })
    } else if (data.commitments.total > 0) {
      items.push({ text: `Commitment completion rate is ${commitRate}% -- needs attention.`, type: 'warning' })
    }

    if (data.commitments.overdue > 0) {
      items.push({
        text: `${data.commitments.overdue} commitment${data.commitments.overdue > 1 ? 's are' : ' is'} overdue.`,
        type: 'warning',
      })
    }

    if (data.responseMetrics.trend === 'improving') {
      items.push({
        text: `Task completion speed improving: ${data.responseMetrics.avg_days_recent}d avg vs. ${data.responseMetrics.avg_days_prior}d prior quarter.`,
        type: 'good',
      })
    } else if (data.responseMetrics.trend === 'slowing') {
      items.push({
        text: `Task completion slowing: ${data.responseMetrics.avg_days_recent}d avg vs. ${data.responseMetrics.avg_days_prior}d prior quarter.`,
        type: 'warning',
      })
    }

    const inactiveCount = data.teamEngagement.filter(m => m.actions < 3).length
    if (inactiveCount > 0) {
      items.push({
        text: `${inactiveCount} team member${inactiveCount > 1 ? 's had' : ' had'} fewer than 3 activities in 30 days -- consider check-ins.`,
        type: 'info',
      })
    }

    if (data.grantPipeline.active_funding > 0) {
      items.push({
        text: `Active grant funding: ${formatCurrency(data.grantPipeline.active_funding)} across ${data.grantPipeline.active} grant${data.grantPipeline.active !== 1 ? 's' : ''}.`,
        type: 'info',
      })
    }

    return items
  }, [data])

  if (isLoading) return <CardSkeleton count={6} />

  if (!data) {
    return (
      <div>
        <PageHeader
          icon={<Shield size={20} />}
          title="PI Dashboard"
          subtitle="Evidence-based leadership metrics"
        />
        <EmptyState
          icon={<LineChart size={40} />}
          title="No PI analytics available"
          subtitle="Metrics appear as your team logs activity, tasks, and publications."
        />
      </div>
    )
  }

  const commitRate = data && data.commitments.total > 0
    ? Math.round((data.commitments.completed / data.commitments.total) * 100)
    : 0

  const maxEngagement = data ? Math.max(...data.teamEngagement.map(m => m.actions), 1) : 1

  // Stage color mapping — theme-agnostic fills so #fff text passes AA in
  // BOTH modes. --slate/--teal/--gold flip to LIGHT dark-mode variants
  // where white text fails 2:1. r7 2026-04-22.
  const stageColors: Record<string, string> = {
    'Idea': 'var(--stage-fill-idea)',
    'Data Collection': 'var(--stage-fill-data-collection)',
    'Analysis': 'var(--stage-fill-analysis)',
    'Writing': 'var(--stage-fill-writing)',
    'Review': 'var(--stage-fill-review)',
    'Revisions': 'var(--stage-fill-revisions)',
    'Published': 'var(--stage-fill-published)',
    'Submitted': 'var(--stage-fill-submitted)',
  }

  return (
    <div>
      <PageHeader
        icon={<Shield size={20} />}
        title="PI Dashboard"
        subtitle="Evidence-based leadership metrics"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!data) return
              const lines = [
                'PI Dashboard Report',
                `Generated: ${new Date().toLocaleDateString()}`,
                '',
                `Commitment Rate: ${commitRate}% (${data.commitments.completed}/${data.commitments.total})`,
                `Overdue: ${data.commitments.overdue}`,
                `Avg Response: ${data.responseMetrics.avg_days}d (${data.responseMetrics.trend})`,
                `Active Funding: ${data.grantPipeline.active_funding ? formatCurrency(data.grantPipeline.active_funding) : '$0'} (${data.grantPipeline.active} grants)`,
                `Trainee Pubs: ${data.menteeVelocity.reduce((s, m) => s + m.pub_count, 0)}`,
                '',
                'Insights:',
                ...insights.map(i => `  ${i.type === 'good' ? '+' : i.type === 'warning' ? '!' : '-'} ${i.text}`),
              ]
              navigator.clipboard.writeText(lines.join('\n'))
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: copied ? 'var(--green)' : 'var(--slate)', border: '1px solid var(--border-subtle)', background: 'none', cursor: 'pointer', opacity: 0.85 }}
          >
            <Copy size={11} />
            {copied ? 'Copied' : 'Copy Report'}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: 'var(--slate)', border: '1px solid var(--border-subtle)', background: 'none', cursor: 'pointer', opacity: 0.85 }}
          >
            <Printer size={11} />
            Print
          </button>
        </div>
      </PageHeader>

      {/* Top-line hero stats — DD-6 display variant (Fraunces 60px + gold label) */}
      <motion.div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" variants={staggerContainer} initial="hidden" animate="visible">
        <motion.div variants={staggerItem}><MetricCard
          variant="display"
          icon={Target}
          label="Commitments Kept"
          value={`${commitRate}%`}
          color={commitRate >= 80 ? 'var(--green)' : commitRate >= 60 ? 'var(--gold)' : 'var(--maroon)'}
          subtitle={`${data?.commitments.completed || 0} of ${data?.commitments.total || 0}`}
        /></motion.div>
        <motion.div variants={staggerItem}><MetricCard
          variant="display"
          icon={Clock}
          label="Avg Response"
          value={`${data?.responseMetrics.avg_days || 0}d`}
          color="var(--teal)"
          subtitle={data?.responseMetrics.trend === 'improving' ? 'Getting faster' : data?.responseMetrics.trend === 'slowing' ? 'Getting slower' : 'Stable'}
        /></motion.div>
        <motion.div variants={staggerItem}><MetricCard
          variant="display"
          icon={DollarSign}
          label="Active Funding"
          value={data?.grantPipeline.active_funding ? formatCurrency(data.grantPipeline.active_funding) : '$0'}
          color="var(--gold)"
          subtitle={`${data?.grantPipeline.active || 0} active grants`}
        /></motion.div>
        <motion.div variants={staggerItem}><MetricCard
          variant="display"
          icon={BookOpen}
          label="Trainee Pubs"
          value={data?.menteeVelocity.reduce((s, m) => s + m.pub_count, 0) || 0}
          color="var(--green)"
          subtitle={`${data?.menteeVelocity.length || 0} trainees`}
        /></motion.div>
      </motion.div>

      {/* Two-column: Commitment Scorecard + Response Time */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commitment Scorecard */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-normal uppercase tracking-wider"
              style={{ color: 'var(--gold)' }}
            >
              Commitment Scorecard
            </h3>
          </div>
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-8 flex-wrap">
              <div className="relative flex-shrink-0">
                <CompletionRing rate={commitRate} size={120} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className="text-2xl font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {commitRate}%
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: 'var(--slate)' }}
                  >
                    kept
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p
                  className="text-sm mb-3"
                  style={{ color: 'var(--ink)', lineHeight: 1.5 }}
                >
                  You kept{' '}
                  <strong style={{ color: 'var(--teal)' }}>{data?.commitments.completed || 0}</strong>{' '}
                  of <strong>{data?.commitments.total || 0}</strong> promises to your team.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard icon={CheckCircle2} label="Completed" value={data?.commitments.completed || 0} color="var(--green)" />
                  <MetricCard icon={Target} label="Total" value={data?.commitments.total || 0} color="var(--teal)" />
                  <MetricCard icon={AlertTriangle} label="Overdue" value={data?.commitments.overdue || 0} color="var(--maroon)" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Response Time Metrics */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-normal uppercase tracking-wider"
              style={{ color: 'var(--gold)' }}
            >
              Response Time
            </h3>
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
              Task creation to completion
            </span>
          </div>
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-6 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-3xl font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {data?.responseMetrics.avg_days || 0}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>
                    days avg
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {data?.responseMetrics.trend === 'improving' ? (
                    <>
                      <TrendingDown size={14} style={{ color: 'var(--green)' }} />
                      <span className="text-xs" style={{ color: 'var(--green)' }}>
                        Improving
                      </span>
                    </>
                  ) : data?.responseMetrics.trend === 'slowing' ? (
                    <>
                      <TrendingUp size={14} style={{ color: 'var(--maroon)' }} />
                      <span className="text-xs" style={{ color: 'var(--maroon)' }}>
                        Slowing
                      </span>
                    </>
                  ) : (
                    <>
                      <Minus size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
                      <span className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                        Stable
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--teal-hover)' }}>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
                    Last 90 days
                  </span>
                  <div
                    className="text-lg font-semibold"
                    style={{ color: 'var(--teal)' }}
                  >
                    {data?.responseMetrics.avg_days_recent || 0}d
                  </div>
                </div>
                <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(100, 116, 139, 0.04)' }}>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
                    Prior 90 days
                  </span>
                  <div
                    className="text-lg font-semibold"
                    style={{ color: 'var(--slate)' }}
                  >
                    {data?.responseMetrics.avg_days_prior || 0}d
                  </div>
                </div>
              </div>
            </div>
            <p
              className="text-xs"
              style={{ color: 'var(--slate)', opacity: 0.75 }}
            >
              Based on {data?.responseMetrics.total_tasks || 0} completed tasks
            </p>
          </div>
        </div>
      </div>

      {/* Two-column: Team Engagement + Mentee Velocity */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Engagement Score */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-normal uppercase tracking-wider"
              style={{ color: 'var(--gold)' }}
            >
              Team Engagement
            </h3>
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
              Last 30 days
            </span>
          </div>
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
            {data && data.teamEngagement.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {data.teamEngagement.map((member) => {
                  const person = getPersonInfo(member.slug)
                  const barWidth = (member.actions / maxEngagement) * 100
                  return (
                    <Link
                      key={member.slug}
                      to={`/team/${member.slug}/trajectory`}
                      title={`Open ${person.name}'s trajectory · ${member.score} score`}
                      className="flex items-center gap-3 rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                      style={{ textDecoration: 'none' }}
                    >
                      <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                        <Avatar
                          name={person.name}
                          initials={person.initials}
                          photoUrl={person.photoUrl}
                          variant="ice"
                          size="tight"
                        />
                      </div>
                      <span
                        className="text-xs w-28 truncate"
                        style={{ color: 'var(--ink)' }}
                      >
                        {person.name}
                      </span>
                      <div
                        className="flex-1 h-5 rounded overflow-hidden"
                        style={{ backgroundColor: 'var(--border-subtle)' }}
                      >
                        <div
                          className="h-full rounded flex items-center px-2"
                          style={{
                            width: `${Math.max(barWidth, 8)}%`,
                            // Theme-agnostic dark fills so #fff passes AA in
                            // both modes. --slate/--gold flip to LIGHT
                            // dark-mode variants (#dcb355 gold dark, #b0b5b9
                            // slate dark) where white text fails ~2:1.
                            // r7 2026-04-22.
                            backgroundColor: member.actions < 3 ? 'var(--stage-fill-idea)' : 'var(--stage-fill-analysis)',
                            transition: 'width 0.6s ease',
                            minWidth: 24,
                          }}
                        >
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: '#fff' }}
                          >
                            {member.actions}
                          </span>
                        </div>
                      </div>
                      <span
                        className="text-[10px] w-8 text-right"
                        style={{ color: 'var(--teal)' }}
                        title={`Score: ${member.score}`}
                      >
                        {member.score}
                      </span>
                    </Link>
                  )
                })}
                <div className="flex items-center gap-2 mt-1 pt-2" style={{ borderTop: '1px dashed var(--border-subtle)' }}>
                  <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                    Score = comments x3 + updates x2 + completions x1
                  </span>
                </div>
              </div>
            ) : (
              <p
                className="text-center py-6 text-sm"
                style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
              >
                No activity data for the last 30 days
              </p>
            )}
          </div>
        </div>

        {/* Mentee Publication Velocity */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-normal uppercase tracking-wider"
              style={{ color: 'var(--gold)' }}
            >
              Mentee Publication Velocity
            </h3>
          </div>
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
            {data && data.menteeVelocity.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] uppercase tracking-wider pb-2" style={{ color: 'var(--slate)' }}>
                      Mentee
                    </th>
                    <th className="text-right text-[10px] uppercase tracking-wider pb-2" style={{ color: 'var(--slate)' }}>
                      Papers
                    </th>
                    <th className="text-right text-[10px] uppercase tracking-wider pb-2" style={{ color: 'var(--slate)' }}>
                      Rate
                    </th>
                    <th className="text-right text-[10px] uppercase tracking-wider pb-2" style={{ color: 'var(--slate)' }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.menteeVelocity.map((mentee) => {
                    const person = getPersonInfo(mentee.slug)
                    return (
                      <tr key={mentee.slug} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                              <Avatar
                                name={person.name}
                                initials={person.initials}
                                photoUrl={person.photoUrl}
                                variant="gold"
                                size="xs"
                              />
                            </div>
                            <span className="text-sm" style={{ color: 'var(--ink)' }}>
                              {mentee.name}
                            </span>
                          </div>
                        </td>
                        <td className="text-right text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                          {mentee.pub_count}
                        </td>
                        <td className="text-right text-sm" style={{ color: 'var(--teal)' }}>
                          {mentee.rate > 0 ? `${mentee.rate}/yr` : '--'}
                        </td>
                        <td className="text-right">
                          {mentee.pub_count > 0 ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                color: 'var(--green)',
                                backgroundColor: 'var(--green-hover)',
                              }}
                            >
                              <TrendingUp size={10} />
                              Publishing
                            </span>
                          ) : (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                color: 'var(--slate)',
                                backgroundColor: 'var(--border-subtle)',
                              }}
                            >
                              Pre-pub
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-center py-6 text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                No trainees/fellows in the system
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Lab Output Dashboard — Two columns: Pubs per Year + Grants/Projects */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Publications per Year */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-normal uppercase tracking-wider"
              style={{ color: 'var(--gold)' }}
            >
              Publications per Year
            </h3>
          </div>
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
            {data && data.pubsByQuarter.length > 0 ? (
              <PubsBarChart
                data={data.pubsByQuarter.map(q => ({
                  label: `'${String(q.year).slice(2)}`,
                  value: q.count,
                }))}
              />
            ) : (
              <p className="text-center py-6 text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                No publication data
              </p>
            )}
          </div>
        </div>

        {/* Grant Pipeline + Projects by Stage */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-normal uppercase tracking-wider"
              style={{ color: 'var(--gold)' }}
            >
              Grant Pipeline & Projects
            </h3>
          </div>
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
            {/* Grants: submitted vs funded */}
            <div className="mb-5">
              <h4 className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>
                Grants: Submitted vs Funded
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard icon={Target} label="Submitted" value={data?.grantsFunnel.submitted || 0} color="var(--gold)" />
                <MetricCard icon={CheckCircle2} label="Funded" value={data?.grantsFunnel.funded || 0} color="var(--green)" />
              </div>
              {data && data.grantsFunnel.submitted > 0 && (
                <div className="mt-2">
                  <div
                    className="h-2.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--border-subtle)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((data.grantsFunnel.funded / data.grantsFunnel.submitted) * 100)}%`,
                        backgroundColor: 'var(--green)',
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                  <span className="text-[10px] mt-1" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                    {Math.round((data.grantsFunnel.funded / data.grantsFunnel.submitted) * 100)}% success rate
                  </span>
                </div>
              )}
            </div>

            {/* Projects by stage */}
            {data && data.projectsByStage.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>
                  Active Projects by Stage
                </h4>
                <StackedBar
                  segments={data.projectsByStage.map(s => ({
                    label: s.stage,
                    value: s.count,
                    color: stageColors[s.stage] || 'var(--slate)',
                  }))}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leadership Insights */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={14} style={{ color: 'var(--gold)' }} />
          <h3
            className="text-xs font-normal uppercase tracking-wider"
            style={{ color: 'var(--gold)' }}
          >
            Leadership Insights
          </h3>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
          {insights.length > 0 ? (
            <div className="flex flex-col gap-3">
              {insights.map((insight, i) => {
                const iconMap = {
                  good: CheckCircle2,
                  warning: AlertTriangle,
                  info: Lightbulb,
                }
                const colorMap = {
                  good: 'var(--green)',
                  warning: 'var(--maroon)',
                  info: 'var(--teal)',
                }
                const bgMap = {
                  good: 'var(--green-hover)',
                  warning: 'var(--maroon-hover)',
                  info: 'var(--teal-hover)',
                }
                const InsightIcon = iconMap[insight.type]
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: bgMap[insight.type] }}
                  >
                    <InsightIcon
                      size={16}
                      style={{ color: colorMap[insight.type], flexShrink: 0, marginTop: 1 }}
                    />
                    <p
                      className="text-sm"
                      style={{
                        color: 'var(--ink)',
                        lineHeight: 1.5,
                      }}
                    >
                      {insight.text}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p
              className="text-center py-4 text-sm"
              style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
            >
              Not enough data to generate insights yet
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
