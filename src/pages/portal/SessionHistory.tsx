import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { History, Clock, GitCommit, Zap, Monitor, Filter, Search } from 'lucide-react'
import { usePBSessions, usePBSessionStats } from '../../hooks/useApiData'
import type { PBSessionRow } from '../../hooks/useApiData'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { formatMediumDate } from '../../lib/dateUtils'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { staggerContainer, staggerItem } from '../../lib/animations'

// ── Helpers ────────────────────────────────────────────────────

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

function getProjectColor(name: string): string {
  // Deterministic color from project name
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 45%, 55%)`
}

// ── Activity Chart (inline SVG) ────────────────────────────────

function ActivityChart({ data }: { data: { day: string; count: number; total_minutes: number }[] }) {
  if (!data.length) return null

  // Fill in missing days for last 30 days
  const days: { day: string; count: number; total_minutes: number }[] = []
  const now = new Date()
  const dataMap = new Map(data.map(d => [d.day, d]))
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    days.push(dataMap.get(key) || { day: key, count: 0, total_minutes: 0 })
  }

  const maxCount = Math.max(...days.map(d => d.count), 1)
  const chartHeight = 80
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--slate)', opacity: 0.6, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Sessions per day (last 30 days)
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          width="100%"
          height={chartHeight + 20}
          viewBox={`0 0 ${days.length * 10} ${chartHeight + 20}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map(pct => (
            <line
              key={pct}
              x1={0}
              y1={chartHeight - chartHeight * pct}
              x2={days.length * 10}
              y2={chartHeight - chartHeight * pct}
              stroke="var(--border-subtle)"
              strokeWidth={0.5}
              strokeDasharray="2,2"
            />
          ))}
          {/* Bars */}
          {days.map((d, i) => {
            const barH = d.count > 0 ? Math.max((d.count / maxCount) * (chartHeight - 4), 3) : 0
            const isHovered = hoveredIdx === i
            return (
              <g key={d.day}>
                {/* Hit area */}
                <rect
                  x={i * 10}
                  y={0}
                  width={10}
                  height={chartHeight + 20}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: d.count > 0 ? 'default' : undefined }}
                />
                {/* Bar */}
                <rect
                  x={i * 10 + 1.5}
                  y={chartHeight - barH}
                  width={7}
                  height={barH}
                  rx={1.5}
                  fill={d.count > 0 ? (isHovered ? 'var(--teal)' : 'rgba(0,200,180,0.5)') : 'var(--border-subtle)'}
                  opacity={d.count > 0 ? 1 : 0.3}
                  style={{ transition: 'fill 0.15s, opacity 0.15s' }}
                />
                {/* Day-of-week label for Mondays */}
                {new Date(d.day + 'T12:00:00').getDay() === 1 && (
                  <text
                    x={i * 10 + 5}
                    y={chartHeight + 14}
                    textAnchor="middle"
                    fontSize={3.5}
                    fill="var(--slate)"
                    opacity={0.5}
                  >
                    M
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {/* Tooltip */}
        {hoveredIdx !== null && days[hoveredIdx] && (
          <div
            style={{
              position: 'absolute',
              top: -32,
              left: `${(hoveredIdx / days.length) * 100}%`,
              transform: 'translateX(-50%)',
              background: 'var(--ink)',
              color: 'var(--bg)',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {formatMediumDate(days[hoveredIdx].day)}: {days[hoveredIdx].count} session{days[hoveredIdx].count !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        padding: '14px 16px',
        borderRadius: 10,
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--slate)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--slate)', opacity: 'var(--ink-label)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────

export default function SessionHistory() {
  const [projectFilter, setProjectFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const { data: sessions = [], isLoading: sessionsLoading } = usePBSessions({
    limit: 100,
    project: projectFilter || undefined,
    since: sinceFilter || undefined,
  })
  const { data: stats, isLoading: statsLoading } = usePBSessionStats()

  // Derive project list for dropdown
  const projectNames = useMemo(() => {
    if (!stats?.per_project) return []
    return stats.per_project.map(p => p.project_name).filter(Boolean).sort()
  }, [stats])

  // Filter by search term
  const filteredSessions = useMemo(() => {
    if (!searchTerm) return sessions
    const q = searchTerm.toLowerCase()
    return sessions.filter(s =>
      (s.summary && s.summary.toLowerCase().includes(q)) ||
      (s.project_name && s.project_name.toLowerCase().includes(q))
    )
  }, [sessions, searchTerm])

  // Group sessions by date
  const grouped = useMemo(() => {
    const map = new Map<string, PBSessionRow[]>()
    for (const s of filteredSessions) {
      const date = s.started_at.split('T')[0]
      const list = map.get(date) || []
      list.push(s)
      map.set(date, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredSessions])

  // Flat list for keyboard nav
  const flatSessions = filteredSessions
  const [focusedIndex, setFocusedIndex] = useState(-1)

  useListKeyboardNav({
    itemCount: flatSessions.length,
    focusedIndex,
    setFocusedIndex,
  })

  // Reset focus on filter change
  useEffect(() => { setFocusedIndex(-1) }, [projectFilter, sinceFilter, searchTerm])

  // Date filter presets
  const setDatePreset = useCallback((preset: string) => {
    const now = new Date()
    switch (preset) {
      case '7d':
        now.setDate(now.getDate() - 7)
        break
      case '30d':
        now.setDate(now.getDate() - 30)
        break
      case '90d':
        now.setDate(now.getDate() - 90)
        break
      default:
        setSinceFilter('')
        return
    }
    setSinceFilter(now.toISOString().split('T')[0])
  }, [])

  const isLoading = sessionsLoading || statsLoading

  return (
    <div>
      <PageHeader
        icon={<History size={20} />}
        title="Session History"
        subtitle={stats ? `${filteredSessions.length}${searchTerm ? ` of ${stats.total_sessions}` : ''} sessions` : undefined}
      >
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />

          {/* Search */}
          <div style={{ position: 'relative', minWidth: 160 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', opacity: 0.4 }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search summaries..."
              style={{
                fontSize: 12,
                padding: '5px 10px 5px 26px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>

          {/* Project filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={{
              fontSize: 12,
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
              cursor: 'pointer',
              minWidth: 140,
            }}
          >
            <option value="">All projects</option>
            {projectNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          {/* Date range presets */}
          {['7d', '30d', '90d', 'all'].map(preset => (
            <button
              key={preset}
              onClick={() => setDatePreset(preset)}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: (preset === 'all' && !sinceFilter) || (sinceFilter && preset !== 'all')
                  ? (() => {
                    // Approximate match for active preset
                    const now = new Date()
                    const sinceDate = new Date(sinceFilter)
                    const diffDays = Math.round((now.getTime() - sinceDate.getTime()) / 86400000)
                    if (preset === '7d' && Math.abs(diffDays - 7) < 2) return 'var(--teal)'
                    if (preset === '30d' && Math.abs(diffDays - 30) < 2) return 'var(--teal)'
                    if (preset === '90d' && Math.abs(diffDays - 90) < 2) return 'var(--teal)'
                    return 'var(--surface)'
                  })()
                  : (preset === 'all' && !sinceFilter) ? 'var(--teal)' : 'var(--surface)',
                color: (preset === 'all' && !sinceFilter) ? 'white' : 'var(--slate)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {preset === 'all' ? 'All time' : preset}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Stats bar */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}
        >
          <StatCard
            label="Total Sessions"
            value={stats.total_sessions}
          />
          <StatCard
            label="Total Hours"
            value={stats.total_hours}
            sub={`${stats.total_commits} commits`}
          />
          <StatCard
            label="Avg Session"
            value={formatDuration(stats.avg_minutes)}
          />
          <StatCard
            label="This Week"
            value={stats.sessions_this_week}
            sub={`${stats.total_actions} actions total`}
          />
        </motion.div>
      )}

      {/* Activity chart */}
      {stats?.per_day && <ActivityChart data={stats.per_day} />}

      {/* Session list */}
      {isLoading ? (
        <div style={{ padding: 24 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 36, marginBottom: 4, borderRadius: 6, backgroundColor: 'var(--border-subtle)', opacity: 0.3, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<History size={32} />}
          title="No sessions yet"
          subtitle="Sessions will appear here once synced from brain.db"
        />
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 80px 1fr 2fr 60px 60px',
              gap: 8,
              padding: '8px 12px',
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--slate)',
              opacity: 'var(--ink-label)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div>Time</div>
            <div>Duration</div>
            <div>Project</div>
            <div>Summary</div>
            <div style={{ textAlign: 'center' }}>Actions</div>
            <div style={{ textAlign: 'center' }}>Commits</div>
          </div>

          {/* Grouped by date */}
          {grouped.map(([date, dateSessions]) => {
            // Count items before this date group for flat index
            let flatOffset = 0
            for (const [d] of grouped) {
              if (d === date) break
              flatOffset += grouped.find(g => g[0] === d)?.[1].length || 0
            }

            return (
              <div key={date}>
                {/* Date group header */}
                <div
                  style={{
                    padding: '10px 12px 6px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--gold)',
                    opacity: 0.85,
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: 'rgba(var(--gold-rgb, 191,155,48), 0.04)',
                  }}
                >
                  {formatMediumDate(date)}
                  <span style={{ fontWeight: 400, opacity: 0.6, marginLeft: 8 }}>
                    {dateSessions.length} session{dateSessions.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Session rows */}
                {dateSessions.map((session, idx) => {
                  const globalIdx = flatOffset + idx
                  const isFocused = focusedIndex === globalIdx

                  return (
                    <motion.div
                      key={session.id}
                      variants={staggerItem}
                      data-session-idx={globalIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '100px 80px 1fr 2fr 60px 60px',
                        gap: 8,
                        padding: '6px 12px',
                        fontSize: 13,
                        color: 'var(--ink)',
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: isFocused ? 'rgba(0,200,180,0.06)' : 'transparent',
                        outline: isFocused ? '1px solid rgba(0,200,180,0.3)' : 'none',
                        outlineOffset: -1,
                        borderRadius: 2,
                        minHeight: 36,
                        alignItems: 'center',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={() => setFocusedIndex(globalIdx)}
                    >
                      {/* Time */}
                      <div style={{ fontSize: 12, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} style={{ opacity: 0.4 }} />
                        {formatTime(session.started_at)}
                      </div>

                      {/* Duration */}
                      <div style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {formatDuration(session.duration_minutes)}
                      </div>

                      {/* Project */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {session.project_name ? (
                          <>
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 'var(--radius-circle)',
                                backgroundColor: getProjectColor(session.project_name),
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {session.project_name}
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.4 }}>--</span>
                        )}
                      </div>

                      {/* Summary */}
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--slate)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={session.summary || ''}
                      >
                        {session.summary || '--'}
                      </div>

                      {/* Actions count */}
                      <div style={{ textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {session.actions_count > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Zap size={10} style={{ color: 'var(--gold)', opacity: 0.7 }} />
                            {session.actions_count}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.3 }}>--</span>
                        )}
                      </div>

                      {/* Commits count */}
                      <div style={{ textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {session.commits_count > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <GitCommit size={10} style={{ color: 'var(--teal)', opacity: 0.7 }} />
                            {session.commits_count}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.3 }}>--</span>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )
          })}
        </motion.div>
      )}

      {/* Machine legend */}
      {sessions.length > 0 && (
        <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 8, backgroundColor: 'var(--surface)', border: '1px solid var(--border-subtle)', display: 'flex', gap: 16, alignItems: 'center', fontSize: 11, color: 'var(--slate)', opacity: 0.6 }}>
          <Monitor size={12} />
          <span>
            Machines: {[...new Set(sessions.filter(s => s.machine).map(s => s.machine))].join(', ') || 'none recorded'}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            J/K to navigate rows
          </span>
        </div>
      )}
    </div>
  )
}
