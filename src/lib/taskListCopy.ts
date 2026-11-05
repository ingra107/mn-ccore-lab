// The project Tasks tab's Copy button: the filter on screen as a markdown
// checklist, and the words that say how many it copied.
import type { TaskRow } from './api'
import { isTaskDone } from './taskGrouping'

export type TaskListFilter = 'all' | 'active' | 'done' | 'blocked'

const NOUN: Record<TaskListFilter, string> = { all: 'task', active: 'open task', done: 'completed task', blocked: 'blocked task' }

export function taskListCopy(tasks: TaskRow[], filter: TaskListFilter): { text: string; label: string } {
  const text = tasks
    .map((t) => `- [${isTaskDone(t) ? 'x' : ' '}] ${t.title || t.description}${t.due_date ? ` (due ${t.due_date})` : ''}`)
    .join('\n')
  return { text, label: `Copied ${tasks.length} ${NOUN[filter]}${tasks.length === 1 ? '' : 's'}` }
}
