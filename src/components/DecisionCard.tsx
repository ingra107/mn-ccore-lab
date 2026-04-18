import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, Clock, AlertTriangle, FolderKanban, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Avatar from './Avatar'
import InlineSelect from './InlineSelect'
import SentimentBadge from './SentimentBadge'
import SimilarDecisionsPanel from './SimilarDecisionsPanel'
import { formatRelativeTime } from '../lib/dateUtils'
import { parseTagsString } from '../lib/tagUtils'
import { getPersonInfo } from '../data/team'
import type { DecisionRow } from '../hooks/useApiData'
import type { useUpdateDecisionOutcome } from '../hooks/useMutations'

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

interface Props {
  decision: DecisionRow
  projects: { slug: string; title: string }[]
  onUpdateOutcome?: ReturnType<typeof useUpdateDecisionOutcome>
  onStatusChange?: (decision: DecisionRow, newStatus: string) => void
}

export default function DecisionCard({ decision, projects, onUpdateOutcome, onStatusChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const person = decision.decided_by ? getPersonInfo(decision.decided_by) : null
  const projectTitle = decision.project_slug
    ? projects.find((p) => p.slug === decision.project_slug)?.title
    : null
  const tags = parseTagsString(decision.tags)
  const linkedProjects = decision.linked_projects
    ? decision.linked_projects.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const days = daysAgo(decision.created_at)
  const needsOutcome = decision.outcome_status === 'pending' && days >= 30

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.12)' }}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Scale size={14} style={{ color: 'var(--gold)' }} />
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>
            {decision.title}
          </span>
          {decision.outcome_sentiment && decision.outcome_sentiment !== 'pending' && (
            <SentimentBadge sentiment={decision.outcome_sentiment} />
          )}
          <InlineSelect
            value={decision.outcome_status || 'pending'}
            options={[
              { value: 'pending', label: 'Pending', color: 'var(--gold)' },
              { value: 'recorded', label: 'Recorded', color: 'var(--teal)' },
              { value: 'revisited', label: 'Revisited', color: 'var(--slate)' },
            ]}
            onChange={(val) => onStatusChange ? onStatusChange(decision, val) : onUpdateOutcome?.mutate({ id: decision.id, outcome: decision.outcome || '', outcome_status: val })}
          />
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '2px', opacity: 'var(--ink-label)' }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {decision.rationale && (
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', lineHeight: 1.5, marginBottom: '8px' }}>
            {decision.rationale}
          </p>
        )}

        {decision.outcome && (
          <div
            className="mb-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--teal-hover)', borderLeft: '3px solid var(--teal)' }}
          >
            <p style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
              <span style={{ fontWeight: 500 }}>Outcome:</span> {decision.outcome}
            </p>
          </div>
        )}

        {/* Outcome nudge for 30+ day old pending decisions */}
        {needsOutcome && (
          <div
            className="mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ background: 'var(--gold-hover)', borderLeft: '3px solid var(--gold)' }}
          >
            <AlertTriangle size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: 500 }}>
              This decision was made {days} days ago. Consider recording the outcome.
            </span>
          </div>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
            <Clock size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
            {formatRelativeTime(decision.created_at)}
          </span>

          {person && (
            <span className="flex items-center gap-1.5">
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="gold" />
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>
                {person.name.split(' ')[0]}
              </span>
            </span>
          )}

          {projectTitle && (
            <Link
              to={`/projects/${decision.project_slug}`}
              className="flex items-center gap-1 hover:underline"
              style={{ fontSize: 'var(--label-size)', color: 'var(--teal)', textDecoration: 'none' }}
            >
              <FolderKanban size={11} />
              {projectTitle}
            </Link>
          )}

          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ fontWeight: 400, color: 'var(--teal)', backgroundColor: 'var(--teal-hover)' }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Linked projects */}
        {linkedProjects.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>Linked:</span>
            {linkedProjects.map((slug) => {
              const title = projects.find((p) => p.slug === slug)?.title || slug
              return (
                <Link
                  key={slug}
                  to={`/projects/${slug}`}
                  className="text-[10px] px-1.5 py-0.5 rounded-full hover:underline"
                  style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-hover)', textDecoration: 'none' }}
                >
                  {title}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Expanded: Similar Decisions */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <SimilarDecisionsPanel decisionId={decision.id} projects={projects} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
