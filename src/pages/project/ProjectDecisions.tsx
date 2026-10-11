import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Scale } from 'lucide-react'
import { useDecisions } from '../../hooks/useApiData'
import type { DecisionRow } from '../../hooks/useApiData'
import { formatMediumDate } from '../../lib/dateUtils'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { QueryErrorNote } from '../../components/QueryErrorNote'
import SectionHead from '../../components/ui/SectionHead'

interface ProjectDecisionsProps {
  projectSlug: string
}

export default function ProjectDecisions({ projectSlug }: ProjectDecisionsProps) {
  const { data: decisions = [], isError, refetch } = useDecisions(projectSlug)

  // #507 follow-up: a bare `decisions.length === 0` return-null used to
  // vanish this whole section on a thrown fetch failure too -- Nick would
  // never see the Decisions card for a project whose decisions failed to
  // load. isError now renders a visible retry note instead of nothing.
  if (decisions.length === 0 && !isError) return null

  return (
    <motion.div
      id="decisions"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 }}
      style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
    >
      <SectionHead
        icon={<Scale {...ICON_PROPS} size={16} />}
        title="Decisions"
        right={<>
          <Link
            to={PATHS.decisions}
            style={{
              fontSize: 'var(--label-size)',
              color: 'var(--job-accent)',
              textDecoration: 'none',
            }}
          >
            View all
          </Link>
        </>}
      />

      <div
        style={{
          borderRadius: 'var(--radius-xl)',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        {isError ? (
        <QueryErrorNote label="decisions" onRetry={() => refetch()} />
        ) : (
        <div className="flex flex-col gap-3">
          {decisions.slice(0, 5).map((decision: DecisionRow) => (
            <div
              key={decision.id}
              style={{
                padding: '10px 0',
                borderBottom: `1px solid var(--sk-line)`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Scale {...ICON_PROPS} size={12} style={{ color: 'var(--sk-t3)', flexShrink: 0 }} />
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
                      color: decision.outcome_status === 'recorded' ? 'var(--sk-t3)' : 'var(--sk-t2)',
                      backgroundColor: 'var(--sk-line)',
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
                    color: 'var(--job-accent)',
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
                color: 'var(--job-accent)',
                textDecoration: 'none',
                textAlign: 'center',
                padding: 'var(--sp-sm) 0',
              }}
            >
              +{decisions.length - 5} more decisions
            </Link>
          )}
        </div>
        )}
      </div>
    </motion.div>
  )
}
