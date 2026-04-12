import { useMemo, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet,
  Calendar,
  Banknote,
  Diamond,
  List,
  GanttChartSquare,
  Clock,
  Telescope,
  Plus,
  ClipboardList,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { useDensity, densityClass } from '../../components/DensityToggle'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { ColumnHeader, TableContainer, TableControls } from '../../components/table'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import type { GrantTimelineItem, GrantMilestone } from '../../hooks/useGrantTimeline'
import { useSimilarGrants, useUpcomingGrantMilestones } from '../../hooks/useApiData'
import { useCreateGrantMilestone, useUpdateGrantMilestone, useCompleteGrantMilestone } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'
import { formatMediumDate, isOverdue } from '../../lib/dateUtils'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'

// ── Gantt chart constants ──────────────────────────────────────
const CHART_MIN_YEAR = 2023
const CHART_MAX_YEAR = 2033
const TOTAL_YEARS = CHART_MAX_YEAR - CHART_MIN_YEAR
const BAR_HEIGHT = 32
const BAR_GAP = 10
const LABEL_WIDTH = 140
const CHART_PADDING_TOP = 32
const CHART_PADDING_BOTTOM = 40

// ── Grant Milestone Constants ──────────────────────────────────

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

function formatFunding(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

function mechanismColor(mechanism: string): { bg: string; color: string } {
  switch (mechanism) {
    case 'R01': return { bg: 'var(--teal-active)', color: 'var(--teal)' }
    case 'K23': return { bg: 'var(--teal-active)', color: 'var(--teal)' }
    case 'R03': return { bg: 'rgba(122,0,25,0.1)', color: 'var(--maroon)' }
    default: return { bg: 'var(--gold-active)', color: 'var(--gold)' }
  }
}

// ── Gantt helpers ──────────────────────────────────────────────

function ganttMechanismColor(mechanism: string, proposed: boolean): string {
  if (proposed) return 'var(--gold)'
  switch (mechanism) {
    case 'R01': return 'var(--teal)'
    case 'K23': return 'var(--teal)'
    case 'R03': return 'var(--maroon)'
    default: return 'var(--teal)'
  }
}

function parseYear(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  return d.getFullYear() + d.getMonth() / 12 + d.getDate() / 365
}

function yearToX(year: number, chartWidth: number): number {
  return LABEL_WIDTH + ((year - CHART_MIN_YEAR) / TOTAL_YEARS) * (chartWidth - LABEL_WIDTH)
}

function piDisplayName(pi: string): string {
  const info = getPersonInfo(pi)
  const parts = info.name.split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : info.name
}

// ── Gantt tooltip ──────────────────────────────────────────────

interface TooltipData {
  grant: GrantTimelineItem
  x: number
  y: number
}

function GanttTooltip({ data, chartWidth }: { data: TooltipData; chartWidth: number }) {
  const { grant, x, y } = data
  const info = getPersonInfo(grant.pi)
  const flipLeft = x > chartWidth - 260
  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: y - 8,
    ...(flipLeft ? { right: chartWidth - x + 8 } : { left: x + 8 }),
    width: 240,
    zIndex: 'var(--z-dropdown)',
    pointerEvents: 'none',
  }
  const mc = mechanismColor(grant.mechanism)
  return (
    <div style={tooltipStyle}>
      <div
        className="rounded-lg p-3"
        style={{
          background: 'var(--cream)',
          border: '1px solid rgba(201, 168, 76, 0.3)',
          boxShadow: 'var(--shadow-card-hover)',
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="px-1.5 py-0.5 rounded text-xs font-bold"
            style={{ background: mc.bg, color: mc.color, fontSize: '11px' }}
          >
            {grant.mechanism}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--slate)' }}>{grant.agency}</span>
          {grant.proposed && (
            <span style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 600 }}>
              PROPOSED
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>
          {grant.title}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--slate)', margin: '4px 0 0' }}>
          {info.name}
        </p>
        {(grant.start_date || grant.end_date) && (
          <p style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6, margin: '2px 0 0' }}>
            {grant.start_date ? formatMediumDate(grant.start_date) : '?'}
            {' – '}
            {grant.end_date ? formatMediumDate(grant.end_date) : '?'}
          </p>
        )}
        {grant.total_funding ? (
          <p style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 600, margin: '4px 0 0' }}>
            {formatFunding(grant.total_funding)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ── Gantt Chart ────────────────────────────────────────────────

function GanttChart({ grants }: { grants: GrantTimelineItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [containerWidth, setContainerWidth] = useState(900)

  const measuredRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width)
        }
      })
      observer.observe(node)
      setContainerWidth(node.getBoundingClientRect().width)
      ;(containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      return () => observer.disconnect()
    }
  }, [])

  const chartWidth = containerWidth
  const chartHeight = CHART_PADDING_TOP + grants.length * (BAR_HEIGHT + BAR_GAP) + CHART_PADDING_BOTTOM
  const now = new Date()
  const todayYear = now.getFullYear() + now.getMonth() / 12 + now.getDate() / 365
  const todayX = yearToX(todayYear, chartWidth)

  const handleBarEnter = (grant: GrantTimelineItem, event: React.MouseEvent<SVGGElement>) => {
    const rect = (event.currentTarget as SVGGElement).getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    setTooltip({
      grant,
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.bottom - containerRect.top + 4,
    })
  }

  const handleBarLeave = () => setTooltip(null)

  return (
    <div ref={measuredRef} className="relative" style={{ width: '100%' }}>
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ overflow: 'visible' }}
        role="img"
        aria-label="Grant timeline Gantt chart showing active and proposed grants"
      >
        {/* Year gridlines */}
        {Array.from({ length: TOTAL_YEARS + 1 }, (_, i) => {
          const year = CHART_MIN_YEAR + i
          const x = yearToX(year, chartWidth)
          return (
            <g key={`grid-${year}`}>
              <line
                x1={x} y1={CHART_PADDING_TOP - 16}
                x2={x} y2={chartHeight - CHART_PADDING_BOTTOM + 12}
                stroke="var(--slate)" strokeOpacity={0.12} strokeDasharray="4 4"
              />
              <text
                x={x} y={chartHeight - CHART_PADDING_BOTTOM + 28}
                textAnchor="middle"
                style={{ fontSize: '10px', fill: 'var(--slate)', opacity: 0.6 }}
              >
                {year}
              </text>
            </g>
          )
        })}

        {/* Today marker */}
        <line
          x1={todayX} y1={CHART_PADDING_TOP - 16}
          x2={todayX} y2={chartHeight - CHART_PADDING_BOTTOM + 12}
          stroke="var(--maroon)" strokeWidth={2} strokeOpacity={0.7}
        />
        <text
          x={todayX} y={CHART_PADDING_TOP - 20}
          textAnchor="middle"
          style={{ fontSize: '10px', fill: 'var(--maroon)', fontWeight: 700 }}
        >
          TODAY
        </text>

        {/* Grant bars */}
        {grants.map((grant, index) => {
          const startYear = parseYear(grant.start_date)
          const endYear = parseYear(grant.end_date)
          if (!startYear || !endYear) return null

          const barX = yearToX(startYear, chartWidth)
          const barWidth = yearToX(endYear, chartWidth) - barX
          const barY = CHART_PADDING_TOP + index * (BAR_HEIGHT + BAR_GAP)
          const color = ganttMechanismColor(grant.mechanism, !!grant.proposed)
          const isProposed = !!grant.proposed

          return (
            <g
              key={grant.id}
              onMouseEnter={(e) => handleBarEnter(grant, e)}
              onMouseLeave={handleBarLeave}
              style={{ cursor: 'pointer' }}
            >
              {/* Mechanism badge */}
              <rect
                x={0} y={barY + 4} width={42} height={BAR_HEIGHT - 8} rx={4}
                fill={isProposed ? 'var(--gold-emphasis)' : 'var(--teal-emphasis)'}
              />
              <text
                x={21} y={barY + BAR_HEIGHT / 2 + 1}
                textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize: '10px', fontWeight: 700, fill: color }}
              >
                {grant.mechanism}
              </text>

              {/* PI label */}
              <text
                x={50} y={barY + BAR_HEIGHT / 2 + 1}
                dominantBaseline="middle"
                style={{ fontSize: '11px', fill: 'var(--slate)' }}
              >
                {piDisplayName(grant.pi)}
              </text>

              {/* Bar */}
              {isProposed ? (
                <>
                  <rect
                    x={barX} y={barY + 2} width={Math.max(barWidth, 4)} height={BAR_HEIGHT - 4} rx={6}
                    fill="rgba(201, 168, 76, 0.08)" stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7}
                    className="transition-opacity duration-200 hover:opacity-100"
                  />
                  <clipPath id={`clip-${grant.id}`}>
                    <rect x={barX} y={barY + 2} width={Math.max(barWidth, 4)} height={BAR_HEIGHT - 4} rx={6} />
                  </clipPath>
                  {Array.from({ length: Math.ceil(barWidth / 12) + 2 }, (_, i) => (
                    <line
                      key={`hatch-${i}`}
                      x1={barX + i * 12 - BAR_HEIGHT} y1={barY + BAR_HEIGHT - 2}
                      x2={barX + i * 12} y2={barY + 2}
                      stroke={color} strokeWidth={0.5} strokeOpacity={0.15}
                      clipPath={`url(#clip-${grant.id})`}
                    />
                  ))}
                </>
              ) : (
                <rect
                  x={barX} y={barY + 2} width={Math.max(barWidth, 4)} height={BAR_HEIGHT - 4} rx={6}
                  fill={color} opacity={0.85}
                  className="transition-opacity duration-200 hover:opacity-100"
                />
              )}

              {/* Inline bar label */}
              {barWidth > 120 && (
                <text
                  x={barX + 10} y={barY + BAR_HEIGHT / 2 + 1}
                  dominantBaseline="middle"
                  style={{
                    fontSize: '10px',
                    fill: isProposed ? 'var(--gold)' : 'var(--ink-bright, #fff)',
                    opacity: isProposed ? 0.8 : 0.9,
                  }}
                >
                  {grant.title.length > 35 ? grant.title.slice(0, 35) + '\u2026' : grant.title}
                </text>
              )}

              {/* Milestone diamonds */}
              {grant.milestones.map((m: GrantMilestone) => {
                const mYear = parseYear(m.target_date)
                if (!mYear) return null
                const mx = yearToX(mYear, chartWidth)
                if (mx < barX || mx > barX + barWidth) return null
                const my = barY + BAR_HEIGHT / 2
                return (
                  <g key={m.id}>
                    <polygon
                      points={`${mx},${my - 5} ${mx + 5},${my} ${mx},${my + 5} ${mx - 5},${my}`}
                      fill="var(--gold)" stroke="var(--cream)" strokeWidth={1}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {tooltip && <GanttTooltip data={tooltip} chartWidth={chartWidth} />}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────

type ViewMode = 'list' | 'timeline'
type FilterMode = 'all' | 'active' | 'proposed'
type SortKey = 'title' | 'pi' | 'mechanism' | 'status' | 'start_date' | 'end_date' | 'agency'

export default function Grants() {
  const { data: grants = [], isLoading } = useGrantTimeline()
  const [density, setDensity] = useDensity()
  const [view, setView] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [sortKey, setSortKey] = useState<SortKey>('start_date')
  const [sortAsc, setSortAsc] = useState(true)
  const [searchKeywords, setSearchKeywords] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  useListKeyboardNav({ itemCount: grants.length, focusedIndex, setFocusedIndex })
  const similarGrants = useSimilarGrants(activeSearch)

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

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key as SortKey); setSortAsc(true) }
  }

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

  // Filtered + sorted list
  const filteredGrants = useMemo(() => {
    let list = grants
    if (filter === 'active') list = active
    else if (filter === 'proposed') list = proposed

    return [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'pi': cmp = (a.pi || '').localeCompare(b.pi || ''); break
        case 'mechanism': cmp = (a.mechanism || '').localeCompare(b.mechanism || ''); break
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
        case 'start_date': cmp = (a.start_date || '').localeCompare(b.start_date || ''); break
        case 'end_date': cmp = (a.end_date || '').localeCompare(b.end_date || ''); break
        case 'agency': cmp = (a.agency || '').localeCompare(b.agency || ''); break
      }
      return sortAsc ? cmp : -cmp
    })
  }, [grants, active, proposed, filter, sortKey, sortAsc])

  // Unique mechanisms for the calc row
  const mechanisms = useMemo(() => {
    const seen = new Set<string>()
    for (const g of active) if (g.mechanism) seen.add(g.mechanism)
    return [...seen].sort()
  }, [active])

  const filterPills = (
    <>
      {(['all', 'active', 'proposed'] as FilterMode[]).map((f) => {
        const labels: Record<FilterMode, string> = { all: 'All', active: 'Active', proposed: 'Proposed' }
        const isActive = filter === f
        return (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-xs transition-colors border"
            style={{
              fontWeight: isActive ? 500 : 400,
              borderColor: isActive ? 'var(--teal)' : 'var(--border-subtle)',
              backgroundColor: isActive ? 'var(--teal-active)' : 'transparent',
              color: isActive ? 'var(--teal)' : 'var(--slate)',
              cursor: 'pointer',
            }}
          >
            {labels[f]}
          </button>
        )
      })}
    </>
  )

  return (
    <div>
      <PageHeader
        icon={<Wallet size={20} />}
        title="Grants & Funding"
        subtitle={`${active.length} active, ${proposed.length} proposed`}
        count={grants.length}
      >
        <TableControls
          views={[
            { key: 'list', icon: <List size={14} />, label: 'List' },
            { key: 'timeline', icon: <GanttChartSquare size={14} />, label: 'Timeline' },
          ]}
          activeView={view}
          onViewChange={(v) => setView(v as ViewMode)}
          filters={filterPills}
          showDensity
          density={density}
          onDensityChange={setDensity}
          count={filteredGrants.length}
          countLabel="grants"
        />
      </PageHeader>

      {/* ── LIST VIEW ── */}
      {!isLoading && view === 'list' && (
        <>
          {filteredGrants.length === 0 ? (
            <EmptyState
              icon={<Wallet size={40} />}
              title="No grants"
              subtitle="Active and pending grants will appear here once added."
            />
          ) : (
            <TableContainer className={densityClass(density)}>
              {/* Column headers */}
              <div
                className="hidden sm:grid col-header-row"
                style={{ gridTemplateColumns: 'minmax(200px, 2fr) 120px 100px 80px minmax(120px, 1fr) 100px' }}
              >
                <ColumnHeader label="TITLE" sortKey="title" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <ColumnHeader label="PI" sortKey="pi" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <ColumnHeader label="STATUS" sortKey="status" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <ColumnHeader label="MECHANISM" sortKey="mechanism" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <ColumnHeader label="PERIOD" sortKey="start_date" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <ColumnHeader label="AGENCY" sortKey="agency" currentSort={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              </div>

              {/* Rows */}
              {filteredGrants.map((grant) => {
                const pi = getPersonInfo(grant.pi)
                const mc = mechanismColor(grant.mechanism)
                const isProposed = !!grant.proposed

                // Progress
                let progress = 0
                if (grant.start_date && grant.end_date && !isProposed) {
                  const start = new Date(grant.start_date).getTime()
                  const end = new Date(grant.end_date).getTime()
                  const current = Date.now()
                  progress = Math.max(0, Math.min(100, ((current - start) / (end - start)) * 100))
                }

                return (
                  <div
                    key={grant.id}
                    className="sm:grid items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    style={{
                      gridTemplateColumns: 'minmax(200px, 2fr) 120px 100px 80px minmax(120px, 1fr) 100px',
                      minHeight: 'var(--row-height)',
                      padding: `var(--row-padding-y, 10px) 16px`,
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    {/* Title */}
                    <div className="min-w-0">
                      <span
                        className="text-sm block"
                        style={{
                          color: 'var(--ink)',
                          fontWeight: 500,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {grant.title}
                      </span>
                      {/* Progress bar for active grants */}
                      {!isProposed && progress > 0 && (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)', maxWidth: 160, width: '100%' }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: progress > 80 ? 'var(--maroon)' : 'var(--teal)',
                                transition: 'width 150ms var(--ease-out), background-color 150ms var(--ease-out)',
                              }}
                            />
                          </div>
                          <span className="text-[10px] flex-shrink-0" style={{ color: progress > 80 ? 'var(--maroon)' : 'var(--slate)', opacity: 0.6 }}>
                            {Math.round(progress)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* PI */}
                    <div className="flex items-center gap-1.5 sm:block">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                          <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="xs" variant="ice" />
                        </div>
                        <span className="text-xs truncate" style={{ color: 'var(--slate)' }}>
                          {pi.name.split(' ').slice(-1)[0]}
                        </span>
                      </div>
                    </div>

                    {/* Status pill */}
                    <div>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{
                          color: isProposed ? 'var(--gold)' : 'var(--teal)',
                          backgroundColor: isProposed
                            ? 'color-mix(in srgb, var(--gold) 12%, transparent)'
                            : 'color-mix(in srgb, var(--teal) 12%, transparent)',
                        }}
                      >
                        {isProposed ? 'Proposed' : 'Active'}
                      </span>
                    </div>

                    {/* Mechanism */}
                    <div>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{ backgroundColor: mc.bg, color: mc.color }}
                      >
                        {grant.mechanism}
                      </span>
                    </div>

                    {/* Period */}
                    <div>
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--slate)', opacity: 0.7 }}>
                        <Calendar size={10} style={{ flexShrink: 0 }} />
                        {grant.start_date ? formatMediumDate(grant.start_date) : '?'}
                        {' – '}
                        {grant.end_date ? formatMediumDate(grant.end_date) : '?'}
                      </span>
                    </div>

                    {/* Agency */}
                    <div>
                      <span className="text-xs truncate block" style={{ color: 'var(--slate)', opacity: 0.7 }}>
                        {grant.agency || '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </TableContainer>
          )}

          {/* Calculations row */}
          {filteredGrants.length > 0 && (
            <div
              className="mt-2 px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 flex-wrap"
              style={{ color: 'var(--slate)', opacity: 0.65, fontSize: '12px' }}
            >
              <span>{grants.length} grants</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{active.length} active</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{proposed.length} proposed</span>
              {totalFunding > 0 && (
                <>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span className="flex items-center gap-1">
                    <Banknote size={11} />
                    {formatFunding(totalFunding)} total funding
                  </span>
                </>
              )}
              {mechanisms.length > 0 && (
                <>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>mechanisms: {mechanisms.join(', ')}</span>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── TIMELINE VIEW ── */}
      {!isLoading && view === 'timeline' && (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
          {grants.length === 0 ? (
            <EmptyState
              icon={<GanttChartSquare size={40} />}
              title="No grants to display"
              subtitle="Add grants to see the timeline view."
            />
          ) : (
            <GanttChart grants={[...active, ...proposed]} />
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading && <TableSkeleton rows={4} cols={6} />}

      {/* Upcoming grant milestones */}
      {upcomingMilestones.length > 0 && (
        <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-active)' }}>
                      {m.grantMechanism}
                    </span>
                    <span className="text-[11px] flex-shrink-0 w-20 text-right" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                      {formatMediumDate(m.target_date)}
                    </span>
                  </div>
                  {m.future_note && isDueSoon && (
                    <div className="ml-8 mr-3 mt-1 mb-1 p-3 rounded-lg" style={{
                      background: 'var(--gold-hover)',
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
      <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
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
              color: 'var(--ink-bright, #fff)',
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
          <div className={densityClass(density)}>
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
                    opacity: 'var(--ink-label)' as unknown as number,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.06em',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>

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
                    padding: `var(--row-padding-y, 8px) 12px`,
                    borderBottom: '1px solid var(--border-subtle)',
                    background: m._isOverdue ? 'var(--maroon-hover)' : 'transparent',
                    borderLeft: m._isOverdue ? '3px solid var(--maroon)' : '3px solid transparent',
                  }}
                >
                  <span className="text-xs truncate" style={{ color: 'var(--ink)', fontWeight: 500 }}>
                    {m.grant_mechanism && (
                      <span
                        className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{ color: 'var(--teal)', background: 'var(--teal-active)' }}
                      >
                        {m.grant_mechanism}
                      </span>
                    )}
                    {m.grant_title || m.grant_id}
                  </span>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full inline-block w-fit"
                    style={{ color: 'var(--slate)', background: 'rgba(100,116,139,0.06)' }}
                  >
                    {getMilestoneTypeLabel(m.milestone_type)}
                  </span>
                  <span className="text-xs truncate" style={{ color: 'var(--ink)' }}>
                    {m.title}
                  </span>
                  <span className="text-[11px]" style={{
                    color: m._isOverdue ? 'var(--maroon)' : (daysUntil !== null && daysUntil <= 14 ? 'var(--gold)' : 'var(--slate)'),
                    opacity: m._isOverdue ? 1 : 0.7,
                    fontWeight: m._isOverdue ? 600 : 400,
                  }}>
                    {m.due_date ? formatMediumDate(m.due_date) : '--'}
                  </span>
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

      {/* Grant Landscape — NIH RePORTER */}
      <div className="mt-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Telescope size={16} style={{ color: 'var(--gold)' }} />
          <h3 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
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
              padding: 'var(--sp-sm) var(--sp-md)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
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
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--sp-sm) var(--sp-lg)',
              fontSize: 'var(--value-size)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </div>

        {similarGrants.isLoading && (
          <div className="text-center py-6">
            <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.6 }}>
              Searching NIH RePORTER...
            </p>
          </div>
        )}

        {similarGrants.data?.data?.map((grant) => (
          <div
            key={grant.project_num}
            className="p-3 rounded-lg mb-2"
            style={{ background: 'var(--gold-hover)', border: '1px solid rgba(201,168,76,0.08)' }}
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

        {similarGrants.data && similarGrants.data.total > 0 && !similarGrants.isLoading && (
          <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginTop: '8px' }}>
            Showing {similarGrants.data.data.length} of {similarGrants.data.total.toLocaleString()} results
          </p>
        )}

        {activeSearch && similarGrants.data?.data?.length === 0 && !similarGrants.isLoading && (
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.6, textAlign: 'center', padding: 'var(--sp-lg) 0' }}>
            No funded grants found for "{activeSearch}"
          </p>
        )}
      </div>
    </div>
  )
}

// ── Add Grant Milestone Modal ──────────────────────────────────

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
    padding: 'var(--sp-sm) var(--sp-md)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-subtle)',
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
        background: 'var(--overlay-medium)',
        zIndex: 'var(--z-sidebar)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-lg)',
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
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--border-subtle)',
          padding: 'var(--sp-xl)',
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
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 'var(--ink-label)' as unknown as number }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Grant
            </label>
            <select value={grantId} onChange={(e) => setGrantId(e.target.value)} style={inputStyle}>
              {grants.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.mechanism} - {g.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
              Milestone Type
            </label>
            <select value={milestoneType} onChange={(e) => setMilestoneType(e.target.value)} style={inputStyle}>
              {MILESTONE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

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

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            style={{
              padding: 'var(--sp-sm) var(--sp-lg)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
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
              padding: 'var(--sp-sm) var(--sp-lg)',
              borderRadius: 'var(--radius-lg)',
              border: 'none',
              background: !grantId || !title.trim() ? 'var(--border-subtle)' : 'var(--teal)',
              color: !grantId || !title.trim() ? 'var(--slate)' : 'var(--ink-bright, #fff)',
              fontSize: 'var(--value-size)',
              fontWeight: 600,
              cursor: !grantId || !title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {createMilestone.isPending ? (
              <span>Saving…</span>
            ) : (
              <>
                <Check size={14} />
                Add Milestone
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
