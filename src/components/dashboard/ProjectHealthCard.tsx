import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartPulse, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import HoverCard from '../HoverCard'
import type { HoverCardData } from '../HoverCard'
import { useHoverCard } from '../../hooks/useHoverCard'
import { useProjectHealth } from '../../hooks/useApiData'
import type { ProjectHealth, HealthFactors } from '../../hooks/useApiData'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import SegmentedToggle from '../ui/SegmentedToggle'
import { ACCENT_GOLD, withAlpha } from '../../lib/taskGrouping'

const STATUS_COLORS: Record<string, string> = {
  'Healthy': 'var(--green)',
  'Needs Attention': 'var(--gold)',
  'At Risk': 'var(--orange)',
  'Critical': 'var(--maroon)',
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
        borderRadius: 'var(--radius-lg)',
        padding: '10px 14px',
        fontSize: 'var(--label-size)',
        fontWeight: 400,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        zIndex: 'var(--z-dropdown)',
        boxShadow: 'var(--shadow-card-hover)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '12px' }}>
        Score: {score}/100
      </div>
      {(Object.keys(FACTOR_LABELS) as (keyof HealthFactors)[]).map((key) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <span style={{ opacity: 0.85 }}>{FACTOR_LABELS[key].label}</span>
          <span style={{ fontWeight: 500 }}>
            {factors[key]}/{FACTOR_LABELS[key].max}
          </span>
        </div>
      ))}
    </div>
  )
}

function ProjectHealthCard() {
  const { data } = useProjectHealth()
  const [showHealthy, setShowHealthy] = useState(false)
  // P3-02: heatmap view as alt to the truncated list. localStorage persists.
  const [viewMode, setViewMode] = useState<'list' | 'heatmap'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (window.localStorage.getItem('project-health-view') as 'list' | 'heatmap') ?? 'list'
  })

  const projects = data?.data ?? []
  const summary = data?.summary ?? { total: 0, healthy: 0, needs_attention: 0, at_risk: 0, critical: 0, avg_score: 0 }

  // Projects that need attention (score < 80)
  const needsWork = projects.filter((p) => p.status !== 'Healthy')
  const healthyProjects = projects.filter((p) => p.status === 'Healthy')

  // Heatmap: order worst-first so visual hot-spots cluster top-left.
  const sortedAll = [...projects].sort((a, b) => a.score - b.score)

  function persistView(next: 'list' | 'heatmap') {
    setViewMode(next)
    if (typeof window !== 'undefined') window.localStorage.setItem('project-health-view', next)
  }

  return (
    <BentoCard
      title="Project Health"
      subtitle={`${summary.total} projects tracked`}
      size="span-2"
      icon={HeartPulse}
    >
      <div className="flex flex-col h-full">
        {/* View toggle (P3-02) — shared SegmentedToggle */}
        <div className="flex justify-end mb-2 -mt-1">
          <SegmentedToggle
            ariaLabel="Project health view"
            size="sm"
            uppercase
            options={[
              { value: 'list', label: 'list' },
              { value: 'heatmap', label: 'heatmap' },
            ]}
            value={viewMode}
            onChange={persistView}
          />
        </div>

        {/* Summary counts */}
        <div
          className="flex items-center gap-4 mb-3 pb-3"
          style={{ borderBottom: `1px solid ${withAlpha(ACCENT_GOLD, 8)}` }}
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
                  borderRadius: 'var(--radius-circle)',
                  background: STATUS_COLORS[s.status],
                  boxShadow: s.count > 0 ? `0 0 6px ${STATUS_COLORS[s.status]}40` : 'none',
                }}
              />
              <span
                style={{
                  fontSize: 'var(--value-size)',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  lineHeight: 1,
                }}
              >
                {s.count}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-hint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {viewMode === 'heatmap' && projects.length > 0 ? (
          /* P3-02: every project as a colored cell. Hover for tooltip. */
          <div
            className="flex-1 overflow-y-auto -mx-1 px-1"
            tabIndex={0}
            role="region"
            aria-label="Project health heatmap"
            style={{ maxHeight: '320px' }}
          >
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(20px, 1fr))' }}
            >
              {sortedAll.map((p) => (
                <Link
                  key={p.slug}
                  to={PATHS.project(p.slug)}
                  title={`${p.title} · ${p.status} · ${p.score}/100`}
                  aria-label={`${p.title} · ${p.status} · score ${p.score} of 100`}
                  style={{
                    display: 'block',
                    aspectRatio: '1',
                    borderRadius: 'var(--radius-sm)',
                    background: STATUS_COLORS[p.status] ?? 'var(--slate)',
                    opacity: p.status === 'Healthy' ? 0.5 : 0.85,
                    transition: 'opacity var(--transition-fast) ease, transform var(--transition-fast) ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.15)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = p.status === 'Healthy' ? '0.5' : '0.85'; e.currentTarget.style.transform = 'scale(1)' }}
                />
              ))}
            </div>
            <p
              className="mt-3 text-[10px]"
              style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
            >
              {summary.total} projects · sorted worst first · hover for detail
            </p>
          </div>
        ) : (
        /* Scrollable project list */
        <div
          className="flex-1 overflow-y-auto -mx-1 px-1"
          tabIndex={0}
          role="region"
          aria-label="Project health"
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
                className="cursor-pointer flex items-center gap-2 w-full py-2 mt-1 hover:!opacity-100 transition-opacity"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '10px 0',
                  minHeight: '44px',
                  fontSize: 'var(--label-size)',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                }}
              >
                {showHealthy ? <ChevronUp {...ICON_PROPS} size={12} /> : <ChevronDown {...ICON_PROPS} size={12} />}
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
              style={{ opacity: 0.85 }}
            >
              <HeartPulse size={24} style={{ color: 'var(--teal)', marginBottom: '8px' }} />
              <p
                style={{
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
        )}

        {/* Footer link */}
        <Link
          to={PATHS.projects}
          className="flex items-center gap-1 mt-3 pt-2 portal-footer-link"
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--gold)',
            textDecoration: 'none',
            borderTop: `1px solid ${withAlpha(ACCENT_GOLD, 10)}`,
          }}
        >
          View all projects <ArrowRight {...ICON_PROPS} size={11} />
        </Link>
      </div>
    </BentoCard>
  )
}

