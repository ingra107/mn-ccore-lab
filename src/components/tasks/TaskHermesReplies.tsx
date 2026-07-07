// TaskHermesReplies — the task-scoped Hermes round-trip reader (#519).
//
// A typed "@hermes …" on any task compose surface POSTs an ai_request keyed by
// the task id (source_type='daily_thought', source_id=<task_id>). PB's
// hub_ai_listener answers it, but before this reader the ONLY ai-requests
// consumer filtered strictly by date-key, so task-keyed answers were generated
// and never displayed — the user got a "Sent to Hermes" toast and nothing else.
//
// This renders the request + response thread for that task, polling so the
// answer appears when the listener responds. Empty → renders nothing.

import { useTaskHermesReplies } from '../../hooks/useApiData'
import { HermesReplyList } from '../HermesReplyList'

interface TaskHermesRepliesProps {
  taskId: string
  /** Container style override (per-surface spacing). */
  style?: React.CSSProperties
}

export function TaskHermesReplies({ taskId, style }: TaskHermesRepliesProps) {
  const { data: replies = [] } = useTaskHermesReplies(taskId)
  return <HermesReplyList replies={replies} style={style} />
}
