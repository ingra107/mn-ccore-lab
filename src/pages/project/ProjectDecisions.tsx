import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Scale } from 'lucide-react'
import { useDecisions } from '../../hooks/useApiData'
import type { DecisionRow } from '../../hooks/useApiData'
import { formatMediumDate } from '../../lib/dateUtils'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../../lib/taskGrouping'

interface ProjectDecisionsProps {
  projectSlug: string
}

export default function ProjectDecisions({ projectSlug }: ProjectDecisionsProps) {
  const { data: decisions = [] } = useDecisions(projectSlug)

  if (decisions.length === 0) return null

  return (
    <motion.div
      id="decisions"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 }}
      style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2
          style={{
            fontWeight: 'var(--label-weight)',
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          <Scale {...ICON_PROPS} size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px', color: 'var(--gold)' }} />
          Decisions
        </h2>
        <Link
          to={PATHS.decisions}
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--teal)',
            textDecoration: 'none',
          }}
        >
          View all
        </Link>
      </div>

      <div
        style={{
          background: 'var(--ice)',
          borderRadius: 'var(--radius-xl)',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        <div className="flex flex-col gap-3">
          {decisions.slice(0, 5).map((decision: DecisionRow) => (
            <div
              key={decision.id}
              style={{
                padding: '10px 0',
                borderBottom: `1px solid ${withAlpha(ACCENT_GOLD, 8)}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Scale {...ICON_PROPS} size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 'var(--value-size)',
                    color: 'var(--ink)',
                    fontWeight: 600,
                  }}
                >
                  {decision.title}
                </span>
                {decision.outcome_status !== 'pending' && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      color: decision.outcome_status === 'recorded' ? 'var(--teal)' : 'var(--gold)',
                      backgroundColor: decision.outcome_status === 'recorded' ? 'var(--teal-active)' : 'var(--gold-active)',
                    }}
                  >
                    {decision.outcome_status}
                  </span>
                )}
              </div>
              {decision.rationale && (
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--slate)',
                    lineHeight: 1.5,
                    margin: '0 0 0 20px',
                  }}
                >
                  {decision.rationale.length > 120 ? decision.rationale.slice(0, 120) + '...' : decision.rationale}
                </p>
              )}
              {decision.outcome && (
                <p
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--teal)',
                    margin: '4px 0 0 20px',
                    fontStyle: 'italic',
                  }}
                >
                  Outcome: {decision.outcome.length > 80 ? decision.outcome.slice(0, 80) + '...' : decision.outcome}
                </p>
              )}
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                  marginLeft: '20px',
                  display: 'inline-block',
                  marginTop: '4px',
                }}
              >
                {formatMediumDate(decision.created_at)}
                {decision.decided_by && ` -- ${decision.decided_by}`}
              </span>
            </div>
          ))}
          {decisions.length > 5 && (
            <Link
              to={PATHS.decisions}
              style={{
                fontSize: 'var(--label-size)',
                color: 'var(--teal)',
                textDecoration: 'none',
                textAlign: 'center',
                padding: 'var(--sp-sm) 0',
              }}
            >
              +{decisions.length - 5} more decisions
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  )
}
