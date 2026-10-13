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
import { ActivityThread } from '../activity/ActivityThread'
import { ActivityEntryItem } from '../activity/activityRender'
import { ShowHiddenToggle } from '../activity/ShowHiddenToggle'
import { isRepliableKind } from '../../../shared/activityKinds'
import { canDeleteActivityEntry } from '../activity/activityPermissions'
import { useAuth } from '../../hooks/useAuth'
import { useActivityFeedQuery } from '../../hooks/useActivityFeedQuery'
import { useDeleteActivityEntry, useDismissThread } from '../../hooks/useMutations'
import { activityQueryKey } from '../../lib/askHermes'

export function DayActivityFeed({ dateKey }: { dateKey: string }) {
  const [showHidden, setShowHidden] = useState(false)
  const dismissThread = useDismissThread()
  const deleteEntry = useDeleteActivityEntry()
  const { user } = useAuth()

  const { data: feed } = useActivityFeedQuery({
    lane: 'day', id: dateKey, url: `/api/days/${dateKey}/activity`, showHidden,
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
          <ActivityEntryItem
            key={entry.id}
            entry={entry}
            onDelete={canDeleteActivityEntry(user, entry.actor_slug) ? () => deleteEntry.mutate({ id: entry.id, dayKey: dateKey }) : undefined}
          />
        ) : (
          <ActivityThread
            key={entry.id}
            root={entry}
            invalidateKeys={[activityQueryKey('day', dateKey)]}
            onDelete={(e) => deleteEntry.mutate({ id: e.id, dayKey: dateKey })}
            onDismiss={(e) => dismissThread.mutate({ id: e.id, hidden: !e.hidden_at, dayKey: dateKey })}
          />
        ),
      )}
      <ShowHiddenToggle count={hiddenCount} showing={showHidden} onToggle={() => setShowHidden((v) => !v)} />
    </div>
  )
}
