import { useState, useEffect, useMemo, useRef } from 'react'
import { portalTitle } from '../../constants/pageLabels'
import { useSearchParams } from 'react-router-dom'
import { Plus, ThumbsUp, Lightbulb, Pencil, Archive, Rocket } from 'lucide-react'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import BodyText from '../../components/BodyText'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { FaceDisc } from '../../components/today/skin'
import InlineSelect from '../../components/InlineSelect'
import Field from '../../components/ui/Field'
import CreateProjectModal from '../../components/CreateProjectModal'
import { useUndoToast } from '../../components/UndoToast'
import { ColumnHeader, TableContainer } from '../../components/table'
import SegmentedToggle from '../../components/ui/SegmentedToggle'
import { Button } from '../../components/ui/Button'
import { FIELD_LABEL_STYLE } from '../../components/ui/labelStyle'
import Modal from '../../components/ui/Modal'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { useIdeas } from '../../hooks/useApiData'
import { useCreateIdea, useVoteIdea, useUpdateIdea, useCreateProject } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { IdeaRow } from '../../lib/api'
import { ICON_PROPS } from '../../lib/iconProps'

type SortKey = 'title' | 'submitter' | 'status' | 'votes' | 'created_at'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: 'var(--sk-t1)', bg: 'var(--sk-line)' },
  under_review: { label: 'Under Review', color: 'var(--sk-t2)', bg: 'var(--sk-line)' },
  approved: { label: 'Approved', color: 'var(--sk-t3)', bg: 'var(--sk-line)' },
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

/** The research areas a picker offers: the starter list, then every area the
 *  lab's ideas already carry (prod holds tool / culture / ops, none of them in
 *  the starter list), then the value being edited. A stored value is always an
 *  option, so a select never falls back to "none" and misstates it. */
function areaChoices(ideas: readonly { research_area?: string | null }[], current = ''): string[] {
  const out = [...researchAreas]
  for (const a of [...ideas.map((i) => i.research_area ?? ''), current]) {
    if (a && !out.includes(a)) out.push(a)
  }
  return out
}

const GRID_COLS = 'minmax(200px, 3fr) 120px 100px 80px 80px 80px'

