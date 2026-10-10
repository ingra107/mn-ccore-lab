// The project page's open tasks as the same card Today and the Tasks list use
// (today/TaskRow over tasks/TaskCardRow), inside the `.tk` skin those card rules
// are scoped to. The project context line is hidden (project={null}): every row
// here belongs to this project, so repeating its name is noise. Title click
// opens the full editor panel; the card body expands in place.
import { useCallback, useState } from 'react'
import { TaskRow as CardTaskRow } from '../today/TaskRow'
import { useTodayState } from '../../hooks/useTodayState'
import { isTaskDone } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

const NO_PROJECTS = new Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>()

export function ProjectOpenTaskCards({ tasks, onOpenEditor }: { tasks: TaskRow[]; onOpenEditor: (task: TaskRow) => void }) {
  const state = useTodayState(tasks)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => setExpandedId((cur) => (cur === id ? null : id)), [])
  return (
    <div className="tk flex flex-col gap-2">
      {tasks.map((task) => (
        <CardTaskRow
          key={task.id}
          task={task}
          project={null}
          state={state}
          expandedId={expandedId}
          onExpand={onExpand}
          projectsByPid={NO_PROJECTS}
          done={isTaskDone(task)}
          noDrag
          onOpenEditor={() => onOpenEditor(task)}
        />
      ))}
    </div>
  )
}
