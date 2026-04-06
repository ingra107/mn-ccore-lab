import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Scale, Plus, X, Clock, AlertTriangle, FolderKanban, History, Tag, List, GitCommitVertical, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import Avatar from '../../components/Avatar'
import { useDecisions, useDecisionsForReview, useSimilarDecisions, useSimilarDecisionsById, useDecisionTags } from '../../hooks/useApiData'
import { useCreateDecision, useUpdateDecisionOutcome } from '../../hooks/useMutations'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { useToast } from '../../hooks/useToast'
import { useUndoToast } from '../../components/UndoToast'
import { useProjects } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import InlineSelect from '../../components/InlineSelect'
import { formatRelativeTime } from '../../lib/dateUtils'
import { useDebounce } from '../../hooks/useDebounce'
import type { DecisionRow } from '../../hooks/useApiData'

// ── Tag auto-suggestion ──────────────────────────────────────

const TAG_KEYWORDS: Record<string, string[]> = {
  statistics: ['regression', 'model', 'p-value', 'analysis', 'coefficient', 'variable', 'sample size', 'power', 'hypothesis', 'bayesian', 'anova', 't-test', 'logistic', 'linear', 'cox', 'survival', 'hazard', 'odds ratio', 'confidence interval'],
  IRB: ['consent', 'irb', 'ethics', 'protocol', 'amendment', 'human subjects', 'hipaa', 'phi', 'de-identified', 'waiver'],
  methodology: ['method', 'approach', 'design', 'framework', 'procedure', 'technique', 'algorithm', 'pipeline', 'workflow', 'protocol'],
  collaboration: ['partner', 'collaborat', 'co-pi', 'consortium', 'multi-site', 'external', 'letter of support', 'subcontract', 'mou'],
  'data-sharing': ['data sharing', 'data use', 'dua', 'repository', 'open data', 'access', 'transfer', 'de-identified'],
  infrastructure: ['server', 'database', 'pipeline', 'deploy', 'system', 'architecture', 'cloud', 'storage', 'backup'],
  hiring: ['hire', 'recruit', 'position', 'candidate', 'postdoc', 'fellow', 'student', 'research assistant', 'coordinator'],
  funding: ['grant', 'budget', 'funding', 'nih', 'nsf', 'r01', 'r21', 'k23', 'award', 'supplement', 'no-cost extension'],
  publication: ['manuscript', 'paper', 'journal', 'submission', 'revision', 'reviewer', 'figure', 'table', 'abstract', 'draft'],
  'study-design': ['rct', 'randomized', 'cohort', 'case-control', 'observational', 'prospective', 'retrospective', 'cross-sectional', 'inclusion', 'exclusion', 'enrollment'],
}

function suggestTags(text: string): string[] {
  if (!text || text.length < 3) return []
  const lower = text.toLowerCase()
  const suggested: string[] = []
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      suggested.push(tag)
    }
  }
  return suggested
}

// ── Sentiment helpers ────────────────────────────────────────

const SENTIMENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: 'var(--teal)', bg: 'rgba(45,138,138,0.08)' },
  negative: { label: 'Negative', color: 'var(--maroon)', bg: 'rgba(128,0,0,0.08)' },
  neutral: { label: 'Neutral', color: 'var(--slate)', bg: 'rgba(100,116,139,0.08)' },
  pending: { label: 'Pending', color: 'var(--gold)', bg: 'rgba(201,168,76,0.08)' },
}

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Main Page ────────────────────────────────────────────────