export default memo(ProjectHealthCard)

function ProjectHealthRow({ project }: { project: ProjectHealth }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const color = STATUS_COLORS[project.status]
  const isBad = project.status === 'Critical' || project.status === 'At Risk'
  const hoverCard = useHoverCard()

  const projectData: HoverCardData = {
    type: 'project',
    title: project.title,
    stage: project.stage,
    status: project.status,
  }

  return (
    <Link
      to={PATHS.project(project.slug)}
      className="flex items-center gap-2.5 py-2 group transition-colors hover:bg-[var(--gold-hover)]"
      style={{
        textDecoration: 'none',
        borderBottom: `1px solid ${withAlpha(ACCENT_GOLD, 4)}`,
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--sp-sm) var(--sp-xs)',
        margin: '0 -4px',
        minHeight: '44px',
      }}
    >
      {/* Health dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 'var(--radius-circle)',
          background: color,
          flexShrink: 0,
          boxShadow: isBad ? `0 0 6px ${color}50` : 'none',
        }}
      />

      {/* Project title */}
      <span
        ref={hoverCard.triggerRef as React.RefObject<HTMLSpanElement>}
        onMouseEnter={hoverCard.handlers.onMouseEnter}
        onMouseLeave={hoverCard.handlers.onMouseLeave}
        style={{
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
      <HoverCard
        data={projectData}
        isVisible={hoverCard.isVisible}
        position={hoverCard.position}
        cardRef={hoverCard.cardRef}
        cardHandlers={hoverCard.cardHandlers}
      />

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
            borderRadius: 'var(--radius-sm)',
            background: 'var(--gold-active)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${project.score}%`,
              height: '100%',
              borderRadius: 'var(--radius-sm)',
              background: color,
              transition: 'width 0.3s ease-out, background 0.15s',
            }}
          />
        </div>

        {/* Score number */}
        <span
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: isBad ? color : 'var(--slate)',
            opacity: isBad ? 1 : 0.85,
            minWidth: '20px',
            textAlign: 'right',
          }}
        >
          {project.score}
        </span>

        {/* Status label */}
        <span
          style={{
            fontSize: '10px',
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
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
