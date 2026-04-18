import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GraduationCap, Plus, ChevronDown, ChevronRight, X, Check, AlertTriangle } from 'lucide-react'
import DensityToggle, { useDensity, densityClass } from '../../components/DensityToggle'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { useMenteeMilestones, useMenteeOverview, useActivity } from '../../hooks/useApiData'
import type { MenteeMilestoneRow } from '../../hooks/useApiData'
import { useCreateMenteeMilestone, useUpdateMenteeMilestone } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, isOverdue, getDaysAgo } from '../../lib/dateUtils'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'

// ── Constants ──────────────────────────────────────────────

const MILESTONE_TYPES = [
  { value: 'committee_meeting', label: 'Committee Meeting' },
  { value: 'scholarly_project', label: 'Scholarly Project' },
  { value: 'irb_submission', label: 'IRB Submission' },
  { value: 'irb_renewal', label: 'IRB Renewal' },
  { value: 'program_eval', label: 'Program Evaluation' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'publication', label: 'Publication' },
  { value: 'other', label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming', color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--teal)' },
  { value: 'completed', label: 'Completed', color: 'var(--green)' },
  { value: 'overdue', label: 'Overdue', color: 'var(--maroon)' },
]

// TODO: Remove this hardcoded list once AddMilestoneModal receives mentee slugs as a prop
// derived from the useMenteeOverview() API response (mentee_slug field).
const MENTEE_SLUGS = ['shyu', 'fitzgerald', 'collins']

// ── Silence Detection ──────────────────────────────────────
const SILENCE_AMBER_DAYS = 10  // > 10d → amber "Quiet"
const SILENCE_RED_DAYS   = 21  // > 21d → red "Silent"

function getTypeLabel(type: string): string {
  return MILESTONE_TYPES.find((t) => t.value === type)?.label || type
}

// isOverdue imported from dateUtils

// ── Main Page ──────────────────────────────────────────────

