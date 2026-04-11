import { useMemo, useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { ArrowLeft, Printer, BookOpen, BarChart3, FolderKanban, Flag, ClipboardList, MessageSquare, GitBranch, Users, FileText, CheckCircle2, Clock, AlertTriangle, TrendingUp } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useTrajectory, useContributions } from '../hooks/useApiData'
import type { TrajectoryData, ContributionsData } from '../hooks/useApiData'
import { getMemberBySlug } from '../data/team'
import ActivityHeatmap from '../components/ActivityHeatmap'

// ── Stage colors ───────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  Idea: 'var(--slate)',
  'Data Collection': '#5b8abf',
  Analysis: 'var(--teal)',
  Writing: 'var(--gold)',
  Review: 'var(--maroon)',
  Published: 'var(--green-light)',
}

// ── Cumulative Publication Curve ──────────────────────────

// Custom dot that only renders on months with new publications
function PubDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: { count: number } }
  if (!payload || payload.count === 0) return null
  return (
    <circle cx={cx} cy={cy} r={3.5} fill="var(--gold)" stroke="var(--cream, #fff)" strokeWidth={1.5} />
  )
}

function PublicationCurve({ publications }: { publications: TrajectoryData['publications'] }) {
  const { chartData, maxCount } = useMemo(() => {
    if (publications.length === 0) return { chartData: [], maxCount: 0 }

    // Sort chronologically
    const sorted = [...publications]
      .filter((p) => p.pub_date)
      .sort((a, b) => a.pub_date.localeCompare(b.pub_date))

    if (sorted.length === 0) return { chartData: [], maxCount: 0 }

    // Build month buckets from first pub to now
    const firstDate = new Date(sorted[0].pub_date + 'T12:00:00')
    const now = new Date()
    const monthList: string[] = []
    const d = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
    while (d <= now) {
      monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() + 1)
    }

    // Count cumulative pubs per month
    let cumulative = 0
    const data = monthList.map((month) => {
      const count = sorted.filter((p) => p.pub_date.slice(0, 7) === month).length
      cumulative += count
      // Format label: "24/01" style
      const label = month.slice(2).replace('-', '/')
      return { month, label, cumulative, count }
    })

    return { chartData: data, maxCount: cumulative }
  }, [publications])

  if (chartData.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      >
        <TrendingUp size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-md)' }} />
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          No publications with dates yet
        </p>
      </div>
    )
  }

  // Thin the X-axis tick labels when there are many months
  const tickInterval = chartData.length > 24 ? Math.floor(chartData.length / 6) - 1 : chartData.length > 12 ? 2 : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cumulative Publications Over Time
        </span>
        <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--teal)' }}>
          {maxCount}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--slate)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fill: 'var(--slate)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              color: 'var(--ink)',
            }}
            labelStyle={{ color: 'var(--ink)', fontWeight: 500 }}
            formatter={(value, name) => {
              if (name === 'cumulative') return [value, 'Total']
              return [value, name]
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="var(--teal)"
            strokeWidth={2}
            fill="rgba(45,138,138,0.08)"
            dot={<PubDot />}
            activeDot={{ r: 4, fill: 'var(--gold)', stroke: 'var(--cream, #fff)', strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Project Velocity (horizontal bars) ───────────────────

function ProjectVelocity({ projectStages }: { projectStages: TrajectoryData['projectStages'] }) {
  if (!projectStages || projectStages.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      >
        <FolderKanban size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-md)' }} />
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          No active projects to track velocity
        </p>
      </div>
    )
  }

  const maxDays = Math.max(...projectStages.map((p) => p.total_days), 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Time in Pipeline
        </span>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.6 }}>
          days in current stage / total days
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {projectStages.map((project, i) => {
          const stageColor = STAGE_COLORS[project.stage] || 'var(--slate)'
          const totalWidth = (project.total_days / maxDays) * 100
          const stageWidth = project.total_days > 0
            ? (project.days_in_stage / project.total_days) * 100
            : 100

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                <Link
                  to={`/projects/${project.slug}`}
                  style={{
                    fontSize: 'var(--value-size)',
                    fontWeight: 500,
                    color: 'var(--ink)',
                    textDecoration: 'none',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.title}
                </Link>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: stageColor,
                    background: `${stageColor}15`,
                    flexShrink: 0,
                  }}
                >
                  {project.stage}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    flex: 1,
                    height: '20px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--border-subtle, #e8eff5)',
                    position: 'relative',
                  }}
                >
                  {/* Total project time */}
                  <div
                    style={{
                      width: `${Math.max(totalWidth, 4)}%`,
                      height: '100%',
                      backgroundColor: 'var(--teal-emphasis)',
                      position: 'relative',
                    }}
                  >
                    {/* Current stage portion (right-aligned within total) */}
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: `${Math.max(stageWidth, 8)}%`,
                        backgroundColor: stageColor,
                        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    whiteSpace: 'nowrap',
                    minWidth: '60px',
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {project.days_in_stage}d / {project.total_days}d
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Task Metrics Row ─────────────────────────────────────

function TaskMetricsRow({ metrics }: { metrics: TrajectoryData['taskMetrics'] }) {
  if (!metrics || metrics.total === 0) {
    return null
  }

  const completionRate = metrics.total > 0
    ? Math.round((metrics.completed / metrics.total) * 100)
    : 0
  const overdueRate = metrics.total > 0
    ? Math.round((metrics.overdue / (metrics.total - metrics.completed)) * 100)
    : 0

  const cards = [
    {
      label: 'Completion Rate',
      value: `${completionRate}%`,
      color: completionRate > 70 ? 'var(--teal)' : completionRate > 40 ? 'var(--gold)' : 'var(--maroon)',
      icon: CheckCircle2,
      subtitle: `${metrics.completed} of ${metrics.total}`,
    },
    {
      label: 'Avg Days to Complete',
      value: metrics.avg_days != null ? `${metrics.avg_days}` : '--',
      color: 'var(--gold)',
      icon: Clock,
      subtitle: 'per task',
    },
    {
      label: 'Overdue',
      value: `${metrics.overdue}`,
      color: metrics.overdue > 0 ? 'var(--maroon)' : 'var(--teal)',
      icon: AlertTriangle,
      subtitle: metrics.total - metrics.completed > 0 ? `${overdueRate}% of open` : 'none open',
    },
    {
      label: 'Total Tasks',
      value: `${metrics.total}`,
      color: 'var(--ink)',
      icon: BarChart3,
      subtitle: `${metrics.total - metrics.completed} open`,
    },
  ]

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
    >
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="card"
            style={{
              padding: '1.25rem',
              borderLeft: `3px solid ${card.color}`,
              textAlign: 'center',
            }}
          >
            <Icon
              size={18}
              style={{ color: card.color, margin: '0 auto 0.5rem', display: 'block', opacity: 0.7 }}
              aria-hidden="true"
            />
            <div
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--ink)',
                lineHeight: 1,
              }}
            >
              {card.value}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--slate)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: '0.35rem',
              }}
            >
              {card.label}
            </div>
            {card.subtitle && (
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                  marginTop: '0.2rem',
                }}
              >
                {card.subtitle}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Publication Timeline ───────────────────────────────────

