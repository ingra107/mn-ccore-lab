import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import HoverCard from '../HoverCard'
import type { HoverCardData } from '../HoverCard'
import { useHoverCard } from '../../hooks/useHoverCard'
import { useProjectHealth } from '../../hooks/useApiData'
import type { ProjectHealth, HealthFactors } from '../../hooks/useApiData'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { QueryErrorNote } from '../QueryErrorNote'
import { STATUS_FILLS } from '../../lib/projectHealthFills'

// Color jobs (rules-ui-design 21): orange = going stale, so only the at-risk
// band (At Risk, Critical) carries it; Healthy and Attention are gray text.
const STATUS_COLORS: Record<string, string> = {
  'Healthy': 'var(--slate)',
  'Needs Attention': 'var(--slate)',
  'At Risk': 'var(--job-stale)',
  'Critical': 'var(--job-stale)',
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
  const { data, isError, refetch } = useProjectHealth()
  const [showAll, setShowAll] = useState(false)
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

  // Wave 3 (Lab Overview option A): hero = healthy count with the at-risk count
  // beside it, then the three projects that most need a look (worst first). The
  // four-way breakdown moves to the hero's tooltip; "Show all" opens the rest.
  const ordered = [...needsWork, ...healthyProjects]
  const visible = showAll ? ordered : ordered.slice(0, 3)
  const atRisk = summary.at_risk + summary.critical
  const heroLabel = `healthy · ${atRisk} at risk${summary.needs_attention > 0 ? ` · ${summary.needs_attention} attention` : ''}`

  return (
    <BentoCard
      title="Project Health"
      hero={isError ? undefined : {
        value: summary.healthy,
        label: heroLabel,
        rule: atRisk > 0 ? 'urgent' : 'accent',
        title: `${summary.total} projects: ${summary.critical} critical, ${summary.at_risk} at risk, ${summary.needs_attention} attention, ${summary.healthy} healthy`,
      }}
      headRight={
        <div role="tablist" aria-label="Project health view" className="bento-flt">
          {(['list', 'heatmap'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={viewMode === v}
              className={viewMode === v ? 'bento-flt-on' : undefined}
              onClick={() => persistView(v)}
            >
              {v === 'list' ? 'List' : 'Heatmap'}
            </button>
          ))}
        </div>
      }
      size="span-2"
      uniform
    >
      <div className="flex flex-col h-full">
        {viewMode === 'heatmap' && projects.length > 0 ? (
          /* P3-02: every project as a colored cell. Hover for tooltip. */
          <div
            className="overflow-y-auto -mx-1 px-1"
            tabIndex={0}
            role="region"
            aria-label="Project health heatmap"
            style={{ maxHeight: '320px', minHeight: '84px' }}
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
                    background: STATUS_FILLS[p.status] ?? 'var(--slate)',
                    // Hairline in the theme's ink: Critical (L 0.40) vanishes on a dark
                    // card (1.05:1) and Attention (L 0.83) on a light one (1.58:1).
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 24%, transparent)',
                    transition: 'transform var(--transition-fast) ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
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
        <div role="region" aria-label="Project health">
          {visible.map((p) => (
            <ProjectHealthRow key={p.slug} project={p} />
          ))}

          {/* Empty state -- #507 follow-up: distinguish a thrown fetch
              failure (isError) from a genuinely empty project set. */}
          {projects.length === 0 && (
            isError ? (
              <div className="py-4">
                <QueryErrorNote label="project health" onRetry={() => refetch()} />
              </div>
            ) : (
              <div className="py-4" style={{ fontSize: '12px', color: 'var(--sk-t3)' }}>
                No project data available
              </div>
            )
          )}
        </div>
        )}

        {/* Footer: the link, and "show all" for the rest of the list. */}
        <div className="bento-foot">
          <Link
            to={PATHS.projects}
            className="flex items-center gap-1 portal-footer-link"
            style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', textDecoration: 'none' }}
          >
            All projects <ArrowRight {...ICON_PROPS} size={11} />
          </Link>
          {viewMode === 'list' && ordered.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="cursor-pointer flex items-center gap-1"
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 'var(--label-size)', color: 'var(--sk-t3)' }}
            >
              {showAll ? <ChevronUp {...ICON_PROPS} size={12} /> : <ChevronDown {...ICON_PROPS} size={12} />}
              {showAll ? 'Show fewer' : `Show all ${ordered.length}`}
            </button>
          )}
        </div>
      </div>
    </BentoCard>
  )
}

export default memo(ProjectHealthCard)

function ProjectHealthRow({ project }: { project: ProjectHealth }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const color = STATUS_COLORS[project.status] // text (AA)
  const fill = STATUS_FILLS[project.status] // swatch
  const isBad = project.status === 'Critical' || project.status === 'At Risk'
  const {
    isVisible: hoverIsVisible,
    position: hoverPosition,
    triggerRef: hoverTriggerRef,
    cardRef: hoverCardRef,
    handlers: hoverHandlers,
    cardHandlers: hoverCardHandlers,
  } = useHoverCard()

  const projectData: HoverCardData = {
    type: 'project',
    title: project.title,
    stage: project.stage_label ?? undefined,
    stageColorKey: project.home_kind === 'manuscript' ? (project.home_stage ?? undefined) : undefined,
    status: project.status,
  }

  return (
    <Link
      to={PATHS.project(project.slug)}
      className="bento-row"
    >
      {/* Health dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 'var(--radius-circle)',
          background: fill,
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 24%, transparent)',
          flexShrink: 0,
        }}
      />

      {/* Project title */}
      <span
        ref={hoverTriggerRef as React.RefObject<HTMLSpanElement>}
        onMouseEnter={hoverHandlers.onMouseEnter}
        onMouseLeave={hoverHandlers.onMouseLeave}
        style={{
          fontSize: '12px',
          color: 'var(--ink)',
          fontWeight: isBad ? 600 : 400,
          flex: '1 1 0',
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
        isVisible={hoverIsVisible}
        position={hoverPosition}
        cardRef={hoverCardRef}
        cardHandlers={hoverCardHandlers}
      />

      {/* Status word; hover shows the score and its four factors */}
      <div
        style={{ flexShrink: 0, position: 'relative', marginLeft: 'auto', lineHeight: 1.3 }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span
          className="bento-row-f"
          style={{ color: isBad ? color : undefined, fontWeight: isBad ? 600 : 400 }}
        >
          {project.status === 'Needs Attention' ? 'Attention' : project.status === 'At Risk' ? 'At risk' : project.status}
        </span>
        {showTooltip && <FactorTooltip factors={project.factors} score={project.score} />}
      </div>
    </Link>
  )
}
