import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, Plus, X, Clock, AlertTriangle, FolderKanban, History } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import SectionHeader from '../../components/SectionHeader'
import Avatar from '../../components/Avatar'
import { useDecisions, useDecisionsForReview, useSimilarDecisions } from '../../hooks/useApiData'
import { useCreateDecision, useUpdateDecisionOutcome } from '../../hooks/useMutations'
import { useProjects } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import { useDebounce } from '../../hooks/useDebounce'
import type { DecisionRow } from '../../hooks/useApiData'

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export default function DecisionsPage() {
  const { data: allDecisions = [], isLoading } = useDecisions()
  const { data: reviewDecisions = [] } = useDecisionsForReview()
  const { data: projects = [] } = useProjects()
  const createDecision = useCreateDecision()
  const updateOutcome = useUpdateDecisionOutcome()

  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')

  // Filter decisions (exclude review ones from recent if showing separately)
  const recentDecisions = filterStatus
    ? allDecisions.filter((d) => d.outcome_status === filterStatus)
    : allDecisions

  const pendingCount = allDecisions.filter((d) => d.outcome_status === 'pending').length
  const recordedCount = allDecisions.filter((d) => d.outcome_status === 'recorded').length

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionHeader
          icon={Scale}
          title="Decision Log"
          subtitle={`${allDecisions.length} decisions tracked -- ${pendingCount} pending review, ${recordedCount} with outcomes`}
        />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors mt-1"
          style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={16} />
          Log Decision
        </button>
      </div>

      {/* Status filters */}
      <div className="mt-5 flex items-center gap-2 flex-wrap">
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
              fontFamily: 'var(--font-sans)',
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

      {/* Decisions Awaiting Review */}
      {reviewDecisions.length > 0 && !filterStatus && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: 'var(--gold)' }} />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '16px',
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              Awaiting Outcome Review
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ fontFamily: 'var(--font-mono)', backgroundColor: 'rgba(201,168,76,0.12)', color: 'var(--gold)' }}
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

      {/* Recent Decisions */}
      <div className="mt-8">
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '16px',
            color: 'var(--ink)',
            marginBottom: '16px',
          }}
        >
          {filterStatus ? `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} Decisions` : 'All Decisions'}
        </h2>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--ice)' }} />
            ))}
          </div>
        ) : recentDecisions.length === 0 ? (
          <div
            className="text-center py-12 rounded-xl"
            style={{ background: 'var(--ice)' }}
          >
            <Scale size={32} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 12px' }} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)', opacity: 0.5 }}>
              No decisions logged yet. Start building institutional memory.
            </p>
          </div>
        ) : (
          <div className="table-container flex flex-col gap-3" style={{ padding: '16px 20px' }}>
            {recentDecisions.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} projects={projects} />
            ))}
          </div>
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

// ── Decision Card ─────────────────────────────────────────────

function DecisionCard({ decision, projects }: { decision: DecisionRow; projects: { slug: string; title: string }[] }) {
  const person = decision.decided_by ? getPersonInfo(decision.decided_by) : null
  const projectTitle = decision.project_slug
    ? projects.find((p) => p.slug === decision.project_slug)?.title
    : null
  const tags = decision.tags ? decision.tags.split(',').map((t) => t.trim()).filter(Boolean) : []

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl"
      style={{ background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.12)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Scale size={14} style={{ color: 'var(--gold)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>
          {decision.title}
        </span>
        {decision.outcome_status !== 'pending' && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
            style={{
              fontFamily: 'var(--font-mono)',
              color: decision.outcome_status === 'recorded' ? 'var(--teal)' : 'var(--gold)',
              backgroundColor: decision.outcome_status === 'recorded' ? 'rgba(45,138,138,0.08)' : 'rgba(201,168,76,0.08)',
            }}
          >
            {decision.outcome_status}
          </span>
        )}
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

      {/* Metadata row */}
      <div className="flex items-center gap-3 flex-wrap mt-2">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
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
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', backgroundColor: 'rgba(100,116,139,0.08)' }}
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
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
  const [status, setStatus] = useState('recorded')
  const person = decision.decided_by ? getPersonInfo(decision.decided_by) : null
  const projectTitle = decision.project_slug
    ? projects.find((p) => p.slug === decision.project_slug)?.title
    : null
  const days = daysAgo(decision.created_at)

  function handleSave() {
    if (!outcome.trim()) return
    updateOutcome.mutate({ id: decision.id, outcome: outcome.trim(), outcome_status: status })
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
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>
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
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
            <option value="recorded">Worked</option>
            <option value="recorded">Partially worked</option>
            <option value="recorded">Didn't work</option>
            <option value="revisited">Too early to tell</option>
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
              fontFamily: 'var(--font-sans)',
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

  // Decision replay — search for similar past decisions as user types
  const debouncedTitle = useDebounce(title, 500)
  const { data: similarDecisions = [] } = useSimilarDecisions(debouncedTitle)

  function handleSubmit() {
    if (!title.trim()) return
    onCreate.mutate({
      title: title.trim(),
      rationale: rationale.trim() || undefined,
      context: context.trim() || undefined,
      project_slug: projectSlug || undefined,
      tags: tags.trim() || undefined,
    })
    onClose()
  }

  const labelStyle = {
    fontFamily: 'var(--font-mono)',
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
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
        style={{ backgroundColor: 'var(--cream)', border: '1px solid rgba(201,168,76,0.15)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2">
            <Scale size={18} style={{ color: 'var(--gold)' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px', color: 'var(--ink)', margin: 0 }}>
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
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                      {d.title}
                    </p>
                    {d.outcome && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--teal)', marginTop: 2, marginBottom: 0 }}>
                        Outcome: {d.outcome}
                      </p>
                    )}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
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
              <label style={labelStyle}>Project (optional)</label>
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
                placeholder="e.g. infrastructure, hiring"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end gap-3 border-t" style={{ borderColor: 'var(--border-light)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', background: 'none', border: '1px solid var(--border-light)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="cursor-pointer px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              fontFamily: 'var(--font-sans)',
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
