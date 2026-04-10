import { useMemo } from 'react'
import { CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react'
import Avatar from '../Avatar'
import { useUndoToast } from '../UndoToast'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'
import { useProjects } from '../../hooks/useApiData'
import type { TaskRow } from '../../lib/api'

interface TaskStandUpViewProps {
  tasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onOpenDetail?: (task: TaskRow) => void
}

const statusIcon: Record<string, { icon: typeof Circle; color: string }> = {
  todo: { icon: Circle, color: 'var(--slate)' },
  in_progress: { icon: Clock, color: 'var(--teal)' },
  done: { icon: CheckCircle2, color: 'var(--green)' },
  blocked: { icon: AlertTriangle, color: 'var(--maroon)' },
}

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function TaskStandUpView({ tasks, onStatusChange, onOpenDetail }: TaskStandUpViewProps) {
  const { showUndo } = useUndoToast()

  // Project data for displaying project names
  const { data: projects = [] } = useProjects()
  const projectMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) {
      if (p.slug) map.set(p.slug, p.short_name || p.title)
    }
    return map
  }, [projects])

  // Group by assignee, excluding done tasks
  const grouped = useMemo(() => {
    const map = new Map<string, { todo: TaskRow[]; in_progress: TaskRow[]; blocked: TaskRow[]; done: TaskRow[] }>()

    for (const task of tasks) {
      if (!map.has(task.assignee)) {
        map.set(task.assignee, { todo: [], in_progress: [], blocked: [], done: [] })
      }
      const bucket = map.get(task.assignee)!
      const key = task.status as keyof typeof bucket
      if (bucket[key]) {
        bucket[key].push(task)
      } else {
        bucket.todo.push(task)
      }
    }

    // Sort each person's tasks by priority
    for (const group of map.values()) {
      for (const arr of Object.values(group)) {
        arr.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
      }
    }

    // Sort people by count of active (non-done) tasks
    return [...map.entries()].sort((a, b) => {
      const aActive = a[1].todo.length + a[1].in_progress.length + a[1].blocked.length
      const bActive = b[1].todo.length + b[1].in_progress.length + b[1].blocked.length
      return bActive - aActive
    })
  }, [tasks])

  // Team summary stats
  const totalOpen = grouped.reduce((sum, [, g]) => sum + g.todo.length + g.in_progress.length + g.blocked.length, 0)
  const totalOverdue = grouped.reduce((sum, [, g]) => sum + [...g.todo, ...g.in_progress].filter(t => t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()).length, 0)
  const totalBlocked = grouped.reduce((sum, [, g]) => sum + g.blocked.length, 0)

  return (
    <div className="table-container flex flex-col gap-6" style={{ padding: '16px 20px' }}>
      {/* Team summary bar */}
      {grouped.length > 1 && (
        <div className="flex items-center gap-4 p-3 rounded-lg" style={{ background: 'rgba(201,168,76,0.03)', border: '1px solid rgba(201,168,76,0.08)' }}>
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>
            Team: {totalOpen} open across {grouped.length} people
          </span>
          {totalOverdue > 0 && (
            <span style={{ fontSize: 'var(--label-size)', color: 'var(--maroon)', fontWeight: 600 }}>
              {totalOverdue} overdue
            </span>
          )}
          {totalBlocked > 0 && (
            <span style={{ fontSize: 'var(--label-size)', color: 'var(--maroon)' }}>
              {totalBlocked} blocked
            </span>
          )}
        </div>
      )}

      {grouped.map(([assignee, groups]) => {
        const person = getPersonInfo(assignee)
        const activeCount = groups.todo.length + groups.in_progress.length + groups.blocked.length
        const allOpen = [...groups.todo, ...groups.in_progress, ...groups.blocked]
        const nextDeadline = allOpen.filter(t => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]?.due_date

        return (
          <div
            key={assignee}
            className="rounded-xl border"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream)' }}
          >
            {/* Person header */}
            <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div style={{ width: 36, height: 36 }}>
                <Avatar
                  name={person.name}
                  initials={person.initials}
                  photoUrl={person.photoUrl}
                  size="sm"
                  variant="ice"
                  className="!w-9 !h-9 !min-w-0 !min-h-0 !text-[10px]"
                />
              </div>
              <div className="flex-1">
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  {person.name}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      color: activeCount > 8 ? 'var(--maroon)' : activeCount > 5 ? 'var(--orange)' : 'var(--teal)',
                      backgroundColor: activeCount > 8 ? 'rgba(122,0,25,0.08)' : activeCount > 5 ? 'rgba(194,65,12,0.08)' : 'rgba(45,138,138,0.08)',
                      fontWeight: activeCount > 5 ? 600 : 400,
                    }}
                  >
                    {activeCount} active{activeCount > 8 ? ' — overloaded' : activeCount > 5 ? ' — heavy' : ''}
                  </span>
                  {(() => {
                    const overdueCount = [...groups.todo, ...groups.in_progress].filter(
                      (t) => t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
                    ).length
                    return overdueCount > 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--maroon)', backgroundColor: 'rgba(122,0,25,0.08)' }}>
                        {overdueCount} overdue
                      </span>
                    ) : null
                  })()}
                  {groups.blocked.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--maroon)', backgroundColor: 'rgba(122,0,25,0.06)' }}>
                      {groups.blocked.length} blocked
                    </span>
                  )}
                  {nextDeadline && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--gold)', backgroundColor: 'rgba(201,168,76,0.08)' }}>
                      next: {formatShortDate(nextDeadline)}
                    </span>
                  )}
                </div>
              </div>
              {/* Workload dot */}
              <div style={{
                width: 8, height: 8, borderRadius: 'var(--radius-circle)', flexShrink: 0,
                background: activeCount >= 7 ? 'var(--maroon)' : activeCount >= 4 ? 'var(--gold)' : 'var(--green-light)',
                boxShadow: activeCount >= 7 ? '0 0 6px rgba(122,0,25,0.4)' : 'none',
              }} title={`${activeCount} open tasks`} />
            </div>

            {/* Task sections */}
            <div className="p-4 flex flex-col gap-3">
              {/* In Progress */}
              {groups.in_progress.length > 0 && (
                <TaskSection
                  label="Working On"
                  tasks={groups.in_progress}
                  status="in_progress"
                  onStatusChange={onStatusChange}
                  onOpenDetail={onOpenDetail}
                  showUndo={showUndo}
                  projectMap={projectMap}
                />
              )}

              {/* Blocked */}
              {groups.blocked.length > 0 && (
                <TaskSection
                  label="Blocked"
                  tasks={groups.blocked}
                  status="blocked"
                  onStatusChange={onStatusChange}
                  onOpenDetail={onOpenDetail}
                  showUndo={showUndo}
                  projectMap={projectMap}
                />
              )}

              {/* To Do */}
              {groups.todo.length > 0 && (
                <TaskSection
                  label="Up Next"
                  tasks={groups.todo}
                  status="todo"
                  onStatusChange={onStatusChange}
                  onOpenDetail={onOpenDetail}
                  showUndo={showUndo}
                  projectMap={projectMap}
                />
              )}

              {/* Done (collapsed) */}
              {groups.done.length > 0 && (
                <div style={{ opacity: 0.5 }}>
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: 'var(--slate)' }}
                  >
                    Completed ({groups.done.length})
                  </span>
                </div>
              )}

              {activeCount === 0 && (
                <div
                  className="text-center py-4 text-sm"
                  style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}
                >
                  All caught up
                </div>
              )}
            </div>
          </div>
        )
      })}

      {grouped.length === 0 && (
        <div
          className="text-center py-12 text-sm"
          style={{ color: 'var(--slate)', opacity: 0.6 }}
        >
          No tasks match the current filters
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked' }

function TaskSection({
  label,
  tasks,
  status,
  onStatusChange,
  onOpenDetail,
  showUndo,
  projectMap,
}: {
  label: string
  tasks: TaskRow[]
  status: string
  onStatusChange: (id: string, status: string) => void
  onOpenDetail?: (task: TaskRow) => void
  showUndo: (msg: string, onUndo: () => void) => void
  projectMap: Map<string, string>
}) {
  const config = statusIcon[status] || statusIcon.todo
  const Icon = config.icon

  const cycleStatus = (task: TaskRow) => {
    const next = status === 'todo' ? 'in_progress' : status === 'in_progress' ? 'done' : 'todo'
    onStatusChange(task.id, next)
    showUndo(`Status → ${STATUS_LABELS[next] || next}`, () => onStatusChange(task.id, status))
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} style={{ color: config.color }} />
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: config.color }}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-1 pl-4">
        {tasks.map((task) => {
          const isOverdue = task.due_date && !task.completed && new Date(task.due_date + 'T23:59:59') < new Date()
          const projectName = task.project_id ? projectMap.get(task.project_id) : undefined
          return (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1 group cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-md px-1 -mx-1 transition-colors"
              onClick={() => onOpenDetail?.(task)}
            >
              {/* Status circle — click to cycle */}
              <button
                onClick={(e) => { e.stopPropagation(); cycleStatus(task) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}
                title="Cycle status"
              >
                <Circle size={14} style={{ color: config.color, opacity: 0.5 }} />
              </button>
              <div className="flex-1 min-w-0">
                <span
                  className="text-sm task-title-clickable"
                  style={{ color: 'var(--ink)', borderRadius: 'var(--radius-sm)', padding: '1px 4px', margin: '-1px -4px', transition: 'background var(--transition-fast) ease' }}
                >
                  {task.title || task.description}
                </span>
                {projectName && (
                  <span style={{ fontSize: '10px', color: 'var(--teal)', opacity: 0.7, marginLeft: '6px' }}>
                    {projectName}
                  </span>
                )}
              </div>
              {task.due_date && (
                <span
                  className="text-[10px] flex-shrink-0"
                  style={{
                    color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
                    fontWeight: isOverdue ? 600 : 400,
                    opacity: isOverdue ? 1 : 0.5,
                  }}
                >
                  {isOverdue ? 'Overdue' : formatShortDate(task.due_date)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
