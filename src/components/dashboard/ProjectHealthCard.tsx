import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartPulse, AlertTriangle, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import { useProjectHealth } from '../../hooks/useApiData'

const HEALTH_COLORS: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
}

const STAGE_BG: Record<string, { bg: string; text: string }> = {
  Idea: { bg: 'rgba(100, 116, 139, 0.1)', text: 'var(--slate)' },
  'Data Collection': { bg: 'rgba(45, 138, 138, 0.12)', text: 'var(--teal)' },
  Analysis: { bg: 'rgba(201, 168, 76, 0.12)', text: 'var(--gold)' },
  Writing: { bg: 'rgba(122, 0, 25, 0.1)', text: 'var(--maroon)' },
  Review: { bg: 'rgba(201, 168, 76, 0.2)', text: 'var(--gold)' },
  Published: { bg: 'rgba(100, 116, 139, 0.1)', text: 'var(--slate)' },
}

export default function ProjectHealthCard() {
  const { data } = useProjectHealth()
  const [showHealthy, setShowHealthy] = useState(false)

  const projects = data?.data ?? []
  const summary = data?.summary ?? { total: 0, green: 0, yellow: 0, red: 0, avg_days_since_update: 0 }

  const redProjects = projects.filter((p) => p.health === 'red')
  const yellowProjects = projects.filter((p) => p.health === 'yellow')
  const greenProjects = projects.filter((p) => p.health === 'green')

  return (
    <BentoCard
      title="Project Health"
      subtitle={`${summary.total} projects tracked`}
      size="span-2"
      icon={HeartPulse}
    >
      <div className="flex flex-col h-full">
        {/* Summary dots */}
        <div
          className="flex items-center gap-4 mb-3 pb-3"
          style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.08)' }}
        >
          {[
            { color: 'red', count: summary.red, label: 'Needs attention' },
            { color: 'yellow', count: summary.yellow, label: 'Aging' },
            { color: 'green', count: summary.green, label: 'Healthy' },
          ].map((s) => (
            <div key={s.color} className="flex items-center gap-1.5">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: HEALTH_COLORS[s.color],
                  boxShadow: s.count > 0 ? `0 0 6px ${HEALTH_COLORS[s.color]}40` : 'none',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
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
                  fontFamily: 'var(--font-mono)',
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
          {/* Red projects */}
          {redProjects.map((p) => (
            <ProjectHealthRow key={p.slug} project={p} />
          ))}

          {/* Yellow projects */}
          {yellowProjects.map((p) => (
            <ProjectHealthRow key={p.slug} project={p} />
          ))}

          {/* Green projects (collapsible) */}
          {greenProjects.length > 0 && (
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
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--slate)',
                  opacity: 0.6,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
              >
                {showHealthy ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showHealthy ? 'Hide' : 'Show'} {greenProjects.length} healthy project{greenProjects.length !== 1 ? 's' : ''}
              </button>
              {showHealthy &&
                greenProjects.map((p) => (
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
                  fontFamily: 'var(--font-body)',
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
            fontFamily: 'var(--font-mono)',
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

function ProjectHealthRow({ project }: { project: { slug: string; title: string; stage: string; health: string; days_since_update: number | null; pending_actions: number } }) {
  const isRed = project.health === 'red'
  const stageBg = STAGE_BG[project.stage] ?? { bg: 'rgba(100, 116, 139, 0.08)', text: 'var(--slate)' }

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
          background: HEALTH_COLORS[project.health],
          flexShrink: 0,
          boxShadow: isRed ? `0 0 6px ${HEALTH_COLORS.red}50` : 'none',
        }}
      />

      {/* Warning icon for red */}
      {isRed && (
        <AlertTriangle
          size={12}
          style={{ color: HEALTH_COLORS.red, flexShrink: 0 }}
        />
      )}

      {/* Project title */}
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          color: 'var(--ink)',
          fontWeight: isRed ? 600 : 400,
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

      {/* Stage badge */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: stageBg.bg,
          color: stageBg.text,
          flexShrink: 0,
          letterSpacing: '0.02em',
        }}
      >
        {project.stage}
      </span>

      {/* Days since update */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: isRed ? HEALTH_COLORS.red : 'var(--slate)',
          opacity: isRed ? 1 : 0.5,
          flexShrink: 0,
          minWidth: '28px',
          textAlign: 'right',
          fontWeight: isRed ? 600 : 400,
        }}
      >
        {project.days_since_update !== null ? `${project.days_since_update}d` : '--'}
      </span>
    </Link>
  )
}
