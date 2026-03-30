import { useState, useMemo } from 'react'
import { Clock, List, GanttChartSquare, AlertTriangle, FolderKanban } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import ToggleButton from '../../components/ToggleButton'
import Avatar from '../../components/Avatar'
import { useTasks } from '../../hooks/useApiData'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'

interface DeadlineItem {
  id: string
  title: string
  due_date: string
  type: 'task' | 'milestone'
  assignee?: string
  project?: string
  status: string
  priority?: string
  isOverdue: boolean
  daysUntil: number
}

type ViewMode = 'list' | 'timeline'

export default function Deadlines() {
  const [view, setView] = useState<ViewMode>('list')
  const [filterType, setFilterType] = useState<string>('')

  const { data: tasks = [] } = useTasks()
  const { data: grants = [] } = useGrantTimeline()

  const now = new Date()

  // Aggregate all deadlines
  const deadlines = useMemo(() => {
    const items: DeadlineItem[] = []

    // Tasks with due dates
    for (const task of tasks) {
      if (!task.due_date) continue
      const dueDate = new Date(task.due_date + 'T23:59:59')
      const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        id: task.id,
        title: task.title || task.description,
        due_date: task.due_date,
        type: 'task',
        assignee: task.assignee,
        project: task.project_id || undefined,
        status: task.status,
        priority: task.priority,
        isOverdue: !task.completed && dueDate < now,
        daysUntil,
      })
    }

    // Grant milestones
    for (const grant of grants) {
      for (const milestone of grant.milestones || []) {
        if (!milestone.target_date) continue
        const dueDate = new Date(milestone.target_date + 'T23:59:59')
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        items.push({
          id: milestone.id,
          title: `${grant.mechanism}: ${milestone.title}`,
          due_date: milestone.target_date,
          type: 'milestone',
          project: grant.title,
          status: milestone.status,
          isOverdue: milestone.status !== 'completed' && dueDate < now,
          daysUntil,
        })
      }
    }

    // Filter
    const filtered = filterType
      ? items.filter((d) => d.type === filterType)
      : items

    // Sort by date
    return filtered.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [tasks, grants, filterType, now])

  // Group by time period
  const overdue = deadlines.filter((d) => d.isOverdue && d.status !== 'done' && d.status !== 'completed')
  const thisWeek = deadlines.filter((d) => !d.isOverdue && d.daysUntil >= 0 && d.daysUntil <= 7 && d.status !== 'done')
  const nextWeek = deadlines.filter((d) => d.daysUntil > 7 && d.daysUntil <= 14 && d.status !== 'done')
  const later = deadlines.filter((d) => d.daysUntil > 14 && d.status !== 'done')
  const completed = deadlines.filter((d) => d.status === 'done' || d.status === 'completed')

  return (
    <div>
      <SectionHeader
        icon={Clock}
        title="Deadlines & Milestones"
        subtitle={overdue.length > 0
          ? `${overdue.length} overdue · ${thisWeek.length + nextWeek.length} upcoming — track important dates`
          : `${thisWeek.length + nextWeek.length} upcoming — track important dates and time-sensitive deliverables`
        }
      />

      {/* View tabs + filter */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {([
            { key: 'list' as ViewMode, label: 'List', icon: List },
            { key: 'timeline' as ViewMode, label: 'Timeline', icon: GanttChartSquare },
          ]).map((v) => {
            const Icon = v.icon
            const active = view === v.key
            return (
              <ToggleButton
                key={v.key}
                active={active}
                onClick={() => setView(v.key)}
              >
                <Icon size={14} />
                {v.label}
              </ToggleButton>
            )
          })}
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-full border px-3 py-1.5 text-xs"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: filterType ? 'var(--teal)' : 'var(--slate)',
            backgroundColor: filterType ? 'rgba(45,138,138,0.06)' : 'transparent',
            borderColor: filterType ? 'var(--teal)' : 'var(--border-light)',
            cursor: 'pointer',
            appearance: 'none' as const,
            WebkitAppearance: 'none' as const,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            paddingRight: '24px',
          }}
        >
          <option value="">All Types</option>
          <option value="task">Tasks</option>
          <option value="milestone">Grant Milestones</option>
        </select>
      </div>

      {/* Content */}
      <div className="mt-5">
        {view === 'list' ? (
          <div className="flex flex-col gap-6">
            {overdue.length > 0 && (
              <DeadlineSection title="Overdue" items={overdue} color="var(--maroon)" />
            )}
            {thisWeek.length > 0 && (
              <DeadlineSection title="This Week" items={thisWeek} color="var(--teal)" />
            )}
            {nextWeek.length > 0 && (
              <DeadlineSection title="Next Week" items={nextWeek} color="var(--gold)" />
            )}
            {later.length > 0 && (
              <DeadlineSection title="Later" items={later} color="var(--slate)" />
            )}
            {completed.length > 0 && (
              <DeadlineSection title={`Completed (${completed.length})`} items={completed.slice(0, 5)} color="var(--green, #22c55e)" collapsed />
            )}
            {deadlines.length === 0 && (
              <div className="text-center py-20">
                <div
                  className="mx-auto mb-4"
                  style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
                >
                  <Clock size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
                </div>
                <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                  No deadlines found
                </p>
                <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
                  Task due dates and grant milestones will appear here as they're created.
                </p>
              </div>
            )}
          </div>
        ) : (
          <DeadlineTimeline items={[...overdue, ...thisWeek, ...nextWeek, ...later]} />
        )}
      </div>
    </div>
  )
}

