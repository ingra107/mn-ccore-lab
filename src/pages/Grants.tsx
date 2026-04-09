import { useState, useMemo, useRef, useCallback } from 'react'
import { Banknote, Calendar, Building2, User, Diamond, ChevronRight } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import { useGrantTimeline } from '../hooks/useGrantTimeline'
import type { GrantTimelineItem, GrantMilestone } from '../hooks/useGrantTimeline'
import { getPersonInfo } from '../data/team'
import { formatMediumDate } from '../lib/dateUtils'
import SectionDivider from '../components/SectionDivider'

// ── Constants ──────────────────────────────────────────────────

const CHART_MIN_YEAR = 2023
const CHART_MAX_YEAR = 2033
const TOTAL_YEARS = CHART_MAX_YEAR - CHART_MIN_YEAR
const BAR_HEIGHT = 32
const BAR_GAP = 10
const LABEL_WIDTH = 140
const CHART_PADDING_TOP = 32
const CHART_PADDING_BOTTOM = 40

// ── Helpers ────────────────────────────────────────────────────

function mechanismColor(mechanism: string, proposed: boolean): string {
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

function formatFunding(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

function piDisplayName(pi: string): string {
  const info = getPersonInfo(pi)
  // Use last name only for chart labels
  const parts = info.name.split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : info.name
}

// ── Tooltip Component ──────────────────────────────────────────

interface TooltipData {
  grant: GrantTimelineItem
  x: number
  y: number
}

function GanttTooltip({ data, chartWidth }: { data: TooltipData; chartWidth: number }) {
  const { grant, x, y } = data
  const info = getPersonInfo(grant.pi)

  // Flip tooltip to left side if too close to right edge
  const flipLeft = x > chartWidth - 260
  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: y - 8,
    ...(flipLeft ? { right: chartWidth - x + 8 } : { left: x + 8 }),
    width: 240,
    zIndex: 50,
    pointerEvents: 'none',
  }

  return (
    <div style={tooltipStyle}>
      <div
        className="rounded-lg p-3"
        style={{
          background: 'var(--cream)',
          border: '1px solid rgba(201, 168, 76, 0.3)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Mechanism + Agency */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="px-1.5 py-0.5 rounded text-xs font-bold"
            style={{
              background: grant.proposed
                ? 'rgba(201, 168, 76, 0.15)'
                : 'rgba(45, 138, 138, 0.15)',
              color: grant.proposed ? 'var(--gold)' : 'var(--teal)',
              fontSize: '11px',
            }}
          >
            {grant.mechanism}
          </span>
          <span
            className="text-xs"
            style={{ color: 'var(--slate)', fontSize: '10px' }}
          >
            {grant.agency}
          </span>
          {grant.proposed ? (
            <span
              className="text-xs ml-auto"
              style={{ color: 'var(--gold)', fontSize: '9px' }}
            >
              PROPOSED
            </span>
          ) : null}
        </div>

        {/* Title */}
        <p
          className="text-sm font-medium leading-snug mb-1.5"
          style={{ color: 'var(--ink)' }}
        >
          {grant.title}
        </p>

        {/* PI */}
        <div className="flex items-center gap-1.5 mb-1">
          <User size={11} style={{ color: 'var(--slate)' }} />
          <span className="text-xs" style={{ color: 'var(--slate)' }}>{info.name}</span>
        </div>

        {/* Dates */}
        {(grant.start_date || grant.end_date) && (
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar size={11} style={{ color: 'var(--slate)' }} />
            <span className="text-xs" style={{ color: 'var(--slate)' }}>
              {grant.start_date ? formatMediumDate(grant.start_date) : '?'}
              {' \u2013 '}
              {grant.end_date ? formatMediumDate(grant.end_date) : '?'}
            </span>
          </div>
        )}

        {/* Funding */}
        {grant.total_funding ? (
          <div className="flex items-center gap-1.5">
            <Banknote size={11} style={{ color: 'var(--slate)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--teal)' }}>
              {formatFunding(grant.total_funding)}
            </span>
          </div>
        ) : null}

        {/* Milestones */}
        {grant.milestones.length > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(201, 168, 76, 0.2)' }}>
            <span
              className="text-xs block mb-1"
              style={{ color: 'var(--gold)', fontSize: '9px' }}
            >
              MILESTONES
            </span>
            {grant.milestones.slice(0, 3).map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 mb-0.5">
                <Diamond size={8} style={{ color: 'var(--gold)' }} />
                <span className="text-xs truncate" style={{ color: 'var(--slate)' }}>
                  {m.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── SVG Gantt Chart ────────────────────────────────────────────

function GanttChart({ grants }: { grants: GrantTimelineItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [containerWidth, setContainerWidth] = useState(900)

  // Measure container width
  const measuredRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            setContainerWidth(entry.contentRect.width)
          }
        })
        observer.observe(node)
        setContainerWidth(node.getBoundingClientRect().width)
        // Store for cleanup - attach to the outer ref
        ;(containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        return () => observer.disconnect()
      }
    },
    []
  )

  const chartWidth = containerWidth
  const chartHeight = CHART_PADDING_TOP + grants.length * (BAR_HEIGHT + BAR_GAP) + CHART_PADDING_BOTTOM

  // Today marker
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
                x1={x}
                y1={CHART_PADDING_TOP - 16}
                x2={x}
                y2={chartHeight - CHART_PADDING_BOTTOM + 12}
                stroke="var(--slate)"
                strokeOpacity={0.12}
                strokeDasharray="4 4"
              />
              <text
                x={x}
                y={chartHeight - CHART_PADDING_BOTTOM + 28}
                textAnchor="middle"
                style={{
                  fontSize: '10px',
                  fill: 'var(--slate)',
                  opacity: 0.6,
                }}
              >
                {year}
              </text>
            </g>
          )
        })}

        {/* Today marker */}
        <line
          x1={todayX}
          y1={CHART_PADDING_TOP - 16}
          x2={todayX}
          y2={chartHeight - CHART_PADDING_BOTTOM + 12}
          stroke="var(--maroon)"
          strokeWidth={2}
          strokeOpacity={0.7}
        />
        <text
          x={todayX}
          y={CHART_PADDING_TOP - 20}
          textAnchor="middle"
          style={{
            fontSize: '9px',
            fill: 'var(--maroon)',
            fontWeight: 700,
          }}
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
          const color = mechanismColor(grant.mechanism, !!grant.proposed)
          const isProposed = !!grant.proposed

          return (
            <g
              key={grant.id}
              onMouseEnter={(e) => handleBarEnter(grant, e)}
              onMouseLeave={handleBarLeave}
              style={{ cursor: 'pointer' }}
            >
              {/* Row label: mechanism badge */}
              <rect
                x={0}
                y={barY + 4}
                width={42}
                height={BAR_HEIGHT - 8}
                rx={4}
                fill={isProposed ? 'rgba(201, 168, 76, 0.12)' : 'rgba(45, 138, 138, 0.12)'}
              />
              <text
                x={21}
                y={barY + BAR_HEIGHT / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fill: color,
                }}
              >
                {grant.mechanism}
              </text>

              {/* PI name label */}
              <text
                x={50}
                y={barY + BAR_HEIGHT / 2 + 1}
                dominantBaseline="middle"
                style={{
                  fontSize: '11px',
                  fill: 'var(--slate)',
                }}
              >
                {piDisplayName(grant.pi)}
              </text>

              {/* Grant bar */}
              {isProposed ? (
                <>
                  {/* Proposed: dashed border with semi-transparent fill */}
                  <rect
                    x={barX}
                    y={barY + 2}
                    width={Math.max(barWidth, 4)}
                    height={BAR_HEIGHT - 4}
                    rx={6}
                    fill="rgba(201, 168, 76, 0.08)"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    opacity={0.7}
                    className="transition-opacity duration-200 hover:opacity-100"
                  />
                  {/* Diagonal hatch pattern for proposed */}
                  <clipPath id={`clip-${grant.id}`}>
                    <rect
                      x={barX}
                      y={barY + 2}
                      width={Math.max(barWidth, 4)}
                      height={BAR_HEIGHT - 4}
                      rx={6}
                    />
                  </clipPath>
                  {Array.from({ length: Math.ceil(barWidth / 12) + 2 }, (_, i) => (
                    <line
                      key={`hatch-${i}`}
                      x1={barX + i * 12 - BAR_HEIGHT}
                      y1={barY + BAR_HEIGHT - 2}
                      x2={barX + i * 12}
                      y2={barY + 2}
                      stroke={color}
                      strokeWidth={0.5}
                      strokeOpacity={0.15}
                      clipPath={`url(#clip-${grant.id})`}
                    />
                  ))}
                </>
              ) : (
                /* Active: solid bar */
                <rect
                  x={barX}
                  y={barY + 2}
                  width={Math.max(barWidth, 4)}
                  height={BAR_HEIGHT - 4}
                  rx={6}
                  fill={color}
                  opacity={0.85}
                  className="transition-opacity duration-200 hover:opacity-100"
                />
              )}

              {/* Inline label on bar (only if bar is wide enough) */}
              {barWidth > 120 && (
                <text
                  x={barX + 10}
                  y={barY + BAR_HEIGHT / 2 + 1}
                  dominantBaseline="middle"
                  style={{
                    fontSize: '10px',
                    fill: isProposed ? 'var(--gold)' : '#fff',
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
                // Only show milestones within bar bounds
                if (mx < barX || mx > barX + barWidth) return null
                const my = barY + BAR_HEIGHT / 2
                return (
                  <g key={m.id}>
                    <polygon
                      points={`${mx},${my - 5} ${mx + 5},${my} ${mx},${my + 5} ${mx - 5},${my}`}
                      fill="var(--gold)"
                      stroke="var(--cream)"
                      strokeWidth={1}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {/* Tooltip overlay (HTML, not SVG, for better styling) */}
      {tooltip && <GanttTooltip data={tooltip} chartWidth={chartWidth} />}
    </div>
  )
}

// ── Grant Card ─────────────────────────────────────────────────

function GrantCard({ grant }: { grant: GrantTimelineItem }) {
  const info = getPersonInfo(grant.pi)
  const isProposed = !!grant.proposed
  const color = mechanismColor(grant.mechanism, isProposed)

  return (
    <div
      className="card p-5 fade-in-up"
      style={{
        borderLeft: `3px solid ${color}`,
      }}
    >
      {/* Top row: mechanism + agency + status */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className="px-2 py-0.5 rounded text-xs font-bold"
          style={{
            background: isProposed ? 'rgba(201, 168, 76, 0.15)' : 'rgba(45, 138, 138, 0.15)',
            color,
            fontSize: '11px',
            letterSpacing: '0.03em',
          }}
        >
          {grant.mechanism}
        </span>
        <span
          className="text-xs"
          style={{
            color: 'var(--slate)',
            fontSize: '10px',
          }}
        >
          {grant.agency}
        </span>
        <span className="flex-1" />
        {isProposed ? (
          <span
            className="px-2 py-0.5 rounded-full text-xs"
            style={{
              background: 'rgba(201, 168, 76, 0.12)',
              color: 'var(--gold)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            PROPOSED
          </span>
        ) : (
          <span
            className="px-2 py-0.5 rounded-full text-xs"
            style={{
              background: 'rgba(45, 138, 138, 0.12)',
              color: 'var(--teal)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            ACTIVE
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-base font-normal leading-snug mb-3"
        style={{
          fontWeight: 400,
          color: 'var(--ink)',
        }}
      >
        {grant.title}
      </h3>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {/* PI */}
        <div className="flex items-center gap-2">
          <User size={13} style={{ color: 'var(--slate)', flexShrink: 0 }} />
          <span style={{ color: 'var(--slate)' }}>{info.name}</span>
        </div>

        {/* Agency */}
        <div className="flex items-center gap-2">
          <Building2 size={13} style={{ color: 'var(--slate)', flexShrink: 0 }} />
          <span style={{ color: 'var(--slate)' }}>{grant.agency}</span>
        </div>

        {/* Dates */}
        {(grant.start_date || grant.end_date) && (
          <div className="flex items-center gap-2 col-span-2">
            <Calendar size={13} style={{ color: 'var(--slate)', flexShrink: 0 }} />
            <span style={{ color: 'var(--slate)', fontSize: '13px' }}>
              {grant.start_date ? formatMediumDate(grant.start_date) : 'TBD'}
              {' \u2013 '}
              {grant.end_date ? formatMediumDate(grant.end_date) : 'TBD'}
            </span>
          </div>
        )}

        {/* Funding */}
        {grant.total_funding ? (
          <div className="flex items-center gap-2 col-span-2">
            <Banknote size={13} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <span style={{ color: 'var(--teal)', fontWeight: 600, fontSize: '13px' }}>
              {formatFunding(grant.total_funding)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Milestones */}
      {grant.milestones.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(201, 168, 76, 0.15)' }}>
          <span
            className="text-xs block mb-1.5"
            style={{
              color: 'var(--gold)',
              fontSize: '9px',
              letterSpacing: '0.1em',
            }}
          >
            MILESTONES
          </span>
          <div className="space-y-1">
            {grant.milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Diamond size={9} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span className="text-xs truncate" style={{ color: 'var(--ink)' }}>
                  {m.title}
                </span>
                {m.target_date && (
                  <span
                    className="text-xs ml-auto flex-shrink-0"
                    style={{ color: 'var(--slate)', fontSize: '10px' }}
                  >
                    {formatMediumDate(m.target_date)}
                  </span>
                )}
                {m.status === 'completed' && (
                  <ChevronRight size={10} style={{ color: 'var(--teal)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Summary Stats ──────────────────────────────────────────────

function GrantSummary({ grants }: { grants: GrantTimelineItem[] }) {
  const activeGrants = grants.filter((g) => !g.proposed)
  const proposedGrants = grants.filter((g) => !!g.proposed)
  const totalFunding = grants.reduce((sum, g) => sum + (g.total_funding || 0), 0)
  const agencies = [...new Set(grants.map((g) => g.agency))].filter(Boolean)

  const stats = [
    { label: 'Active Grants', value: String(activeGrants.length), color: 'var(--teal)' },
    { label: 'Proposed', value: String(proposedGrants.length), color: 'var(--gold)' },
    { label: 'Agencies', value: agencies.join(', ') || '--', color: 'var(--slate)' },
    { label: 'Total Funding', value: totalFunding > 0 ? formatFunding(totalFunding) : '--', color: 'var(--teal)' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="text-center p-4 rounded-lg"
          style={{
            background: 'rgba(201, 168, 76, 0.04)',
            border: '1px solid rgba(201, 168, 76, 0.1)',
          }}
        >
          <div
            className="text-2xl sm:text-3xl font-bold mb-1"
            style={{
              color: stat.color,
              fontWeight: 600,
            }}
          >
            {stat.value}
          </div>
          <div
            className="text-xs"
            style={{
              color: 'var(--slate)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────

export default function Grants() {
  usePageMeta(
    'Grant Timeline | MN-CCORE Lab',
    'Funding portfolio and grant timeline for MN-CCORE, showing active NIH awards and proposed grants in critical care and pulmonary medicine research.'
  )

  const { data: grants = [], isLoading } = useGrantTimeline()
  const cardsRef = useScrollRevealGroup('.fade-in-up', 80)
  const [filter, setFilter] = useState<'all' | 'active' | 'proposed'>('all')

  // Sort: active first, then by start_date
  const sortedGrants = useMemo(() => {
    return [...grants].sort((a, b) => {
      if (a.proposed !== b.proposed) return a.proposed - b.proposed
      const aDate = a.start_date || '9999'
      const bDate = b.start_date || '9999'
      return aDate.localeCompare(bDate)
    })
  }, [grants])

  // Grants with valid dates for the chart
  const chartGrants = useMemo(
    () => sortedGrants.filter((g) => g.start_date && g.end_date),
    [sortedGrants]
  )

  // Filtered grants for cards
  const filteredGrants = useMemo(() => {
    if (filter === 'active') return sortedGrants.filter((g) => !g.proposed)
    if (filter === 'proposed') return sortedGrants.filter((g) => !!g.proposed)
    return sortedGrants
  }, [sortedGrants, filter])

  const activeCount = grants.filter((g) => !g.proposed).length
  const proposedCount = grants.filter((g) => !!g.proposed).length
  const totalFunding = grants.reduce((sum, g) => sum + (g.total_funding || 0), 0)
  const mechanisms = [...new Set(grants.map(g => g.mechanism).filter(Boolean))]

  return (
    <>
      {/* Page Header */}
      <section className="pt-4 pb-6 sm:pb-8 content-container">
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl mb-3 sm:mb-4"
          style={{
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Grants & Funding
        </h1>
        <p
          className="text-base sm:text-lg max-w-2xl"
          style={{ color: 'var(--slate)' }}
        >
          Track research grants, funding, and milestone timelines
        </p>

        {/* Funding summary stats */}
        {!isLoading && grants.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Active Awards</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>{activeCount}</div>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Proposed</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>{proposedCount}</div>
            </div>
            {totalFunding > 0 && (
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Total Funding</div>
                <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{formatFunding(totalFunding)}</div>
              </div>
            )}
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Mechanisms</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {mechanisms.map(m => (
                  <span key={m} className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: mechanismColor(m, false), backgroundColor: mechanismColor(m, false) + '14' }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <SectionDivider />

      {/* Gantt Chart Section — hidden on small screens */}
      {!isLoading && chartGrants.length > 0 && (
        <section className="py-8 sm:py-10 content-container hidden md:block">
          <div className="flex items-center gap-2 mb-6">
            <Banknote size={16} style={{ color: 'var(--gold)' }} aria-hidden="true" />
            <h2
              className="text-sm"
              style={{
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--gold)',
                fontSize: '12px',
              }}
            >
              Funding Timeline
            </h2>
            <span className="flex-1 h-px" style={{ background: 'linear-gradient(to right, var(--gold), transparent)', opacity: 0.3 }} />
          </div>

          <GanttChart grants={chartGrants} />

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div style={{ width: 24, height: 8, borderRadius: 4, background: 'var(--teal)', opacity: 0.85 }} />
              <span
                style={{ fontSize: '10px', color: 'var(--slate)' }}
              >
                Active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                style={{
                  width: 24,
                  height: 8,
                  borderRadius: 4,
                  border: '1.5px dashed var(--gold)',
                  background: 'rgba(201, 168, 76, 0.08)',
                  opacity: 0.7,
                }}
              />
              <span
                style={{ fontSize: '10px', color: 'var(--slate)' }}
              >
                Proposed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg width={12} height={12} viewBox="0 0 12 12">
                <polygon points="6,1 11,6 6,11 1,6" fill="var(--gold)" />
              </svg>
              <span
                style={{ fontSize: '10px', color: 'var(--slate)' }}
              >
                Milestone
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div style={{ width: 12, height: 2, background: 'var(--maroon)', opacity: 0.7 }} />
              <span
                style={{ fontSize: '10px', color: 'var(--slate)' }}
              >
                Today
              </span>
            </div>
          </div>
        </section>
      )}

      <SectionDivider />

      {/* Summary Stats */}
      {!isLoading && grants.length > 0 && (
        <section className="pt-8 sm:pt-10 content-container">
          <GrantSummary grants={grants} />
        </section>
      )}

      {/* Grant Cards */}
      <section className="pb-12 sm:pb-16 content-container" ref={cardsRef}>
        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <h2
            className="text-sm mr-2"
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--gold)',
              fontSize: '12px',
            }}
          >
            Awards
          </h2>
          {(['all', 'active', 'proposed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-full text-xs cursor-pointer transition-all duration-200"
              style={{
                fontSize: '11px',
                fontWeight: filter === f ? 600 : 400,
                background: filter === f ? 'rgba(201, 168, 76, 0.15)' : 'transparent',
                color: filter === f ? 'var(--gold)' : 'var(--slate)',
                border: filter === f
                  ? '1px solid rgba(201, 168, 76, 0.3)'
                  : '1px solid rgba(201, 168, 76, 0.1)',
              }}
            >
              {f === 'all' ? `All (${grants.length})` : f === 'active' ? `Active (${activeCount})` : `Proposed (${proposedCount})`}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
              />
              <span className="text-sm" style={{ color: 'var(--slate)' }}>
                Loading grants...
              </span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredGrants.length === 0 && (
          <div className="text-center py-12" style={{ color: 'var(--slate)' }}>
            <Banknote size={40} className="mx-auto mb-3" style={{ opacity: 0.3 }} />
            <p className="text-lg mb-2">
              No grants to display.
            </p>
            <p className="text-sm">Grant data will appear here once the API is connected.</p>
          </div>
        )}

        {/* Cards grid */}
        {!isLoading && filteredGrants.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredGrants.map((grant) => (
              <GrantCard key={grant.id} grant={grant} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
