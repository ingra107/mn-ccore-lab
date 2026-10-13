import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronDown, ChevronRight, X, Check, AlertTriangle } from 'lucide-react'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import EmptyState from '../../components/EmptyState'
import EmptyStateArt from '../../components/EmptyStateArt'
import { FaceDisc } from '../../components/today/skin'
import InlineSelect from '../../components/InlineSelect'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { useUndoToast } from '../../components/UndoToast'
import { useMenteeMilestones, useMenteeOverview, useActivity } from '../../hooks/useApiData'
import type { MenteeMilestoneRow } from '../../hooks/useApiData'
import { useCreateMenteeMilestone, useUpdateMenteeMilestone } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, isOverdue, getDaysAgo } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import { isProductionVisible } from '../../lib/isProductionVisible'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { ICON_PROPS } from '../../lib/iconProps'
import { QueryErrorNote } from '../../components/QueryErrorNote'

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
  { value: 'in_progress', label: 'In Progress', color: 'var(--job-accent)' },
  { value: 'completed', label: 'Completed', color: 'var(--st-done)' },
  { value: 'overdue', label: 'Overdue', color: 'var(--job-overdue)' },
]

// ── Activity Lapse Detection (P2-06) ───────────────────────
// Neutral framing: "Needs check-in" reads as a PI todo, not a trainee judgment.
const SILENCE_AMBER_DAYS = 7   // > 7d  → "Quiet"
const SILENCE_RED_DAYS   = 21  // > 21d → "Needs check-in"

function getTypeLabel(type: string): string {
  return MILESTONE_TYPES.find((t) => t.value === type)?.label || type
}

// isOverdue imported from dateUtils

// ── Main Page ──────────────────────────────────────────────

