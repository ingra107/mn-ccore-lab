// ActivityThread — one root entry plus its collapsed/expanded replies (#98).
//
// Nick's ask: "respond to a specific comment and ultimately it would turn into
// a thread that is based on that comment and could be collapsed up to that
// comment. While it's collapsed, you would need to have a signal that says how
// many replies so I can respond to somebody else."
//
// THE reason this is one shared component rather than logic inlined in each
// feed: TaskActivityFeed and ActivityStream both need expansion state, lazy
// reply loading, an inline composer and cache invalidation. Two copies of that
// is precisely the duplication schema v77 collapsed when it replaced the
// per-entity comment tables. Both feeds render roots through here.
//
// Replies load ON EXPAND, not with the feed: a root carries only its
// reply_count, so a long thread costs nothing until someone opens it.
//
// Depth is ONE level by construction — replies render with `isReply`, which
// suppresses their own Reply control, and the API rejects a reply-to-a-reply
// outright. There is deliberately no recursion here.

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { ActivityEntryItem, type ActivityEntryItemRow } from './activityRender'
import { canDeleteActivityEntry } from './activityPermissions'
import { useAuth } from '../../hooks/useAuth'
import SmartCompose from '../SmartCompose'

interface ActivityThreadProps {
  root: ActivityEntryItemRow
  /** Forwarded verbatim to the root's card so each feed keeps its own anatomy. */
  itemProps?: Record<string, unknown>
  /** Invalidated after a reply lands, so the root's reply_count refreshes. */
  invalidateKeys: unknown[][]
  onDelete?: (entry: ActivityEntryItemRow) => void
  onEdit?: (entry: ActivityEntryItemRow, body: string) => void
}

export function ActivityThread({ root, itemProps, invalidateKeys, onDelete, onEdit }: ActivityThreadProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // Auto-expand when the composer opens: replying to a thread you cannot see
  // is disorienting, and the reply you just wrote must land somewhere visible.
  const [expanded, setExpanded] = useState(false)
  const [composing, setComposing] = useState(false)

  const replyCount = root.reply_count ?? 0

  const { data: replies = [] } = useQuery<ActivityEntryItemRow[]>({
    queryKey: ['activity-replies', root.id],
    queryFn: async () => {
      const res = await fetch(`/api/activity/${root.id}/replies`)
      if (!res.ok) return []
      const body = await res.json() as { data?: ActivityEntryItemRow[] }
      return body.data || []
    },
    // Lazy: nothing is fetched until the thread is actually opened.
    enabled: expanded || composing,
    staleTime: 30 * 1000,
  })

  const postReply = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/activity/${root.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      // The reply list AND the root feed both move: the feed carries
      // reply_count, so refreshing only the replies would leave the collapsed
      // chip lying about how many there are.
      queryClient.invalidateQueries({ queryKey: ['activity-replies', root.id] })
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      // A Hermes reply arrives asynchronously via the ai-requests lane, so the
      // unseen signal can change as a result of this post too.
      queryClient.invalidateQueries({ queryKey: ['unseen-activity'] })
      setComposing(false)
      setExpanded(true)
    },
  })

  return (
    <div className="flex flex-col gap-1.5">
      <ActivityEntryItem
        {...itemProps}
        entry={root}
        replyCount={replyCount}
        threadExpanded={expanded}
        onToggleThread={replyCount > 0 ? () => setExpanded((v) => !v) : undefined}
        onReply={() => { setComposing(true); setExpanded(true) }}
        onDelete={onDelete && canDeleteActivityEntry(user, root.actor_slug) ? () => onDelete(root) : undefined}
        onEdit={onEdit && canDeleteActivityEntry(user, root.actor_slug) ? (b: string) => onEdit(root, b) : undefined}
      />

      {(expanded || composing) && (
        // One indent level, and only one — the left border is the thread spine.
        <div style={{ marginLeft: 20, paddingLeft: 12, borderLeft: '1px solid var(--border-subtle)' }} className="flex flex-col gap-1.5">
          {expanded && replies.map((reply) => (
            <ActivityEntryItem
              {...itemProps}
              key={reply.id}
              entry={reply}
              isReply
              avatarSize="xs"
              onDelete={onDelete && canDeleteActivityEntry(user, reply.actor_slug) ? () => onDelete(reply) : undefined}
              onEdit={onEdit && canDeleteActivityEntry(user, reply.actor_slug) ? (b: string) => onEdit(reply, b) : undefined}
            />
          ))}

          {composing && (
            <SmartCompose
              bare
              autoFocus
              rows={2}
              // Custom mode, NOT task mode. Task mode intercepts a leading
              // @hermes and diverts it to the daily_thought lane before any
              // activity row is written — which would silently drop the reply
              // out of the thread it was aimed at. Here the reply is persisted
              // first and the server dispatches Hermes FROM that entry, so the
              // answer comes back into this same thread.
              placeholder="Reply — start with @hermes to ask Hermes"
              submitting={postReply.isPending}
              submitLabel="Reply"
              submittingLabel="Posting…"
              onSubmit={async (content: string) => { await postReply.mutateAsync(content) }}
            />
          )}
        </div>
      )}
    </div>
  )
}
