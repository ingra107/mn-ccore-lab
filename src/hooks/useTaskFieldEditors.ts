// useTaskFieldEditors — the ONE set of optimistic + undo task-field mutation
// handlers (P2-3). Status / priority / assignee / due / project edits were
// reimplemented verbatim in MyTasks ListView and DeadlinesPage (and ad hoc on
// other surfaces); both fire useUpdateTask + an undo toast with identical
// bodies. This hook is that single chokepoint so every surface that edits a
// task's common fields shares one implementation, one label vocabulary, and one
// undo contract.
//
// Each handler is `(id, prev, next) => void`:
//   • short-circuits when prev === next (no-op, no toast)
//   • fires the optimistic mutation
//   • shows an undo toast that restores `prev`
//
// The editor *components* (InlineSelect / InlineDatePicker / InlineAssigneePicker
// and the FieldControls family) are unchanged — this only consolidates the
// mutation+undo wiring those components call into.

import { useCallback } from 'react'
import { useUpdateTask } from './useMutations'
import { useUndoToast } from '../components/UndoToast'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../lib/taskConstants'

export interface TaskFieldEditors {
  onStatusChange: (id: string, prev: string, next: string) => void
  onPriorityChange: (id: string, prev: string, next: string) => void
  onAssigneeChange: (id: string, prev: string, next: string) => void
  onDateChange: (id: string, prev: string | null, next: string | null) => void
  onProjectChange: (id: string, prev: string | null, next: string) => void
}

export function useTaskFieldEditors(): TaskFieldEditors {
  const updateTask = useUpdateTask()
  const { showUndo } = useUndoToast()

  const onStatusChange = useCallback((id: string, prev: string, next: string) => {
    if (prev === next) return
    // status drives `completed` in lockstep so done-ness stays consistent
    // across the optimistic cache and the API (Rule 68 — UI branches on status).
    updateTask.mutate({ id, fields: { status: next, completed: next === 'done' ? 1 : 0 } })
    const label = STATUS_OPTIONS.find(o => o.value === next)?.label ?? next
    showUndo(`Status → ${label}`, () =>
      updateTask.mutate({ id, fields: { status: prev, completed: prev === 'done' ? 1 : 0 } }))
  }, [updateTask, showUndo])

  const onPriorityChange = useCallback((id: string, prev: string, next: string) => {
    if (prev === next) return
    updateTask.mutate({ id, fields: { priority: next } })
    const label = PRIORITY_OPTIONS.find(o => o.value === next)?.label ?? next
    showUndo(`Priority → ${label}`, () => updateTask.mutate({ id, fields: { priority: prev } }))
  }, [updateTask, showUndo])

  const onAssigneeChange = useCallback((id: string, prev: string, next: string) => {
    if (prev === next) return
    updateTask.mutate({ id, fields: { assignee: next } })
    showUndo('Reassigned', () => updateTask.mutate({ id, fields: { assignee: prev } }))
  }, [updateTask, showUndo])

  const onDateChange = useCallback((id: string, prev: string | null, next: string | null) => {
    if (prev === next) return
    updateTask.mutate({ id, fields: { due_date: next } })
    showUndo(next ? `Due → ${next}` : 'Due cleared', () => updateTask.mutate({ id, fields: { due_date: prev } }))
  }, [updateTask, showUndo])

  const onProjectChange = useCallback((id: string, prev: string | null, next: string) => {
    const newVal = next || null
    if (prev === newVal) return
    updateTask.mutate({ id, fields: { project_id: newVal } })
    showUndo(newVal ? 'Project set' : 'Project cleared', () => updateTask.mutate({ id, fields: { project_id: prev } }))
  }, [updateTask, showUndo])

  return { onStatusChange, onPriorityChange, onAssigneeChange, onDateChange, onProjectChange }
}
