// HermesThoughtReplies — today's Hermes replies to @hermes daily_thought prompts.
//
// Renders ai_requests for today's source_id immediately below MorningThoughtCompose
// on TodayPage. The card rendering lives in the shared HermesReplyList (also used
// by the task-scoped TaskHermesReplies, #519).
//
// The hook (useDailyThoughtReplies) polls every 10s while any item is pending
// so the Thinking… card resolves to the full reply without a manual refresh.

import { useDailyThoughtReplies } from '../../hooks/useApiData'
import { HermesReplyList } from '../HermesReplyList'

interface HermesThoughtRepliesProps {
  dateKey: string
}

export function HermesThoughtReplies({ dateKey }: HermesThoughtRepliesProps) {
  const { data: replies = [] } = useDailyThoughtReplies(dateKey)
  return <HermesReplyList replies={replies} />
}
