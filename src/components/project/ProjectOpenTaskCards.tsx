// The project page's open tasks as the same card Today and the Tasks list use
// (today/TaskRow over tasks/TaskCardRow), inside the `.tk` skin those card rules
// are scoped to. Every row gets the page's own project, so the card is the same
// card as everywhere else (project line, folder + Work on slots). Passing null
// here once meant "hide the line", but the card reads null as "No project",
// so every row on a project page said "No project" (#8971). One card, one
// meaning per value: null only ever means the task has no project.
// Title click opens the full editor panel; the card body expands in place.
import { useCallback, useState } from 'react'
import { TaskRow as CardTaskRow } from '../today/TaskRow'
import { useTodayState } from '../../hooks/useTodayState'
import { isTaskDone } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

type CardProject = { name: string; slug: string; category?: string | null; primary_folder?: string | null }

export function ProjectOpenTaskCards({ tasks, project, onOpenEditor }: {
  tasks: TaskRow[]
  project: { slug: string; title: string; short_name?: string | null; category?: string | null; primary_folder?: string | null }
  onOpenEditor: (task: TaskRow) => void
}) {
  const state = useTodayState(tasks)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => setExpandedId((cur) => (cur === id ? null : id)), [])
  // Short name, same rule as Today (Nick: display short names everywhere).
  const cardProject: CardProject = {
    name: project.short_name || project.title || project.slug,
    slug: project.slug,
    category: project.category ?? null,
    primary_folder: project.primary_folder ?? null,
  }
  const projectsByPid = new Map<string, CardProject>([[project.slug, cardProject]])
  return (
    <div className="tk flex flex-col gap-2">
      {tasks.map((task) => (
        <CardTaskRow
          key={task.id}
          task={task}
          project={cardProject}
          state={state}
          expandedId={expandedId}
          onExpand={onExpand}
          projectsByPid={projectsByPid}
          done={isTaskDone(task)}
          noDrag
          onOpenEditor={() => onOpenEditor(task)}
        />
      ))}
    </div>
  )
}
