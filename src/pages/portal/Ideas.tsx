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
import PageLayout from '../../components/PageLayout'

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

export default function Ideas() {
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

  const activeCount = ideas.filter((i) => i.status !== 'archived' && i.status !== 'parked').length
  const isEmpty = !isLoading && sortedIdeas.length === 0

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

            <select
              aria-label="Filter ideas by status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-full border"
              style={{
                fontSize: 'var(--text-small)',
                padding: '6px var(--sp-md)',
                paddingRight: 'var(--sp-xl)',
                minHeight: '44px',
                color: filterStatus ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: filterStatus ? 'var(--teal-hover)' : 'transparent',
                borderColor: filterStatus ? 'var(--teal)' : 'var(--border-subtle)',
                cursor: 'pointer',
                appearance: 'none' as const,
                WebkitAppearance: 'none' as const,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
              }}
            >
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="parked">Parked</option>
              <option value="archived">Archived</option>
            </select>

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
                              <span style={{ fontSize: '10px', color: 'var(--teal)', opacity: 0.85 }}>
                                ▲ {idea.votes}
                              </span>
                            )}
                          </div>
                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={idea.status}
                              onChange={(e) => handleIdeaStatusChange(idea.id, e.target.value, idea.status)}
                              className="text-[10px] rounded border px-1.5 py-0.5"
                              style={{ background: 'var(--surface-2)', color: 'var(--slate)', borderColor: 'var(--border-subtle)', cursor: 'pointer' }}
                              aria-label="Change status"
                            >
                              <option value="new">New</option>
                              <option value="under_review">Under Review</option>
                              <option value="approved">Approved</option>
                              <option value="parked">Parked</option>
                              <option value="archived">Archived</option>
                            </select>
                          </div>
                        </div>
                      )
                    })}
                    {colIdeas.length === 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6, padding: '12px', textAlign: 'center' }}>
                        Empty
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
                  isExpanded={expandedId === idea.id}
                  onToggleExpand={() => setExpandedId(expandedId === idea.id ? null : idea.id)}
                  onVote={(e) => handleVote(e, idea.id)}
                  onStatusChange={(status) => handleIdeaStatusChange(idea.id, status, idea.status)}
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
    </PageLayout>
  )
}

// IdeaRowView
function IdeaRowView({
  idea,
  isFocused,
  isExpanded,
  onToggleExpand,
  onVote,
  onStatusChange,
}: {
  idea: IdeaRow
  isFocused: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onVote: (e: React.MouseEvent<HTMLButtonElement>) => void
  onStatusChange: (status: string) => void
}) {
  const person = getPersonInfo(idea.submitted_by)

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
          alignItems: 'center',
          gap: 'var(--sp-md)',
          height: 'var(--row-height, 44px)',
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
                fontSize: 'var(--text-label)',
                color: 'var(--gold)',
                opacity: 0.85,
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

      {/* Inline detail panel (shown when title is clicked) */}
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
            <select
              id="idea-area"
              value={researchArea}
              onChange={(e) => setResearchArea(e.target.value)}
              className="w-full rounded-md border"
              style={{
                borderColor: 'var(--border-subtle)',
                cursor: 'pointer',
                padding: 'var(--sp-sm) var(--sp-md)',
                fontSize: 'var(--text-small)',
              }}
            >
              <option value="">Select area (optional)</option>
              {researchAreas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
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