export default function IdeasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
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

  // Auto-open create modal from URL params (keyboard shortcut N). Kept as
  // an effect (not moved to render-time) because it also clears the URL
  // via setSearchParams — a real external-system sync.
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCreate(true)
      // Drop only ?create. Ideas is a tab on Projects (?tab=ideas, 2026-10-09);
      // clearing every param would switch the page back to the Projects tab
      // and unmount this form the moment it opened.
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('create')
        return next
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: ideas = [], isLoading } = useIdeas(filterStatus ? { status: filterStatus } : undefined)
  const vote = useVoteIdea()
  const updateIdea = useUpdateIdea()
  const createProject = useCreateProject()
  const { showUndo } = useUndoToast()
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Board column currently under a dragged card (drop-target highlight).
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  // S15: the approved idea currently being promoted into a project.
  const [promotingIdea, setPromotingIdea] = useState<IdeaRow | null>(null)

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

  // Reset focus when filters change. Adjusted during render (React's
  // "adjusting state based on a prop change" pattern) instead of an effect.
  const [prevFilterStatus, setPrevFilterStatus] = useState(filterStatus)
  if (filterStatus !== prevFilterStatus) {
    setPrevFilterStatus(filterStatus)
    setFocusedIndex(-1)
  }

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
    document.title = portalTitle('Ideas', count > 0 ? `${count} new` : undefined)
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

  // S15: promote an approved idea into a project. CreateProjectModal is
  // prefilled; on create we fire the project mutation (it toasts "Open →" via
  // useCreateProject) then archive the source idea so the board doesn't keep a
  // duplicate. The new project's title carries the idea text forward as the link.
  const handlePromoteCreate = (idea: IdeaRow) => (project: {
    title: string; category?: string; kind?: string; stage?: string; description?: string; pi?: string
  }) => {
    createProject.mutate(project)
    // Archive the source idea, noting the promotion in its description.
    const note = `Promoted to project "${project.title}".`
    updateIdea.mutate({
      id: idea.id,
      fields: {
        status: 'archived',
        description: idea.description ? `${idea.description}\n\n${note}` : note,
      },
    })
  }

  const activeCount = ideas.filter((i) => i.status !== 'archived' && i.status !== 'parked').length
  const isEmpty = !isLoading && sortedIdeas.length === 0

  return (
    <div className="content-container flex flex-col gap-4">
      <PageHeader
        title="Ideas Board"
        hero={isLoading ? undefined : { value: activeCount, label: activeCount === 1 ? 'active idea' : 'active ideas' }}
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus {...ICON_PROPS} size={16} />
            New Idea
          </Button>
        }
      >
        {/* Controls - hidden when empty per M-04 */}
        {!isEmpty && (
          <div className="flex items-center gap-3 flex-wrap">
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

            {/* View toggle (P2-10) — shared SegmentedToggle */}
            <SegmentedToggle
              ariaLabel="Ideas view"
              options={[
                { value: 'kanban', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
          </div>
        )}
      </PageHeader>

      {/* Content */}
      <div className="mt-5">
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
          <div className="grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-[repeat(4,minmax(220px,1fr))]">
            {(['new', 'under_review', 'approved', 'parked'] as const).map((col) => {
              const colIdeas = sortedIdeas.filter((i) => i.status === col)
              const cfg = statusConfig[col]
              const isOver = dragOverCol === col
              return (
                <div
                  key={col}
                  className={`${colIdeas.length === 0 ? 'hidden sm:flex' : 'flex'} flex-col`}
                  data-testid={`ideas-col-${col}`}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== col) setDragOverCol(col) }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverCol(null) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverCol(null)
                    const id = e.dataTransfer.getData('text/plain')
                    const dropped = ideas.find((i) => i.id === id)
                    if (dropped && dropped.status !== col) handleIdeaStatusChange(dropped.id, col, dropped.status)
                  }}
                >
                  <div className="flex items-baseline gap-2 mb-3">
                    <span style={{ color: cfg.color, fontSize: 'var(--text-small)', fontWeight: 'var(--weight-ui)' }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 'var(--text-label)', color: 'var(--sk-t3)', fontVariantNumeric: 'tabular-nums' }}>
                      {colIdeas.length}
                    </span>
                  </div>
                  <div
                    className="flex flex-col gap-2 flex-1"
                    style={{
                      borderRadius: 'var(--radius-lg)',
                      outline: isOver ? '2px dashed var(--job-accent)' : 'none',
                      outlineOffset: 4,
                      minHeight: 72,
                    }}
                  >
                    {colIdeas.map((idea) => (
                      <IdeaBoardCard
                        key={idea.id}
                        idea={idea}
                        onStatusChange={(status) => handleIdeaStatusChange(idea.id, status, idea.status)}
                        onPromote={() => setPromotingIdea(idea)}
                      />
                    ))}
                    {colIdeas.length === 0 && (
                      <div
                        className="hidden sm:block"
                        style={{
                          fontSize: 'var(--text-label)',
                          color: 'var(--sk-t3)',
                          padding: '20px 4px',
                          border: '1px dashed var(--sk-line2)',
                          borderRadius: 'var(--radius-lg)',
                          textAlign: 'center',
                        }}
                      >
                        Drag an idea here
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
                  areas={areaChoices(ideas, idea.research_area ?? '')}
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
                  onPromote={() => setPromotingIdea(idea)}
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
              const statusColors: Record<string, string> = { new: 'var(--sk-t1)', under_review: 'var(--sk-t2)', approved: 'var(--sk-t3)', parked: 'var(--slate)', archived: 'var(--slate)' }
              const stats: { label: string; value: number; color?: string }[] = [
                { label: 'Count', value: sortedIdeas.length },
                ...Object.entries(statusCounts).map(([key, count]) => ({
                  label: statusLabels[key] || key,
                  value: count,
                  color: statusColors[key],
                })),
                ...(voted > 0 ? [{ label: 'Voted', value: voted, color: 'var(--sk-t2)' }] : []),
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
      <CreateIdeaModal open={showCreate} onClose={() => setShowCreate(false)} areas={areaChoices(ideas)} />

      {/* S15: promote-an-idea → prefilled project create */}
      <CreateProjectModal
        open={!!promotingIdea}
        onClose={() => setPromotingIdea(null)}
        prefill={promotingIdea ? {
          title: promotingIdea.title,
          description: promotingIdea.description ?? undefined,
          pi: promotingIdea.submitted_by || undefined,
        } : undefined}
        onCreate={promotingIdea ? handlePromoteCreate(promotingIdea) : () => {}}
      />
    </div>
  )
}

const IDEA_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'parked', label: 'Parked' },
  { value: 'archived', label: 'Archived' },
]

// IdeaBoardCard: Today-card anatomy (title, quiet context line, age on the
// left, face on the right). Draggable between columns; the status select lives
// in the corner menu for keyboard and touch, where drag does not work.
function IdeaBoardCard({
  idea,
  onStatusChange,
  onPromote,
}: {
  idea: IdeaRow
  onStatusChange: (status: string) => void
  onPromote: () => void
}) {
  const person = getPersonInfo(idea.submitted_by)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className="card"
      draggable
      data-testid="idea-board-card"
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', idea.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      style={{ padding: '11px 12px', cursor: 'grab', opacity: dragging ? 0.5 : 1 }}
    >
      <div className="flex items-start gap-2">
        <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-small)', color: 'var(--ink)', fontWeight: 600, lineHeight: 1.35 }}>
          {idea.title}
        </div>
        <div
          className="sr idea-move"
          style={{ '--sr-hov': 'var(--hover-subtle)', flexShrink: 0 } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          <InlineSelect
            value={idea.status}
            options={IDEA_STATUS_OPTIONS}
            onChange={onStatusChange}
            ariaLabel={`Move idea: ${idea.title}`}
            display={<span aria-hidden="true" style={{ color: 'var(--sk-t3)', fontSize: 'var(--text-small)', lineHeight: 1 }}>&#8943;</span>}
          />
        </div>
      </div>
      {idea.research_area && (
        <div style={{ fontSize: 'var(--text-label)', color: 'var(--sk-t3)', marginTop: 2 }}>{idea.research_area}</div>
      )}
      <div className="flex items-center justify-between" style={{ marginTop: 'var(--sp-sm)' }}>
        <span style={{ fontSize: 'var(--text-label)', color: 'var(--sk-t3)', fontVariantNumeric: 'tabular-nums' }}>
          {formatRelativeTime(idea.created_at)}
          {idea.votes > 0 && <> &middot; {idea.votes} {idea.votes === 1 ? 'vote' : 'votes'}</>}
        </span>
        <div style={{ width: 20, height: 20, flexShrink: 0 }}>
          <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={20} />
        </div>
      </div>
      {idea.status === 'approved' && (
        <button
          type="button"
          onClick={onPromote}
          className="inline-flex items-center gap-1.5"
          style={{ marginTop: 'var(--sp-sm)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--job-accent)', fontSize: 'var(--text-label)', fontWeight: 500 }}
        >
          <Rocket {...ICON_PROPS} size={12} />
          Promote to project
        </button>
      )}
    </div>
  )
}

// IdeaRowView
function IdeaRowView({
  idea,
  areas,
  isFocused,
  isExpanded,
  isEditing,
  onToggleExpand,
  onVote,
  onStatusChange,
  onEdit,
  onEditSave,
  onEditCancel,
  onPromote,
}: {
  idea: IdeaRow
  areas: string[]
  isFocused: boolean
  isExpanded: boolean
  isEditing: boolean
  onToggleExpand: () => void
  onVote: (e: React.MouseEvent<HTMLButtonElement>) => void
  onStatusChange: (status: string) => void
  onEdit: () => void
  onEditSave: (fields: { title: string; description: string; research_area: string }) => void
  onEditCancel: () => void
  onPromote: () => void
}) {
  const person = getPersonInfo(idea.submitted_by)
  const [editTitle, setEditTitle] = useState(idea.title)
  const [editDescription, setEditDescription] = useState(idea.description ?? '')
  const [editArea, setEditArea] = useState(idea.research_area ?? '')
  const editTitleRef = useRef<HTMLInputElement>(null)

  // Reset edit fields when editing opens; focus title without scroll.
  // Kept as an effect (already syncing with the DOM via focus()) rather
  // than moved to render-time.
  useEffect(() => {
    if (isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditTitle(idea.title)
      setEditDescription(idea.description ?? '')
      setEditArea(idea.research_area ?? '')
      editTitleRef.current?.focus({ preventScroll: true })
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
                color: 'var(--sk-t3)',
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
            <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={20} />
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
              { value: 'new', label: 'New', color: 'var(--sk-t1)' },
              { value: 'under_review', label: 'Review', color: 'var(--sk-t2)' },
              { value: 'approved', label: 'Approved', color: 'var(--sk-t3)' },
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
              color: idea.votes > 0 ? 'var(--sk-t1)' : 'var(--slate)',
              transition: 'transform var(--duration-normal) var(--ease-out), color var(--duration-normal)',
              padding: '2px var(--sp-sm)',
              minHeight: '44px',
              minWidth: '44px',
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-label={`Vote (${idea.votes})`}
          >
            <ThumbsUp {...ICON_PROPS} size={13} />
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
          {/* S15: promote approved ideas to a project */}
          {idea.status === 'approved' && (
            <Button size="icon"
              className="rounded-md"
              onClick={(e) => { e.stopPropagation(); onPromote() }}
              style={{
                background: 'none',
                border: '1px solid color-mix(in srgb, var(--job-accent) 30%, transparent)',
                color: 'var(--job-accent)',
                cursor: 'pointer',
                padding: '4px',
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Promote idea to project"
              title="Promote to project"
            >
              <Rocket {...ICON_PROPS} size={12} />
            </Button>
          )}
          <Button size="icon"
            className="rounded-md"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            style={{
              background: 'none',
              border: 'none',
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
            <Pencil {...ICON_PROPS} size={12} />
          </Button>
          <Button size="icon"
            className="rounded-md"
            onClick={(e) => {
              e.stopPropagation()
              onStatusChange('archived')
            }}
            style={{
              background: 'none',
              border: 'none',
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
            <Archive {...ICON_PROPS} size={12} />
          </Button>
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
              color: idea.votes > 0 ? 'var(--sk-t1)' : 'var(--slate)',
              padding: '0 var(--sp-sm)',
              minHeight: '44px',
              transition: 'transform var(--duration-normal) var(--ease-out)',
            }}
          >
            <ThumbsUp {...ICON_PROPS} size={11} />
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
            <span style={{ fontSize: 'var(--text-label)', color: 'var(--sk-t3)', opacity: 0.85 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', marginLeft: 'auto', flexShrink: 0 }}>
            {idea.status === 'approved' && (
              <Button size="icon"
                onClick={(e) => { e.stopPropagation(); onPromote() }}
                className="rounded-md flex items-center justify-center"
                style={{
                  background: 'none',
                  border: '1px solid color-mix(in srgb, var(--job-accent) 30%, transparent)',
                  color: 'var(--job-accent)',
                  cursor: 'pointer',
                  padding: '4px',
                  minHeight: '44px',
                  minWidth: '44px',
                }}
                aria-label="Promote idea to project"
                title="Promote to project"
              >
                <Rocket {...ICON_PROPS} size={12} />
              </Button>
            )}
            <Button size="icon"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="rounded-md flex items-center justify-center"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--slate)',
                cursor: 'pointer',
                padding: '4px',
                minHeight: '44px',
                minWidth: '44px',
              }}
              aria-label="Edit idea"
              title="Edit"
            >
              <Pencil {...ICON_PROPS} size={12} />
            </Button>
            <Button size="icon"
              onClick={(e) => {
                e.stopPropagation()
                onStatusChange('archived')
              }}
              className="rounded-md flex items-center justify-center"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--slate)',
                cursor: 'pointer',
                padding: '4px',
                minHeight: '44px',
                minWidth: '44px',
              }}
              aria-label="Archive idea"
              title="Archive"
            >
              <Archive {...ICON_PROPS} size={12} />
            </Button>
            <div style={{ width: 18, height: 18, flexShrink: 0 }}>
              <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={16} />
            </div>
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
              <Field label="Title" htmlFor="idea-edit-title" noContainer>
                <input
                  id="idea-edit-title"
                  type="text"
                  ref={editTitleRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--field-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--cream)', color: 'var(--ink)', fontSize: 'var(--text-base)', boxSizing: 'border-box' }}
                />
              </Field>
              <Field label="Description" htmlFor="idea-edit-description" noContainer>
                <textarea
                  id="idea-edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--field-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--cream)', color: 'var(--ink)', fontSize: 'var(--text-small)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </Field>
              <Field label="Research area" htmlFor="idea-edit-area" noContainer>
                <select
                  id="idea-edit-area"
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value)}
                  aria-label="Research area"
                  style={{ padding: '6px 8px', border: '1px solid var(--field-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--cream)', color: 'var(--ink)', fontSize: 'var(--text-small)' }}
                >
                  <option value="">— none —</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <Button type="submit" variant="primary" size="sm" disabled={!editTitle.trim()}>
                  Save
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={onEditCancel}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
          /* ── Read-only detail ── */
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <div style={FIELD_LABEL_STYLE}>Title</div>
              <div style={{ whiteSpace: 'normal' }}>{idea.title}</div>
            </div>
            {idea.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={FIELD_LABEL_STYLE}>Description</div>
                <div><BodyText text={idea.description} /></div>
              </div>
            )}
            {idea.research_area && (
              <div>
                <div style={FIELD_LABEL_STYLE}>Research area</div>
                <div style={{ color: 'var(--sk-t3)' }}>{idea.research_area}</div>
              </div>
            )}
            <div>
              <div style={FIELD_LABEL_STYLE}>Submitted by</div>
              <div>{person.name || idea.submitted_by}</div>
            </div>
            <div>
              <div style={FIELD_LABEL_STYLE}>Submitted</div>
              <div>{formatRelativeTime(idea.created_at)}</div>
            </div>
            <div>
              <div style={FIELD_LABEL_STYLE}>Votes</div>
              <div style={{ color: idea.votes > 0 ? 'var(--sk-t1)' : 'var(--slate)' }}>{idea.votes}</div>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  )
}