function PublicationTimeline({ publications }: { publications: TrajectoryData['publications'] }) {
  if (publications.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      >
        <BookOpen size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-md)' }} />
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          No publications yet
        </p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '2rem' }}>
      {/* Vertical connecting line */}
      <div
        style={{
          position: 'absolute',
          left: '7px',
          top: '8px',
          bottom: '8px',
          width: '2px',
          background: 'var(--teal)',
          opacity: 0.3,
          borderRadius: 'var(--radius-sm)',
        }}
      />

      {publications.map((pub, i) => (
        <motion.div
          key={pub.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          style={{
            position: 'relative',
            paddingBottom: i < publications.length - 1 ? '1.5rem' : 0,
          }}
        >
          {/* Gold dot */}
          <div
            style={{
              position: 'absolute',
              left: '-2rem',
              top: '6px',
              width: '16px',
              height: '16px',
              borderRadius: 'var(--radius-circle)',
              background: 'var(--gold)',
              border: '3px solid var(--cream, #ffffff)',
              zIndex: 'var(--z-base)',
            }}
          />

          <div
            className="card"
            style={{
              padding: '1rem 1.25rem',
              borderLeft: '3px solid var(--gold)',
            }}
          >
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--ink)',
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {pub.title}
            </h4>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.4rem',
              }}
            >
              {pub.journal && (
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--teal)',
                    fontStyle: 'italic',
                  }}
                >
                  {pub.journal}
                </span>
              )}
              {pub.journal && pub.pub_date && (
                <span style={{ color: 'var(--slate)', opacity: 0.3 }}>&middot;</span>
              )}
              {pub.pub_date && (
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    opacity: 0.7,
                  }}
                >
                  {pub.pub_date}
                </span>
              )}
            </div>
            {pub.doi && (
              <a
                href={pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 'var(--label-size)',
                  color: 'var(--teal)',
                  textDecoration: 'none',
                  marginTop: '0.25rem',
                  display: 'inline-block',
                }}
              >
                DOI
              </a>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ── Task Velocity Sparkline ────────────────────────────────

function TaskVelocity({ taskStats }: { taskStats: TrajectoryData['taskStats'] }) {
  // Pad to 12 months if needed
  const months = useMemo(() => {
    const now = new Date()
    const result: { month: string; label: string; completed: number; isCurrent: boolean }[] = []
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const found = taskStats.find((s) => s.month === key)
      result.push({
        month: key,
        label: key.slice(5), // "01", "02", etc.
        completed: found?.completed ?? 0,
        isCurrent: key === currentKey,
      })
    }
    return result
  }, [taskStats])

  const totalCompleted = months.reduce((sum, m) => sum + m.completed, 0)

  if (totalCompleted === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      >
        <BarChart3 size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-md)' }} />
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          No task completions in the last 12 months
        </p>
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <span
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--slate)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Tasks Completed -- Last 12 Months
        </span>
        <span
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--gold)',
          }}
        >
          {totalCompleted}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={months} barCategoryGap="15%">
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
            formatter={(value) => [value, 'Completed']}
          />
          <Bar dataKey="completed" radius={[3, 3, 0, 0]} name="Completed">
            {months.map((m, index) => (
              <Cell
                key={index}
                fill={m.isCurrent ? 'var(--teal)' : 'var(--gold)'}
                fillOpacity={m.completed === 0 ? 0.15 : m.isCurrent ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Active Projects Grid ───────────────────────────────────

function ActiveProjects({ projects }: { projects: TrajectoryData['projects'] }) {
  if (projects.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      >
        <FolderKanban size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-md)' }} />
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          No active projects
        </p>
      </div>
    )
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
    >
      {projects.map((project, i) => {
        const stageColor = STAGE_COLORS[project.stage] || 'var(--slate)'
        return (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
          >
            <Link
              to={`/projects/${project.slug}`}
              className="card block trajectory-project-card"
              style={{
                padding: '1.25rem',
                textDecoration: 'none',
                borderLeft: `3px solid ${stageColor}`,
                transition: 'border-color 0.2s, box-shadow 0.2s',
              } as React.CSSProperties}
            >
              <h4
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: '0 0 0.5rem',
                  lineHeight: 1.3,
                }}
              >
                {project.title}
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--label-size)',
                    fontWeight: 500,
                    color: stageColor,
                    background: `${stageColor}15`,
                  }}
                >
                  {project.stage}
                </span>
                {project.category && (
                  <span
                    style={{
                      fontSize: 'var(--label-size)',
                      color: 'var(--slate)',
                      opacity: 0.6,
                    }}
                  >
                    {project.category}
                  </span>
                )}
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Upcoming Milestones ────────────────────────────────────

function UpcomingMilestones({ milestones }: { milestones: TrajectoryData['milestones'] }) {
  if (milestones.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      >
        <Flag size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-md)' }} />
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          No milestones tracked
        </p>
      </div>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in14Days = new Date(today)
  in14Days.setDate(in14Days.getDate() + 14)

  return (
    <div className="space-y-2">
      {milestones.map((ms, i) => {
        const dueDate = ms.due_date ? new Date(ms.due_date + 'T12:00:00') : null
        const isOverdue = dueDate ? dueDate < today : false
        const isUpcoming = dueDate && !isOverdue ? dueDate <= in14Days : false
        const isComplete = ms.status === 'completed'

        let dateColor = 'var(--slate)'
        if (isComplete) dateColor = 'var(--teal)'
        else if (isOverdue) dateColor = 'var(--maroon)'
        else if (isUpcoming) dateColor = 'var(--gold)'

        return (
          <motion.div
            key={ms.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="card"
            style={{
              padding: '0.875rem 1.25rem',
              borderLeft: `3px solid ${dateColor}`,
              opacity: isComplete ? 0.5 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    margin: 0,
                    textDecoration: isComplete ? 'line-through' : 'none',
                  }}
                >
                  {ms.title}
                </h4>
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    opacity: 0.6,
                  }}
                >
                  {ms.project_title}
                </span>
              </div>
              {ms.due_date && (
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    fontWeight: isOverdue || isUpcoming ? 600 : 400,
                    color: dateColor,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {isOverdue ? 'overdue ' : ''}
                  {ms.due_date}
                </span>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof BookOpen
  title: string
  count?: number
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <Icon size={20} style={{ color: 'var(--gold)' }} aria-hidden="true" />
      <h2
        style={{
          fontWeight: 500,
          fontSize: '1.25rem',
          color: 'var(--ink)',
          margin: 0,
        }}
      >
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--slate)',
            opacity: 0.6,
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// ── Divider ────────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{
        height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--border-subtle, #e8eff5), transparent)',
        margin: '2.5rem 0',
      }}
    />
  )
}

// ── Period Selector ───────────────────────────────────────

const PERIODS = [30, 60, 90, 180, 365] as const

function PeriodSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (days: number) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {PERIODS.map((days) => {
        const active = value === days
        const label = days === 365 ? '1y' : `${days}d`
        return (
          <button
            key={days}
            onClick={() => onChange(days)}
            style={{
              fontSize: 'var(--label-size)',
              fontWeight: active ? 600 : 400,
              padding: '4px 10px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${active ? 'var(--gold)' : 'var(--border-light, #e8eff5)'}`,
              background: active ? 'var(--gold)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--slate)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Contribution Metric Card ──────────────────────────────

function ContribMetricCard({
  label,
  count,
  color,
  icon: Icon,
}: {
  label: string
  count: number
  color: string
  icon: typeof CheckCircle2
}) {
  return (
    <div
      className="card"
      style={{
        padding: '1.25rem',
        borderLeft: `3px solid ${color}`,
        textAlign: 'center',
      }}
    >
      <Icon
        size={20}
        style={{ color, margin: '0 auto 0.5rem', display: 'block', opacity: 0.7 }}
        aria-hidden="true"
      />
      <div
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          color: 'var(--ink)',
          lineHeight: 1,
        }}
      >
        {count}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: 'var(--slate)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: '0.35rem',
        }}
      >
        {label}
      </div>
    </div>
  )
}

// ── Contribution Timeline Entry ───────────────────────────

interface TimelineEntry {
  id: string
  type: 'task' | 'update' | 'comment' | 'decision' | 'meeting' | 'publication'
  title: string
  subtitle?: string
  timestamp: string
}

const TYPE_CONFIG: Record<
  TimelineEntry['type'],
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  task: { icon: CheckCircle2, color: 'var(--teal)', label: 'Task' },
  update: { icon: FileText, color: 'var(--gold)', label: 'Update' },
  comment: { icon: MessageSquare, color: 'var(--ink)', label: 'Comment' },
  decision: { icon: GitBranch, color: 'var(--maroon)', label: 'Decision' },
  meeting: { icon: Users, color: 'var(--teal)', label: 'Meeting' },
  publication: { icon: BookOpen, color: 'var(--gold)', label: 'Publication' },
}

function buildTimeline(data: ContributionsData): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const t of data.tasks) {
    entries.push({
      id: `task-${t.id}`,
      type: 'task',
      title: t.title || t.description || 'Task completed',
      subtitle: t.priority ? `Priority: ${t.priority}` : undefined,
      timestamp: t.completed_at,
    })
  }

  for (const u of data.updates) {
    entries.push({
      id: `update-${u.id}`,
      type: 'update',
      title: u.content.length > 120 ? u.content.slice(0, 120) + '...' : u.content,
      subtitle: u.update_type || undefined,
      timestamp: u.created_at,
    })
  }

  for (const c of data.comments) {
    entries.push({
      id: `comment-${c.id}`,
      type: 'comment',
      title: c.content.length > 120 ? c.content.slice(0, 120) + '...' : c.content,
      timestamp: c.created_at,
    })
  }

  for (const d of data.decisions) {
    entries.push({
      id: `decision-${d.id}`,
      type: 'decision',
      title: d.title,
      subtitle: d.outcome_status || undefined,
      timestamp: d.created_at,
    })
  }

  for (const m of data.meetings) {
    entries.push({
      id: `meeting-${m.id}`,
      type: 'meeting',
      title: m.title,
      timestamp: m.date + 'T12:00:00',
    })
  }

  for (const p of data.publications) {
    entries.push({
      id: `pub-${p.id}`,
      type: 'publication',
      title: p.title,
      subtitle: p.journal || undefined,
      timestamp: (p.pub_date || '') + 'T12:00:00',
    })
  }

  entries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
  return entries
}

function ContributionTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      >
        <ClipboardList size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-md)' }} />
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          No contributions in this period
        </p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '2rem' }}>
      {/* Vertical connecting line */}
      <div
        style={{
          position: 'absolute',
          left: '7px',
          top: '8px',
          bottom: '8px',
          width: '2px',
          background: 'var(--gold)',
          opacity: 0.2,
          borderRadius: 'var(--radius-sm)',
        }}
      />

      {entries.map((entry, i) => {
        const config = TYPE_CONFIG[entry.type]
        const Icon = config.icon
        const dateStr = entry.timestamp
          ? new Date(entry.timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : ''

        return (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.5), duration: 0.25 }}
            style={{
              position: 'relative',
              paddingBottom: i < entries.length - 1 ? '0.75rem' : 0,
            }}
          >
            {/* Type dot */}
            <div
              style={{
                position: 'absolute',
                left: '-2rem',
                top: '8px',
                width: '16px',
                height: '16px',
                borderRadius: 'var(--radius-circle)',
                background: config.color,
                border: '3px solid var(--cream, #ffffff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 'var(--z-base)',
              }}
            />

            <div
              className="card"
              style={{
                padding: '0.75rem 1rem',
                borderLeft: `3px solid ${config.color}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <Icon size={13} style={{ color: config.color, flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: '10px',
                        color: config.color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: 600,
                      }}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 'var(--value-size)',
                      color: 'var(--ink)',
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {entry.title}
                  </p>
                  {entry.subtitle && (
                    <span
                      style={{
                        fontSize: 'var(--label-size)',
                        color: 'var(--slate)',
                        opacity: 0.6,
                      }}
                    >
                      {entry.subtitle}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    opacity: 0.6,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {dateStr}
                </span>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Contributions Panel ───────────────────────────────────

function ContributionsPanel({ slug, memberName }: { slug: string; memberName: string }) {
  const [period, setPeriod] = useState(90)
  const { data: contributions, isLoading } = useContributions(slug, period)

  const timeline = useMemo(
    () => (contributions ? buildTimeline(contributions) : []),
    [contributions]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (!contributions) {
    return (
      <div className="py-16 text-center">
        <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
          Unable to load contribution data. Try refreshing the page.
        </p>
      </div>
    )
  }

  const s = contributions.summary

  return (
    <div>
      {/* Period selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            color: 'var(--slate)',
          }}
        >
          Showing last {period === 365 ? '1 year' : `${period} days`}
        </span>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Print header -- only visible in print */}
      <div className="contributions-print-header" style={{ display: 'none' }}>
        <h2
          style={{
            fontSize: '16pt',
            fontWeight: 500,
            margin: '0 0 4pt',
          }}
        >
          Contribution Portfolio -- {memberName}
        </h2>
        <p style={{ fontSize: '10pt', color: '#666', margin: 0 }}>
          {period === 365 ? '1 year' : `${period} days`} ending {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Summary stats grid */}
      <div
        className="grid gap-3 mb-8"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
      >
        <ContribMetricCard label="Tasks Completed" count={s.tasks_completed} color="var(--teal)" icon={CheckCircle2} />
        <ContribMetricCard label="Updates Posted" count={s.updates_posted} color="var(--gold)" icon={FileText} />
        <ContribMetricCard label="Comments Made" count={s.comments_made} color="var(--ink)" icon={MessageSquare} />
        <ContribMetricCard label="Decisions Made" count={s.decisions_made} color="var(--maroon)" icon={GitBranch} />
        <ContribMetricCard label="Meetings" count={s.meetings_contributed} color="var(--teal)" icon={Users} />
        <ContribMetricCard label="Publications" count={s.publications} color="var(--gold)" icon={BookOpen} />
      </div>

      <Divider />

      {/* Contribution timeline */}
      <section id="contribution-timeline">
        <SectionHeader icon={ClipboardList} title="Contribution Timeline" count={timeline.length} />
        <ContributionTimeline entries={timeline} />
      </section>
    </div>
  )
}

// ── Tab type ──────────────────────────────────────────────

type TabId = 'trajectory' | 'contributions'

// ── Main Page ──────────────────────────────────────────────

export default function TrajectoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const member = slug ? getMemberBySlug(slug) : undefined
  const { data: trajectory, isLoading } = useTrajectory(slug || '')
  const [activeTab, setActiveTab] = useState<TabId>('trajectory')

  usePageMeta(
    member ? `${member.name} — Development Trajectory | MN-CCORE Lab` : 'Trajectory | MN-CCORE Lab',
    member ? `Development trajectory for ${member.name} — publications, projects, and milestones.` : ''
  )

  if (!member) {
    return <Navigate to="/team" replace />
  }

  const displayName = member.credentials
    ? `${member.name}, ${member.credentials}`
    : member.name

  const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
    { id: 'trajectory', label: 'Trajectory', icon: BarChart3 },
    { id: 'contributions', label: 'Contributions', icon: ClipboardList },
  ]

  return (
    <div
      style={{
        maxWidth: '64rem',
        margin: '0 auto',
        padding: '2rem 1.5rem 4rem',
      }}
    >
      {/* Back link */}
      <Link
        to={`/team/${slug}`}
        className="inline-flex items-center gap-1.5 mb-6 no-print hover:!opacity-100 transition-opacity"
        style={{
          fontSize: '12px',
          color: 'var(--slate)',
          textDecoration: 'none',
          opacity: 0.7,
        }}
      >
        <ArrowLeft size={14} />
        Back to profile
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1.5rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Avatar */}
          {member.photoUrl ? (
            <img
              src={member.photoUrl}
              alt={member.name}
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--radius-circle)',
                objectFit: 'cover',
                border: '2px solid var(--gold)',
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--radius-circle)',
                background: 'linear-gradient(135deg, var(--gold), var(--teal))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--ink-bright, #fff)',
              }}
            >
              {member.initials}
            </div>
          )}

          <div>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {displayName}
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--slate)',
                margin: '0.25rem 0 0',
              }}
            >
              {member.role}
            </p>
          </div>
        </div>

        {/* Export button */}
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium no-print hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors"
          style={{
            fontSize: '12px',
            background: 'var(--ice)',
            color: 'var(--slate)',
            border: '1px solid var(--border-subtle, #e8eff5)',
            cursor: 'pointer',
          }}
        >
          <Printer size={14} />
          Export for Review
        </button>
      </motion.div>

      {/* Tab bar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: '0',
          borderBottom: '2px solid var(--border-subtle, #e8eff5)',
          marginBottom: '2rem',
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                fontSize: '12px',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--gold)' : 'var(--slate)',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                marginBottom: '-2px',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'trajectory' && (
          <motion.div
            key="trajectory"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-16">
                <div
                  className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
                />
              </div>
            )}

            {/* Content */}
            {!isLoading && trajectory && (
              <>
                {/* Section 0: Task Metrics */}
                {trajectory.taskMetrics && trajectory.taskMetrics.total > 0 && (
                  <>
                    <section id="task-metrics">
                      <SectionHeader icon={CheckCircle2} title="Task Metrics" />
                      <TaskMetricsRow metrics={trajectory.taskMetrics} />
                    </section>
                    <Divider />
                  </>
                )}

                {/* Section 1: Publication Curve */}
                <section id="publication-curve">
                  <SectionHeader icon={TrendingUp} title="Publication Curve" count={trajectory.publications.length} />
                  <PublicationCurve publications={trajectory.publications} />
                </section>

                <Divider />

                {/* Section 2: Project Velocity */}
                {trajectory.projectStages && trajectory.projectStages.length > 0 && (
                  <>
                    <section id="project-velocity">
                      <SectionHeader icon={FolderKanban} title="Project Velocity" count={trajectory.projectStages.length} />
                      <ProjectVelocity projectStages={trajectory.projectStages} />
                    </section>
                    <Divider />
                  </>
                )}

                {/* Section 3: Task Velocity */}
                <section id="task-velocity">
                  <SectionHeader icon={BarChart3} title="Task Velocity" />
                  <TaskVelocity taskStats={trajectory.taskStats} />
                </section>

                <Divider />

                {/* Section 4: Activity Heatmap */}
                {slug && (
                  <>
                    <section id="activity-heatmap">
                      <SectionHeader icon={BarChart3} title="Activity" />
                      <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
                        <ActivityHeatmap slug={slug} days={180} />
                      </div>
                    </section>
                    <Divider />
                  </>
                )}

                {/* Section 5: Active Projects */}
                <section id="active-projects">
                  <SectionHeader icon={FolderKanban} title="Active Projects" count={trajectory.projects.length} />
                  <ActiveProjects projects={trajectory.projects} />
                </section>

                <Divider />

                {/* Section 6: Publication Timeline */}
                <section id="publication-timeline">
                  <SectionHeader icon={BookOpen} title="Publication Timeline" count={trajectory.publications.length} />
                  <PublicationTimeline publications={trajectory.publications} />
                </section>

                <Divider />

                {/* Section 7: Milestones */}
                <section id="milestones">
                  <SectionHeader icon={Flag} title="Milestones" count={trajectory.milestones.length} />
                  <UpcomingMilestones milestones={trajectory.milestones} />
                </section>
              </>
            )}

            {/* Empty state (no data at all and not loading) */}
            {!isLoading && !trajectory && (
              <div className="py-16 text-center">
                <p style={{ fontSize: '14px', color: 'var(--slate)' }}>
                  Unable to load trajectory data. Try refreshing the page.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'contributions' && slug && (
          <motion.div
            key="contributions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <ContributionsPanel slug={slug} memberName={displayName} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Print Styles ── */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }

          .contributions-print-header {
            display: block !important;
            margin-bottom: 16pt;
            padding-bottom: 8pt;
            border-bottom: 1pt solid #ccc;
          }

          /* Reset backgrounds for clean print */
          .card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            break-inside: avoid;
          }

          /* Page setup */
          @page {
            margin: 0.75in 1in;
          }

          /* Make metric cards print nicely */
          .grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
          }

          /* Timeline entries */
          [style*="paddingLeft: 2rem"] {
            padding-left: 1.5rem !important;
          }

          /* Ensure all content visible */
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Hide sidebar for clean print */
          nav, aside {
            display: none !important;
          }

          /* Maximize content width */
          main, [role="main"] {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