export default function MenteeMilestones() {
  const [density, setDensity] = useDensity()
  const [filterMentee, setFilterMentee] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const { data: milestones = [], isLoading: milestonesLoading } = useMenteeMilestones({
    mentee: filterMentee || undefined,
    status: filterStatus || undefined,
    type: filterType || undefined,
  })
  const { data: overview = [], isLoading: overviewLoading } = useMenteeOverview()
  // Per-actor last-activity queries (limit=1, actor-filtered) so high activity volume doesn't hide old entries
  const { data: actShyu = [] }      = useActivity(1, 'shyu')
  const { data: actFitzgerald = [] } = useActivity(1, 'fitzgerald')
  const { data: actCollins = [] }   = useActivity(1, 'collins')
  const { data: actEddington = [] } = useActivity(1, 'eddington')
  const { data: actMceachron = [] } = useActivity(1, 'mceachron')
  const updateMilestone = useUpdateMenteeMilestone()
  const { showUndo } = useUndoToast()

  const isLoading = milestonesLoading || overviewLoading

  // Compute days since last activity per mentee slug (per-actor queries, immune to global feed volume)
  const daysSinceActivity = useMemo<Map<string, number>>(() => {
    const now = Date.now()
    const map = new Map<string, number>()
    const perActorEntries: [string, typeof actShyu][] = [
      ['shyu', actShyu], ['fitzgerald', actFitzgerald], ['collins', actCollins],
      ['eddington', actEddington], ['mceachron', actMceachron],
    ]
    for (const [slug, entries] of perActorEntries) {
      if (entries.length > 0 && entries[0].timestamp) {
        const ts = new Date(entries[0].timestamp).getTime()
        if (!isNaN(ts)) {
          map.set(slug, Math.floor((now - ts) / 86400000))
        }
      }
    }
    return map
  }, [actShyu, actFitzgerald, actCollins, actEddington, actMceachron])

  // Compute overdue status client-side for display
  const enrichedMilestones = useMemo(() => {
    return milestones.map((m) => ({
      ...m,
      _isOverdue: isOverdue(m.due_date, m.status) || m.status === 'overdue',
    }))
  }, [milestones])

  // Group by mentee
  const grouped = useMemo(() => {
    const groups = new Map<string, (MenteeMilestoneRow & { _isOverdue: boolean })[]>()
    for (const m of enrichedMilestones) {
      if (!groups.has(m.mentee_slug)) groups.set(m.mentee_slug, [])
      groups.get(m.mentee_slug)!.push(m)
    }
    // Sort groups by mentee slug to be deterministic
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [enrichedMilestones])

  // Flat list for keyboard nav
  const flatList = enrichedMilestones

  const handleStatusChange = useCallback((id: string, newStatus: string, prevStatus: string) => {
    updateMilestone.mutate({ id, fields: { status: newStatus } as Partial<{ status: string }> })
    const labels: Record<string, string> = { upcoming: 'Upcoming', in_progress: 'In Progress', completed: 'Completed', overdue: 'Overdue' }
    showUndo(`Status changed to ${labels[newStatus] || newStatus}`, () =>
      updateMilestone.mutate({ id, fields: { status: prevStatus } as Partial<{ status: string }> }),
    )
  }, [updateMilestone, showUndo])

  // Derive mentee slugs from overview API response; fall back to hardcoded list if not yet loaded
  const menteeSlugsDerived = useMemo(
    () => overview.length > 0 ? [...new Set(overview.map((o) => o.mentee_slug))] : MENTEE_SLUGS,
    [overview],
  )

  const overdueTotal = overview.reduce((sum, o) => sum + o.overdue_count, 0)
  const upcomingTotal = overview.reduce((sum, o) => sum + o.upcoming_count, 0)

  useListKeyboardNav({
    itemCount: flatList.length,
    focusedIndex,
    setFocusedIndex,
    onEnter: () => {
      if (focusedIndex >= 0 && focusedIndex < flatList.length) {
        setExpandedRow((prev) => prev === flatList[focusedIndex].id ? null : flatList[focusedIndex].id)
      }
    },
    onEscape: () => {
      setExpandedRow(null)
      setFocusedIndex(-1)
    },
    disabled: showAddModal,
  })

  return (
    <div>
      <PageHeader
        icon={<GraduationCap size={20} />}
        title="Mentee Milestones"
        subtitle={
          overdueTotal > 0
            ? `${overdueTotal} overdue, ${upcomingTotal} upcoming`
            : `${upcomingTotal} upcoming milestones`
        }
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter: Mentee */}
          <FilterSelect
            value={filterMentee}
            onChange={setFilterMentee}
            placeholder="All Mentees"
            options={menteeSlugsDerived.map((s) => ({ value: s, label: getPersonInfo(s).name }))}
          />

          {/* Filter: Type */}
          <FilterSelect
            value={filterType}
            onChange={setFilterType}
            placeholder="All Types"
            options={MILESTONE_TYPES}
          />

          {/* Filter: Status */}
          <FilterSelect
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="All Statuses"
            options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          />

          <DensityToggle value={density} onChange={setDensity} />

          {/* Add button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: 'var(--teal-solid)',
              color: 'var(--ink-bright, #fff)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Add Milestone
          </button>
        </div>
      </PageHeader>

      {/* PI Overview Cards */}
      {!filterMentee && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {menteeSlugsDerived.map((slug) => {
            const person = getPersonInfo(slug)
            const stats = overview.find((o) => o.mentee_slug === slug)
            const silenceDays = daysSinceActivity.get(slug) ?? null
            const isSilent = silenceDays !== null && silenceDays > SILENCE_RED_DAYS
            const isQuiet  = silenceDays !== null && silenceDays > SILENCE_AMBER_DAYS && !isSilent
            return (
              <motion.button
                key={slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setFilterMentee(slug)}
                className="card flex items-center gap-3 p-4 text-left transition-all"
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xl)',
                  cursor: 'pointer',
                  background: 'var(--cream)',
                }}
                whileHover={{ scale: 1.01 }}
              >
                <div style={{ width: 40, height: 40, flexShrink: 0 }}>
                  <Avatar
                    name={person.name}
                    initials={person.initials}
                    photoUrl={person.photoUrl}
                    variant="ice"
                    size="base-xl"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 'var(--value-size)', fontWeight: 500, color: 'var(--ink)' }}>
                      {person.name}
                    </span>
                    {(isSilent || isQuiet) && (
                      <span
                        style={{
                          fontSize: 'var(--text-micro)',
                          fontWeight: 'var(--weight-ui)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: isSilent
                            ? 'color-mix(in oklch, var(--maroon) 15%, transparent)'
                            : 'color-mix(in oklch, var(--gold) 15%, transparent)',
                          color: isSilent ? 'var(--maroon)' : 'var(--gold)',
                          flexShrink: 0,
                        }}
                      >
                        {isSilent ? 'Silent' : 'Quiet'} {silenceDays}d
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span style={{ fontSize: 'var(--label-size)', color: 'var(--teal)' }}>
                      {stats?.upcoming_count ?? 0} upcoming
                    </span>
                    {(stats?.overdue_count ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--maroon)',
                          background: 'color-mix(in srgb, var(--maroon) 12%, transparent)',
                        }}
                      >
                        <AlertTriangle size={10} />
                        {stats?.overdue_count} overdue
                      </span>
                    )}
                    <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                      {stats?.completed_count ?? 0} done
                    </span>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      {/* Active mentee filter chip */}
      {filterMentee && (
        <div className="flex items-center gap-2 mb-4">
          <span style={{ fontSize: '12px', color: 'var(--slate)' }}>Showing:</span>
          <button
            onClick={() => setFilterMentee('')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors"
            style={{
              background: 'var(--teal-active)',
              color: 'var(--teal)',
              border: '1px solid rgba(45,138,138,0.2)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {getPersonInfo(filterMentee).name}
            <X size={12} />
          </button>
        </div>
      )}

      {/* Timeline Table */}
      <div className="mt-2">
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : flatList.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={40} />}
            title="Nothing scheduled yet"
            subtitle="Track committee meetings, IRB submissions, scholarly projects, and qualifying exams for each mentee in one place."
            action={{ label: 'Add Milestone', onClick: () => setShowAddModal(true) }}
          />
        ) : (
          <div className={`table-container ${densityClass(density)}`}>
            {/* Column headers */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: '140px minmax(200px, 1fr) 120px 120px 100px',
                padding: 'var(--sp-sm) var(--sp-lg)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {['MENTEE', 'TITLE', 'TYPE', 'DUE DATE', 'STATUS'].map((col) => (
                <span
                  key={col}
                  style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    color: 'var(--slate)',
                    opacity: 'var(--ink-label)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.06em',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>

            {/* Grouped rows */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
            >
              {grouped.map(([menteeSlug, items]) => (
                <MenteeGroup
                  key={menteeSlug}
                  menteeSlug={menteeSlug}
                  items={items}
                  expandedRow={expandedRow}
                  onToggleExpand={(id) => setExpandedRow((prev) => (prev === id ? null : id))}
                  onStatusChange={handleStatusChange}
                  focusedIndex={focusedIndex}
                  flatList={flatList}
                  silenceDays={daysSinceActivity.get(menteeSlug) ?? null}
                />
              ))}
            </motion.div>

            {/* Summary row */}
            {flatList.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 20,
                  padding: 'var(--sp-sm) var(--sp-lg)',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--teal-hover)',
                }}
              >
                {[
                  { label: 'Total', value: flatList.length },
                  ...(overdueTotal > 0
                    ? [{ label: 'Overdue', value: overdueTotal, color: 'var(--maroon)' }]
                    : []),
                  { label: 'Upcoming', value: upcomingTotal },
                  {
                    label: 'Completed',
                    value: overview.reduce((s, o) => s + o.completed_count, 0),
                    color: 'var(--green)',
                  },
                ].map((s) => (
                  <span key={s.label} style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
                    {s.label}{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: (s as { color?: string }).color || 'var(--slate)',
                        opacity: 1,
                      }}
                    >
                      {s.value}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Milestone Modal */}
      <AnimatePresence>
        {showAddModal && <AddMilestoneModal onClose={() => setShowAddModal(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ── Mentee Group ───────────────────────────────────────────

function MenteeGroup({
  menteeSlug,
  items,
  expandedRow,
  onToggleExpand,
  onStatusChange,
  focusedIndex,
  flatList,
  silenceDays,
}: {
  menteeSlug: string
  items: (MenteeMilestoneRow & { _isOverdue: boolean })[]
  expandedRow: string | null
  onToggleExpand: (id: string) => void
  onStatusChange: (id: string, newStatus: string, prevStatus: string) => void
  focusedIndex: number
  flatList: (MenteeMilestoneRow & { _isOverdue: boolean })[]
  silenceDays: number | null
}) {
  const [expanded, setExpanded] = useState(true)
  const person = getPersonInfo(menteeSlug)
  const overdueCount = items.filter((i) => i._isOverdue).length
  const isSilent = silenceDays !== null && silenceDays > SILENCE_RED_DAYS
  const isQuiet  = silenceDays !== null && silenceDays > SILENCE_AMBER_DAYS && !isSilent

  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '12px 16px 6px',
          textAlign: 'left',
        }}
      >
        {expanded ? (
          <ChevronDown size={12} style={{ color: 'var(--slate)', opacity: 0.75 }} />
        ) : (
          <ChevronRight size={12} style={{ color: 'var(--slate)', opacity: 0.75 }} />
        )}
        <div style={{ width: 20, height: 20, flexShrink: 0 }}>
          <Avatar
            name={person.name}
            initials={person.initials}
            photoUrl={person.photoUrl}
            variant="ice"
            size="xs"
          />
        </div>
        <span
          style={{
            fontSize: 'var(--label-size)',
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '0.02em',
          }}
        >
          {person.name}
        </span>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
          {items.length}
        </span>
        {overdueCount > 0 && (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--maroon)',
              background: 'color-mix(in srgb, var(--maroon) 12%, transparent)',
            }}
          >
            {overdueCount} overdue
          </span>
        )}
        {(isSilent || isQuiet) && (
          <span
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-ui)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isSilent
                ? 'color-mix(in oklch, var(--maroon) 15%, transparent)'
                : 'color-mix(in oklch, var(--gold) 15%, transparent)',
              color: isSilent ? 'var(--maroon)' : 'var(--gold)',
              flexShrink: 0,
            }}
          >
            {isSilent ? 'Silent' : 'Quiet'} {silenceDays}d
          </span>
        )}
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
      </button>

      {expanded &&
        items.map((item) => {
          const globalIndex = flatList.findIndex((f) => f.id === item.id)
          const isFocused = globalIndex === focusedIndex
          return (
            <MilestoneRow
              key={item.id}
              item={item}
              isExpanded={expandedRow === item.id}
              isFocused={isFocused}
              onToggleExpand={() => onToggleExpand(item.id)}
              onStatusChange={onStatusChange}
            />
          )
        })}
    </motion.div>
  )
}

