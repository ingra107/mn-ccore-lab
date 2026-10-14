import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { History, Clock, GitCommit, Zap, Monitor, Filter, Search } from 'lucide-react'
import { usePBSessions, usePBSessionStats } from '../../hooks/useApiData'
import type { PBSessionRow } from '../../hooks/useApiData'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { formatMediumDate, localDateKey, parseDateOnlyOrTimestamp } from '../../lib/dateUtils'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import EmptyState from '../../components/EmptyState'
import InlineSelect from '../../components/InlineSelect'
import FilterLinks from '../../components/ui/FilterLinks'
import StatRow from '../../components/ui/StatRow'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { ICON_PROPS } from '../../lib/iconProps'

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
    // D1 bare `YYYY-MM-DD HH:MM:SS` has no zone suffix; new Date() would read it
    // as LOCAL wall-clock — off by the viewer's UTC offset. parseDateOnlyOrTimestamp
    // appends 'Z' so the stored UTC time displays as the correct local clock time.
    const d = parseDateOnlyOrTimestamp(dateStr)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

// ── Activity Chart (inline SVG) ────────────────────────────────

function ActivityChart({ data }: { data: { day: string; count: number; total_minutes: number }[] }) {
  // Must be above the early return to satisfy Rules of Hooks — useState call
  // count must be the same on every render regardless of whether data is empty.
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!data.length) return null

  // Fill in missing days for last 30 days
  const days: { day: string; count: number; total_minutes: number }[] = []
  const now = new Date()
  const dataMap = new Map(data.map(d => [d.day, d]))
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = localDateKey(d)
    days.push(dataMap.get(key) || { day: key, count: 0, total_minutes: 0 })
  }

  const maxCount = Math.max(...days.map(d => d.count), 1)
  const chartHeight = 80

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--slate)', opacity: 0.75, marginBottom: 'var(--sp-sm)' }}>
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
                  fill={d.count > 0 ? (isHovered ? 'var(--job-accent)' : 'color-mix(in srgb, var(--job-accent) 50%, transparent)') : 'var(--border-subtle)'}
                  opacity={d.count > 0 ? 1 : 0.85}
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
              padding: 'var(--sp-xs) var(--sp-sm)',
              borderRadius: 'var(--radius-md)',
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 'var(--z-sticky)',
            }}
          >
            {formatMediumDate(days[hoveredIdx].day)}: {days[hoveredIdx].count} session{days[hoveredIdx].count !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────

export default function SessionHistory() {
  const [projectFilter, setProjectFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [activePreset, setActivePreset] = useState('all')

  const { data: sessions = [], isLoading: sessionsLoading } = usePBSessions({
    limit: 100,
    project: projectFilter || undefined,
    since: sinceFilter || undefined,
  })
  // Range stats share the list's filter, so the tiles and the "N of M" count
  // describe the range on screen. The project picker reads the unfiltered set.
  // No filter = the same all-time query (one cache entry, one request).
  const { data: stats, isLoading: statsLoading } = usePBSessionStats(
    projectFilter || sinceFilter
      ? { project: projectFilter || undefined, since: sinceFilter || undefined }
      : undefined,
  )
  const { data: allStats } = usePBSessionStats()

  // Derive project list for dropdown
  const projectNames = useMemo(() => {
    if (!allStats?.per_project) return []
    return allStats.per_project.map(p => p.project_name).filter(Boolean).sort()
  }, [allStats])

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

  // Reset focus on filter change. Adjusted during render (React's
  // "adjusting state based on a prop change" pattern) instead of an effect.
  const focusResetKey = `${projectFilter}|${sinceFilter}|${searchTerm}`
  const [prevFocusResetKey, setPrevFocusResetKey] = useState(focusResetKey)
  if (focusResetKey !== prevFocusResetKey) {
    setPrevFocusResetKey(focusResetKey)
    setFocusedIndex(-1)
  }

  // Date filter presets
  const setDatePreset = useCallback((preset: string) => {
    setActivePreset(preset)
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
    setSinceFilter(localDateKey(now))
  }, [])

  const isLoading = sessionsLoading || statsLoading

  return (
    <PageContainer>
      <PageHeader
        title="Session History"
        // The list is capped (limit 100); say so whenever it shows fewer rows
        // than the range holds, not only while searching.
        subtitle={stats ? `${filteredSessions.length}${searchTerm || filteredSessions.length < stats.total_sessions ? ` of ${stats.total_sessions}` : ''} sessions` : undefined}
      >
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />

          {/* Search */}
          <div style={{ position: 'relative', minWidth: 160 }}>
            <Search {...ICON_PROPS} size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', opacity: 0.75 }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search summaries..."
              style={{
                fontSize: 12,
                padding: '5px 10px 5px 26px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--field-edge)',
                backgroundColor: 'var(--field-bg)',
                color: 'var(--ink)',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>

          {/* Project filter */}
          <InlineSelect
            value={projectFilter}
            options={[{ value: '', label: 'All projects' }, ...projectNames.map((name) => ({ value: name, label: name }))]}
            onChange={setProjectFilter}
            alwaysShowChevron
          />

          {/* Date range presets */}
          <FilterLinks
            ariaLabel="Date range"
            value={activePreset}
            onChange={(v) => setDatePreset(v)}
            options={[
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
              { value: '90d', label: '90d' },
              { value: 'all', label: 'All time' },
            ]}
          />
        </div>
      </PageHeader>

      {/* Stats bar */}
      {stats && (
        <div style={{ marginBottom: 'var(--sp-xl)' }}>
          <StatRow
            stats={[
              { label: activePreset === 'all' ? 'Total sessions' : `Sessions, last ${activePreset}`, value: stats.total_sessions },
              { label: 'Total hours', value: stats.total_hours, sub: `${stats.total_commits} commits` },
              { label: 'Avg session', value: formatDuration(stats.avg_minutes) },
              { label: 'This week', value: stats.sessions_this_week, sub: `${stats.total_actions} actions total` },
            ]}
          />
        </div>
      )}

      {/* Activity chart */}
      {stats?.per_day && <ActivityChart data={stats.per_day} />}

      {/* Session list */}
      {isLoading ? (
        <div style={{ padding: 'var(--sp-xl)' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 36, marginBottom: 'var(--sp-xs)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--border-subtle)', opacity: 0.85, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<History size={32} />}
          title="Set up SessionEnd hook to see Claude history"
          subtitle="Sessions populate here automatically once the MN-CCORE SessionEnd hook is installed in your Claude Code setup. Each session becomes a searchable record of what got done, tied to the project folder it ran in."
          action={{
            label: 'Open install guide',
            onClick: () => window.open('https://github.com/ingra107/Peripheral-Brain#sessionend-hook', '_blank', 'noopener,noreferrer'),
          }}
        />
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          {/* Table header */}
          {/* .sess-grid (index.css) owns the columns: six on a wide screen,
              stacked on a phone, where the header row hides. */}
          <div
            className="sess-grid sess-head"
            style={{
              padding: 'var(--sp-sm) var(--sp-md)',
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--slate)',
              opacity: 'var(--ink-label)',
              borderBottom: '1px solid var(--sk-line)',
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
                    color: 'var(--sk-t2)',
                    opacity: 0.85,
                    borderBottom: '1px solid var(--sk-line)',
                    backgroundColor: 'color-mix(in srgb, var(--sk-t1) 3%, transparent)',
                  }}
                >
                  {formatMediumDate(date)}
                  <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 'var(--sp-sm)' }}>
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
                      className="sess-grid"
                      style={{
                        padding: '6px 12px',
                        fontSize: 13,
                        color: 'var(--ink)',
                        borderBottom: '1px solid var(--sk-line)',
                        backgroundColor: isFocused ? 'color-mix(in srgb, var(--job-accent) 6%, transparent)' : 'transparent',
                        outline: isFocused ? '1px solid color-mix(in srgb, var(--job-accent) 30%, transparent)' : 'none',
                        outlineOffset: -1,
                        borderRadius: 'var(--radius-sm)',
                        minHeight: 36,
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={() => setFocusedIndex(globalIdx)}
                    >
                      {/* Time */}
                      <div className="sg-time" style={{ fontSize: 12, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
                        <Clock {...ICON_PROPS} size={11} style={{ opacity: 0.85 }} />
                        {formatTime(session.started_at)}
                      </div>

                      {/* Duration */}
                      <div className="sg-dur" style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {formatDuration(session.duration_minutes)}
                      </div>

                      {/* Project */}
                      <div className="sg-proj" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {session.project_name ? (
                          <>
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 'var(--radius-circle)',
                                backgroundColor: 'var(--sk-t3)',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {session.project_name}
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.75 }}>--</span>
                        )}
                      </div>

                      {/* Summary */}
                      <div
                        className="sg-sum"
                        style={{
                          fontSize: 12,
                          color: 'var(--slate)',
                        }}
                        title={session.summary || ''}
                      >
                        {session.summary || '--'}
                      </div>

                      {/* Actions count */}
                      <div className="sg-act" style={{ textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {session.actions_count > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Zap {...ICON_PROPS} size={10} style={{ color: 'var(--sk-t3)', opacity: 0.85 }} />
                            {session.actions_count}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.85 }}>--</span>
                        )}
                      </div>

                      {/* Commits count */}
                      <div className="sg-com" style={{ textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {session.commits_count > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <GitCommit {...ICON_PROPS} size={10} style={{ color: 'var(--sk-t3)', opacity: 0.85 }} />
                            {session.commits_count}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.85 }}>--</span>
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
        <div style={{ marginTop: 20, padding: 'var(--sp-md) var(--sp-sm)', display: 'flex', gap: 'var(--sp-lg)', alignItems: 'center', fontSize: 11, color: 'var(--slate)', opacity: 0.75 }}>
          <Monitor {...ICON_PROPS} size={12} />
          <span>
            Machines: {[...new Set(sessions.filter(s => s.machine).map(s => s.machine))].join(', ') || 'none recorded'}
          </span>
          <span className="kbd-hint" style={{ marginLeft: 'auto' }}>
            J/K to navigate rows
          </span>
        </div>
      )}
    </PageContainer>
  )
}
