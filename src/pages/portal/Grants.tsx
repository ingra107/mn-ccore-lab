import { useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Calendar, Banknote, Diamond, ArrowRight, Clock, Telescope, Plus, ClipboardList, X, Check, AlertTriangle } from 'lucide-react'
import { staggerContainer, staggerItem } from '../../lib/animations'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import MetricCard from '../../components/MetricCard'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import type { GrantTimelineItem } from '../../hooks/useGrantTimeline'
import { useSimilarGrants, useUpcomingGrantMilestones } from '../../hooks/useApiData'
import { useCreateGrantMilestone, useUpdateGrantMilestone, useCompleteGrantMilestone } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'
import { formatMediumDate, isOverdue } from '../../lib/dateUtils'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'

// ── Grant Milestone Constants ──────────────────────────────

const MILESTONE_TYPES = [
  { value: 'progress_report', label: 'Progress Report' },
  { value: 'continuing_review', label: 'Continuing Review' },
  { value: 'nce_deadline', label: 'NCE Deadline' },
  { value: 'budget_period', label: 'Budget Period' },
  { value: 'irb_renewal', label: 'IRB Renewal' },
  { value: 'subcontract', label: 'Subcontract' },
  { value: 'other', label: 'Other' },
]

const MILESTONE_STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming', color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--teal)' },
  { value: 'completed', label: 'Completed', color: 'var(--green)' },
  { value: 'overdue', label: 'Overdue', color: 'var(--maroon)' },
]

function getMilestoneTypeLabel(type: string): string {
  return MILESTONE_TYPES.find((t) => t.value === type)?.label || type
}

// isMilestoneOverdue replaced by isOverdue from dateUtils

