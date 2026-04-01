import { useMemo, useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Printer, BookOpen, BarChart3, FolderKanban, Flag, ClipboardList, MessageSquare, GitBranch, Users, FileText, CheckCircle2, Clock, AlertTriangle, TrendingUp } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useTrajectory, useContributions } from '../hooks/useApiData'
import type { TrajectoryData, ContributionsData } from '../hooks/useApiData'
import { getMemberBySlug } from '../data/team'
import ActivityHeatmap from '../components/ActivityHeatmap'

// ── Stage colors ───────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  Idea: '#64748b',
  'Data Collection': '#5b8abf',
  Analysis: '#2d8a8a',
  Writing: '#c9a84c',
  Review: '#7a0019',
  Published: 'var(--green-light)',
}

// ── Cumulative Publication Curve ──────────────────────────

function PublicationCurve({ publications }: { publications: TrajectoryData['publications'] }) {
  const { points, months: _months, maxCount } = useMemo(() => {
    if (publications.length === 0) return { points: [], months: [] as string[], maxCount: 0 }

    // Sort chronologically
    const sorted = [...publications]
      .filter((p) => p.pub_date)
      .sort((a, b) => a.pub_date.localeCompare(b.pub_date))

    if (sorted.length === 0) return { points: [], months: [] as string[], maxCount: 0 }

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
    const pts = monthList.map((month) => {
      const count = sorted.filter((p) => {
        const pm = p.pub_date.slice(0, 7)
        return pm === month
      }).length
      cumulative += count
      return { month, cumulative, count }
    })

    return { points: pts, months: monthList, maxCount: cumulative }
  }, [publications])

  if (points.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-light)' }}
      >
        <TrendingUp size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
          No publications with dates yet
        </p>
      </div>
    )
  }

  const width = 600
  const height = 200
  const padding = { top: 20, right: 24, bottom: 30, left: 40 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const xScale = (i: number) => padding.left + (i / (points.length - 1 || 1)) * chartW
  const yScale = (v: number) => padding.top + chartH - (v / (maxCount || 1)) * chartH

  // Build SVG path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(p.cumulative).toFixed(1)}`)
    .join(' ')

  // Area fill path
  const areaD = `${pathD} L ${xScale(points.length - 1).toFixed(1)} ${yScale(0).toFixed(1)} L ${xScale(0).toFixed(1)} ${yScale(0).toFixed(1)} Z`

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const step = Math.max(1, Math.ceil(maxCount / 4))
    const ticks: number[] = []
    for (let v = 0; v <= maxCount; v += step) ticks.push(v)
    if (ticks[ticks.length - 1] !== maxCount) ticks.push(maxCount)
    return ticks
  }, [maxCount])

  // X-axis labels (every ~6 months or less)
  const xLabels = useMemo(() => {
    if (points.length <= 6) return points.map((_, i) => i)
    const step = Math.max(1, Math.floor(points.length / 6))
    const indices: number[] = []
    for (let i = 0; i < points.length; i += step) indices.push(i)
    if (indices[indices.length - 1] !== points.length - 1) indices.push(points.length - 1)
    return indices
  }, [points])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cumulative Publications Over Time
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '20px', fontWeight: 700, color: 'var(--teal)' }}>
          {maxCount}
        </span>
      </div>

      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxWidth: width, height: 'auto' }}>
          {/* Grid lines */}
          {yTicks.map((v) => (
            <g key={`y-${v}`}>
              <line
                x1={padding.left} y1={yScale(v)}
                x2={width - padding.right} y2={yScale(v)}
                stroke="var(--border-light, #e8eff5)" strokeWidth={1}
              />
              <text
                x={padding.left - 8} y={yScale(v) + 4}
                textAnchor="end"
                style={{ fontFamily: 'var(--font-sans)', fontSize: '9px', fill: 'var(--slate)' }}
                opacity={0.5}
              >
                {v}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabels.map((idx) => (
            <text
              key={`x-${idx}`}
              x={xScale(idx)}
              y={height - 6}
              textAnchor="middle"
              style={{ fontFamily: 'var(--font-sans)', fontSize: '8px', fill: 'var(--slate)' }}
              opacity={0.5}
            >
              {points[idx]?.month.slice(2).replace('-', '/')}
            </text>
          ))}

          {/* Area fill */}
          <path d={areaD} fill="rgba(45,138,138,0.08)" />

          {/* Line */}
          <path d={pathD} fill="none" stroke="var(--teal)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Dot markers on publication dates */}
          {points.map((p, i) =>
            p.count > 0 ? (
              <circle
                key={`dot-${i}`}
                cx={xScale(i)} cy={yScale(p.cumulative)}
                r={3.5} fill="var(--gold)" stroke="var(--cream, #fff)" strokeWidth={1.5}
              >
                <title>{p.month}: {p.count} publication{p.count > 1 ? 's' : ''} (total: {p.cumulative})</title>
              </circle>
            ) : null
          )}
        </svg>
      </div>
    </div>
  )
}

