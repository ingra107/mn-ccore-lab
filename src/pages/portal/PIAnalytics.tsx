import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
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
} from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import MetricCard from '../../components/MetricCard'
import { useAuth } from '../../hooks/useAuth'
import { getPersonInfo } from '../../data/team'
import Avatar from '../../components/Avatar'

const PI_EMAILS = ['ningraha@umn.edu', 'sandb029@umn.edu', 'nicholas.ingraham@gmail.com']

interface PIAnalyticsData {
  commitments: {
    total: number
    completed: number
    overdue: number
  }
  responseMetrics: {
    total_updates: number
    response_rate: number
  }
  menteeVelocity: Array<{
    slug: string
    name: string
    pub_count: number
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
  }>
}

function usePIAnalytics() {
  return useQuery({
    queryKey: ['pi-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/pi/analytics')
      if (!res.ok) throw new Error('Failed to fetch PI analytics')
      const json = await res.json() as { data: PIAnalyticsData }
      return json.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`
  }
  return `$${amount.toLocaleString()}`
}

// SVG ring chart for commitment completion
function CompletionRing({ rate, size = 120 }: { rate: number; size?: number }) {
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (rate / 100) * circumference
  const color = rate >= 80 ? 'var(--green, #22c55e)' : rate >= 60 ? 'var(--gold)' : 'var(--maroon)'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border-light)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  )
}

export default function PIAnalytics() {
  const { user } = useAuth()
  const isPi = user?.email ? PI_EMAILS.includes(user.email) : false
  const { data, isLoading } = usePIAnalytics()

  // Compute insights
  const insights = useMemo(() => {
    if (!data) return []
    const items: Array<{ text: string; type: 'good' | 'warning' | 'info' }> = []

    // Commitment completion
    const commitRate = data.commitments.total > 0
      ? Math.round((data.commitments.completed / data.commitments.total) * 100)
      : 0
    if (commitRate >= 80) {
      items.push({ text: `Your commitment completion rate is ${commitRate}% -- strong follow-through.`, type: 'good' })
    } else if (commitRate >= 50) {
      items.push({ text: `Your commitment completion rate is ${commitRate}% -- room to improve.`, type: 'warning' })
    } else if (data.commitments.total > 0) {
      items.push({ text: `Your commitment completion rate is ${commitRate}% -- needs attention.`, type: 'warning' })
    }

    // Overdue commitments
    if (data.commitments.overdue > 0) {
      items.push({
        text: `${data.commitments.overdue} commitment${data.commitments.overdue > 1 ? 's are' : ' is'} overdue -- consider prioritizing or renegotiating.`,
        type: 'warning',
      })
    }

    // Inactive team members
    const inactiveCount = data.teamEngagement.filter(m => m.actions < 3).length
    if (inactiveCount > 0) {
      items.push({
        text: `${inactiveCount} team member${inactiveCount > 1 ? 's had' : ' had'} fewer than 3 activities in the last 30 days -- consider check-ins.`,
        type: 'info',
      })
    }

    // Grant funding
    if (data.grantPipeline.active_funding > 0) {
      items.push({
        text: `Active grant funding: ${formatCurrency(data.grantPipeline.active_funding)} across ${data.grantPipeline.active} grant${data.grantPipeline.active !== 1 ? 's' : ''}.`,
        type: 'info',
      })
    }

    // Response rate
    if (data.responseMetrics.total_updates > 0 && data.responseMetrics.response_rate !== null) {
      const rr = Math.round((data.responseMetrics.response_rate || 0) * 100)
      if (rr < 50) {
        items.push({
          text: `Only ${rr}% of project updates received follow-up comments -- team may need more engagement prompts.`,
          type: 'warning',
        })
      }
    }

    return items
  }, [data])

  // Not a PI
  if (!isPi) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: 'rgba(122,0,25,0.06)' }}
        >
          <Shield size={24} style={{ color: 'var(--maroon)' }} />
        </div>
        <h2
          className="text-xl font-semibold mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
        >
          PI Access Only
        </h2>
        <p className="text-sm max-w-md" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
          This dashboard contains leadership analytics and is restricted to principal investigators.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  const commitRate = data && data.commitments.total > 0
    ? Math.round((data.commitments.completed / data.commitments.total) * 100)
    : 0

  const maxEngagement = data ? Math.max(...data.teamEngagement.map(m => m.actions), 1) : 1

  return (
    <div>
      <SectionHeader
        icon={Shield}
        title="PI Dashboard"
        subtitle="Leadership effectiveness metrics -- for self-improvement, not evaluation"
      />

      {/* Commitment Scorecard */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} style={{ color: 'var(--gold)' }} />
          <h3
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
          >
            Commitment Scorecard
          </h3>
        </div>
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-8 flex-wrap">
            {/* Ring chart */}
            <div className="relative flex-shrink-0">
              <CompletionRing rate={commitRate} size={120} />
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <span
                  className="text-2xl font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}
                >
                  {commitRate}%
                </span>
                <span
                  className="text-[10px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}
                >
                  kept
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1 min-w-[200px]">
              <p
                className="text-sm mb-3"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)', lineHeight: 1.5 }}
              >
                You kept{' '}
                <strong style={{ color: 'var(--teal)' }}>{data?.commitments.completed || 0}</strong>{' '}
                of{' '}
                <strong>{data?.commitments.total || 0}</strong>{' '}
                promises to your team.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <MetricCard
                  icon={CheckCircle2}
                  label="Completed"
                  value={data?.commitments.completed || 0}
                  color="var(--green, #22c55e)"
                />
                <MetricCard
                  icon={Target}
                  label="Total"
                  value={data?.commitments.total || 0}
                  color="var(--teal)"
                />
                <MetricCard
                  icon={AlertTriangle}
                  label="Overdue"
                  value={data?.commitments.overdue || 0}
                  color="var(--maroon)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Engagement Heatmap */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} style={{ color: 'var(--gold)' }} />
          <h3
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
          >
            Team Engagement
          </h3>
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.6 }}>
            Last 30 days
          </span>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
          {data && data.teamEngagement.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {data.teamEngagement.map((member) => {
                const person = getPersonInfo(member.slug)
                const barWidth = (member.actions / maxEngagement) * 100
                return (
                  <div key={member.slug} className="flex items-center gap-3">
                    <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                      <Avatar
                        name={person.name}
                        initials={person.initials}
                        photoUrl={person.photoUrl}
                        size="sm"
                        variant="ice"
                        className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[8px]"
                      />
                    </div>
                    <span
                      className="text-xs w-28 truncate"
                      style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}
                    >
                      {person.name}
                    </span>
                    <div
                      className="flex-1 h-5 rounded overflow-hidden"
                      style={{ backgroundColor: 'var(--border-light)' }}
                    >
                      <div
                        className="h-full rounded flex items-center px-2"
                        style={{
                          width: `${Math.max(barWidth, 8)}%`,
                          backgroundColor: member.actions < 3 ? 'var(--slate)' : 'var(--gold)',
                          opacity: member.actions < 3 ? 0.4 : 1,
                          transition: 'width 0.6s ease',
                          minWidth: 24,
                        }}
                      >
                        <span
                          className="text-[9px] font-semibold"
                          style={{ color: 'white', fontFamily: 'var(--font-mono)' }}
                        >
                          {member.actions}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p
              className="text-center py-6 text-sm"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}
            >
              No activity data for the last 30 days
            </p>
          )}
        </div>
      </div>

      {/* Two-column: Mentee Velocity + Grant Pipeline */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mentee Publication Velocity */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
            >
              Mentee Publication Velocity
            </h3>
          </div>
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
            {data && data.menteeVelocity.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr>
                    <th
                      className="text-left text-[10px] uppercase tracking-wider pb-2"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}
                    >
                      Mentee
                    </th>
                    <th
                      className="text-right text-[10px] uppercase tracking-wider pb-2"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}
                    >
                      Papers
                    </th>
                    <th
                      className="text-right text-[10px] uppercase tracking-wider pb-2"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.menteeVelocity.map((mentee) => {
                    const person = getPersonInfo(mentee.slug)
                    return (
                      <tr
                        key={mentee.slug}
                        className="border-t"
                        style={{ borderColor: 'var(--border-light)' }}
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                              <Avatar
                                name={person.name}
                                initials={person.initials}
                                photoUrl={person.photoUrl}
                                size="sm"
                                variant="gold"
                                className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]"
                              />
                            </div>
                            <span
                              className="text-sm"
                              style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}
                            >
                              {mentee.name}
                            </span>
                          </div>
                        </td>
                        <td
                          className="text-right text-sm font-semibold"
                          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
                        >
                          {mentee.pub_count}
                        </td>
                        <td className="text-right">
                          {mentee.pub_count > 0 ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--green, #22c55e)',
                                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                              }}
                            >
                              <TrendingUp size={10} />
                              Publishing
                            </span>
                          ) : (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--slate)',
                                backgroundColor: 'var(--border-light)',
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
              <p
                className="text-center py-6 text-sm"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}
              >
                No trainees/fellows in the system
              </p>
            )}
          </div>
        </div>

        {/* Grant Pipeline */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={14} style={{ color: 'var(--gold)' }} />
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
            >
              Grant Pipeline
            </h3>
          </div>
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                icon={CheckCircle2}
                label="Active Grants"
                value={data?.grantPipeline.active || 0}
                color="var(--green, #22c55e)"
              />
              <MetricCard
                icon={Target}
                label="Pending"
                value={data?.grantPipeline.pending || 0}
                color="var(--gold)"
              />
              <MetricCard
                icon={DollarSign}
                label="Active Funding"
                value={data?.grantPipeline.active_funding ? formatCurrency(data.grantPipeline.active_funding) : '$0'}
                color="var(--teal)"
              />
              <MetricCard
                icon={TrendingUp}
                label="Total Grants"
                value={data?.grantPipeline.total || 0}
                color="var(--ink)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Leadership Insights */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={14} style={{ color: 'var(--gold)' }} />
          <h3
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
          >
            Leadership Insights
          </h3>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
          {insights.length > 0 ? (
            <div className="flex flex-col gap-3">
              {insights.map((insight, i) => {
                const iconMap = {
                  good: CheckCircle2,
                  warning: AlertTriangle,
                  info: Lightbulb,
                }
                const colorMap = {
                  good: 'var(--green, #22c55e)',
                  warning: 'var(--maroon)',
                  info: 'var(--teal)',
                }
                const bgMap = {
                  good: 'rgba(34, 197, 94, 0.04)',
                  warning: 'rgba(122, 0, 25, 0.04)',
                  info: 'rgba(45, 138, 138, 0.04)',
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
                        fontFamily: 'var(--font-body)',
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
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}
            >
              Not enough data to generate insights yet
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
