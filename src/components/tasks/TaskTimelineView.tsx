import { useMemo, useRef, useState, useCallback } from 'react'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, localDateKey, isOverdue as isPastDue } from '../../lib/dateUtils'
import EmptyState from '../EmptyState'
import { useProjects } from '../../hooks/useApiData'
import type { TaskRow } from '../../lib/api'

interface TaskTimelineViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onOpenDetail?: (task: TaskRow) => void
}

// ── Constants ──────────────────────────────────────────────────
const BAR_HEIGHT = 24
const BAR_GAP = 6
const ROW_HEIGHT = BAR_HEIGHT + BAR_GAP
const LABEL_WIDTH = 200
const CHART_PADDING_TOP = 28
const CHART_PADDING_BOTTOM = 32

const statusColors: Record<string, string> = {
  todo: 'var(--slate)',
  in_progress: 'var(--teal)',
  done: 'var(--green)',
  blocked: 'var(--maroon)',
}

const priorityOpacity: Record<string, number> = {
  urgent: 1,
  high: 0.85,
  medium: 0.85,
  low: 0.85,
}

export default function TaskTimelineView({ tasks, onOpenDetail }: TaskTimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ task: TaskRow; x: number; y: number } | null>(null)

  // Project data for displaying project names
  const { data: projects = [] } = useProjects()
  const projectMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) {
      if (p.slug) map.set(p.slug, p.short_name || p.title)
    }
    return map
  }, [projects])

  // Filter to tasks with due dates for the timeline; undated tasks listed below
  const { datedTasks, undatedTasks, startDate, endDate, totalDays } = useMemo(() => {
    const dated = tasks.filter((t) => t.due_date && !t.completed)
    const undated = tasks.filter((t) => !t.due_date && !t.completed)

    if (dated.length === 0) {
      return { datedTasks: [], undatedTasks: undated, startDate: new Date(), endDate: new Date(), totalDays: 30 }
    }

    // Compute range: from today (or earliest task) to latest due date + buffer
    const now = new Date()
    const dates = dated.map((t) => new Date(t.due_date! + 'T12:00:00'))
    const minDate = new Date(Math.min(now.getTime(), ...dates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))

    // Add 3-day buffer on each side
    const start = new Date(minDate)
    start.setDate(start.getDate() - 3)
    const end = new Date(maxDate)
    end.setDate(end.getDate() + 7)

    const days = Math.max(14, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))

    // Sort by due date
    dated.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))

    return { datedTasks: dated, undatedTasks: undated, startDate: start, endDate: end, totalDays: days }
  }, [tasks])

  const chartWidth = 800
  const chartHeight = CHART_PADDING_TOP + datedTasks.length * ROW_HEIGHT + CHART_PADDING_BOTTOM

  const dateToX = useCallback(
    (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00')
      const dayOffset = (d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      return LABEL_WIDTH + (dayOffset / totalDays) * (chartWidth - LABEL_WIDTH)
    },
    [startDate, totalDays]
  )

  const todayX = dateToX(localDateKey())

  // Generate week markers
  const weekMarkers = useMemo(() => {
    const markers: { x: number; label: string }[] = []
    const d = new Date(startDate)
    // Align to Monday
    d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7))
    while (d <= endDate) {
      const iso = localDateKey(d)
      markers.push({ x: dateToX(iso), label: formatShortDate(iso) })
      d.setDate(d.getDate() + 7)
    }
    return markers
  }, [startDate, endDate, dateToX])

  if (datedTasks.length === 0 && undatedTasks.length === 0) {
    return (
      <EmptyState
        compact
        icon={<div style={{ fontSize: 24, lineHeight: 1 }}>📅</div>}
        title="No tasks match the current filters"
      />
    )
  }

  return (
    <div>
      {datedTasks.length > 0 && (
        <div ref={containerRef} className="relative overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream)' }}>
          <svg width={chartWidth} height={chartHeight} style={{ display: 'block', minWidth: chartWidth }}>
            {/* Week grid lines */}
            {weekMarkers.map((m, i) => (
              <g key={i}>
                <line x1={m.x} y1={0} x2={m.x} y2={chartHeight} stroke="var(--border-subtle)" strokeWidth={1} />
                <text x={m.x} y={chartHeight - 8} textAnchor="middle" fill="var(--slate)" fontSize={9} fontFamily="var(--font-sans)" opacity={0.5}>
                  {m.label}
                </text>
              </g>
            ))}

            {/* TODAY marker */}
            {todayX >= LABEL_WIDTH && todayX <= chartWidth && (
              <g>
                <line x1={todayX} y1={0} x2={todayX} y2={chartHeight - CHART_PADDING_BOTTOM} stroke="var(--maroon)" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />
                <text x={todayX} y={12} textAnchor="middle" fill="var(--maroon)" fontSize={9} fontFamily="var(--font-sans)" fontWeight={600}>
                  TODAY
                </text>
              </g>
            )}

            {/* Task bars */}
            {datedTasks.map((task, i) => {
              const person = getPersonInfo(task.assignee)
              const y = CHART_PADDING_TOP + i * ROW_HEIGHT
              const dueX = dateToX(task.due_date!)
              const createdX = task.created_at ? dateToX(task.created_at.split('T')[0]) : LABEL_WIDTH
              const barStart = Math.max(createdX, LABEL_WIDTH)
              const barEnd = dueX
              const barWidth = Math.max(barEnd - barStart, 8)
              // R4: pass status so done tasks are never marked overdue.
              const isOverdue = isPastDue(task.due_date, task.status)
              const color = statusColors[task.status] || statusColors.todo
              const opacity = priorityOpacity[task.priority] || 0.7

              return (
                <g
                  key={task.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (rect) {
                      setTooltip({ task, x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onOpenDetail?.(task)}
                >
                  {/* Label */}
                  <text
                    x={LABEL_WIDTH - 8}
                    y={y + BAR_HEIGHT / 2 + 4}
                    textAnchor="end"
                    fill="var(--ink)"
                    fontSize={11}
                    fontFamily="var(--font-sans)"
                  >
                    {(task.title || task.description).slice(0, 22)}{(task.title || task.description).length > 22 ? '...' : ''}
                  </text>

                  {/* Bar */}
                  <rect
                    x={barStart}
                    y={y}
                    width={barWidth}
                    height={BAR_HEIGHT}
                    rx={4}
                    fill={color}
                    opacity={opacity}
                  />

                  {/* Overdue indicator */}
                  {isOverdue && (
                    <circle cx={dueX} cy={y + BAR_HEIGHT / 2} r={4} fill="var(--maroon)" />
                  )}

                  {/* Avatar at end */}
                  <foreignObject x={dueX + 6} y={y + 2} width={20} height={20}>
                    <div style={{ width: 20, height: 20, borderRadius: 'var(--radius-circle)', overflow: 'hidden', backgroundColor: 'var(--ice)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {person.photoUrl ? (
                        <img src={person.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 7, color: 'var(--slate)', fontWeight: 600 }}>{person.initials}</span>
                      )}
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-50 rounded-lg shadow-lg border p-3 pointer-events-none"
              style={{
                left: tooltip.x + 12,
                top: tooltip.y - 10,
                backgroundColor: 'var(--cream)',
                borderColor: 'var(--border-subtle)',
                maxWidth: 260,
              }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {tooltip.task.title || tooltip.task.description}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[10px] flex-wrap" style={{ color: 'var(--slate)' }}>
                <span>{getPersonInfo(tooltip.task.assignee).name}</span>
                <span style={{ opacity: 0.85 }}>|</span>
                <span>Due {formatShortDate(tooltip.task.due_date!)}</span>
                <span style={{ opacity: 0.85 }}>|</span>
                <span style={{ color: statusColors[tooltip.task.status] }}>{tooltip.task.status.replace('_', ' ')}</span>
                {tooltip.task.project_id && projectMap.get(tooltip.task.project_id) && (
                  <>
                    <span style={{ opacity: 0.85 }}>|</span>
                    <span style={{ color: 'var(--teal)' }}>{projectMap.get(tooltip.task.project_id)}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Undated tasks */}
      {undatedTasks.length > 0 && (
        <div className="mt-4">
          <p
            className="text-xs uppercase tracking-wider mb-2"
            style={{ color: 'var(--slate)', opacity: 0.75 }}
          >
            No due date ({undatedTasks.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {undatedTasks.map((task) => {
              const person = getPersonInfo(task.assignee)
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--ink)',
                  }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: 'var(--radius-circle)', overflow: 'hidden', backgroundColor: 'var(--ice)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {person.photoUrl ? (
                      <img src={person.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 6, fontWeight: 600, color: 'var(--slate)' }}>{person.initials}</span>
                    )}
                  </div>
                  {(task.title || task.description).slice(0, 30)}{(task.title || task.description).length > 30 ? '...' : ''}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