// ── Milestone Row ──────────────────────────────────────────

function MilestoneRow({
  item,
  isExpanded,
  isFocused,
  onToggleExpand,
  onStatusChange,
}: {
  item: MenteeMilestoneRow & { _isOverdue: boolean }
  isExpanded: boolean
  isFocused: boolean
  onToggleExpand: () => void
  onStatusChange: (id: string, newStatus: string, prevStatus: string) => void
}) {
  const person = getPersonInfo(item.mentee_slug)
  const isDone = item.status === 'completed'
  const dueStr = item.due_date ? formatShortDate(item.due_date) : '--'
  const daysLate = (item._isOverdue && item.due_date) ? getDaysAgo(item.due_date) : 0

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        opacity: isDone ? 0.45 : 1,
        background: item._isOverdue
          ? 'var(--maroon-hover)'
          : isFocused
            ? 'var(--teal-hover)'
            : 'transparent',
        transition: 'background var(--transition-fast, 150ms) ease',
      }}
    >
      {/* Desktop row */}
      <div
        className="hidden sm:grid hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        style={{
          gridTemplateColumns: '140px 1fr 120px 120px 100px',
          padding: `var(--row-padding-y, 8px) 16px`,
          alignItems: 'center',
        }}
      >
        {/* Mentee */}
        <div className="flex items-center gap-1.5">
          <div style={{ width: 20, height: 20, flexShrink: 0 }}>
            <Avatar
              name={person.name}
              initials={person.initials}
              photoUrl={person.photoUrl}
              variant="ice"
              size="xs"
            />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--slate)' }}>
            {person.name.split(' ')[1] || person.name}
          </span>
        </div>

        {/* Title — clickable to expand */}
        <span
          onClick={onToggleExpand}
          className="task-title-clickable"
          style={{
            fontSize: 'var(--value-size)',
            fontWeight: 400,
            color: 'var(--ink)',
            textDecoration: isDone ? 'line-through' : 'none',
            paddingRight: '12px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 4px',
            margin: '-1px -4px',
            transition: 'background var(--transition-fast, 150ms) ease',
          }}
        >
          {item.title}
        </span>

        {/* Type */}
        <span
          style={{
            fontSize: 'var(--label-size)',
            fontWeight: 500,
            color: 'var(--gold)',
            opacity: 0.7,
          }}
        >
          {getTypeLabel(item.milestone_type)}
        </span>

        {/* Due date */}
        {item._isOverdue ? (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--maroon)',
              background: 'color-mix(in srgb, var(--maroon) 12%, transparent)',
              whiteSpace: 'nowrap' as const,
            }}
          >
            <AlertTriangle size={10} />
            {daysLate > 0 ? `${daysLate}d overdue` : 'Overdue'}
          </span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--slate)', fontWeight: 400 }}>
            {dueStr}
          </span>
        )}

        {/* Status */}
        <div onClick={(e) => e.stopPropagation()}>
          <InlineSelect
            value={item.status}
            options={STATUS_OPTIONS}
            onChange={(val) => onStatusChange(item.id, val, item.status)}
            size="sm"
          />
        </div>
      </div>

      {/* Mobile row */}
      <div
        className="sm:hidden"
        style={{ padding: `var(--row-padding-y, 12px) 16px` }}
        onClick={onToggleExpand}
      >
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', marginBottom: '4px' }}>
          {item.title}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {item._isOverdue ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--maroon)',
                background: 'color-mix(in srgb, var(--maroon) 12%, transparent)',
              }}
            >
              <AlertTriangle size={9} />
              {daysLate > 0 ? `${daysLate}d overdue` : 'Overdue'}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 400 }}>
              {dueStr}
            </span>
          )}
          <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--gold)', opacity: 0.7 }}>
            {getTypeLabel(item.milestone_type)}
          </span>
          <div style={{ width: 18, height: 18, flexShrink: 0 }}>
            <Avatar
              name={person.name}
              initials={person.initials}
              photoUrl={person.photoUrl}
              variant="ice"
              size="sm-icon"
            />
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding: 'var(--sp-md) var(--sp-lg) var(--sp-lg)',
                marginLeft: '16px',
                borderLeft: '2px solid var(--border-subtle)',
              }}
            >
              {item.description && (
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--ink)',
                    lineHeight: 1.5,
                    marginBottom: '8px',
                  }}
                >
                  {item.description}
                </p>
              )}
              {item.notes && (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--slate)',
                    lineHeight: 1.5,
                    padding: 'var(--sp-sm) var(--sp-md)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--teal-hover)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--teal)', display: 'block', marginBottom: '4px' }}>
                    Notes
                  </span>
                  {item.notes}
                </div>
              )}
              {!item.description && !item.notes && (
                <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.75 }}>
                  No additional details.
                </span>
              )}
              {item.due_date && (
                <div style={{ marginTop: '8px', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
                  Due: {item.due_date}
                  {item.completed_at && ` | Completed: ${item.completed_at.split('T')[0]}`}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Filter Select ──────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border px-3 py-1.5 text-xs"
      style={{
        fontSize: '12px',
        color: value ? 'var(--teal)' : 'var(--slate)',
        backgroundColor: value ? 'var(--teal-hover)' : 'transparent',
        borderColor: value ? 'var(--teal)' : 'var(--border-subtle)',
        cursor: 'pointer',
        appearance: 'none' as const,
        WebkitAppearance: 'none' as const,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        paddingRight: '24px',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ── Add Milestone Modal ────────────────────────────────────

function AddMilestoneModal({ onClose }: { onClose: () => void }) {
  const createMilestone = useCreateMenteeMilestone()
  const [menteeSlug, setMenteeSlug] = useState(MENTEE_SLUGS[0])
  const [milestoneType, setMilestoneType] = useState('committee_meeting')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = () => {
    if (!title.trim()) return
    createMilestone.mutate(
      {
        mentee_slug: menteeSlug,
        milestone_type: milestoneType,
        title: title.trim(),
        due_date: dueDate || undefined,
        description: description.trim() || undefined,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay-medium)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--cream)',
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-elevated)',
          width: '100%',
          maxWidth: '480px',
          padding: 'var(--sp-xl)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Add Milestone
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          {/* Mentee */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', fontWeight: 500, color: 'var(--slate)', marginBottom: '4px', display: 'block' }}>
              Mentee
            </label>
            <select
              value={menteeSlug}
              onChange={(e) => setMenteeSlug(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--sp-sm) var(--sp-md)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                fontSize: 'var(--value-size)',
              }}
            >
              {MENTEE_SLUGS.map((s) => (
                <option key={s} value={s}>
                  {getPersonInfo(s).name}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', fontWeight: 500, color: 'var(--slate)', marginBottom: '4px', display: 'block' }}>
              Milestone Type
            </label>
            <select
              value={milestoneType}
              onChange={(e) => setMilestoneType(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--sp-sm) var(--sp-md)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                fontSize: 'var(--value-size)',
              }}
            >
              {MILESTONE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', fontWeight: 500, color: 'var(--slate)', marginBottom: '4px', display: 'block' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual Committee Meeting"
              autoFocus
              style={{
                width: '100%',
                padding: 'var(--sp-sm) var(--sp-md)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                fontSize: 'var(--value-size)',
                outline: 'none',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            />
          </div>

          {/* Due Date */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', fontWeight: 500, color: 'var(--slate)', marginBottom: '4px', display: 'block' }}>
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--sp-sm) var(--sp-md)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                fontSize: 'var(--value-size)',
                outline: 'none',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', fontWeight: 500, color: 'var(--slate)', marginBottom: '4px', display: 'block' }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context or requirements..."
              rows={3}
              style={{
                width: '100%',
                padding: 'var(--sp-sm) var(--sp-md)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                fontSize: 'var(--value-size)',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            style={{
              padding: 'var(--sp-sm) var(--sp-lg)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--slate)',
              fontSize: 'var(--value-size)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || createMilestone.isPending}
            className="flex items-center gap-1.5"
            style={{
              padding: 'var(--sp-sm) var(--sp-lg)',
              borderRadius: 'var(--radius-lg)',
              border: 'none',
              background: title.trim() ? 'var(--teal-solid)' : 'var(--border-subtle)',
              color: title.trim() ? 'var(--ink-bright, #fff)' : 'var(--slate)',
              fontSize: 'var(--value-size)',
              fontWeight: 500,
              cursor: title.trim() ? 'pointer' : 'not-allowed',
              opacity: createMilestone.isPending ? 0.7 : 1,
            }}
          >
            <Check size={14} />
            {createMilestone.isPending ? 'Creating...' : 'Create Milestone'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