// ── Deadline Section ─────────────────────────────────────────

function DeadlineSection({ title, items, color, collapsed = false }: { title: string; items: DeadlineItem[]; color: string; collapsed?: boolean }) {
  const [expanded, setExpanded] = useState(!collapsed)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-2"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
          {title}
        </span>
        <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
          {items.length}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: color + '33' }}>
          {items.map((item) => (
            <DeadlineRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Deadline Row ─────────────────────────────────────────────

function DeadlineRow({ item }: { item: DeadlineItem }) {
  const person = item.assignee ? getPersonInfo(item.assignee) : null
  const isDone = item.status === 'done' || item.status === 'completed'

  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-black/[0.02]"
      style={{ opacity: isDone ? 0.5 : 1 }}
    >
      {/* Type icon */}
      {item.type === 'milestone' ? (
        <FolderKanban size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
      ) : item.isOverdue ? (
        <AlertTriangle size={14} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
      ) : (
        <Clock size={14} style={{ color: 'var(--teal)', flexShrink: 0, opacity: 0.6 }} />
      )}

      {/* Title */}
      <span
        className="flex-1 text-sm truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          color: 'var(--ink)',
          textDecoration: isDone ? 'line-through' : 'none',
        }}
      >
        {item.title}
      </span>

      {/* Project */}
      {item.project && (
        <span className="text-[10px] hidden sm:block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', opacity: 0.6 }}>
          {item.project}
        </span>
      )}

      {/* Priority */}
      {item.priority && (item.priority === 'urgent' || item.priority === 'high') && (
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ fontFamily: 'var(--font-mono)', color: item.priority === 'urgent' ? 'var(--maroon)' : '#c2410c', backgroundColor: item.priority === 'urgent' ? 'rgba(122,0,25,0.08)' : 'rgba(194,65,12,0.08)' }}>
          {item.priority}
        </span>
      )}

      {/* Assignee */}
      {person && (
        <div style={{ width: 22, height: 22 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-[22px] !h-[22px] !min-w-0 !min-h-0 !text-[7px]" />
        </div>
      )}

      {/* Date */}
      <span
        className="text-[11px] flex-shrink-0 w-16 text-right"
        style={{
          fontFamily: 'var(--font-mono)',
          color: item.isOverdue ? 'var(--maroon)' : 'var(--slate)',
          fontWeight: item.isOverdue ? 600 : 400,
          opacity: item.isOverdue ? 1 : 0.6,
        }}
      >
        {item.daysUntil === 0 ? 'Today' : item.daysUntil === 1 ? 'Tomorrow' : formatShortDate(item.due_date)}
      </span>
    </div>
  )
}

// ── Timeline View ────────────────────────────────────────────

function DeadlineTimeline({ items }: { items: DeadlineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <div
          className="mx-auto mb-4"
          style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
        >
          <GanttChartSquare size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
        </div>
        <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
          No upcoming deadlines
        </p>
        <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
          Deadlines will appear on the timeline as tasks and milestones are scheduled.
        </p>
      </div>
    )
  }

  // Group by week
  const byWeek = useMemo(() => {
    const groups = new Map<string, DeadlineItem[]>()
    for (const item of items) {
      const d = new Date(item.due_date + 'T12:00:00')
      // Get Monday of the week
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d)
      monday.setDate(diff)
      const key = monday.toISOString().split('T')[0]
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div
        className="absolute left-2 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: 'var(--border-light)' }}
      />

      {byWeek.map(([weekStart, weekItems]) => {
        const weekDate = new Date(weekStart + 'T12:00:00')
        const weekEnd = new Date(weekDate)
        weekEnd.setDate(weekEnd.getDate() + 6)

        return (
          <div key={weekStart} className="mb-6 relative">
            {/* Week dot */}
            <div
              className="absolute -left-4 top-0.5 w-3 h-3 rounded-full border-2"
              style={{ backgroundColor: 'white', borderColor: 'var(--teal)' }}
            />

            {/* Week label */}
            <div className="mb-2">
              <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                {formatShortDate(weekStart)} — {formatShortDate(weekEnd.toISOString().split('T')[0])}
              </span>
            </div>

            {/* Items */}
            <div className="flex flex-col gap-1.5">
              {weekItems.map((item) => (
                <DeadlineRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
