// useAutoAcknowledge — Slack-style "seen" semantics for assignments
// (Nick 2026-06-11: "once you click on it or see that task ... then its done").
//
// Opening a task's detail surface IS the acknowledgement: when the viewer is
// the task's assignee and the task is unacknowledged (and not done), the
// acknowledge mutation fires silently on first view. This replaces the
// explicit "Acknowledge Assignment" button (removed from TaskDetailPanel) —
// there is no separate chore. `acknowledged_at` keeps its meaning for PI
// surfaces: it now reads "has the assignee opened this yet".
//
// Call from every task detail surface: TaskDetailPanel (full editor),
// TaskDetailDrawer (Today inline), InlineDetail (MyTasks Columns/Lanes).

import { useEffect, useMemo, useRef } from 'react'
import { useAuth } from './useAuth'
import { emailToSlug } from '../lib/emailSlug'
import { useAcknowledgeTask } from './useMutations'

interface AckableTask {
  id: string
  assignee: string | null
  acknowledged_at: string | null
  status: string
}

export function useAutoAcknowledge(task: AckableTask | null | undefined) {
  const { user } = useAuth()
  const viewerSlug = useMemo(() => emailToSlug(user?.email), [user?.email])
  const { mutate: ackMutate } = useAcknowledgeTask()
  // Session-local guard so optimistic-rollback on a failed POST can't loop.
  const fired = useRef<Set<string>>(new Set())

  const id = task?.id
  const assignee = task?.assignee
  const acknowledgedAt = task?.acknowledged_at
  const status = task?.status

  useEffect(() => {
    if (!id || !viewerSlug) return
    if (assignee !== viewerSlug) return
    if (acknowledgedAt || status === 'done') return
    if (fired.current.has(id)) return
    fired.current.add(id)
    ackMutate(id)
  }, [id, assignee, acknowledgedAt, status, viewerSlug, ackMutate])
}