function formatFunding(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

function mechanismColor(mechanism: string): { bg: string; color: string } {
  switch (mechanism) {
    case 'R01': return { bg: 'rgba(45,138,138,0.1)', color: 'var(--teal)' }
    case 'K23': return { bg: 'rgba(45,138,138,0.1)', color: 'var(--teal)' }
    case 'R03': return { bg: 'rgba(122,0,25,0.1)', color: 'var(--maroon)' }
    default: return { bg: 'rgba(201,168,76,0.1)', color: 'var(--gold)' }
  }
}

export default function Grants() {
  const { data: grants = [], isLoading } = useGrantTimeline()
  const [searchKeywords, setSearchKeywords] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  useListKeyboardNav({ itemCount: grants.length, focusedIndex, setFocusedIndex })
  const similarGrants = useSimilarGrants(activeSearch)

  // Grant post-award milestones
  const { data: upcomingMilestonesData = [], isLoading: milestonesLoading } = useUpcomingGrantMilestones(90)
  const updateMilestone = useUpdateGrantMilestone()
  const completeMilestone = useCompleteGrantMilestone()
  const { showUndo } = useUndoToast()

  const enrichedPostAward = useMemo(() => {
    return upcomingMilestonesData.map((m) => ({
      ...m,
      _isOverdue: isOverdue(m.due_date, m.status) || m.status === 'overdue',
    }))
  }, [upcomingMilestonesData])

  const handleMilestoneStatusChange = useCallback((id: string, newStatus: string, prevStatus: string) => {
    if (newStatus === 'completed') {
      completeMilestone.mutate(id)
    } else {
      updateMilestone.mutate({ id, fields: { status: newStatus } })
    }
    const labels: Record<string, string> = { upcoming: 'Upcoming', in_progress: 'In Progress', completed: 'Completed', overdue: 'Overdue' }
    showUndo(`Status changed to ${labels[newStatus] || newStatus}`, () => {
      updateMilestone.mutate({ id, fields: { status: prevStatus } })
    })
  }, [updateMilestone, completeMilestone, showUndo])

  const active = useMemo(() => grants.filter((g) => !g.proposed), [grants])
  const proposed = useMemo(() => grants.filter((g) => g.proposed), [grants])

  const totalFunding = useMemo(
    () => grants.reduce((sum, g) => sum + (g.total_funding || 0), 0),
    [grants]
  )

  const upcomingMilestones = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10)
    return grants
      .flatMap((g) =>
        (g.milestones || [])
          .filter((m) => m.target_date >= now && m.status !== 'completed')
          .map((m) => ({ ...m, grantMechanism: g.mechanism, grantTitle: g.title }))
      )
      .sort((a, b) => a.target_date.localeCompare(b.target_date))
      .slice(0, 5)
  }, [grants])

  return (
    <div>
      <PageHeader
        icon={<Wallet size={20} />}
        title="Grants & Funding"
        subtitle={`${active.length} active, ${proposed.length} proposed`}
        count={grants.length}
      />

      {/* Summary metrics */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Wallet} label="Active Grants" value={active.length} color="var(--teal)" />
        <MetricCard icon={Wallet} label="Proposed" value={proposed.length} color="var(--gold)" />
        <MetricCard icon={Banknote} label="Total Funding" value={totalFunding > 0 ? formatFunding(totalFunding) : '-'} color="var(--teal)" />
        <MetricCard icon={Diamond} label="Upcoming Milestones" value={upcomingMilestones.length} color="var(--maroon)" />
      </div>

      {/* Upcoming milestones */}
      {upcomingMilestones.length > 0 && (
        <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
          <h3 className="text-sm font-normal mb-3" style={{ color: 'var(--ink)' }}>
            Upcoming Milestones
          </h3>
          <div className="flex flex-col gap-1.5">
            {upcomingMilestones.map((m) => {
              const daysUntil = Math.ceil((new Date(m.target_date + 'T23:59:59').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
              const isDueSoon = daysUntil >= 0 && daysUntil <= 7
              return (
                <div key={m.id}>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                    <Diamond size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                    <span className="flex-1 text-sm truncate" style={{ color: 'var(--ink)' }}>
                      {m.title}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.08)' }}>
                      {m.grantMechanism}
                    </span>
                    <span className="text-[11px] flex-shrink-0 w-20 text-right" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                      {formatMediumDate(m.target_date)}
                    </span>
                  </div>
                  {m.future_note && isDueSoon && (
                    <div className="ml-8 mr-3 mt-1 mb-1 p-3 rounded-lg" style={{
                      background: 'rgba(201,168,76,0.06)',
                      border: '1px solid rgba(201,168,76,0.15)',
                      borderLeft: '3px solid var(--gold)',
                    }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock size={10} style={{ color: 'var(--gold)' }} />
                        <span style={{ fontSize: 'var(--label-size)', fontWeight: 500, color: 'var(--gold)' }}>
                          Note from past you
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, fontStyle: 'italic', margin: 0 }}>
                        {m.future_note}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Post-Award Lifecycle Milestones */}
      <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={14} style={{ color: 'var(--teal)' }} />
            <h3 className="text-sm font-normal" style={{ color: 'var(--ink)', margin: 0 }}>
              Post-Award Milestones
            </h3>
            {enrichedPostAward.filter((m) => m._isOverdue).length > 0 && (
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
                {enrichedPostAward.filter((m) => m._isOverdue).length} overdue
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddMilestone(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: 'var(--teal)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Plus size={12} />
            Add Milestone
          </button>
        </div>

        {milestonesLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : enrichedPostAward.length === 0 ? (
          <div className="text-center py-4">
            <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.6 }}>
              No upcoming post-award milestones. Add progress reports, continuing reviews, NCE deadlines, and budget periods.
            </p>
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: 'minmax(140px, 1fr) 140px minmax(200px, 2fr) 100px 100px',
                padding: '6px 12px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {['GRANT', 'TYPE', 'TITLE', 'DUE DATE', 'STATUS'].map((col) => (
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

            {/* Milestone rows */}
            {enrichedPostAward.map((m) => {
              const daysUntil = m.due_date
                ? Math.ceil((new Date(m.due_date + 'T23:59:59').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : null
              return (
                <div
                  key={m.id}
                  className="sm:grid items-center transition-colors"
                  style={{
                    gridTemplateColumns: 'minmax(140px, 1fr) 140px minmax(200px, 2fr) 100px 100px',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: m._isOverdue ? 'rgba(122,0,25,0.04)' : 'transparent',
                    borderLeft: m._isOverdue ? '3px solid var(--maroon)' : '3px solid transparent',
                  }}
                >
                  {/* Grant name */}
                  <span className="text-xs truncate" style={{ color: 'var(--ink)', fontWeight: 500 }}>
                    {m.grant_mechanism && (
                      <span
                        className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          color: 'var(--teal)',
                          background: 'rgba(45,138,138,0.1)',
                        }}
                      >
                        {m.grant_mechanism}
                      </span>
                    )}
                    {m.grant_title || m.grant_id}
                  </span>

                  {/* Type */}
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full inline-block w-fit"
                    style={{
                      color: 'var(--slate)',
                      background: 'rgba(100,116,139,0.06)',
                    }}
                  >
                    {getMilestoneTypeLabel(m.milestone_type)}
                  </span>

                  {/* Title */}
                  <span className="text-xs truncate" style={{ color: 'var(--ink)' }}>
                    {m.title}
                  </span>

                  {/* Due date */}
                  <span className="text-[11px]" style={{
                    color: m._isOverdue ? 'var(--maroon)' : (daysUntil !== null && daysUntil <= 14 ? 'var(--gold)' : 'var(--slate)'),
                    opacity: m._isOverdue ? 1 : 0.7,
                    fontWeight: m._isOverdue ? 600 : 400,
                  }}>
                    {m.due_date ? formatMediumDate(m.due_date) : '--'}
                  </span>

                  {/* Status inline select */}
                  <InlineSelect
                    value={m.status}
                    options={MILESTONE_STATUS_OPTIONS}
                    onChange={(newVal) => handleMilestoneStatusChange(m.id, newVal, m.status)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Milestone Modal */}
      <AnimatePresence>
        {showAddMilestone && (
          <AddGrantMilestoneModal
            grants={grants}
            onClose={() => setShowAddMilestone(false)}
          />
        )}
      </AnimatePresence>

      {/* Grant cards */}
      <div className="mt-5">
        {isLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : grants.length === 0 ? (
          <EmptyState
            icon={<Wallet size={40} />}
            title="No grants yet"
            subtitle="Active and pending grants with timelines, milestones, and budget tracking will appear here as they're added."
          />
        ) : (
          <motion.div className="table-container flex flex-col gap-3" style={{ padding: '16px 20px' }} variants={staggerContainer} initial="hidden" animate="visible">
            {/* Active grants first, then proposed */}
            {[...active, ...proposed].map((grant) => (
              <motion.div key={grant.id} variants={staggerItem}>
                <GrantCard grant={grant} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Link to full Gantt view */}
      {grants.length > 0 && (
        <div className="mt-4 text-center">
          <Link
            to="/grants"
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--teal)', textDecoration: 'none' }}
          >
            View full Gantt timeline
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Grant Landscape — NIH RePORTER */}
      <div className="mt-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Telescope size={16} style={{ color: 'var(--gold)' }} />
          <h3 style={{ fontWeight: 400, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
            Grant Landscape (NIH RePORTER)
          </h3>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Search keywords (e.g., critical care, mechanical ventilation, ARDS)"
            value={searchKeywords}
            onChange={(e) => setSearchKeywords(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setActiveSearch(searchKeywords) }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-light)',
              fontSize: 'var(--value-size)',
              background: 'var(--cream)',
              color: 'var(--ink)',
            }}
          />
          <button
            onClick={() => setActiveSearch(searchKeywords)}
            style={{
              background: 'var(--gold)',
              color: 'var(--ink)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 'var(--value-size)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </div>

        {/* Loading state */}
        {similarGrants.isLoading && (
          <div className="text-center py-6">
            <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.6 }}>
              Searching NIH RePORTER...
            </p>
          </div>
        )}

        {/* Results */}
        {similarGrants.data?.data?.map((grant) => (
          <div
            key={grant.project_num}
            className="p-3 rounded-lg mb-2"
            style={{ background: 'rgba(201,168,76,0.03)', border: '1px solid rgba(201,168,76,0.08)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, margin: 0 }}>
                  {grant.title}
                </p>
                <span style={{ fontSize: '10px', color: 'var(--slate)' }}>
                  {grant.project_num} &middot; {grant.pi} &middot; {grant.organization} &middot; FY{grant.fiscal_year}
                </span>
              </div>
              {grant.award_amount > 0 && (
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--teal)', whiteSpace: 'nowrap' }}>
                  ${(grant.award_amount / 1000).toFixed(0)}K
                </span>
              )}
            </div>
            {grant.abstract && (
              <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.7, marginTop: '4px', lineHeight: 1.4, marginBottom: 0 }}>
                {grant.abstract}...
              </p>
            )}
          </div>
        ))}

        {/* Total count */}
        {similarGrants.data && similarGrants.data.total > 0 && !similarGrants.isLoading && (
          <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginTop: '8px' }}>
            Showing {similarGrants.data.data.length} of {similarGrants.data.total.toLocaleString()} results
          </p>
        )}

        {/* Empty state after search */}
        {activeSearch && similarGrants.data?.data?.length === 0 && !similarGrants.isLoading && (
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.6, textAlign: 'center', padding: '16px 0' }}>
            No funded grants found for "{activeSearch}"
          </p>
        )}
      </div>
    </div>
  )
}

// ── Grant Card ──────────────────────────────────────────────

function GrantCard({ grant }: { grant: GrantTimelineItem }) {
  const pi = getPersonInfo(grant.pi)
  const mc = mechanismColor(grant.mechanism)
  const now = new Date().toISOString().slice(0, 10)

  // Progress percentage (how far through the grant period)
  let progress = 0
  if (grant.start_date && grant.end_date && !grant.proposed) {
    const start = new Date(grant.start_date).getTime()
    const end = new Date(grant.end_date).getTime()
    const current = Date.now()
    progress = Math.max(0, Math.min(100, ((current - start) / (end - start)) * 100))
  }

  const pendingMilestones = (grant.milestones || []).filter(
    (m) => m.target_date >= now && m.status !== 'completed'
  )

  return (
    <div
      className="rounded-xl border p-5 transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-start gap-4">
        {/* Left: mechanism badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: mc.bg, color: mc.color }}
          >
            {grant.mechanism}
          </span>
          {grant.proposed && (
            <span className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: 'var(--gold)' }}>
              Proposed
            </span>
          )}
        </div>

        {/* Center: content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
            {grant.title}
          </h4>

          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {/* PI */}
            <div className="flex items-center gap-1.5">
              <div style={{ width: 20, height: 20 }}>
                <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
              </div>
              <span className="text-xs" style={{ color: 'var(--slate)' }}>
                {pi.name}
              </span>
            </div>

            {/* Agency */}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--slate)', backgroundColor: 'rgba(100,116,139,0.06)' }}>
              {grant.agency}
            </span>

            {/* Dates */}
            {(grant.start_date || grant.end_date) && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                <Calendar size={10} />
                {grant.start_date ? formatMediumDate(grant.start_date) : '?'}
                {' \u2013 '}
                {grant.end_date ? formatMediumDate(grant.end_date) : '?'}
              </span>
            )}

            {/* Funding */}
            {grant.total_funding ? (
              <span className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                <Banknote size={10} />
                {formatFunding(grant.total_funding)}
              </span>
            ) : null}
          </div>

          {/* Progress bar (active grants only) */}
          {!grant.proposed && progress > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-light)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: progress > 80 ? 'var(--maroon)' : 'var(--teal)',
                  }}
                />
              </div>
              <span className="text-[10px] flex-shrink-0" style={{ color: progress > 80 ? 'var(--maroon)' : 'var(--slate)', opacity: progress > 80 ? 0.8 : 0.5 }}>
                {Math.round(progress)}%
                {grant.end_date && (() => {
                  const days = Math.ceil((new Date(grant.end_date).getTime() - Date.now()) / 86400000)
                  return days > 0 && days < 365 ? ` · ${days}d left` : null
                })()}
              </span>
            </div>
          )}

          {/* Upcoming milestones */}
          {pendingMilestones.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pendingMilestones.slice(0, 3).map((m) => (
                <span
                  key={m.id}
                  className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ color: 'var(--gold)', backgroundColor: 'rgba(201,168,76,0.08)' }}
                >
                  <Diamond size={8} />
                  {m.title}
                  <span style={{ opacity: 'var(--ink-label)', marginLeft: 2 }}>{formatMediumDate(m.target_date)}</span>
                </span>
              ))}
              {pendingMilestones.length > 3 && (
                <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.4 }}>
                  +{pendingMilestones.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Grant Milestone Modal ──────────────────────────────

function AddGrantMilestoneModal({
  grants,
  onClose,
}: {
  grants: GrantTimelineItem[]
  onClose: () => void
}) {
  const createMilestone = useCreateGrantMilestone()
  const [grantId, setGrantId] = useState(grants[0]?.id || '')
  const [milestoneType, setMilestoneType] = useState('progress_report')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = () => {
    if (!grantId || !title.trim()) return
    createMilestone.mutate(
      {
        grant_id: grantId,
        milestone_type: milestoneType,
        title: title.trim(),
        due_date: dueDate || undefined,
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => onClose() },
    )
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-light)',
    fontSize: 'var(--value-size)',
    background: 'var(--cream)',
    color: 'var(--ink)',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--cream)',
          borderRadius: '16px',
          border: '1px solid var(--border-light)',
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: 'var(--shadow-card-hover)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            Add Grant Milestone
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 'var(--ink-label)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Grant */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Grant
            </label>
            <select
              value={grantId}
              onChange={(e) => setGrantId(e.target.value)}
              style={inputStyle}
            >
              {grants.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.mechanism} - {g.title}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Milestone Type
            </label>
            <select
              value={milestoneType}
              onChange={(e) => setMilestoneType(e.target.value)}
              style={inputStyle}
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
            <label style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Title
            </label>
            <input
              type="text"
              placeholder="e.g., Year 2 RPPR"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Due date */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Notes (optional)
            </label>
            <textarea
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' as const }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'none',
              fontSize: 'var(--value-size)',
              color: 'var(--slate)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!grantId || !title.trim() || createMilestone.isPending}
            className="flex items-center gap-1.5"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: !grantId || !title.trim() ? 'var(--border-light)' : 'var(--teal)',
              color: !grantId || !title.trim() ? 'var(--slate)' : 'white',
              fontSize: 'var(--value-size)',
              fontWeight: 600,
              cursor: !grantId || !title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            <Check size={14} />
            {createMilestone.isPending ? 'Adding...' : 'Add Milestone'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
