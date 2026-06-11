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
import { useMarkSeen } from './useEntitySeen'

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
  const markSeen = useMarkSeen()
  // Session-local guards so optimistic-rollback on a failed POST can't loop
  // (ack) and repeated re-renders don't spam the seen upsert.
  const fired = useRef<Set<string>>(new Set())
  const seenFired = useRef<Set<string>>(new Set())

  const id = task?.id
  const assignee = task?.assignee
  const acknowledgedAt = task?.acknowledged_at
  const status = task?.status

  useEffect(() => {
    if (!id || !viewerSlug) return

    // Mark SEEN for ANY viewer — feeds the new-activity signal (entity_seen,
    // schema v81): "you looked at this task at T"; activity after T re-flags.
    if (!seenFired.current.has(id)) {
      seenFired.current.add(id)
      markSeen('task', id)
    }

    // Acknowledge only as the ASSIGNEE — feeds the one-shot NEW signal.
    if (assignee !== viewerSlug) return
    if (acknowledgedAt || status === 'done') return
    if (fired.current.has(id)) return
    fired.current.add(id)
    ackMutate(id)
  }, [id, assignee, acknowledgedAt, status, viewerSlug, ackMutate, markSeen])
}
