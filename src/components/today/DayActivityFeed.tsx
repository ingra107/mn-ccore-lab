// DayActivityFeed — today's conversations on the Today bar (Hermes wave Phase 3).
//
// Replaces HermesThoughtReplies, which read ai_requests for the day's
// daily_thought prompts and could only show a flat Thinking…→answer card. This
// reads the unified `day` feed (activity_entries entity_type='day') and renders
// each conversation through the SAME ActivityThread the task/project feeds use —
// so a Today-bar @hermes ask becomes a real thread you can REPLY to (including
// replying to Hermes), and dismiss when it's done.
//
// Day threads default PRIVATE, so the feed is viewer-scoped server-side: you see
// your own day threads (+ any you shared), the PI sees all.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivityThread } from '../activity/ActivityThread'
import { ActivityEntryItem, type ActivityEntryItemRow } from '../activity/activityRender'
import { ShowHiddenToggle } from '../activity/ShowHiddenToggle'
import { isRepliableKind } from '../../../shared/activityKinds'
import { useDismissThread } from '../../hooks/useMutations'

const isPending = (body: string) => /Thinking about this/.test(body)

export function DayActivityFeed({ dateKey }: { dateKey: string }) {
  const [showHidden, setShowHidden] = useState(false)
  const dismissThread = useDismissThread()

  const { data: feed } = useQuery<{ entries: ActivityEntryItemRow[]; hiddenCount: number }>({
    queryKey: ['day-activity', dateKey, showHidden],
    queryFn: async () => {
      const res = await fetch(`/api/days/${dateKey}/activity${showHidden ? '?include_hidden=1' : ''}`)
      if (!res.ok) return { entries: [], hiddenCount: 0 }
      const data = await res.json() as { data?: ActivityEntryItemRow[]; hidden_count?: number }
      return { entries: data.data || [], hiddenCount: data.hidden_count || 0 }
    },
    // Poll every 10s while any thread is still "Thinking…" so Hermes's answer
    // resolves without a manual refresh (mirrors the old daily_thought poller);
    // otherwise idle.
    refetchInterval: (q) =>
      ((q.state.data as { entries?: ActivityEntryItemRow[] } | undefined)?.entries ?? []).some((r) => isPending(r.body))
        ? 10_000
        : false,
    staleTime: 5_000,
  })

  const entries = feed?.entries ?? []
  const hiddenCount = feed?.hiddenCount ?? 0

  // Render nothing until there's a conversation (or something dismissed to reveal)
  // — the composer above stands alone on an empty day.
  if (entries.length === 0 && hiddenCount === 0) return null

  return (
    <div className="flex flex-col gap-1.5" style={{ marginBottom: 12 }}>
      {entries.map((entry) =>
        !isRepliableKind(entry.kind) ? (
          <ActivityEntryItem key={entry.id} entry={entry} />
        ) : (
          <ActivityThread
            key={entry.id}
            root={entry}
            invalidateKeys={[['day-activity', dateKey]]}
            onDismiss={(e) => dismissThread.mutate({ id: e.id, hidden: !e.hidden_at, dayKey: dateKey })}
          />
        ),
      )}
      <ShowHiddenToggle count={hiddenCount} showing={showHidden} onToggle={() => setShowHidden((v) => !v)} />
    </div>
  )
}
