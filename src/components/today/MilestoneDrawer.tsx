// MilestoneDrawer — inline expand drawer for a milestone task row (GH
// #131/#132). A milestone has no click-to-complete box on the collapsed row
// (Nick: "you can't just click a box to check it off") — completion, the
// project's links and its open tasks all live here, behind the expand caret.
//
// Deliberately reuses TaskDetailDrawer's building blocks rather than
// reinventing them: action-bar Button style, StoredLinkChip/ProjectLinkLibrary
// for links, SmartCompose for notes, TaskDetailPanel for the full editor.

import { useState } from 'react'
import { isTaskDone } from '../../lib/taskGrouping'
import { useProjects, useProjectLinks, useTasks } from '../../hooks/useApiData'
import { TaskRow as SharedTaskRow } from '../tasks/TaskRow'
import TaskDetailPanel from '../tasks/TaskDetailPanel'
import StoredLinkChip from '../StoredLinkChip'
import ProjectLinkLibrary from '../ProjectLinkLibrary'
import WorkOnActions from '../WorkOnActions'
import SmartCompose from '../SmartCompose'
import { Button } from '../ui/Button'
import { PATHS } from '../../constants/paths'
import { Link } from 'react-router-dom'
import { stripMeetingMarker } from '../../lib/textUtils'
import { ACCENT_TEAL, INK_DIM, INK_MUTED } from './constants'
import type { TaskRow } from '../../lib/api'

const OPEN_TASKS_CAP = 8

// Surface-agnostic (Nick 2026-09-16: "put on my tasks too"). The host passes
// ONE completion verb that takes a task row, so Today routes it through
// useTodayState (instant + undo) and My Tasks through its own
// onToggleComplete — the drawer never picks a mutation itself.
export function MilestoneDrawer({ task, project, onToggleComplete }: {
  task: TaskRow
  project: { name: string; slug: string; primary_folder?: string | null } | null
  onToggleComplete: (t: TaskRow) => void
}) {
  const isDone = isTaskDone(task)
  const [descExpanded, setDescExpanded] = useState(false)
  const [fullEditorTask, setFullEditorTask] = useState<TaskRow | null>(null)

  // Today's WorkOnActions launches need the project's primary_folder, which
  // Today's own projectsByPid map doesn't carry through — pull the full row.
  const { data: allProjects } = useProjects()
  const fullProject = project ? allProjects?.find((p) => p.slug === project.slug) ?? null : null

  const { data: storedLinks, isLoading: linksLoading } = useProjectLinks(project?.slug ?? null)
  const keyLinks = (storedLinks ?? []).filter((l) => l.role === 'key')

  const { data: projectTasks } = useTasks(project ? { project: project.slug } : undefined, { enabled: !!project })
  const openTasks = (projectTasks ?? []).filter((t) => !isTaskDone(t) && t.kind !== 'milestone' && t.id !== task.id)
  const visibleOpenTasks = openTasks.slice(0, OPEN_TASKS_CAP)
  const hiddenOpenCount = openTasks.length - visibleOpenTasks.length

  // Same path the row's done box takes on Today (instant + undo toast +
  // sinks to the done bucket) — not a raw status mutation.
  const toggleDone = () => onToggleComplete(task)

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ padding: '10px 18px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Action row — mark complete only lives here (Nick: the collapsed row
          has no click-to-check box for a milestone). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isDone ? (
            <Button variant="ghost" size="sm" onClick={toggleDone} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)' }}>↺ Reopen</Button>
          ) : (
            <Button variant="ghost-gold" size="sm" onClick={toggleDone} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)' }}>✓ Mark complete</Button>
          )}
          <button onClick={() => setFullEditorTask(task)} title="Open the full task editor" style={{ padding: '4px 10px', background: 'transparent', color: 'var(--teal)', border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>⊞ Full editor</button>
          {fullProject?.primary_folder && (
            <WorkOnActions primaryFolder={fullProject.primary_folder} projectLabel={fullProject.title} variant="compact" />
          )}
        </div>
      </div>

      {/* Description — same static-context + 3-line-clamp treatment as TaskDetailDrawer. */}
      {task.description ? (
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              fontSize: 12,
              color: INK_MUTED,
              lineHeight: 1.55,
              ...(descExpanded ? {} : {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
                overflow: 'hidden',
              }),
            }}
          >{stripMeetingMarker(task.description)}</div>
          {!descExpanded && (
            <button
              onClick={() => setDescExpanded(true)}
              style={{ fontSize: 11, color: INK_DIM, background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit' }}
            >more</button>
          )}
        </div>
      ) : null}

      {project ? (
        <>
          {/* Project links — key links inline as chips, then the full library
              (current + archived) for everything else (Rule: never duplicate
              the key_link_* denormalized slots' render path). */}
          {(keyLinks.length > 0 || (storedLinks && storedLinks.length > 0)) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: INK_DIM, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Project links</div>
              {keyLinks.length > 0 && (
                <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
                  {keyLinks.map((link) => <StoredLinkChip key={link.id} link={link} />)}
                </div>
              )}
              <ProjectLinkLibrary links={storedLinks} isLoading={linksLoading} />
            </div>
          )}

          {/* Open tasks on this project — compact non-interactive-expand rows. */}
          {visibleOpenTasks.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: INK_DIM, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Open tasks on this project</div>
              <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                {visibleOpenTasks.map((t) => (
                  <SharedTaskRow
                    key={t.id}
                    task={t}
                    project={null}
                    variant="task"
                    dense
                    hideCaret
                    isDone={isTaskDone(t)}
                    onToggleDone={() => onToggleComplete(t)}
                    isExpanded={false}
                    // Row body or title → the full editor for THAT task (Nick
                    // 2026-09-16: "click on the open tasks here and edit them").
                    // Same TaskDetailPanel the milestone's own Full editor uses.
                    onToggleExpand={() => setFullEditorTask(t)}
                    onOpenEditor={() => setFullEditorTask(t)}
                  />
                ))}
              </div>
              {hiddenOpenCount > 0 && (
                <Link to={`${PATHS.project(project.slug)}?tab=tasks`} style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: ACCENT_TEAL, textDecoration: 'none' }}>
                  {hiddenOpenCount} more →
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 12, fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>No project</div>
      )}

      {/* Note composer */}
      <div style={{ marginTop: 14 }}>
        <SmartCompose
          taskId={task.id}
          placeholder="Note or @hermes…"
          showMeLock
          showHermesToggle
          bare
          alwaysShowToolbar
          launchContext={{ projectSlug: project?.slug ?? task.project_id ?? null, primaryFolder: fullProject?.primary_folder ?? null }}
        />
      </div>

      {fullEditorTask && (
        <TaskDetailPanel task={fullEditorTask} onClose={() => setFullEditorTask(null)} />
      )}
    </div>
  )
}
