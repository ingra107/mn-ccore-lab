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
import { ThreadSummary } from './ThreadSummary'

interface ActivityThreadProps {
  root: ActivityEntryItemRow
  /** Forwarded verbatim to the root's card so each feed keeps its own anatomy. */
  itemProps?: Record<string, unknown>
  /** Invalidated after a reply lands, so the root's reply_count refreshes. */
  invalidateKeys: unknown[][]
  onDelete?: (entry: ActivityEntryItemRow) => void
  onEdit?: (entry: ActivityEntryItemRow, body: string) => void
  /** Dismiss (hide) or restore this root's whole thread. Feed passes it; gated
   *  author-or-PI here, re-enforced server-side. Reversible single click. */
  onDismiss?: (entry: ActivityEntryItemRow) => void
}

export function ActivityThread({ root, itemProps, invalidateKeys, onDelete, onEdit, onDismiss }: ActivityThreadProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // Auto-expand when the composer opens: replying to a thread you cannot see
  // is disorienting, and the reply you just wrote must land somewhere visible.
  const [expanded, setExpanded] = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  const replyCount = root.reply_count ?? 0

  // A Hermes thread = the root is an @hermes/@claude ask. Continuing it means
  // talking to Hermes, and the reply must START with @hermes for the server to
  // answer in-thread — so seed the composer with the token when it opens.
  const isHermesThread = /^\s*@(hermes|claude)\b/i.test(root.body)
  const openComposer = () => {
    setComposing(true)
    setExpanded(true)
    setDraft((d) => d || (isHermesThread ? '@hermes ' : ''))
  }
  // The reply box sits at the bottom of an open thread; until typed in it holds the seed.
  const replyDraft = draft ?? (isHermesThread ? '@hermes ' : '')
  const setReplyDraft = (v: string) => setDraft(v)

  const { data: replies = [] } = useQuery<ActivityEntryItemRow[]>({
    queryKey: ['activity-replies', root.id],
    queryFn: async () => {
      const res = await fetch(`/api/activity/${root.id}/replies`)
      if (!res.ok) return []
      const body = await res.json() as { data?: ActivityEntryItemRow[] }
      return body.data || []
    },
    // Fetched as soon as the root has replies: the collapsed summary row needs
    // who is in the thread and when it last moved. Roots with none stay idle.
    enabled: replyCount > 0 || expanded || composing,
    // Poll every 10s while a reply is still "Thinking…" so a Hermes answer fills
    // in without a manual refresh. A typed @hermes ask lands a pending placeholder
    // reply that _postHermesResponse rewrites asynchronously; the placeholder is a
    // REPLY, so the poll lives here (the roots feed never sees it). Idle otherwise.
    refetchInterval: (q) =>
      ((q.state.data as ActivityEntryItemRow[] | undefined) ?? []).some((r) => /Thinking about this/.test(r.body))
        ? 10_000
        : false,
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
      setDraft(null)
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
        onReply={openComposer}
        onDelete={onDelete && canDeleteActivityEntry(user, root.actor_slug) ? () => onDelete(root) : undefined}
        onEdit={onEdit && canDeleteActivityEntry(user, root.actor_slug) ? (b: string) => onEdit(root, b) : undefined}
        onDismiss={onDismiss && canDeleteActivityEntry(user, root.actor_slug) ? () => onDismiss(root) : undefined}
        isHidden={!!root.hidden_at}
      />

      {replyCount > 0 && (
        <ThreadSummary
          root={root}
          replies={replies}
          replyCount={replyCount}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          viewerSlug={user?.slug ?? ''}
        />
      )}

      {(expanded || composing) && (
        // One indent level, and only one — the left border is the thread spine.
        <div style={{ marginLeft: 20, paddingLeft: 12, borderLeft: '1px solid var(--border-subtle)' }} className="flex flex-col gap-1.5">
          {expanded && [...replies].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((reply) => (
            <ActivityEntryItem
              {...itemProps}
              key={reply.id}
              entry={reply}
              isReply
              avatarSize="xs"
              onReply={openComposer}
              onDelete={onDelete && canDeleteActivityEntry(user, reply.actor_slug) ? () => onDelete(reply) : undefined}
              onEdit={onEdit && canDeleteActivityEntry(user, reply.actor_slug) ? (b: string) => onEdit(reply, b) : undefined}
            />
          ))}

          {(composing || expanded) && (
            <SmartCompose
              bare
              autoFocus={composing}
              rows={2}
              value={replyDraft}
              onChange={setReplyDraft}
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
              onSubmit={async (content: string) => { await postReply.mutateAsync(content); setDraft(null) }}
            />
          )}
        </div>
      )}
    </div>
  )
}
