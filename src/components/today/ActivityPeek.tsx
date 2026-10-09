// ActivityPeek — the task drawer's activity lines (Today reskin).
//
// One line per entry, newest first, three of them: a small initials badge (the
// same Face the cards use), the FIRST name, what they did, a muted time:
//
//   LS  Lianne added ICC 0.05 numbers · 2h
//
// then "view all →" (opens the full editor, which keeps the full threaded feed
// with replies). Same query as the full feed (['task-activity', id, showHidden]),
// so opening the editor right after costs no refetch. Hermes shows an H badge.
//
// Controls kept from the card feed, same gating, shown at the right of the line:
//   - dismiss / restore (EyeOff / Eye, the v102 root dismiss): single click,
//     author-or-PI; "N dismissed — show" toggle below the lines.
//   - delete (two-step trash, "Click again to delete permanently", armed for 5s):
//     author-or-PI (canDeleteActivityEntry).
// They appear on row hover or keyboard focus (opacity, so they stay focusable)
// and are always visible on touch (@media (hover: none)).

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DeleteEntryButton, DismissEntryButton, type ActivityEntryItemRow } from '../activity/activityRender'
import { ShowHiddenToggle } from '../activity/ShowHiddenToggle'
import { canDeleteActivityEntry } from '../activity/activityPermissions'
import { isRepliableKind } from '../../../shared/activityKinds'
import { useAuth } from '../../hooks/useAuth'
import { useDeleteActivityEntry, useDismissThread } from '../../hooks/useMutations'
import { Face } from './skin'
import { firstNameFor } from '../../lib/personLabel'
import { formatRelativeTime } from '../../lib/dateUtils'

/** One plain line of text from an entry body: markdown marks and newlines flattened. */
function oneLine(body: string): string {
  return body.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim()
}

/** "2h", "5m", "3d" (formatRelativeTime without its " ago"). */
function ago(ts: string): string {
  const r = formatRelativeTime(ts)
  return r === 'just now' ? 'now' : r.replace(/ ago$/, '')
}

export function ActivityPeek({ taskId, count = 3, onViewAll }: { taskId: string; count?: number; onViewAll: () => void }) {
  const { user } = useAuth()
  const [showHidden, setShowHidden] = useState(false)
  const deleteEntry = useDeleteActivityEntry()
  const dismissThread = useDismissThread()

  const { data: feed, isLoading } = useQuery<{ entries: ActivityEntryItemRow[]; hiddenCount: number }>({
    queryKey: ['task-activity', taskId, showHidden],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/activity${showHidden ? '?include_hidden=1' : ''}`)
      if (!res.ok) return { entries: [], hiddenCount: 0 }
      const data = await res.json() as { data?: ActivityEntryItemRow[]; hidden_count?: number }
      return { entries: data.data || [], hiddenCount: data.hidden_count || 0 }
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })
  const entries = (feed?.entries ?? []).slice(0, count)
  const hiddenCount = feed?.hiddenCount ?? 0

  return (
    <div>
      {isLoading ? (
        <div className="tk-feedl" style={{ color: 'var(--sk-t3)' }}>Loading activity…</div>
      ) : entries.length === 0 ? (
        <div className="tk-feedl" style={{ color: 'var(--sk-t3)' }}>No activity yet.</div>
      ) : (
        entries.map((e) => {
          const hermes = e.actor_slug === 'claude-ai'
          const mayAct = canDeleteActivityEntry(user, e.actor_slug)
          const hidden = !!e.hidden_at
          return (
            <div key={e.id} className={`tk-feedl${hidden ? ' tk-hid' : ''}`} data-activity-id={e.id}>
              {hermes
                ? <span role="img" className="tk-face tk-sm tk-herm" title="Hermes" aria-label="Hermes">H</span>
                : <Face slug={e.actor_slug} sm />}
              <span className="tk-feedt">
                <b>{hermes ? 'Hermes' : firstNameFor(e.actor_slug)}</b> {oneLine(e.body)}
              </span>
              <span className="tk-feedm">{ago(e.created_at)}</span>
              {mayAct && (
                <span className="tk-feedctl">
                  {isRepliableKind(e.kind) && (
                    <DismissEntryButton
                      isHidden={hidden}
                      onClick={() => dismissThread.mutate({ id: e.id, hidden: !hidden, taskId })}
                    />
                  )}
                  <DeleteEntryButton onDelete={() => deleteEntry.mutate({ id: e.id, taskId })} />
                </span>
              )}
            </div>
          )
        })
      )}
      <ShowHiddenToggle count={hiddenCount} showing={showHidden} onToggle={() => setShowHidden((v) => !v)} />
      <button type="button" onClick={onViewAll} className="tk-rmore" style={{ marginTop: 2 }}>view all →</button>
    </div>
  )
}