// ── Project Velocity (horizontal bars) ───────────────────

function ProjectVelocity({ projectStages }: { projectStages: TrajectoryData['projectStages'] }) {
  if (!projectStages || projectStages.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-light)' }}
      >
        <FolderKanban size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
          No active projects to track velocity
        </p>
      </div>
    )
  }

  const maxDays = Math.max(...projectStages.map((p) => p.total_days), 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Time in Pipeline
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
          days in current stage / total days
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {projectStages.map((project, i) => {
          const stageColor = STAGE_COLORS[project.stage] || '#64748b'
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
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
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
                    borderRadius: '9999px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-sans)',
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
                    borderRadius: '4px',
                    overflow: 'hidden',
                    backgroundColor: 'var(--border-light, #e8eff5)',
                    position: 'relative',
                  }}
                >
                  {/* Total project time */}
                  <div
                    style={{
                      width: `${Math.max(totalWidth, 4)}%`,
                      height: '100%',
                      backgroundColor: 'rgba(45,138,138,0.15)',
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
                        borderRadius: '0 4px 4px 0',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>

                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
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
                fontFamily: 'var(--font-sans)',
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
                fontFamily: 'var(--font-sans)',
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
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 0.5,
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
        style={{ background: 'var(--ice)', border: '1px solid var(--border-light)' }}
      >
        <BookOpen size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
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
          borderRadius: '1px',
        }}
      />

      {publications.map((pub, i) => (
        <motion.div
          key={pub.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
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
              borderRadius: '50%',
              background: 'var(--gold)',
              border: '3px solid var(--cream, #ffffff)',
              zIndex: 1,
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
                fontFamily: 'var(--font-body)',
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
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
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
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
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
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
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
  const maxCompleted = useMemo(
    () => Math.max(...taskStats.map((s) => s.completed), 1),
    [taskStats]
  )

  // Pad to 12 months if needed
  const months = useMemo(() => {
    const now = new Date()
    const result: { month: string; completed: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const found = taskStats.find((s) => s.month === key)
      result.push({ month: key, completed: found?.completed ?? 0 })
    }
    return result
  }, [taskStats])

  const currentMonth = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const totalCompleted = months.reduce((sum, m) => sum + m.completed, 0)

  if (totalCompleted === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-light)' }}
      >
        <BarChart3 size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
          No task completions in the last 12 months
        </p>
      </div>
    )
  }

  const barWidth = 100 / months.length
  const chartHeight = 120

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
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            color: 'var(--slate)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Tasks Completed -- Last 12 Months
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--gold)',
          }}
        >
          {totalCompleted}
        </span>
      </div>

      <svg
        viewBox={`0 0 100 ${chartHeight}`}
        preserveAspectRatio="none"
        style={{
          width: '100%',
          height: `${chartHeight}px`,
          borderRadius: '8px',
          overflow: 'visible',
        }}
      >
        {months.map((m, i) => {
          const height = (m.completed / maxCompleted) * (chartHeight - 20)
          const isCurrent = m.month === currentMonth
          return (
            <g key={m.month}>
              <rect
                x={i * barWidth + barWidth * 0.15}
                y={chartHeight - height - 16}
                width={barWidth * 0.7}
                height={Math.max(height, 2)}
                rx={2}
                fill={isCurrent ? 'var(--teal)' : 'var(--gold)'}
                opacity={m.completed === 0 ? 0.15 : isCurrent ? 1 : 0.7}
              />
              {/* Month label */}
              <text
                x={i * barWidth + barWidth / 2}
                y={chartHeight - 2}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '3.5px',
                  fill: 'var(--slate)',
                  opacity: 0.5,
                }}
              >
                {m.month.slice(5)}
              </text>
              {/* Count label on non-zero bars */}
              {m.completed > 0 && (
                <text
                  x={i * barWidth + barWidth / 2}
                  y={chartHeight - height - 20}
                  textAnchor="middle"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '3.5px',
                    fill: isCurrent ? 'var(--teal)' : 'var(--gold)',
                    fontWeight: 600,
                  }}
                >
                  {m.completed}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Active Projects Grid ───────────────────────────────────

function ActiveProjects({ projects }: { projects: TrajectoryData['projects'] }) {
  if (projects.length === 0) {
    return (
      <div
        className="py-10 text-center rounded-xl"
        style={{ background: 'var(--ice)', border: '1px solid var(--border-light)' }}
      >
        <FolderKanban size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
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
        const stageColor = STAGE_COLORS[project.stage] || '#64748b'
        return (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
          >
            <Link
              to={`/projects/${project.slug}`}
              className="card block"
              style={{
                padding: '1.25rem',
                textDecoration: 'none',
                borderLeft: `3px solid ${stageColor}`,
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderLeftColor = 'var(--gold)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderLeftColor = stageColor
                e.currentTarget.style.boxShadow = ''
              }}
            >
              <h4
                style={{
                  fontFamily: 'var(--font-body)',
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
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-sans)',
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
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
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
        style={{ background: 'var(--ice)', border: '1px solid var(--border-light)' }}
      >
        <Flag size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
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
                    fontFamily: 'var(--font-body)',
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
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
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
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
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
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
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
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
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
        background: 'linear-gradient(90deg, transparent, var(--border-light, #e8eff5), transparent)',
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
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: active ? 600 : 400,
              padding: '4px 10px',
              borderRadius: '6px',
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
          fontFamily: 'var(--font-sans)',
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
          fontFamily: 'var(--font-sans)',
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
        style={{ background: 'var(--ice)', border: '1px solid var(--border-light)' }}
      >
        <ClipboardList size={28} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
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
          borderRadius: '1px',
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
                borderRadius: '50%',
                background: config.color,
                border: '3px solid var(--cream, #ffffff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
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
                        fontFamily: 'var(--font-sans)',
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
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
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
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
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
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
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
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
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
            fontFamily: 'var(--font-sans)',
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
            fontFamily: 'var(--font-sans)',
            fontSize: '16pt',
            fontWeight: 700,
            margin: '0 0 4pt',
          }}
        >
          Contribution Portfolio -- {memberName}
        </h2>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '10pt', color: '#666', margin: 0 }}>
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
        className="inline-flex items-center gap-1.5 mb-6 no-print"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          color: 'var(--slate)',
          textDecoration: 'none',
          opacity: 0.7,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
      >
        <ArrowLeft size={14} />
        Back to profile
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
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
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--gold)',
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gold), var(--teal))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-sans)',
                fontSize: '18px',
                fontWeight: 700,
                color: 'white',
              }}
            >
              {member.initials}
            </div>
          )}

          <div>
            <h1
              style={{
                fontFamily: 'var(--font-sans)',
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
                fontFamily: 'var(--font-body)',
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium no-print"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            background: 'var(--ice)',
            color: 'var(--slate)',
            border: '1px solid var(--border-light, #e8eff5)',
            cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--gold)'
            e.currentTarget.style.color = 'var(--gold)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-light, #e8eff5)'
            e.currentTarget.style.color = 'var(--slate)'
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
          borderBottom: '2px solid var(--border-light, #e8eff5)',
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
                fontFamily: 'var(--font-sans)',
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
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>
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
