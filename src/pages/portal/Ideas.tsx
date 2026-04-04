import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, LayoutGrid, List, ThumbsUp, X, Lightbulb } from 'lucide-react'
import { CardSkeleton, TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import ToggleButton from '../../components/ToggleButton'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { useIdeas } from '../../hooks/useApiData'
import { useCreateIdea, useVoteIdea, useUpdateIdea } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { IdeaRow } from '../../lib/api'

type ViewMode = 'grid' | 'list'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'var(--teal)', bg: 'rgba(45,138,138,0.08)' },
  under_review: { label: 'Under Review', color: 'var(--gold)', bg: 'rgba(201,168,76,0.08)' },
  approved: { label: 'Approved', color: 'var(--green, #22c55e)', bg: 'rgba(34,197,94,0.08)' },
  parked: { label: 'Parked', color: 'var(--slate)', bg: 'rgba(100,116,139,0.08)' },
  archived: { label: 'Archived', color: 'var(--slate)', bg: 'rgba(100,116,139,0.05)' },
}

const researchAreas = [
  'Mechanical Ventilation',
  'Sepsis',
  'ARDS',
  'ICU Quality',
  'Machine Learning',
  'Fluid Management',
  'Health Equity',
  'CLIF',
  'Other',
]

export default function Ideas() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('grid')
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')

  // Auto-open create modal from URL params (keyboard shortcut N)
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: ideas = [], isLoading } = useIdeas(filterStatus ? { status: filterStatus } : undefined)
  const vote = useVoteIdea()
  const updateIdea = useUpdateIdea()
  const { showUndo } = useUndoToast()
  const [focusedIndex, setFocusedIndex] = useState(-1)

  useListKeyboardNav({
    itemCount: view === 'list' ? ideas.length : 0,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

  // Reset focus when filters change
  useEffect(() => { setFocusedIndex(-1) }, [filterStatus, view])

  const handleIdeaStatusChange = (id: string, status: string, prevStatus: string) => {
    updateIdea.mutate({ id, fields: { status } })
    showUndo(`Idea → ${status.replace('_', ' ')}`, () => updateIdea.mutate({ id, fields: { status: prevStatus } }))
  }

  const activeCount = ideas.filter((i) => i.status !== 'archived' && i.status !== 'parked').length

  return (
    <div>
      <PageHeader
        icon={<Lightbulb size={20} />}
        title="Ideas Board"
        subtitle={`${activeCount} active ideas`}
        count={activeCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={16} />
            New Idea
          </button>
        }
      >
        {/* Status flow legend */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {['new', 'under_review', 'approved', 'parked'].map((s, i) => {
            const cfg = statusConfig[s]
            return (
              <span key={s} className="flex items-center gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-sans)', color: cfg.color, backgroundColor: cfg.bg }}>
                  {cfg.label}
                </span>
                {i < 3 && <span className="text-[8px]" style={{ color: 'var(--slate)', opacity: 0.3 }}>&#8594;</span>}
              </span>
            )
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {([
              { key: 'grid' as ViewMode, label: 'Grid', icon: LayoutGrid },
              { key: 'list' as ViewMode, label: 'List', icon: List },
            ]).map((v) => {
              const Icon = v.icon
              const active = view === v.key
              return (
                <ToggleButton
                  key={v.key}
                  active={active}
                  onClick={() => setView(v.key)}
                >
                  <Icon size={14} />
                  {v.label}
                </ToggleButton>
              )
            })}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-full border px-3 py-1.5 text-xs"
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '12px',
              color: filterStatus ? 'var(--teal)' : 'var(--slate)',
              backgroundColor: filterStatus ? 'rgba(45,138,138,0.06)' : 'transparent',
              borderColor: filterStatus ? 'var(--teal)' : 'var(--border-light)',
              cursor: 'pointer', appearance: 'none' as const, WebkitAppearance: 'none' as const,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: '24px',
            }}
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="parked">Parked</option>
          </select>
        </div>
      </PageHeader>

      {/* Content */}
      <div className="mt-5">
        {isLoading ? (
          view === 'grid' ? <CardSkeleton count={6} /> : <TableSkeleton rows={6} cols={5} />
        ) : view === 'grid' ? (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {ideas.map((idea) => (
              <motion.div key={idea.id} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}>
                <IdeaCard idea={idea} onVote={() => vote.mutate(idea.id)} onStatusChange={(status) => handleIdeaStatusChange(idea.id, status, idea.status)} />
              </motion.div>
            ))}
            {ideas.length === 0 && (
              <div className="col-span-3">
                <EmptyState
                  icon={<Lightbulb size={40} />}
                  title="The board is open"
                  subtitle="Research ideas, clinical questions, side projects — anything worth exploring. Drop one here and let the team weigh in."
                  action={{ label: 'Submit an idea', onClick: () => setShowCreate(true) }}
                />
              </div>
            )}
          </motion.div>
        ) : (
          <IdeaListView ideas={ideas} onVote={(id) => vote.mutate(id)} onStatusChange={(id, status) => {
            const prev = ideas.find(i => i.id === id)?.status || 'new'
            handleIdeaStatusChange(id, status, prev)
          }} focusedIndex={focusedIndex} />
        )}
      </div>

      {/* Create modal */}
      <CreateIdeaModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

// ── Idea Card ────────────────────────────────────────────────

function IdeaCard({ idea, onVote, onStatusChange }: { idea: IdeaRow; onVote: () => void; onStatusChange: (status: string) => void }) {
  const person = getPersonInfo(idea.submitted_by)
  const status = statusConfig[idea.status] || statusConfig.new

  return (
    <div className="rounded-xl border p-4 flex flex-col" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--cream)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ fontFamily: 'var(--font-sans)', color: status.color, backgroundColor: status.bg }}>
          {status.label}
        </span>
        {idea.research_area && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-sans)', color: 'var(--gold)', backgroundColor: 'rgba(201,168,76,0.06)' }}>
            {idea.research_area}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold mb-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
        {idea.title}
      </h4>

      {/* Description */}
      {idea.description && (
        <p className="text-xs leading-relaxed mb-3 flex-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
          {idea.description.length > 120 ? idea.description.slice(0, 120) + '...' : idea.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 20, height: 20 }}>
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
          </div>
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>
            {formatRelativeTime(idea.created_at)}
          </span>
        </div>

        <button
          onClick={onVote}
          className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-black/5"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)' }}
        >
          <ThumbsUp size={13} />
          <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-sans)' }}>
            {idea.votes}
          </span>
        </button>
      </div>
    </div>
  )
}

// ── Idea List View ───────────────────────────────────────────

function IdeaListView({ ideas, onVote, onStatusChange, focusedIndex = -1 }: { ideas: IdeaRow[]; onVote: (id: string) => void; onStatusChange: (id: string, status: string) => void; focusedIndex?: number }) {
  const gridCols = '40px 1fr 100px 90px 80px'
  return (
    <div className="table-container">
      {/* Column headers — hidden on mobile */}
      <div className="hidden sm:grid" style={{ gridTemplateColumns: gridCols, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 0.5, textTransform: 'uppercase' as const, letterSpacing: '0.06em', textAlign: 'center' as const }}>
          VOTES
        </span>
        {['TITLE', 'AREA', 'STATUS', 'BY'].map((col) => (
          <span key={col} style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 0.5, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      {ideas.map((idea, idx) => {
        const person = getPersonInfo(idea.submitted_by)
        const status = statusConfig[idea.status] || statusConfig.new
        const isFocused = focusedIndex === idx
        return (
          <div key={idea.id} className={isFocused ? 'task-row-focused' : ''} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {/* Desktop row — hidden on mobile */}
            <div
              className="hidden sm:grid hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
              style={{ gridTemplateColumns: gridCols, padding: '10px 16px', alignItems: 'center' }}
            >
              {/* Votes */}
              <button
                onClick={() => onVote(idea.id)}
                className="flex flex-col items-center gap-0.5"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)' }}
              >
                <ThumbsUp size={13} />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600 }}>{idea.votes}</span>
              </button>

              {/* Title + description */}
              <div style={{ minWidth: 0, paddingRight: '12px' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 400, color: 'var(--ink)', display: 'block' }}>
                  {idea.title}
                </span>
                {idea.description && (
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--slate)', opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                    {idea.description}
                  </span>
                )}
              </div>

              {/* Research area */}
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', opacity: idea.research_area ? 0.7 : 0.3 }}>
                {idea.research_area || '—'}
              </span>

              {/* Status (inline editable) */}
              <InlineSelect
                value={idea.status}
                options={[
                  { value: 'new', label: 'New', color: 'var(--teal)' },
                  { value: 'under_review', label: 'Review', color: 'var(--gold)' },
                  { value: 'approved', label: 'Approved', color: 'var(--green)' },
                  { value: 'parked', label: 'Parked', color: 'var(--slate)' },
                ]}
                onChange={(val) => onStatusChange(idea.id, val)}
              />

              {/* Submitted by */}
              <div className="flex items-center gap-1.5">
                <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                  <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
                </div>
              </div>
            </div>

            {/* Mobile row — shown only on mobile */}
            <div
              className="sm:hidden hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
              style={{ padding: '12px 16px' }}
            >
              {/* Title */}
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                {idea.title}
              </span>
              {/* Metadata row */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => onVote(idea.id)}
                  className="flex items-center gap-1"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)', padding: 0 }}
                >
                  <ThumbsUp size={11} />
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600 }}>{idea.votes}</span>
                </button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: status.color }}>
                  {status.label}
                </span>
                {idea.research_area && (
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', opacity: 0.7 }}>
                    {idea.research_area}
                  </span>
                )}
                <div style={{ width: 18, height: 18, flexShrink: 0 }}>
                  <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-[18px] !h-[18px] !min-w-0 !min-h-0 !text-[7px]" />
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {ideas.length === 0 && (
        <div className="text-center py-16">
          <Lightbulb size={24} style={{ color: 'var(--teal)', opacity: 0.3, margin: '0 auto 8px' }} />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--slate)', opacity: 0.4 }}>
            No ideas yet
          </p>
        </div>
      )}
    </div>
  )
}

// ── Create Idea Modal ────────────────────────────────────────

function CreateIdeaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [researchArea, setResearchArea] = useState('')
  const createIdea = useCreateIdea()
  const { showSuccess } = useToast()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createIdea.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      research_area: researchArea || undefined,
    }, {
      onSuccess: () => showSuccess('Idea submitted'),
    })
    setTitle('')
    setDescription('')
    setResearchArea('')
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15,25,35,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-xl border w-full max-w-md mx-4"
        style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, color: 'var(--ink)' }}>
            New Idea
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the idea?"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)' }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why is this interesting? What would it involve?"
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
              style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
              Research Area
            </label>
            <select
              value={researchArea}
              onChange={(e) => setResearchArea(e.target.value)}
              className="w-full rounded-md border px-2.5 py-2 text-sm"
              style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)', cursor: 'pointer' }}
            >
              <option value="">Select area (optional)</option>
              {researchAreas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-light)' }}>
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} className="px-4 py-2 rounded-md text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', backgroundColor: !title.trim() ? 'var(--border-light)' : 'var(--teal)', color: !title.trim() ? 'var(--slate)' : 'white', cursor: !title.trim() ? 'not-allowed' : 'pointer', border: 'none' }}>
              Submit Idea
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