export default function MenteeMilestonesPage() {
  const [filterMentee, setFilterMentee] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const { data: rawMilestones = [], isLoading: milestonesLoading, isError: milestonesError, refetch: refetchMilestones } = useMenteeMilestones({
    mentee: filterMentee || undefined,
    status: filterStatus || undefined,
    type: filterType || undefined,
  })
  const milestones = useMemo(
    () => rawMilestones.filter((m: MenteeMilestoneRow) => isProductionVisible(m.title)),
    [rawMilestones],
  )
  const { data: overview = [], isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useMenteeOverview()
  // Per-actor last-activity queries (limit=1, actor-filtered) so high activity
  // volume doesn't hide old entries. Mentee roster confirmed by Nick 2026-04-20:
  // Dan Shyu, Beret Fitzgerald, Claire Collins, Michael Kalinoski.
  // Casey Eddington (Data Analyst) and Kendall McEachron (Faculty Collaborator)
  // are not mentees and were removed.
  // #507 follow-up opt-out: a failure on any of the 4 per-actor queries below
  // (or on useMenteeOverview) just omits that mentee's "Quiet"/"Needs
  // check-in" badge or overview stat -- no false claim is rendered (the
  // badge/count simply doesn't appear), and the main milestones table (the
  // real page content, isError-handled below) is unaffected.
  const { data: actShyu = [] }       = useActivity(1, 'dan-shyu')
  const { data: actFitzgerald = [] } = useActivity(1, 'beret-fitzgerald')
  const { data: actCollins = [] }    = useActivity(1, 'claire-collins')
  const { data: actKalinoski = [] }  = useActivity(1, 'michael-kalinoski')
  const updateMilestone = useUpdateMenteeMilestone()
  const { showUndo } = useUndoToast()

  const isLoading = milestonesLoading || overviewLoading

  // Compute days since last activity per mentee slug (per-actor queries, immune to global feed volume).
  // Date.now() is an intentional snapshot at memoize time — recomputes
  // whenever any of the per-actor activity queries change.
  const daysSinceActivity = useMemo<Map<string, number>>(() => {
    // eslint-disable-next-line react-hooks/purity -- deliberate snapshot, see comment above
    const now = Date.now()
    const map = new Map<string, number>()
    const perActorEntries: [string, typeof actShyu][] = [
      ['dan-shyu', actShyu], ['beret-fitzgerald', actFitzgerald],
      ['claire-collins', actCollins], ['michael-kalinoski', actKalinoski],
    ]
    for (const [slug, entries] of perActorEntries) {
      if (entries.length > 0 && entries[0].timestamp) {
        const ts = parseDbUtc(entries[0].timestamp).getTime()
        if (!isNaN(ts)) {
          map.set(slug, Math.floor((now - ts) / 86400000))
        }
      }
    }
    return map
  }, [actShyu, actFitzgerald, actCollins, actKalinoski])

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

  // P3-4: derive mentee slugs from the team raw API (member_type), falling back
  // to the overview API (mentees with tracked milestones). No hardcoded roster.
  const { data: rawTeamData } = useQuery({
    queryKey: ['team-raw'],
    queryFn: async (): Promise<{ data: Array<{ slug?: string; member_type?: string }> }> => {
      const r = await fetch('/api/team')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    staleTime: 60 * 1000,
  })
  const MENTEE_TYPES = new Set(['mentee', 'trainee', 'fellow', 'resident'])
  const menteeSlugsDerived = useMemo(() => {
    // Primary: from team API (includes member_type)
    const fromTeam = (rawTeamData?.data ?? [])
      .filter((m) => m.member_type && MENTEE_TYPES.has(m.member_type) && m.slug)
      .map((m) => m.slug as string)
    if (fromTeam.length > 0) return fromTeam
    // Secondary: overview API (mentees with tracked milestones)
    if (overview.length > 0) return [...new Set(overview.map((o) => o.mentee_slug))]
    // No hardcoded fallback (P3-4) — empty until team/overview data loads.
    return [] as string[]
  }, [rawTeamData, overview])

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
    <PageContainer>
      <PageHeader
        title="Mentee Milestones"
        subtitle={(() => {
          // R4-P2-05: reconcile subtitle with the table. When a filter is
          // active and the table is narrower than the overall upcoming
          // count, surface `Showing N of M` so the mismatch is explained.
          const filterActive = Boolean(filterMentee || filterType)
          const shown = flatList.length
          if (filterActive && shown !== upcomingTotal) {
            return `Showing ${shown} of ${upcomingTotal} upcoming`
          }
          return overdueTotal > 0
            ? `${overdueTotal} overdue, ${upcomingTotal} upcoming`
            : `${upcomingTotal} upcoming milestones`
        })()}
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

          {/* Add button */}
          <Button
            variant="primary"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              gap: '0.375rem',
              padding: '6px 12px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            <Plus {...ICON_PROPS} size={14} />
            Add Milestone
          </Button>
        </div>
      </PageHeader>

      {/* #507 follow-up: the overview cards below claim a specific "N
          upcoming"/"N overdue" count per mentee -- on a fetch failure that
          would otherwise read as a confirmed zero. Flag it once here rather
          than restructuring every card. */}
      {overviewError && (
        <div className="mb-4">
          <QueryErrorNote label="mentee overview stats" onRetry={() => refetchOverview()} />
        </div>
      )}

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
                  borderRadius: 'var(--radius-xl)',
                  cursor: 'pointer',
                  // NO inline background: .card supplies the dark-mode gradient
                  // lift (the card material gradient); an inline `background`
                  // shorthand resets background-image and DEFEATS that lift.
                }}
                whileHover={{ scale: 1.01 }}
              >
                <div style={{ width: 40, height: 40, flexShrink: 0 }}>
                  <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={40} />
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
                          // Orange (going stale) for both buckets — we're flagging PI action, not
                          // calling out the trainee. Red was too harsh.
                          backgroundColor: 'color-mix(in srgb, var(--job-stale) 15%, transparent)',
                          color: 'var(--job-stale)',
                          flexShrink: 0,
                        }}
                      >
                        {isSilent ? `Needs check-in · ${silenceDays}d` : `Quiet · ${silenceDays}d`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span style={{ fontSize: 'var(--label-size)', color: 'var(--sk-t2)' }}>
                      {stats?.upcoming_count ?? 0} upcoming
                    </span>
                    {(stats?.overdue_count ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--job-overdue)',
                          background: 'color-mix(in srgb, var(--job-overdue) 12%, transparent)',
                        }}
                      >
                        <AlertTriangle {...ICON_PROPS} size={10} />
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
              background: 'color-mix(in srgb, var(--job-accent) 10%, transparent)',
              color: 'var(--job-accent)',
              border: '1px solid color-mix(in srgb, var(--job-accent) 20%, transparent)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {getPersonInfo(filterMentee).name}
            <X {...ICON_PROPS} size={12} />
          </button>
        </div>
      )}

      {/* Timeline Table */}
      <div className="mt-2">
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : milestonesError ? (
          <div className="flex items-center justify-center py-10">
            <QueryErrorNote label="milestones" onRetry={() => refetchMilestones()} />
          </div>
        ) : flatList.length === 0 ? (
          <EmptyState
            icon={<EmptyStateArt variant="grants" />}
            title="Nothing scheduled yet"
            subtitle="Track committee meetings, IRB submissions, scholarly projects, and qualifying exams for each mentee in one place."
            action={{ label: 'Add Milestone', onClick: () => setShowAddModal(true) }}
          />
        ) : (
          <div className="table-container">
            {/* Column headers */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: '140px minmax(200px, 1fr) 120px 120px 100px',
                padding: 'var(--sp-sm) var(--sp-lg)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {['Mentee', 'Title', 'Type', 'Due date', 'Status'].map((col) => (
                <span
                  key={col}
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--slate)',
                    opacity: 'var(--ink-label)',
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
                  background: 'color-mix(in srgb, var(--sk-t1) 3%, transparent)',
                }}
              >
                {[
                  { label: 'Total', value: flatList.length },
                  ...(overdueTotal > 0
                    ? [{ label: 'Overdue', value: overdueTotal, color: 'var(--job-overdue)' }]
                    : []),
                  { label: 'Upcoming', value: upcomingTotal },
                  {
                    label: 'Completed',
                    value: overview.reduce((s, o) => s + o.completed_count, 0),
                    color: 'var(--sk-t3)',
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
      {showAddModal && <AddMilestoneModal menteeSlugs={menteeSlugsDerived} onClose={() => setShowAddModal(false)} />}
    </PageContainer>
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
    <motion.div variants={{ hidden: { y: 8 }, visible: { y: 0 } }}>
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
          <ChevronDown {...ICON_PROPS} size={12} style={{ color: 'var(--slate)', opacity: 0.75 }} />
        ) : (
          <ChevronRight {...ICON_PROPS} size={12} style={{ color: 'var(--slate)', opacity: 0.75 }} />
        )}
        <div style={{ width: 20, height: 20, flexShrink: 0 }}>
          <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={20} />
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
              color: 'var(--job-overdue)',
              background: 'color-mix(in srgb, var(--job-overdue) 12%, transparent)',
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
              // Amber for both — neutral framing (P2-06).
              backgroundColor: 'color-mix(in srgb, var(--job-stale) 15%, transparent)',
              color: 'var(--job-stale)',
              flexShrink: 0,
            }}
          >
            {isSilent ? `Needs check-in · ${silenceDays}d` : `Quiet · ${silenceDays}d`}
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
        opacity: isDone ? 0.85 : 1,
        background: item._isOverdue
          ? 'color-mix(in srgb, var(--job-overdue) 6%, transparent)'
          : isFocused
            ? 'color-mix(in srgb, var(--job-accent) 6%, transparent)'
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
            <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={20} />
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
            color: 'var(--sk-t3)',
            opacity: 0.85,
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
              color: 'var(--job-overdue)',
              background: 'color-mix(in srgb, var(--job-overdue) 12%, transparent)',
              whiteSpace: 'nowrap' as const,
            }}
          >
            <AlertTriangle {...ICON_PROPS} size={10} />
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
                color: 'var(--job-overdue)',
                background: 'color-mix(in srgb, var(--job-overdue) 12%, transparent)',
              }}
            >
              <AlertTriangle {...ICON_PROPS} size={9} />
              {daysLate > 0 ? `${daysLate}d overdue` : 'Overdue'}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 400 }}>
              {dueStr}
            </span>
          )}
          <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--sk-t3)', opacity: 0.85 }}>
            {getTypeLabel(item.milestone_type)}
          </span>
          <div style={{ width: 18, height: 18, flexShrink: 0 }}>
            <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={18} />
          </div>
          {/* P3-5: status edit works on touch — same shared editor as desktop.
              stopPropagation so tapping the control doesn't toggle row expand. */}
          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
            <InlineSelect
              value={item.status}
              options={STATUS_OPTIONS}
              onChange={(val) => onStatusChange(item.id, val, item.status)}
              size="sm"
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
                    background: 'color-mix(in srgb, var(--sk-t1) 3%, transparent)',
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--sk-t3)', display: 'block', marginBottom: '4px' }}>
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
    <InlineSelect
      value={value}
      options={[{ value: '', label: placeholder }, ...options]}
      onChange={onChange}
      alwaysShowChevron
    />
  )
}