export default function DecisionsPage() {
  const [filterTag, setFilterTag] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const { data: allDecisions = [], isLoading } = useDecisions(undefined, filterTag || undefined)
  const { data: reviewDecisions = [] } = useDecisionsForReview()
  const { data: projects = [] } = useProjects()
  const { data: tagCounts = [] } = useDecisionTags()
  const createDecision = useCreateDecision()
  const updateOutcome = useUpdateDecisionOutcome()
  const { showUndo } = useUndoToast()

  const handleStatusChange = (decision: DecisionRow, newStatus: string) => {
    const prevStatus = decision.outcome_status || 'pending'
    const statusLabels: Record<string, string> = { pending: 'Pending', recorded: 'Recorded', revisited: 'Revisited' }
    updateOutcome.mutate({ id: decision.id, outcome: decision.outcome || '', outcome_status: newStatus })
    showUndo(`Status → ${statusLabels[newStatus] || newStatus}`, () =>
      updateOutcome.mutate({ id: decision.id, outcome: decision.outcome || '', outcome_status: prevStatus })
    )
  }

  // Filter decisions by status
  const filteredDecisions = filterStatus
    ? allDecisions.filter((d) => d.outcome_status === filterStatus)
    : allDecisions

  const pendingCount = allDecisions.filter((d) => d.outcome_status === 'pending').length
  const recordedCount = allDecisions.filter((d) => d.outcome_status !== 'pending').length

  useListKeyboardNav({
    itemCount: viewMode === 'list' ? filteredDecisions.length : 0,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

  return (
    <div>
      <PageHeader
        icon={<Scale size={20} />}
        title="Decision Log"
        subtitle={`${pendingCount} pending review, ${recordedCount} with outcomes`}
        count={allDecisions.length}
        actions={
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-light)' }}>
              <button
                onClick={() => setViewMode('list')}
                className="px-3 py-1.5 text-xs"
                style={{
                  fontWeight: 500,
                  color: viewMode === 'list' ? 'var(--teal)' : 'var(--slate)',
                  backgroundColor: viewMode === 'list' ? 'rgba(45,138,138,0.08)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <List size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                List
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className="px-3 py-1.5 text-xs"
                style={{
                  fontWeight: 500,
                  color: viewMode === 'timeline' ? 'var(--teal)' : 'var(--slate)',
                  backgroundColor: viewMode === 'timeline' ? 'rgba(45,138,138,0.08)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <GitCommitVertical size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                Timeline
              </button>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={16} />
              Log Decision
            </button>
          </div>
        }
      >
        {/* Status filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: '', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'recorded', label: 'Recorded' },
            { key: 'revisited', label: 'Revisited' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                color: filterStatus === f.key ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: filterStatus === f.key ? 'rgba(45,138,138,0.1)' : 'transparent',
                border: `1px solid ${filterStatus === f.key ? 'rgba(45,138,138,0.25)' : 'var(--border-light)'}`,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tag filters */}
        {tagCounts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <Tag size={12} style={{ color: 'var(--slate)', opacity: 0.5 }} />
            {filterTag && (
              <button
                onClick={() => setFilterTag('')}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  color: 'var(--maroon)',
                  backgroundColor: 'rgba(128,0,0,0.06)',
                  border: '1px solid rgba(128,0,0,0.15)',
                  cursor: 'pointer',
                }}
              >
                Clear filter
              </button>
            )}
            {tagCounts.slice(0, 12).map((tc) => (
              <button
                key={tc.tag}
                onClick={() => setFilterTag(filterTag === tc.tag ? '' : tc.tag)}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
                style={{
                  color: filterTag === tc.tag ? 'white' : 'var(--teal)',
                  backgroundColor: filterTag === tc.tag ? 'var(--teal)' : 'rgba(45,138,138,0.06)',
                  border: `1px solid ${filterTag === tc.tag ? 'var(--teal)' : 'rgba(45,138,138,0.15)'}`,
                  cursor: 'pointer',
                }}
              >
                {tc.tag} ({tc.count})
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {/* Decisions Awaiting Review (nudge for 30+ day old decisions) */}
      {reviewDecisions.length > 0 && !filterStatus && !filterTag && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: 'var(--gold)' }} />
            <h2
              style={{
                fontWeight: 500,
                fontSize: '16px',
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              Record outcome?
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(201,168,76,0.12)', color: 'var(--gold)' }}
            >
              {reviewDecisions.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {reviewDecisions.map((decision) => (
              <ReviewCard key={decision.id} decision={decision} projects={projects} updateOutcome={updateOutcome} />
            ))}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="mt-8">
        <h2
          style={{
            fontWeight: 500,
            fontSize: '16px',
            color: 'var(--ink)',
            marginBottom: '16px',
          }}
        >
          {filterTag ? `Tagged: ${filterTag}` : filterStatus ? `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} Decisions` : 'All Decisions'}
        </h2>

        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : filteredDecisions.length === 0 ? (
          <EmptyState
            icon={<Scale size={40} />}
            title="No decisions logged"
            subtitle="When the team makes a call — study design, protocol change, authorship — record it here so nobody has to remember who said what, or when."
            action={{ label: 'Log Decision', onClick: () => setShowCreate(true) }}
          />
        ) : viewMode === 'timeline' ? (
          <DecisionTimeline decisions={filteredDecisions} projects={projects} />
        ) : (
          <motion.div
            className="table-container flex flex-col gap-3"
            style={{ padding: '16px 20px' }}
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {filteredDecisions.map((decision) => (
              <motion.div key={decision.id} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}>
                <DecisionCard decision={decision} projects={projects} onUpdateOutcome={updateOutcome} onStatusChange={handleStatusChange} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Create Decision Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateDecisionModal
            projects={projects}
            onCreate={createDecision}
            onClose={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Sentiment Badge ──────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  const config = SENTIMENT_CONFIG[sentiment || 'pending'] || SENTIMENT_CONFIG.pending
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full"
      style={{
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bg,
      }}
    >
      {config.label}
    </span>
  )
}

// ── Decision Card ─────────────────────────────────────────────

function DecisionCard({ decision, projects, onUpdateOutcome, onStatusChange }: { decision: DecisionRow; projects: { slug: string; title: string }[]; onUpdateOutcome?: { mutate: (input: { id: string; outcome: string; outcome_status: string; outcome_sentiment?: string }) => void }; onStatusChange?: (decision: DecisionRow, newStatus: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const person = decision.decided_by ? getPersonInfo(decision.decided_by) : null
  const projectTitle = decision.project_slug
    ? projects.find((p) => p.slug === decision.project_slug)?.title
    : null
  const tags = decision.tags ? decision.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
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
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '2px', opacity: 0.5 }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {decision.rationale && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--slate)', lineHeight: 1.5, marginBottom: '8px' }}>
            {decision.rationale}
          </p>
        )}

        {decision.outcome && (
          <div
            className="mb-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(45,138,138,0.04)', borderLeft: '3px solid var(--teal)' }}
          >
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
              <span style={{ fontWeight: 600 }}>Outcome:</span> {decision.outcome}
            </p>
          </div>
        )}

        {/* Outcome nudge for 30+ day old pending decisions */}
        {needsOutcome && (
          <div
            className="mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ background: 'rgba(201,168,76,0.06)', borderLeft: '3px solid var(--gold)' }}
          >
            <AlertTriangle size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--gold)', fontWeight: 500 }}>
              This decision was made {days} days ago. Consider recording the outcome.
            </span>
          </div>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
            <Clock size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
            {formatRelativeTime(decision.created_at)}
          </span>

          {person && (
            <span className="flex items-center gap-1.5">
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="gold" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)' }}>
                {person.name.split(' ')[0]}
              </span>
            </span>
          )}

          {projectTitle && (
            <Link
              to={`/projects/${decision.project_slug}`}
              className="flex items-center gap-1 hover:underline"
              style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--teal)', textDecoration: 'none' }}
            >
              <FolderKanban size={11} />
              {projectTitle}
            </Link>
          )}

          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ fontWeight: 400, color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.06)' }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Linked projects */}
        {linkedProjects.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>Linked:</span>
            {linkedProjects.map((slug) => {
              const title = projects.find((p) => p.slug === slug)?.title || slug
              return (
                <Link
                  key={slug}
                  to={`/projects/${slug}`}
                  className="text-[10px] px-1.5 py-0.5 rounded-full hover:underline"
                  style={{ color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.04)', textDecoration: 'none' }}
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

// ── Similar Decisions Panel ──────────────────────────────────

function SimilarDecisionsPanel({ decisionId, projects }: { decisionId: string; projects: { slug: string; title: string }[] }) {
  const { data: similar = [], isLoading } = useSimilarDecisionsById(decisionId)

  if (isLoading) {
    return (
      <div className="px-4 pb-4" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', opacity: 0.5, padding: '8px 0' }}>
          Finding related decisions...
        </p>
      </div>
    )
  }

  if (similar.length === 0) {
    return (
      <div className="px-4 pb-4" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', opacity: 0.5, padding: '8px 0' }}>
          No similar decisions found.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-4" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
      <div className="flex items-center gap-1.5 mt-3 mb-2">
        <History size={12} style={{ color: 'var(--gold)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--gold)' }}>
          Related Decisions
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {similar.map((d) => {
          const projTitle = d.project_slug ? projects.find((p) => p.slug === d.project_slug)?.title : null
          return (
            <div
              key={d.id}
              className="p-3 rounded-lg"
              style={{ background: 'rgba(201,168,76,0.03)', border: '1px dashed rgba(201,168,76,0.12)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                  {d.title}
                </span>
                {d.outcome_sentiment && d.outcome_sentiment !== 'pending' && (
                  <SentimentBadge sentiment={d.outcome_sentiment} />
                )}
                {d.relevance_score && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}
                  >
                    score: {d.relevance_score}
                  </span>
                )}
              </div>
              {d.outcome && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--teal)', marginTop: 2, marginBottom: 2 }}>
                  Outcome: {d.outcome}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
                  {new Date(d.created_at).toLocaleDateString()}
                </span>
                {projTitle && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--teal)' }}>
                    {projTitle}
                  </span>
                )}
                {d.shared_tags && d.shared_tags.length > 0 && d.shared_tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] px-1 py-0.5 rounded-full"
                    style={{ color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.08)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Decision Timeline ────────────────────────────────────────

function DecisionTimeline({ decisions, projects }: { decisions: DecisionRow[]; projects: { slug: string; title: string }[] }) {
  return (
    <div className="relative pl-8" style={{ paddingTop: '4px' }}>
      {/* Vertical line */}
      <div
        className="absolute left-3 top-0 bottom-0"
        style={{ width: '2px', backgroundColor: 'rgba(201,168,76,0.2)' }}
      />

      {decisions.map((decision, i) => {
        const sentiment = decision.outcome_sentiment || 'pending'
        const config = SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.pending
        const tags = decision.tags ? decision.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
        const projTitle = decision.project_slug
          ? projects.find((p) => p.slug === decision.project_slug)?.title
          : null

        return (
          <motion.div
            key={decision.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="relative mb-6"
          >
            {/* Node dot */}
            <div
              className="absolute rounded-full"
              style={{
                left: '-25px',
                top: '6px',
                width: '10px',
                height: '10px',
                backgroundColor: config.color,
                border: '2px solid var(--cream)',
                boxShadow: `0 0 0 2px ${config.bg}`,
              }}
            />

            {/* Date label */}
            <div
              className="absolute text-right"
              style={{
                left: '-110px',
                top: '2px',
                width: '75px',
                fontSize: '10px',
                color: 'var(--slate)',
                opacity: 0.5,
              }}
            >
              {new Date(decision.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>

            {/* Content */}
            <div
              className="p-3 rounded-lg"
              style={{ background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.1)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>
                  {decision.title}
                </span>
                <SentimentBadge sentiment={sentiment} />
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ fontWeight: 400, color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.06)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {decision.outcome && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--teal)', marginTop: '4px', marginBottom: 0 }}>
                  Outcome: {decision.outcome}
                </p>
              )}

              {projTitle && (
                <Link
                  to={`/projects/${decision.project_slug}`}
                  className="flex items-center gap-1 mt-1"
                  style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--teal)', textDecoration: 'none', opacity: 0.7 }}
                >
                  <FolderKanban size={10} />
                  {projTitle}
                </Link>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────

function ReviewCard({
  decision,
  projects,
  updateOutcome,
}: {
  decision: DecisionRow
  projects: { slug: string; title: string }[]
  updateOutcome: ReturnType<typeof useUpdateDecisionOutcome>
}) {
  const [outcome, setOutcome] = useState('')
  const [sentiment, setSentiment] = useState('neutral')
  const person = decision.decided_by ? getPersonInfo(decision.decided_by) : null
  const projectTitle = decision.project_slug
    ? projects.find((p) => p.slug === decision.project_slug)?.title
    : null
  const days = daysAgo(decision.created_at)

  function handleSave() {
    if (!outcome.trim()) return
    updateOutcome.mutate({
      id: decision.id,
      outcome: outcome.trim(),
      outcome_status: 'recorded',
      outcome_sentiment: sentiment,
    })
    setOutcome('')
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(201,168,76,0.15)' }}
    >
      {/* Decision info */}
      <div className="p-4" style={{ background: 'var(--cream)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Scale size={14} style={{ color: 'var(--gold)' }} />
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>
            {decision.title}
          </span>
        </div>
        {decision.rationale && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--slate)', lineHeight: 1.5, margin: 0 }}>
            {decision.rationale}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {person && (
            <span className="flex items-center gap-1.5">
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="gold" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)' }}>
                {person.name.split(' ')[0]}
              </span>
            </span>
          )}
          {projectTitle && (
            <Link
              to={`/projects/${decision.project_slug}`}
              className="flex items-center gap-1"
              style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--teal)', textDecoration: 'none' }}
            >
              <FolderKanban size={11} />
              {projectTitle}
            </Link>
          )}
        </div>
      </div>

      {/* Outcome input */}
      <div
        className="p-4"
        style={{
          background: 'rgba(201,168,76,0.06)',
          borderTop: '1px solid rgba(201,168,76,0.15)',
          borderLeft: '3px solid var(--gold)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--ink)',
            marginBottom: '10px',
            fontWeight: 500,
          }}
        >
          This decision was made {days} days ago. What was the outcome?
        </p>
        <textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Describe the outcome..."
          rows={3}
          style={{
            width: '100%',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--ink)',
            background: 'var(--cream)',
            border: '1px solid rgba(201,168,76,0.15)',
            borderRadius: '8px',
            padding: '8px 12px',
            outline: 'none',
            resize: 'vertical',
            marginBottom: '8px',
          }}
        />
        <div className="flex items-center gap-3">
          <select
            value={sentiment}
            onChange={(e) => setSentiment(e.target.value)}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--ink)',
              background: 'var(--cream)',
              border: '1px solid rgba(201,168,76,0.15)',
              borderRadius: '6px',
              padding: '6px 10px',
              outline: 'none',
            }}
          >
            <option value="positive">Positive outcome</option>
            <option value="neutral">Neutral outcome</option>
            <option value="negative">Negative outcome</option>
          </select>
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={!outcome.trim()}
            className="cursor-pointer px-4 py-1.5 rounded-md text-xs font-medium"
            style={{
              background: outcome.trim() ? 'var(--gold)' : 'rgba(201,168,76,0.2)',
              color: outcome.trim() ? '#0f1923' : 'var(--slate)',
              border: 'none',
              opacity: outcome.trim() ? 1 : 0.5,
            }}
            whileTap={{ scale: 0.95 }}
          >
            Save Outcome
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// ── Create Decision Modal ─────────────────────────────────────

function CreateDecisionModal({
  projects,
  onCreate,
  onClose,
}: {
  projects: { slug: string; title: string }[]
  onCreate: ReturnType<typeof useCreateDecision>
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [context, setContext] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const [tags, setTags] = useState('')
  const [linkedProjectSlugs, setLinkedProjectSlugs] = useState<string[]>([])
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const { showSuccess } = useToast()

  // Decision replay -- search for similar past decisions as user types
  const debouncedTitle = useDebounce(title, 500)
  const { data: similarDecisions = [] } = useSimilarDecisions(debouncedTitle)

  // Auto-suggest tags based on decision text
  const fullText = `${title} ${rationale} ${context}`
  const suggestedTags = useMemo(() => suggestTags(fullText), [fullText])
  const currentTags = tags.split(',').map((t) => t.trim()).filter(Boolean)
  const newSuggestions = suggestedTags.filter((t) => !currentTags.includes(t))

  // Filtered projects for linking
  const filteredProjects = projectSearchQuery
    ? projects.filter((p) => p.title.toLowerCase().includes(projectSearchQuery.toLowerCase()) || p.slug.toLowerCase().includes(projectSearchQuery.toLowerCase()))
    : projects.slice(0, 8)

  function addTag(tag: string) {
    const existing = tags.split(',').map((t) => t.trim()).filter(Boolean)
    if (!existing.includes(tag)) {
      setTags(existing.length > 0 ? `${tags}, ${tag}` : tag)
    }
  }

  function toggleLinkedProject(slug: string) {
    setLinkedProjectSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  function handleSubmit() {
    if (!title.trim()) return
    onCreate.mutate({
      title: title.trim(),
      rationale: rationale.trim() || undefined,
      context: context.trim() || undefined,
      project_slug: projectSlug || undefined,
      tags: tags.trim() || undefined,
      linked_projects: linkedProjectSlugs.length > 0 ? linkedProjectSlugs.join(',') : undefined,
    }, {
      onSuccess: () => showSuccess('Decision logged'),
    })
    onClose()
  }

  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape
  useEffect(() => {
    if (!modalRef.current) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = modalRef.current!.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handler)
    modalRef.current.querySelector<HTMLElement>('input')?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const labelStyle = {
    fontSize: '10px',
    color: 'var(--slate)',
    opacity: 0.7,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: '4px',
  }

  const inputStyle = {
    width: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    color: 'var(--ink)',
    background: 'var(--cream)',
    border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: '8px',
    padding: '8px 12px',
    outline: 'none',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Record Decision"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
        style={{ backgroundColor: 'var(--cream)', border: '1px solid rgba(201,168,76,0.15)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2">
            <Scale size={18} style={{ color: 'var(--gold)' }} />
            <h3 style={{ fontWeight: 400, fontSize: '17px', color: 'var(--ink)', margin: 0 }}>
              Log a Decision
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Decision Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What was decided?"
              style={inputStyle}
              autoFocus
            />
            {similarDecisions.length > 0 && (
              <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(201,168,76,0.04)', border: '1px dashed rgba(201,168,76,0.2)' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <History size={12} style={{ color: 'var(--gold)' }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--gold)' }}>
                    Similar past decisions
                  </span>
                </div>
                {similarDecisions.map(d => (
                  <div key={d.id} className="py-2" style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                        {d.title}
                      </p>
                      {d.outcome_sentiment && d.outcome_sentiment !== 'pending' && (
                        <SentimentBadge sentiment={d.outcome_sentiment} />
                      )}
                    </div>
                    {d.outcome && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--teal)', marginTop: 2, marginBottom: 0 }}>
                        Outcome: {d.outcome}
                      </p>
                    )}
                    <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Rationale</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why was this decision made?"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Context</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="What were the alternatives considered?"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div className="flex gap-4">
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Primary Project (optional)</label>
              <select
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value)}
                style={{ ...inputStyle, padding: '8px 10px' }}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.title}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Tags (comma-separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. statistics, methodology"
                style={inputStyle}
              />
              {/* Tag auto-suggestions */}
              {newSuggestions.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span style={{ fontSize: '9px', color: 'var(--slate)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Suggested:
                  </span>
                  {newSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="text-[10px] px-1.5 py-0.5 rounded-full transition-colors"
                      style={{
                        color: 'var(--teal)',
                        backgroundColor: 'rgba(45,138,138,0.06)',
                        border: '1px dashed rgba(45,138,138,0.2)',
                        cursor: 'pointer',
                      }}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Linked Projects */}
          <div>
            <label style={labelStyle}>Linked Projects (optional)</label>
            <div className="relative">
              <div className="flex items-center gap-1" style={{ ...inputStyle, padding: '4px 8px', flexWrap: 'wrap' }}>
                {linkedProjectSlugs.map((slug) => {
                  const projTitle = projects.find((p) => p.slug === slug)?.title || slug
                  return (
                    <span
                      key={slug}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                      style={{ backgroundColor: 'rgba(45,138,138,0.08)', color: 'var(--teal)' }}
                    >
                      {projTitle}
                      <button
                        type="button"
                        onClick={() => toggleLinkedProject(slug)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: '0 2px', fontSize: '10px' }}
                      >
                        x
                      </button>
                    </span>
                  )
                })}
                <input
                  type="text"
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  placeholder={linkedProjectSlugs.length > 0 ? 'Add more...' : 'Search projects...'}
                  style={{
                    flex: 1,
                    minWidth: '120px',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                    padding: '4px',
                  }}
                />
              </div>
              {projectSearchQuery && filteredProjects.length > 0 && (
                <div
                  className="absolute z-10 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--cream)', border: '1px solid var(--border-light)', maxHeight: '150px', overflowY: 'auto' }}
                >
                  {filteredProjects.filter((p) => !linkedProjectSlugs.includes(p.slug)).map((p) => (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => { toggleLinkedProject(p.slug); setProjectSearchQuery('') }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                      style={{
                        fontFamily: 'var(--font-body)',
                        color: 'var(--ink)',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-light)',
                      }}
                    >
                      <Search size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px', opacity: 0.4 }} />
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end gap-3 border-t" style={{ borderColor: 'var(--border-light)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--slate)', background: 'none', border: '1px solid var(--border-light)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="cursor-pointer px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: title.trim() ? 'var(--teal)' : 'var(--ice)',
              color: title.trim() ? 'white' : 'var(--slate)',
              border: 'none',
              opacity: title.trim() ? 1 : 0.5,
            }}
            whileTap={{ scale: 0.95 }}
          >
            Log Decision
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
