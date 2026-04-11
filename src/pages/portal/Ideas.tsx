import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, LayoutGrid, List, ThumbsUp, X, Lightbulb, ArrowUpDown } from 'lucide-react'
import DensityToggle, { useDensity, densityClass } from '../../components/DensityToggle'
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
import PageLayout from '../../components/PageLayout'

type ViewMode = 'grid' | 'list'
type SortMode = 'newest' | 'votes' | 'title'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'var(--teal)', bg: 'var(--teal-active)' },
  under_review: { label: 'Under Review', color: 'var(--gold)', bg: 'var(--gold-active)' },
  approved: { label: 'Approved', color: 'var(--green)', bg: 'var(--green-hover)' },
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
  const [density, setDensity] = useDensity()
  const [view, setView] = useState<ViewMode>('grid')
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')

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
    const count = ideas.filter(i => i.status === 'new').length
    document.title = count > 0 ? `Ideas (${count} new) | MN-CCORE` : 'Ideas | MN-CCORE'
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [ideas])

  const handleIdeaStatusChange = (id: string, status: string, prevStatus: string) => {
    updateIdea.mutate({ id, fields: { status } })
    showUndo(`Idea → ${status.replace('_', ' ')}`, () => updateIdea.mutate({ id, fields: { status: prevStatus } }))
  }

  const sortedIdeas = useMemo(() => {
    const sorted = [...ideas]
    switch (sortMode) {
      case 'votes': sorted.sort((a, b) => (b.votes || 0) - (a.votes || 0)); break
      case 'title': sorted.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'newest':
      default: sorted.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')); break
    }
    return sorted
  }, [ideas, sortMode])

  const activeCount = ideas.filter((i) => i.status !== 'archived' && i.status !== 'parked').length

  return (
    <PageLayout>
      <PageHeader
        icon={<Lightbulb size={20} />}
        title="Ideas Board"
        subtitle={`${activeCount} active ideas`}
        count={activeCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--teal)', color: 'var(--ink-bright, #fff)', border: 'none', cursor: 'pointer' }}
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
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: cfg.color, backgroundColor: cfg.bg }}>
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

          <button
            onClick={() => setSortMode(s => s === 'newest' ? 'votes' : s === 'votes' ? 'title' : 'newest')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors border"
            style={{
              color: sortMode !== 'newest' ? 'var(--teal)' : 'var(--slate)',
              borderColor: sortMode !== 'newest' ? 'var(--teal)' : 'var(--border-light)',
              backgroundColor: sortMode !== 'newest' ? 'var(--teal-hover)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <ArrowUpDown size={10} />
            {sortMode === 'newest' ? 'Newest' : sortMode === 'votes' ? 'Most Voted' : 'A-Z'}
          </button>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-full border px-3 py-1.5 text-xs"
            style={{
              fontSize: '12px',
              color: filterStatus ? 'var(--teal)' : 'var(--slate)',
              backgroundColor: filterStatus ? 'var(--teal-hover)' : 'transparent',
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
          <DensityToggle value={density} onChange={setDensity} />
        </div>
      </PageHeader>

      {/* Content */}
      <div className={`mt-5 ${densityClass(density)}`}>
        {isLoading ? (
          view === 'grid' ? <CardSkeleton count={6} /> : <TableSkeleton rows={6} cols={5} />
        ) : view === 'grid' ? (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {sortedIdeas.map((idea) => (
              <motion.div key={idea.id} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}>
                <IdeaCard idea={idea} onVote={() => vote.mutate(idea.id)} onStatusChange={(status) => handleIdeaStatusChange(idea.id, status, idea.status)} />
              </motion.div>
            ))}
            {sortedIdeas.length === 0 && (
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
          <IdeaListView ideas={sortedIdeas} onVote={(id) => vote.mutate(id)} onStatusChange={(id, status) => {
            const prev = sortedIdeas.find(i => i.id === id)?.status || 'new'
            handleIdeaStatusChange(id, status, prev)
          }} focusedIndex={focusedIndex} />
        )}
      </div>

      {/* Create modal */}
      <CreateIdeaModal open={showCreate} onClose={() => setShowCreate(false)} />
    </PageLayout>
  )
}

// ── Idea Card ────────────────────────────────────────────────

function IdeaCard({ idea, onVote, onStatusChange }: { idea: IdeaRow; onVote: () => void; onStatusChange: (status: string) => void }) {
  const person = getPersonInfo(idea.submitted_by)
  const status = statusConfig[idea.status] || statusConfig.new

  return (
    <div className="rounded-xl border p-4 flex flex-col" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ color: status.color, backgroundColor: status.bg }}>
          {status.label}
        </span>
        {idea.research_area && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--gold)', backgroundColor: 'var(--gold-hover)' }}>
            {idea.research_area}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
        {idea.title}
      </h4>

      {/* Description */}
      {idea.description && (
        <p className="text-xs leading-relaxed mb-3 flex-1" style={{ color: 'var(--slate)', opacity: 0.7 }}>
          {idea.description.length > 120 ? idea.description.slice(0, 120) + '...' : idea.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 20, height: 20 }}>
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
          </div>
          <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.6 }}>
            {formatRelativeTime(idea.created_at)}
          </span>
        </div>

        <button
          onClick={(e) => {
            onVote()
            // Scale bounce animation
            const btn = e.currentTarget
            btn.style.transform = 'scale(1.3)'
            setTimeout(() => { btn.style.transform = 'scale(1)' }, 150)
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-md transition-all hover:bg-black/5"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)', transition: 'transform 150ms ease, color 150ms' }}
        >
          <ThumbsUp size={13} />
          <span className="text-xs font-medium">
            {idea.votes}
          </span>
        </button>
      </div>
    </div>
  )
}

// ── Idea List View ───────────────────────────────────────────

function IdeaListView({ ideas, onVote, onStatusChange, focusedIndex = -1 }: { ideas: IdeaRow[]; onVote: (id: string) => void; onStatusChange: (id: string, status: string) => void; focusedIndex?: number }) {
  const gridCols = '40px minmax(200px, 1fr) 100px 90px 80px'
  return (
    <div className="table-container">
      {/* Column headers — hidden on mobile */}
      <div className="hidden sm:grid" style={{ gridTemplateColumns: gridCols, padding: 'var(--sp-sm) var(--sp-lg)', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', textAlign: 'center' as const }}>
          VOTES
        </span>
        {['TITLE', 'AREA', 'STATUS', 'BY'].map((col) => (
          <span key={col} style={{ fontSize: '10px', fontWeight: 500, color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
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
              style={{ gridTemplateColumns: gridCols, padding: `var(--row-padding-y, 10px) 16px`, alignItems: 'center' }}
            >
              {/* Votes */}
              <button
                onClick={() => onVote(idea.id)}
                className="flex flex-col items-center gap-0.5"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)' }}
              >
                <ThumbsUp size={13} />
                <span style={{ fontSize: 'var(--label-size)', fontWeight: 600 }}>{idea.votes}</span>
              </button>

              {/* Title + description */}
              <div style={{ minWidth: 0, paddingRight: '12px' }}>
                <span style={{ fontSize: 'var(--value-size)', fontWeight: 400, color: 'var(--ink)', display: 'block' }}>
                  {idea.title}
                </span>
                {idea.description && (
                  <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'block' }}>
                    {idea.description}
                  </span>
                )}
              </div>

              {/* Research area */}
              <span style={{ fontSize: '11px', color: 'var(--gold)', opacity: idea.research_area ? 0.7 : 0.3 }}>
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
              style={{ padding: `var(--row-padding-y, 12px) 16px` }}
            >
              {/* Title */}
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
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
                  <span style={{ fontSize: 'var(--label-size)', fontWeight: 600 }}>{idea.votes}</span>
                </button>
                <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: status.color }}>
                  {status.label}
                </span>
                {idea.research_area && (
                  <span style={{ fontSize: '11px', color: 'var(--gold)', opacity: 0.7 }}>
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
          <Lightbulb size={24} style={{ color: 'var(--teal)', opacity: 0.3, margin: '0 auto var(--sp-sm)' }} />
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.4 }}>
            No ideas yet
          </p>
        </div>
      )}

      {/* Calculations row */}
      {ideas.length > 0 && (() => {
        const statusCounts = ideas.reduce<Record<string, number>>((acc, i) => {
          acc[i.status] = (acc[i.status] || 0) + 1
          return acc
        }, {})
        const voted = ideas.filter(i => i.votes > 0).length
        const statusLabels: Record<string, string> = { new: 'New', under_review: 'Under Review', approved: 'Approved', parked: 'Parked', archived: 'Archived' }
        const statusColors: Record<string, string> = { new: 'var(--teal)', under_review: 'var(--gold)', approved: 'var(--green)', parked: 'var(--slate)', archived: 'var(--slate)' }
        const stats = [
          { label: 'Count', value: ideas.length },
          ...Object.entries(statusCounts).map(([key, count]) => ({
            label: statusLabels[key] || key,
            value: count,
            color: statusColors[key],
          })),
          ...(voted > 0 ? [{ label: 'Voted', value: voted, color: 'var(--teal)' }] : []),
        ]
        return (
          <div
            style={{
              display: 'flex',
              gap: 20,
              padding: 'var(--sp-sm) var(--sp-lg)',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--teal-hover)',
            }}
          >
            {stats.map(s => (
              <span key={s.label} style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.6 }}>
                {s.label}{' '}
                <span style={{ fontWeight: 600, color: (s as any).color || 'var(--slate)', opacity: 1 }}>
                  {s.value}
                </span>
              </span>
            ))}
          </div>
        )
      })()}
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
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape
  useEffect(() => {
    if (!open || !modalRef.current) return
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
  }, [open, onClose])

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
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="New Idea"
        className="rounded-xl shadow-xl border w-full max-w-md mx-4"
        style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-lg" style={{ fontWeight: 500, color: 'var(--ink)' }}>
            New Idea
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 'var(--sp-xs)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the idea?"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--border-subtle)' }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why is this interesting? What would it involve?"
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: 'var(--border-subtle)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Research Area
            </label>
            <select
              value={researchArea}
              onChange={(e) => setResearchArea(e.target.value)}
              className="w-full rounded-md border px-2.5 py-2 text-sm"
              style={{ borderColor: 'var(--border-subtle)', cursor: 'pointer' }}
            >
              <option value="">Select area (optional)</option>
              {researchAreas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-subtle)' }}>
              Cancel
            </button>
            <button type="submit" disabled={!title.trim()} className="px-4 py-2 rounded-md text-sm font-medium" style={{ backgroundColor: !title.trim() ? 'var(--border-subtle)' : 'var(--teal)', color: !title.trim() ? 'var(--slate)' : 'var(--ink-bright, #fff)', cursor: !title.trim() ? 'not-allowed' : 'pointer', border: 'none' }}>
              Submit Idea
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
