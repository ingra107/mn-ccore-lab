import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartPulse, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import { useProjectHealth } from '../../hooks/useApiData'
import type { ProjectHealth, HealthFactors } from '../../hooks/useApiData'

const STATUS_COLORS: Record<string, string> = {
  'Healthy': '#16a34a',
  'Needs Attention': '#c9a84c',
  'At Risk': '#c2410c',
  'Critical': '#7a0019',
}

const FACTOR_LABELS: Record<keyof HealthFactors, { label: string; max: number }> = {
  activity: { label: 'Activity recency', max: 30 },
  velocity: { label: 'Task velocity', max: 25 },
  overdue: { label: 'Overdue tasks', max: 25 },
  milestones: { label: 'Milestone progress', max: 20 },
}

function FactorTooltip({ factors, score }: { factors: HealthFactors; score: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        background: 'var(--ink, #0f1923)',
        color: '#e8e2d6',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '11px',
        fontFamily: 'var(--font-sans)',
        fontWeight: 400,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        zIndex: 50,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '12px' }}>
        Score: {score}/100
      </div>
      {(Object.keys(FACTOR_LABELS) as (keyof HealthFactors)[]).map((key) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <span style={{ opacity: 0.7 }}>{FACTOR_LABELS[key].label}</span>
          <span style={{ fontWeight: 500 }}>
            {factors[key]}/{FACTOR_LABELS[key].max}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ProjectHealthCard() {
  const { data } = useProjectHealth()
  const [showHealthy, setShowHealthy] = useState(false)

  const projects = data?.data ?? []
  const summary = data?.summary ?? { total: 0, healthy: 0, needs_attention: 0, at_risk: 0, critical: 0, avg_score: 0 }

  // Projects that need attention (score < 80)
  const needsWork = projects.filter((p) => p.status !== 'Healthy')
  const healthyProjects = projects.filter((p) => p.status === 'Healthy')

  return (
    <BentoCard
      title="Project Health"
      subtitle={`${summary.total} projects tracked`}
      size="span-2"
      icon={HeartPulse}
    >
      <div className="flex flex-col h-full">
        {/* Summary counts */}
        <div
          className="flex items-center gap-4 mb-3 pb-3"
          style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.08)' }}
        >
          {[
            { status: 'Critical' as const, count: summary.critical, label: 'Critical' },
            { status: 'At Risk' as const, count: summary.at_risk, label: 'At Risk' },
            { status: 'Needs Attention' as const, count: summary.needs_attention, label: 'Attention' },
            { status: 'Healthy' as const, count: summary.healthy, label: 'Healthy' },
          ].map((s) => (
            <div key={s.status} className="flex items-center gap-1.5">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STATUS_COLORS[s.status],
                  boxShadow: s.count > 0 ? `0 0 6px ${STATUS_COLORS[s.status]}40` : 'none',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  lineHeight: 1,
                }}
              >
                {s.count}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '9px',
                  color: 'var(--slate)',
                  opacity: 0.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable project list */}
        <div
          className="flex-1 overflow-y-auto -mx-1 px-1"
          style={{ maxHeight: '280px', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Projects needing attention (sorted worst first) */}
          {needsWork.map((p) => (
            <ProjectHealthRow key={p.slug} project={p} />
          ))}

          {/* Healthy projects (collapsible) */}
          {healthyProjects.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowHealthy(!showHealthy)}
                className="cursor-pointer flex items-center gap-2 w-full py-2 mt-1"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '10px 0',
                  minHeight: '44px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  color: 'var(--slate)',
                  opacity: 0.6,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
              >
                {showHealthy ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showHealthy ? 'Hide' : 'Show'} {healthyProjects.length} healthy project{healthyProjects.length !== 1 ? 's' : ''}
              </button>
              {showHealthy &&
                healthyProjects.map((p) => (
                  <ProjectHealthRow key={p.slug} project={p} />
                ))}
            </>
          )}

          {/* Empty state */}
          {projects.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-8"
              style={{ opacity: 0.4 }}
            >
              <HeartPulse size={24} style={{ color: 'var(--teal)', marginBottom: '8px' }} />
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  color: 'var(--slate)',
                  margin: 0,
                }}
              >
                No project data available
              </p>
            </div>
          )}
        </div>

        {/* Footer link */}
        <Link
          to="/projects"
          className="flex items-center gap-1 mt-3 pt-2"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            color: 'var(--gold)',
            textDecoration: 'none',
            borderTop: '1px solid rgba(201, 168, 76, 0.1)',
          }}
        >
          View all projects <ArrowRight size={11} />
        </Link>
      </div>
    </BentoCard>
  )
}

function ProjectHealthRow({ project }: { project: ProjectHealth }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const color = STATUS_COLORS[project.status]
  const isBad = project.status === 'Critical' || project.status === 'At Risk'

  return (
    <Link
      to={`/projects/${project.slug}`}
      className="flex items-center gap-2.5 py-2 group"
      style={{
        textDecoration: 'none',
        borderBottom: '1px solid rgba(201, 168, 76, 0.04)',
        transition: 'background 0.15s',
        borderRadius: '4px',
        padding: '8px 4px',
        margin: '0 -4px',
        minHeight: '44px',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201, 168, 76, 0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Health dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          boxShadow: isBad ? `0 0 6px ${color}50` : 'none',
        }}
      />

      {/* Project title */}
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          color: 'var(--ink)',
          fontWeight: isBad ? 600 : 400,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}
      >
        {project.title}
      </span>

      {/* Health bar + score */}
      <div
        className="flex items-center gap-2"
        style={{ flexShrink: 0, position: 'relative' }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Health bar */}
        <div
          style={{
            width: '48px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(201, 168, 76, 0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${project.score}%`,
              height: '100%',
              borderRadius: '2px',
              background: color,
              transition: 'width 0.3s ease-out, background 0.15s',
            }}
          />
        </div>

        {/* Score number */}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '10px',
            fontWeight: 500,
            color: isBad ? color : 'var(--slate)',
            opacity: isBad ? 1 : 0.6,
            minWidth: '20px',
            textAlign: 'right',
          }}
        >
          {project.score}
        </span>

        {/* Status label */}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '3px',
            background: `${color}14`,
            color,
            flexShrink: 0,
            letterSpacing: '0.02em',
            minWidth: '44px',
            textAlign: 'center',
          }}
        >
          {project.status === 'Needs Attention' ? 'Attention' : project.status}
        </span>

        {/* Tooltip */}
        {showTooltip && <FactorTooltip factors={project.factors} score={project.score} />}
      </div>
    </Link>
  )
}
