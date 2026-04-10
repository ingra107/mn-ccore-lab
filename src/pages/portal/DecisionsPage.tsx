import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Scale, Plus, AlertTriangle, FolderKanban, Tag, List, GitCommitVertical } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import Avatar from '../../components/Avatar'
import { useDecisions, useDecisionsForReview, useDecisionTags } from '../../hooks/useApiData'
import { useCreateDecision, useUpdateDecisionOutcome } from '../../hooks/useMutations'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { useUndoToast } from '../../components/UndoToast'
import { useProjects } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'
import { SENTIMENT_CONFIG } from '../../components/SentimentBadge'
import SentimentBadge from '../../components/SentimentBadge'
import DecisionCard from '../../components/DecisionCard'
import SimilarDecisionsPanel from '../../components/SimilarDecisionsPanel'
import CreateDecisionModal from '../../components/CreateDecisionModal'
import type { DecisionRow } from '../../hooks/useApiData'

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
                opacity: 'var(--ink-label)',
              }}
            >
              {formatShortDate(decision.created_at)}
            </div>

            {/* Content */}
            <div
              className="p-3 rounded-lg"
              style={{ background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.1)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--ink)' }}>
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
                <p style={{ fontSize: '12px', color: 'var(--teal)', marginTop: '4px', marginBottom: 0 }}>
                  Outcome: {decision.outcome}
                </p>
              )}

              {projTitle && (
                <Link
                  to={`/projects/${decision.project_slug}`}
                  className="flex items-center gap-1 mt-1"
                  style={{ fontSize: 'var(--label-size)', color: 'var(--teal)', textDecoration: 'none', opacity: 0.7 }}
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
  const days = Math.floor((new Date().getTime() - new Date(decision.created_at).getTime()) / (1000 * 60 * 60 * 24))

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
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', lineHeight: 1.5, margin: 0 }}>
            {decision.rationale}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2">
          {person && (
            <span className="flex items-center gap-1.5">
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="gold" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>
                {person.name.split(' ')[0]}
              </span>
            </span>
          )}
          {projectTitle && (
            <Link
              to={`/projects/${decision.project_slug}`}
              className="flex items-center gap-1"
              style={{ fontSize: 'var(--label-size)', color: 'var(--teal)', textDecoration: 'none' }}
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
            fontSize: 'var(--value-size)',
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
            fontSize: 'var(--value-size)',
            color: 'var(--ink)',
            background: 'var(--cream)',
            border: '1px solid rgba(201,168,76,0.15)',
            borderRadius: 'var(--radius-lg)',
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
              fontSize: '12px',
              color: 'var(--ink)',
              background: 'var(--cream)',
              border: '1px solid rgba(201,168,76,0.15)',
              borderRadius: 'var(--radius-md)',
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
              color: outcome.trim() ? 'var(--ink)' : 'var(--slate)',
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

// ── Main Page ────────────────────────────────────────────────

export default function DecisionsPage() {
  const [filterTag, setFilterTag] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
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

  // Filter decisions by status + search
  const filteredDecisions = allDecisions.filter((d) => {
    if (filterStatus && d.outcome_status !== filterStatus) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const text = `${d.title} ${d.rationale || ''} ${d.outcome || ''} ${d.tags || ''}`.toLowerCase()
      if (!text.includes(q)) return false
    }
    return true
  })

  const pendingCount = allDecisions.filter((d) => d.outcome_status === 'pending').length
  const recordedCount = allDecisions.filter((d) => d.outcome_status !== 'pending').length

  useListKeyboardNav({
    itemCount: viewMode === 'list' ? filteredDecisions.length : 0,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

  // N key opens create modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !showCreate) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setShowCreate(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCreate])

  // Dynamic page title
  useEffect(() => {
    document.title = pendingCount > 0 ? `Decisions (${pendingCount} pending) | MN-CCORE` : 'Decisions | MN-CCORE'
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [pendingCount])

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
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
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

        {/* Search */}
        <div className="mt-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decisions..."
            className="w-full max-w-xs rounded-lg border px-3 py-1.5 text-xs outline-none"
            style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)', background: 'var(--cream)' }}
          />
        </div>

        {/* Tag filters */}
        {tagCounts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <Tag size={12} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
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

// Re-export sub-components for any consumers that may import them directly
export { SimilarDecisionsPanel }
