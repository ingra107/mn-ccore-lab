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

  const place = useCallback((cmd: Parameters<typeof sort.mutate>[0]['cmd'], message: string) => {
    sort.mutate({ id: task.id, cmd }, {
      onSuccess: () => { toast.showSuccess(message); onDone?.() },
    })
  }, [task.id, sort, toast, onDone])

  const sortAs = useCallback((kind: WorkKind) => {
    const label = WORK_KINDS.find((k) => k.code === kind)?.label ?? kind
    place({ op: 'sort', work_kind: kind, from_section: fromSection }, `Sorted as ${label}`)
  }, [fromSection, place])

  const leaveUnsorted = useCallback(
    () => place({ op: 'unsort', from_section: fromSection }, 'Left in Sort'),
    [fromSection, place])

  const reset = useCallback(
    () => place({ op: 'reset', from_section: fromSection }, 'Back to automatic'),
    [fromSection, place])

  return { sortAs, leaveUnsorted, reset, pending: sort.isPending }
}
