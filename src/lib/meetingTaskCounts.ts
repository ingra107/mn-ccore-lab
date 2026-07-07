import type { TaskRow } from './api'
import { isTaskDone } from './taskGrouping'

export interface MeetingActionCounts {
  actionCount: number
  pendingCount: number
}

/**
 * Groups meeting-linked tasks (tasks.meeting_id) by their owning meeting row,
 * joined on EITHER `meeting.id` or `meeting.source_id` (T3's dual-id join:
 * `IN (id, source_id)`) — a PB-calendar-matched meeting's tasks may carry
 * either id space, so a naive `task.meeting_id === meeting.id` undercounts.
 * Extracted from Meetings.tsx's actionCountsByMeetingId (T9) so every
 * meeting-count consumer shares one join instead of forking a copy (#547 T19).
 */
export function countActionsByMeetingId(
  tasks: TaskRow[],
  meetingRows: { id: string; source_id?: string | null }[]
): Map<string, MeetingActionCounts> {
  const byRawMeetingId = new Map<string, MeetingActionCounts>()
  for (const t of tasks) {
    if (!t.meeting_id) continue
    const c = byRawMeetingId.get(t.meeting_id) ?? { actionCount: 0, pendingCount: 0 }
    c.actionCount += 1
    if (!isTaskDone(t)) c.pendingCount += 1
    byRawMeetingId.set(t.meeting_id, c)
  }
  const merged = new Map<string, MeetingActionCounts>()
  for (const row of meetingRows) {
    const fromId = byRawMeetingId.get(row.id)
    const fromSourceId = row.source_id && row.source_id !== row.id ? byRawMeetingId.get(row.source_id) : undefined
    if (!fromId && !fromSourceId) continue
    merged.set(row.id, {
      actionCount: (fromId?.actionCount ?? 0) + (fromSourceId?.actionCount ?? 0),
      pendingCount: (fromId?.pendingCount ?? 0) + (fromSourceId?.pendingCount ?? 0),
    })
  }
  return merged
}
