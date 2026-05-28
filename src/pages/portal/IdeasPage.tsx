import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, ThumbsUp, X, Lightbulb, Pencil, Archive } from 'lucide-react'
import DensityToggle, { useDensity, densityClass } from '../../components/DensityToggle'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { ColumnHeader, TableContainer } from '../../components/table'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { useIdeas } from '../../hooks/useApiData'
import { useCreateIdea, useVoteIdea, useUpdateIdea } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { IdeaRow } from '../../lib/api'

type SortKey = 'title' | 'submitter' | 'status' | 'votes' | 'created_at'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'var(--teal)', bg: 'var(--teal-active)' },
  under_review: { label: 'Under Review', color: 'var(--gold)', bg: 'var(--gold-active)' },
  approved: { label: 'Approved', color: 'var(--green)', bg: 'var(--green-hover)' },
  parked: { label: 'Parked', color: 'var(--slate)', bg: 'var(--hover-subtle)' },
  archived: { label: 'Archived', color: 'var(--slate)', bg: 'var(--hover-subtle)' },
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

const GRID_COLS = 'minmax(200px, 3fr) 120px 100px 80px 80px 80px'

export default function IdeasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [density, setDensity] = useDensity()
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  // P2-10: kanban-first. The data model is a 4-state pipeline; default to
  // showing it that way. List view stays available as a toggle for sorting
  // / filtering across all states at once.
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>(() => {
    if (typeof window === 'undefined') return 'kanban'
    return (window.localStorage.getItem('ideas-view') as 'kanban' | 'list') ?? 'kanban'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('ideas-view', viewMode)
  }, [viewMode])

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
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key as SortKey)
      // sensible defaults: dates/votes desc, text asc
      setSortAsc(key === 'title' || key === 'submitter' || key === 'status')
    }
  }

  const sortedIdeas = useMemo(() => {
    const sorted = [...ideas]
    const dir = sortAsc ? 1 : -1
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title) * dir
        case 'submitter': {
          const an = getPersonInfo(a.submitted_by).name || ''
          const bn = getPersonInfo(b.submitted_by).name || ''
          return an.localeCompare(bn) * dir
        }
        case 'status':
          return (a.status || '').localeCompare(b.status || '') * dir
        case 'votes':
          return ((a.votes || 0) - (b.votes || 0)) * dir
        case 'created_at':
        default:
          return (a.created_at || '').localeCompare(b.created_at || '') * dir
      }
    })
    return sorted
  }, [ideas, sortKey, sortAsc])

  useListKeyboardNav({
    itemCount: sortedIdeas.length,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

  // Reset focus when filters change
  useEffect(() => { setFocusedIndex(-1) }, [filterStatus])

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
    showUndo(`Idea \u2192 ${status.replace('_', ' ')}`, () => updateIdea.mutate({ id, fields: { status: prevStatus } }))
  }

  const handleVote = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation()
    vote.mutate(id)
    // Bounce animation (CSS transform, no Framer Motion)
    const btn = e.currentTarget
    btn.style.transform = 'scale(1.3)'
    window.setTimeout(() => { btn.style.transform = 'scale(1)' }, 150)
  }

  const handleEditSave = (id: string, fields: { title: string; description: string; research_area: string }) => {
    updateIdea.mutate({
      id,
      fields: {
        title: fields.title,
        description: fields.description || null,
        research_area: fields.research_area || null,
      },
    })
    setEditingId(null)
  }

  const activeCount = ideas.filter((i) => i.status !== 'archived' && i.status !== 'parked').length
  const isEmpty = !isLoading && sortedIdeas.length === 0

  return (
    <div className="content-container flex flex-col gap-4">
      <PageHeader
        icon={<Lightbulb size={20} />}
        title="Ideas Board"
        subtitle={`${activeCount} active ideas`}
        count={activeCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--teal-solid)',
              color: 'var(--ink-bright)',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--sp-sm) var(--sp-lg)',
            }}
          >
            <Plus size={16} />
            New Idea
          </button>
        }
      >
        {/* Controls - hidden when empty per M-04 */}
        {!isEmpty && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status flow legend */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {['new', 'under_review', 'approved', 'parked'].map((s, i) => {
                const cfg = statusConfig[s]
                return (
                  <span key={s} className="flex items-center gap-1">
                    <span
                      className="rounded-full"
                      style={{
                        color: cfg.color,
                        backgroundColor: cfg.bg,
                        fontSize: 'var(--text-micro)',
                        padding: '2px var(--sp-sm)',
                      }}
                    >
                      {cfg.label}
                    </span>
                    {i < 3 && (
                      <span
                        style={{
                          fontSize: 'var(--text-micro)',
                          color: 'var(--slate)',
                          opacity: 0.75,
                        }}
                      >
                        &#8594;
                      </span>
                    )}
                  </span>
                )
              })}
            </div>

            <InlineSelect
              value={filterStatus}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'new', label: 'New' },
                { value: 'under_review', label: 'Under Review' },
                { value: 'approved', label: 'Approved' },
                { value: 'parked', label: 'Parked' },
                { value: 'archived', label: 'Archived' },
              ]}
              onChange={setFilterStatus}
              alwaysShowChevron
            />

            {/* View toggle (P2-10) */}
            <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface-2)' }}>
              {(['kanban', 'list'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className="px-2.5 py-1 rounded text-xs"
                  style={{
                    background: viewMode === v ? 'var(--cream)' : 'transparent',
                    color: viewMode === v ? 'var(--ink)' : 'var(--slate)',
                    fontWeight: viewMode === v ? 500 : 400,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: viewMode === v ? 'var(--shadow-card)' : 'none',
                  }}
                >
                  {v === 'kanban' ? 'Board' : 'List'}
                </button>
              ))}
            </div>

            <DensityToggle value={density} onChange={setDensity} />
          </div>
        )}
      </PageHeader>

      {/* Content */}
      <div className={`mt-5 ${densityClass(density)}`}>
        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : isEmpty ? (
          <EmptyState
            icon={<Lightbulb size={40} />}
            title="The board is open"
            subtitle="Press N or use the form above to capture the first idea. Half-formed thoughts welcome — the team will sharpen them."
            action={{ label: 'Submit an idea', onClick: () => setShowCreate(true) }}
          />
        ) : viewMode === 'kanban' ? (
          /* P2-10: kanban-first board view */
          <>
          {(() => {
            // P2-R2-12: when one column holds >80% of ideas the board reads
            // as broken. Suggest List view via dismissible banner.
            const dismissed = (() => {
              try { return localStorage.getItem('ideas-kanban-lopsided-dismissed') === '1' } catch { return false }
            })()
            const total = sortedIdeas.length
            const newCount = sortedIdeas.filter(i => i.status === 'new').length
            const lopsided = total >= 5 && newCount / total > 0.8
            if (!lopsided || dismissed) return null
            return (
              <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg"
                style={{ background: 'var(--gold-hover)', border: '1px solid rgba(201,168,76,0.15)', fontSize: '12px', color: 'var(--slate)' }}>
                <span>Most ideas are still in <strong>New</strong>.</span>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: '12px' }}
                >
                  Switch to List view →
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => {
                    try { localStorage.setItem('ideas-kanban-lopsided-dismissed', '1') } catch { /* ok */ }
                    // Force re-render via no-op state nudge.
                    setViewMode((v) => v)
                  }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.6, padding: 4 }}
                >
                  ✕
                </button>
              </div>
            )
          })()}
          <div className="grid gap-4 overflow-x-auto" style={{ gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))' }}>
            {(['new', 'under_review', 'approved', 'parked'] as const).map((col) => {
              const colIdeas = sortedIdeas.filter((i) => i.status === col)
              const cfg = statusConfig[col]
              return (
                <div key={col} className="flex flex-col" style={{ minHeight: '200px' }}>
                  <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: `2px solid ${cfg.color}` }}>
                    <span style={{ color: cfg.color, fontSize: '12px', fontWeight: 'var(--weight-ui)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85 }}>
                      {colIdeas.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {colIdeas.map((idea) => {
                      const person = getPersonInfo(idea.submitted_by)
                      return (
                        <div
                          key={idea.id}
                          className="rounded-lg border p-3 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}
                          onClick={() => setExpandedId(expandedId === idea.id ? null : idea.id)}
                        >
                          <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500, lineHeight: 1.35 }}>
                            {idea.title}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.85 }}>
                              {person.name.split(' ')[0]}
                            </span>
                            {idea.votes > 0 && (
                              <span style={{ fontSize: '10px', color: 'var(--teal)' }}>
                                ▲ {idea.votes}
                              </span>
                            )}
                          </div>
                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            <InlineSelect
                              value={idea.status}
                              options={[
                                { value: 'new', label: 'New' },
                                { value: 'under_review', label: 'Under Review' },
                                { value: 'approved', label: 'Approved' },
                                { value: 'parked', label: 'Parked' },
                                { value: 'archived', label: 'Archived' },
                              ]}
                              onChange={(v) => handleIdeaStatusChange(idea.id, v, idea.status)}
                            />
                          </div>
                        </div>
                      )
                    })}
                    {colIdeas.length === 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px', textAlign: 'center' }}>
                        Empty
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </>
        ) : (
          <TableContainer ariaLabel="Ideas">
            {/* Column headers - hidden on mobile.
                No role="row" — see note in TableContainer (axe). */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: GRID_COLS,
                padding: 'var(--sp-sm) var(--sp-lg)',
                borderBottom: '1px solid var(--border-subtle)',
                alignItems: 'center',
                gap: 'var(--sp-md)',
              }}
            >
              <div>
                <ColumnHeader label="Title" sortKey="title" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              </div>
              <div>
                <ColumnHeader label="Submitter" sortKey="submitter" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              </div>
              <div>
                <ColumnHeader label="Status" sortKey="status" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <ColumnHeader label="Votes" sortKey="votes" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} align="right" />
              </div>
              <div>
                <ColumnHeader label="Age" sortKey="created_at" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              </div>
              <div />
            </div>

            {/* Rows */}
            <div>
              {sortedIdeas.map((idea, idx) => (
                <IdeaRowView
                  key={idea.id}
                  idea={idea}
                  isFocused={focusedIndex === idx}
                  isExpanded={expandedId === idea.id || editingId === idea.id}
                  isEditing={editingId === idea.id}
                  onToggleExpand={() => {
                    setEditingId(null)
                    setExpandedId(expandedId === idea.id ? null : idea.id)
                  }}
                  onVote={(e) => handleVote(e, idea.id)}
                  onStatusChange={(status) => handleIdeaStatusChange(idea.id, status, idea.status)}
                  onEdit={() => {
                    setExpandedId(idea.id)
                    setEditingId(idea.id)
                  }}
                  onEditSave={(fields) => handleEditSave(idea.id, fields)}
                  onEditCancel={() => {
                    setEditingId(null)
                    setExpandedId(null)
                  }}
                />
              ))}
            </div>

            {/* Calculations row */}
            {(() => {
              const statusCounts = sortedIdeas.reduce<Record<string, number>>((acc, i) => {
                acc[i.status] = (acc[i.status] || 0) + 1
                return acc
              }, {})
              const voted = sortedIdeas.filter(i => i.votes > 0).length
              const statusLabels: Record<string, string> = { new: 'New', under_review: 'Under Review', approved: 'Approved', parked: 'Parked', archived: 'Archived' }
              const statusColors: Record<string, string> = { new: 'var(--teal)', under_review: 'var(--gold)', approved: 'var(--green)', parked: 'var(--slate)', archived: 'var(--slate)' }
              const stats: { label: string; value: number; color?: string }[] = [
                { label: 'Count', value: sortedIdeas.length },
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
                    gap: 'var(--sp-xl)',
                    padding: 'var(--sp-sm) var(--sp-lg)',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'var(--hover-subtle)',
                  }}
                >
                  {stats.map(s => (
                    <span
                      key={s.label}
                      style={{
                        fontSize: 'var(--text-label)',
                        color: 'var(--slate)',
                        opacity: 'var(--ink-label)',
                      }}
                    >
                      {s.label}{' '}
                      <span style={{ fontWeight: 600, color: s.color || 'var(--slate)', opacity: 1 }}>
                        {s.value}
                      </span>
                    </span>
                  ))}
                </div>
              )
            })()}
          </TableContainer>
        )}
      </div>

      {/* Create modal */}
      <CreateIdeaModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