// CreateIdeaModal
function CreateIdeaModal({ open, onClose, areas }: { open: boolean; onClose: () => void; areas: string[] }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [researchArea, setResearchArea] = useState('')
  const createIdea = useCreateIdea()
  const { showSuccess } = useToast()
  const formRef = useRef<HTMLFormElement>(null)

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

  const fieldStyle = {
    border: '1px solid var(--field-edge)',
    padding: 'var(--sp-sm) var(--sp-md)',
    fontSize: 'var(--text-small)',
  } as const

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New idea"
      maxWidth="sm"
      onExtraKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault()
          formRef.current?.requestSubmit()
        }
      }}
      footer={
        <>
          {!title.trim() && (
            <p id="idea-submit-hint" style={{ fontSize: 'var(--text-label)', color: 'var(--slate)', marginRight: 'auto' }}>
              Title is required.
            </p>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="idea-create-form"
            variant="primary"
            disabled={!title.trim()}
            aria-describedby={!title.trim() ? 'idea-submit-hint' : undefined}
          >
            Submit idea
          </Button>
        </>
      }
    >
      <form
        id="idea-create-form"
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ gap: 'var(--sp-md)' }}
      >
        <Field label="Title" required htmlFor="idea-title" noContainer>
          <input
            id="idea-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's the idea?"
            className="w-full rounded-md outline-none"
            style={fieldStyle}
            aria-required="true"
            autoFocus
          />
        </Field>

        <Field label="Description" htmlFor="idea-description" noContainer>
          <textarea
            id="idea-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why is this interesting? What would it involve?"
            rows={3}
            className="w-full rounded-md outline-none resize-none"
            style={fieldStyle}
          />
        </Field>

        {/* A field with an edge, like Title and Description above it (an input
            must look like an input, rules-ui-design 20); the borderless
            InlineSelect read as plain text. Native select: the phone's own
            picker. */}
        <Field label="Research area" htmlFor="idea-area" noContainer>
          <select
            id="idea-area"
            value={researchArea}
            onChange={(e) => setResearchArea(e.target.value)}
            className="w-full rounded-md outline-none"
            style={{ ...fieldStyle, background: 'var(--cream)', color: researchArea ? 'var(--ink)' : 'var(--slate)' }}
          >
            <option value="">Select area (optional)</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  )
}
