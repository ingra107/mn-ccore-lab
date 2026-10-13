// MeetingActivityFeed — the conversation on a meeting page (#124).
//
// Nick: "I need a way to interact with meetings … just like we do with comments
// and stuff elsewhere." Meetings were the last first-class surface with nothing
// to say back to; the debrief was readable and unaskable. This is the composer
// plus the thread list, reading the unified `meeting` feed
// (activity_entries entity_type='meeting') and rendering every root through the
// SAME ActivityThread the task / project / day feeds use — so replies, @me
// privacy, dismiss and @mentions all behave the way they already do everywhere
// else, with no second renderer to drift.
//
// The @hermes ask is the point of the surface. The server attaches the meeting's
// agenda, notes, decisions, tasks and the path to PB's archived verbatim
// transcript to the prompt, so "reread the transcript and tell me what I said we
// had to answer before the next meeting" is answerable in the thread — and the
// answer can be turned into an artifact from the same conversation.

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ActivityThread } from '../activity/ActivityThread'
import { ActivityEntryItem } from '../activity/activityRender'
import { ShowHiddenToggle } from '../activity/ShowHiddenToggle'
import { isRepliableKind } from '../../../shared/activityKinds'
import { useDismissThread } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { isHermesPrefix } from '../../lib/hermesRouting'
import { askHermesOnMeeting, meetingActivityQueryKey, hermesOutcomeToast } from '../../lib/askHermes'
import SmartCompose from '../SmartCompose'
import { ICON_PROPS } from '../../lib/iconProps'
import { MessageSquare } from 'lucide-react'
import { useActivityFeedQuery } from '../../hooks/useActivityFeedQuery'

export default function MeetingActivityFeed({ meetingId }: { meetingId: string }) {
  const [showHidden, setShowHidden] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const dismissThread = useDismissThread()
  const queryClient = useQueryClient()
  const toast = useToast()

  // The shared feed read (key, include_hidden fetch, unwrap, bounded poll while
  // Hermes is thinking): the same hook the day feed uses.
  const { data: feed } = useActivityFeedQuery({
    lane: 'meeting',
    id: meetingId,
    url: `/api/meetings/${encodeURIComponent(meetingId)}/activity`,
    showHidden,
    enabled: !!meetingId,
  })

  const entries = feed?.entries ?? []
  const hiddenCount = feed?.hiddenCount ?? 0

  async function handleSubmit() {
    const content = text.trim()
    if (!content || submitting) return
    setSubmitting(true)
    try {
      // A typed @hermes PREFIX selects the default audience (private), the same
      // rule the task and day composers follow; a mid-text "@hermes" mention
      // stays a team-visible remark that still triggers an answer. The body goes
      // VERBATIM either way — the stored token is what the server fires on.
      const askedHermes = isHermesPrefix(content)
      const result = await askHermesOnMeeting(meetingId, content, askedHermes ? 'author' : 'team')
      if (result.ok) setText('')
      if (askedHermes) {
        const t = hermesOutcomeToast(result, 'Posted')
        toast[t.kind === 'error' ? 'showError' : t.kind === 'info' ? 'showInfo' : 'showSuccess'](t.text)
      } else if (!result.ok) {
        toast.showError(`Posting failed: ${result.error.message}`)
      }
      // Surface the new root (and its Thinking… placeholder) immediately.
      queryClient.invalidateQueries({ queryKey: meetingActivityQueryKey(meetingId) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Today's compose field (principle 20): .tk-compose supplies the
          visible edge, focus ring and readable placeholder; SmartCompose
          reads page tokens (its old hex-pinned dark theme, which left the
          field edgeless on the light page, is gone; item 32). */}
      <div className="tk"><div className="tk-compose" style={{ marginBottom: 0 }}><div style={{ flex: 1, minWidth: 0 }}>
        <SmartCompose
          value={text}
          onChange={setText}
          onSubmit={handleSubmit}
          submitting={submitting}
          rows={2}
          alwaysShowToolbar
          submitLabel="Post"
          placeholder="Ask about this meeting, or @hermes to reread the transcript…"
        />
      </div></div></div>
      {entries.length === 0 && hiddenCount === 0 ? (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
          <MessageSquare {...ICON_PROPS} size={13} aria-hidden />
          Nothing said here yet. Ask @hermes what this meeting decided, or leave a note for whoever missed it.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map((entry) =>
            !isRepliableKind(entry.kind) ? (
              <ActivityEntryItem key={entry.id} entry={entry} />
            ) : (
              <ActivityThread
                key={entry.id}
                root={entry}
                invalidateKeys={[meetingActivityQueryKey(meetingId)]}
                onDismiss={(e) => dismissThread.mutate({ id: e.id, hidden: !e.hidden_at, meetingId })}
              />
            ),
          )}
          <ShowHiddenToggle count={hiddenCount} showing={showHidden} onToggle={() => setShowHidden((v) => !v)} />
        </div>
      )}
    </div>
  )
}
