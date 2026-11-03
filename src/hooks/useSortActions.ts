// useSortActions: the three hand placements of a task's kind of work (sort,
// leave unsorted, reset to automatic), each one POST /api/tasks/:id/sort with a
// toast. Used by components/tasks/SortPicker. The Worker logs every call with
// the section the row sat in (from_section), which is why this reads it.

import { useCallback } from 'react'
import { useSortTask } from './useMutations'
import { useUndoToast } from '../components/UndoToast'
import { useSectionCtx } from './useSectionCtx'
import { sectionForTask, WORK_KINDS, type WorkKind } from '../lib/taskSections'
import type { TaskRow } from '../lib/api'

export function useSortActions(task: TaskRow, onDone?: () => void) {
  const sort = useSortTask()
  const toast = useUndoToast()
  const ctx = useSectionCtx()
  const fromSection = sectionForTask(task, ctx)

  const sortAs = useCallback((kind: WorkKind) => {
    const label = WORK_KINDS.find((k) => k.code === kind)?.label ?? kind
    sort.mutate({ id: task.id, cmd: { op: 'sort', work_kind: kind, from_section: fromSection } }, {
      onSuccess: () => { toast.showSuccess(`Sorted as ${label}`); onDone?.() },
    })
  }, [task.id, fromSection, sort, toast, onDone])

  const leaveUnsorted = useCallback(() => {
    sort.mutate({ id: task.id, cmd: { op: 'unsort', from_section: fromSection } }, {
      onSuccess: () => { toast.showSuccess('Left in Sort'); onDone?.() },
    })
  }, [task.id, fromSection, sort, toast, onDone])

  const reset = useCallback(() => {
    sort.mutate({ id: task.id, cmd: { op: 'reset', from_section: fromSection } }, {
      onSuccess: () => { toast.showSuccess('Back to automatic'); onDone?.() },
    })
  }, [task.id, fromSection, sort, toast, onDone])

  return { sortAs, leaveUnsorted, reset, pending: sort.isPending }
}