// IdeaRowView
function IdeaRowView({
  idea,
  isFocused,
  isExpanded,
  isEditing,
  onToggleExpand,
  onVote,
  onStatusChange,
  onEdit,
  onEditSave,
  onEditCancel,
}: {
  idea: IdeaRow
  isFocused: boolean
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onVote: (e: React.MouseEvent<HTMLButtonElement>) => void
  onStatusChange: (status: string) => void
  onEdit: () => void
  onEditSave: (fields: { title: string; description: string; research_area: string }) => void
  onEditCancel: () => void
}) {
  const person = getPersonInfo(idea.submitted_by)
  const [editTitle, setEditTitle] = useState(idea.title)
  const [editDescription, setEditDescription] = useState(idea.description ?? '')
  const [editArea, setEditArea] = useState(idea.research_area ?? '')

  // Reset edit fields when editing opens
  useEffect(() => {
    if (isEditing) {
      setEditTitle(idea.title)
      setEditDescription(idea.description ?? '')
      setEditArea(idea.research_area ?? '')
    }
  }, [isEditing, idea.title, idea.description, idea.research_area])

  return (
    <div
      className={`idea-row group${isFocused ? ' task-row-focused' : ''}`}
      style={{
        borderBottom: '1px solid var(--row-separator)',
      }}
    >
      {/* Desktop row */}
      <div
        className="hidden sm:grid"
        style={{
          gridTemplateColumns: GRID_COLS,
          padding: 'var(--row-padding-y, 10px) var(--sp-lg)',
          // align-items: center truncates rows with research_area sub-text
          // (title + 2px margin + 11px label = ~45px, overflows 44px row).
          // Switch to start + minHeight auto-grow keeps sub-text in its row.
          // GH #18. r7 2026-04-22.
          alignItems: 'start',
          gap: 'var(--sp-md)',
          minHeight: 'var(--row-height, 44px)',
          boxSizing: 'border-box' as const,
          transition: 'background-color var(--duration-fast)',
        }}
      >
        {/* Title (dominant, clickable to expand detail) */}
        <div style={{ minWidth: 0 }}>
          <span
            onClick={onToggleExpand}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggleExpand()
              }
            }}
            style={{
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-heading)',
              color: 'var(--ink)',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              cursor: 'pointer',
            }}
            title={idea.title}
            aria-expanded={isExpanded}
          >
            {idea.title}
          </span>
          {idea.research_area && (
            <span
              style={{
                display: 'block',
                fontSize: 'var(--text-label)',
                color: 'var(--gold)',
                opacity: 0.85,
                marginTop: 2,
              }}
            >
              {idea.research_area}
            </span>
          )}
        </div>

        {/* Submitter (recedes) */}
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <div style={{ width: 20, height: 20, flexShrink: 0 }}>
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
          </div>
          <span
            style={{
              fontSize: 'var(--text-small)',
              fontWeight: 400,
              color: 'var(--slate)',
              opacity: 'var(--ink-label)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {person.name || idea.submitted_by}
          </span>
        </div>

        {/* Status (inline editable) */}
        <div>
          <InlineSelect
            value={idea.status}
            options={[
              { value: 'new', label: 'New', color: 'var(--teal)' },
              { value: 'under_review', label: 'Review', color: 'var(--gold)' },
              { value: 'approved', label: 'Approved', color: 'var(--green)' },
              { value: 'parked', label: 'Parked', color: 'var(--slate)' },
              { value: 'archived', label: 'Archived', color: 'var(--slate)' },
            ]}
            onChange={onStatusChange}
          />
        </div>

        {/* Votes (right-aligned numeric with bounce) */}
        <div style={{ textAlign: 'right' as const }}>
          <button
            onClick={onVote}
            className="inline-flex items-center gap-1 rounded-md"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)',
              transition: 'transform var(--duration-normal) var(--ease-out), color var(--duration-normal)',
              padding: '2px var(--sp-sm)',
              minHeight: '44px',
              minWidth: '44px',
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-label={`Vote (${idea.votes})`}
          >
            <ThumbsUp size={13} />
            <span
              style={{
                fontSize: 'var(--text-small)',
                fontWeight: 600,
              }}
            >
              {idea.votes}
            </span>
          </button>
        </div>

        {/* Age (recedes) */}
        <div>
          <span
            style={{
              fontSize: 'var(--text-small)',
              fontWeight: 400,
              color: 'var(--slate)',
              opacity: 'var(--ink-label)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatRelativeTime(idea.created_at)}
          </span>
        </div>

        {/* Actions (hover-only ghost buttons) */}
        <div
         
          className="idea-actions flex items-center justify-end gap-1"
        >
          <button
            className="rounded-md"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              color: 'var(--slate)',
              cursor: 'pointer',
              padding: '4px',
              minHeight: '44px',
              minWidth: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Edit idea"
            title="Edit"
          >
            <Pencil size={12} />
          </button>
          <button
            className="rounded-md"
            onClick={(e) => {
              e.stopPropagation()
              onStatusChange('archived')
            }}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              color: 'var(--slate)',
              cursor: 'pointer',
              padding: '4px',
              minHeight: '44px',
              minWidth: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Archive idea"
            title="Archive"
          >
            <Archive size={12} />
          </button>
        </div>
      </div>

      {/* Mobile stacked row */}
      <div
        className="sm:hidden"
        style={{
          padding: 'var(--row-padding-y, 12px) var(--sp-lg)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--weight-heading)',
            color: 'var(--ink)',
            display: 'block',
            marginBottom: 'var(--sp-xs)',
          }}
        >
          {idea.title}
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onVote}
            className="flex items-center gap-1"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)',
              padding: '0 var(--sp-sm)',
              minHeight: '44px',
              transition: 'transform var(--duration-normal) var(--ease-out)',
            }}
          >
            <ThumbsUp size={11} />
            <span style={{ fontSize: 'var(--text-label)', fontWeight: 600 }}>{idea.votes}</span>
          </button>
          <span
            style={{
              fontSize: 'var(--text-label)',
              fontWeight: 500,
              color: (statusConfig[idea.status] || statusConfig.new).color,
            }}
          >
            {(statusConfig[idea.status] || statusConfig.new).label}
          </span>
          {idea.research_area && (
            <span style={{ fontSize: 'var(--text-label)', color: 'var(--gold)', opacity: 0.85 }}>
              {idea.research_area}
            </span>
          )}
          <span
            style={{
              fontSize: 'var(--text-label)',
              color: 'var(--slate)',
              opacity: 'var(--ink-label)',
            }}
          >
            {formatRelativeTime(idea.created_at)}
          </span>
          <div style={{ width: 18, height: 18, flexShrink: 0, marginLeft: 'auto' }}>
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" variant="ice" />
          </div>
        </div>
      </div>

      {/* Scoped CSS for hover actions + row hover */}
      <style>{`
        .idea-row:hover > div:first-child {
          background-color: var(--hover-subtle);
        }
        .idea-row .idea-actions {
          opacity: 0;
          pointer-events: none;
          transition: opacity var(--duration-normal);
        }
        .idea-row:hover .idea-actions {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>

      {/* Inline detail panel (shown when title is clicked or Edit pressed) */}
      {isExpanded && (
        <div
          style={{
            padding: 'var(--sp-md) var(--sp-lg)',
            background: 'var(--hover-subtle, rgba(0,0,0,0.02))',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: 'var(--text-small)',
            color: 'var(--ink)',
          }}
        >
          {isEditing ? (
            /* ── Inline edit form ── */
            <form
              onSubmit={(e) => {
                e.preventDefault()
                onEditSave({ title: editTitle.trim(), description: editDescription.trim(), research_area: editArea })
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--slate)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--cream)', color: 'var(--ink)', fontSize: 'var(--text-base)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--slate)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--cream)', color: 'var(--ink)', fontSize: 'var(--text-small)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--slate)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Research Area</label>
                <select
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value)}
                  aria-label="Research area"
                  style={{ padding: '6px 8px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--cream)', color: 'var(--ink)', fontSize: 'var(--text-small)' }}
                >
                  <option value="">— none —</option>
                  {researchAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <button
                  type="submit"
                  disabled={!editTitle.trim()}
                  style={{ padding: '6px 14px', background: 'var(--teal-solid)', color: 'var(--ink-bright)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-small)', fontWeight: 500 }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onEditCancel}
                  style={{ padding: '6px 14px', background: 'none', color: 'var(--slate)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-small)' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
          /* ── Read-only detail ── */
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Title</div>
              <div style={{ whiteSpace: 'normal' }}>{idea.title}</div>
            </div>
            {idea.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Description</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{idea.description}</div>
              </div>
            )}
            {idea.research_area && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Research area</div>
                <div style={{ color: 'var(--gold)' }}>{idea.research_area}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Submitted by</div>
              <div>{person.name || idea.submitted_by}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Submitted</div>
              <div>{formatRelativeTime(idea.created_at)}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Votes</div>
              <div style={{ color: idea.votes > 0 ? 'var(--teal)' : 'var(--slate)' }}>{idea.votes}</div>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  )
}

// CreateIdeaModal
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        const form = modalRef.current?.querySelector('form')
        if (form) form.requestSubmit()
        return
      }
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
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'var(--overlay-medium)', zIndex: 'var(--z-modal)' }}
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
        <div
          className="flex items-center justify-between border-b"
          style={{
            borderColor: 'var(--border-subtle)',
            padding: 'var(--sp-md) var(--sp-xl)',
          }}
        >
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, color: 'var(--ink)' }}>
            New Idea
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--slate)',
              padding: 'var(--sp-xs)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col"
          style={{ padding: 'var(--sp-xl)', gap: 'var(--sp-md)' }}
        >
          <div>
            <label
              htmlFor="idea-title"
              className="block"
              style={{
                fontSize: 'var(--text-label)',
                fontWeight: 500,
                color: 'var(--slate)',
                marginBottom: 'var(--sp-xs)',
              }}
            >
              Title *
            </label>
            <input
              id="idea-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the idea?"
              className="w-full rounded-md border outline-none"
              style={{
                borderColor: 'var(--border-subtle)',
                padding: 'var(--sp-sm) var(--sp-md)',
                fontSize: 'var(--text-small)',
              }}
              aria-required="true"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="idea-description"
              className="block"
              style={{
                fontSize: 'var(--text-label)',
                fontWeight: 500,
                color: 'var(--slate)',
                marginBottom: 'var(--sp-xs)',
              }}
            >
              Description
            </label>
            <textarea
              id="idea-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why is this interesting? What would it involve?"
              rows={3}
              className="w-full rounded-md border outline-none resize-none"
              style={{
                borderColor: 'var(--border-subtle)',
                padding: 'var(--sp-sm) var(--sp-md)',
                fontSize: 'var(--text-small)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="idea-area"
              className="block"
              style={{
                fontSize: 'var(--text-label)',
                fontWeight: 500,
                color: 'var(--slate)',
                marginBottom: 'var(--sp-xs)',
              }}
            >
              Research Area
            </label>
            <InlineSelect
              value={researchArea}
              options={[{ value: '', label: 'Select area (optional)' }, ...researchAreas.map((a) => ({ value: a, label: a }))]}
              onChange={setResearchArea}
              size="md"
              alwaysShowChevron
            />
          </div>

          {!title.trim() && (
            <p
              id="idea-submit-hint"
              style={{
                fontSize: 'var(--text-label)',
                color: 'var(--slate)',
                opacity: 0.85,
              }}
            >
              Title is required.
            </p>
          )}
          <div
            className="flex justify-end"
            style={{ gap: 'var(--sp-sm)', marginTop: 'var(--sp-sm)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-md"
              style={{
                color: 'var(--slate)',
                cursor: 'pointer',
                background: 'none',
                border: '1px solid var(--border-subtle)',
                padding: 'var(--sp-sm) var(--sp-lg)',
                fontSize: 'var(--text-small)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              aria-describedby={!title.trim() ? 'idea-submit-hint' : undefined}
              className="rounded-md"
              style={{
                backgroundColor: !title.trim() ? 'var(--border-subtle)' : 'var(--teal)',
                color: !title.trim() ? 'var(--slate)' : 'var(--ink-bright)',
                cursor: !title.trim() ? 'not-allowed' : 'pointer',
                border: 'none',
                padding: 'var(--sp-sm) var(--sp-lg)',
                fontSize: 'var(--text-small)',
                fontWeight: 500,
              }}
            >
              Submit Idea
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
