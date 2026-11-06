// The palette's quick-filter commands, as data. Each one links to a My Tasks
// URL the page reads (`?filter=`, `?status=`, `?priority=`), and its count is
// taken over the SAME list that link opens: the viewer's own tasks. The palette
// used to link `?status=` (which nothing read) and count the whole lab.
import type { TaskRow } from './api'
import { PATHS } from '../constants/paths'
import { isTaskDone } from './taskGrouping'
import { localDateKey } from './dateUtils'

export type QuickFilterIcon = 'done' | 'active' | 'high' | 'urgent' | 'today' | 'overdue' | 'blocked'

export interface QuickFilterCommand {
  id: string
  label: string
  sublabel: string
  href: string
  icon: QuickFilterIcon
}

type FilterTask = Pick<TaskRow, 'id' | 'status' | 'priority' | 'assignee' | 'due_date' | 'planned_for' | 'completed'>

export function taskQuickFilters(allTasks: readonly FilterTask[], viewerSlug: string, today: string = localDateKey()): QuickFilterCommand[] {
  const mine = allTasks.filter((t) => t.assignee === viewerSlug)
  const open = mine.filter((t) => !isTaskDone(t))
  const n = (x: readonly unknown[], what: string) => `${x.length} ${what}`
  const base = PATHS.myTasks
  return [
    {
      id: 'filter-completed', label: 'Completed Tasks', icon: 'done',
      sublabel: n(mine.filter((t) => isTaskDone(t)), 'done'),
      // The page hides completed rows by default; this view is about them.
      href: `${base}?status=done&hideCompleted=0`,
    },
    {
      id: 'filter-in-progress', label: 'In Progress Tasks', icon: 'active',
      sublabel: n(open.filter((t) => t.status === 'in_progress'), 'active'),
      href: `${base}?status=in_progress`,
    },
    {
      id: 'filter-high-priority', label: 'High Priority', icon: 'high',
      sublabel: n(open.filter((t) => t.priority === 'high'), 'high'),
      href: `${base}?priority=high`,
    },
    {
      id: 'filter-urgent', label: 'Urgent Tasks', icon: 'urgent',
      sublabel: n(open.filter((t) => t.priority === 'urgent'), 'urgent'),
      href: `${base}?priority=urgent`,
    },
    {
      // The Today quick view is planned for today OR due today.
      id: 'filter-due-today', label: 'Due Today', icon: 'today',
      sublabel: n(open.filter((t) => t.planned_for?.slice(0, 10) === today || t.due_date?.slice(0, 10) === today), 'planned or due today'),
      href: `${base}?filter=today`,
    },
    {
      id: 'filter-overdue', label: 'Overdue Tasks', icon: 'overdue',
      sublabel: n(open.filter((t) => !!t.due_date && t.due_date.slice(0, 10) < today), 'past due'),
      href: `${base}?filter=overdue`,
    },
    {
      id: 'ctx-tasks-blocked', label: 'Show Blocked Tasks', icon: 'blocked',
      sublabel: n(open.filter((t) => t.status === 'blocked'), 'blocked'),
      href: `${base}?status=blocked`,
    },
  ]
}