// ── Add Milestone Modal ────────────────────────────────────

function AddMilestoneModal({ menteeSlugs, onClose }: { menteeSlugs: string[]; onClose: () => void }) {
  const createMilestone = useCreateMenteeMilestone()
  const [menteeSlug, setMenteeSlug] = useState(menteeSlugs[0] ?? '')
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

  const inputStyle = {
    width: '100%',
    padding: 'var(--sp-sm) var(--sp-md)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--field-edge)',
    background: 'var(--field-bg)',
    color: 'var(--ink)',
    fontSize: 'var(--value-size)',
    outline: 'none',
  } as const

  return (
    <Modal
      open
      onClose={onClose}
      title="Add milestone"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!title.trim() || createMilestone.isPending}
          >
            <Check {...ICON_PROPS} size={14} />
            {createMilestone.isPending ? 'Creating...' : 'Create milestone'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Mentee" htmlFor="mentee-milestone-mentee" noContainer>
          <InlineSelect id="mentee-milestone-mentee"
            value={menteeSlug}
            options={menteeSlugs.map((s) => ({ value: s, label: getPersonInfo(s).name || s }))}
            onChange={setMenteeSlug}
            size="md"
            alwaysShowChevron
          />
        </Field>

        <Field label="Milestone type" htmlFor="mentee-milestone-type" noContainer>
          <InlineSelect id="mentee-milestone-type"
            value={milestoneType}
            options={MILESTONE_TYPES}
            onChange={setMilestoneType}
            size="md"
            alwaysShowChevron
          />
        </Field>

        <Field label="Title" htmlFor="mentee-milestone-title" noContainer>
          <input
            id="mentee-milestone-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual Committee Meeting"
            autoFocus
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          />
        </Field>

        <Field label="Due date" htmlFor="mentee-milestone-due" noContainer>
          <input
            id="mentee-milestone-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Description (optional)" htmlFor="mentee-milestone-description" noContainer>
          <textarea
            id="mentee-milestone-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional context or requirements..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </Field>
      </div>
    </Modal>
  )
}
