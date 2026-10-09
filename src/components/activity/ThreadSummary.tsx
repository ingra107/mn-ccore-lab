// ThreadSummary — the Slack-style row under a root comment (Today reskin).
//
//   (LS)(NI)(H)  3 replies  [New]  last reply 2h        ▸
//
// Overlapping initials badges of everyone in the thread (root author first, then
// repliers in the order they joined; Hermes is an H badge), the reply count, a
// "New" tag when a reply from someone else has not been seen, and the last
// reply's time. Click anywhere on the row to expand the thread in place under
// the comment, click again to collapse.
//
// "New" is per-browser: a reply by someone else is new until the thread is
// opened here (the newest reply time is remembered in localStorage), and on a
// thread never opened here it is new only while the entity itself still has
// unseen activity (the sidebar/entity_seen signal, snapshotted before the page
// marks the entity seen). A server-side per-reply seen flag would make this
// exact across devices; that is a Worker change (hub-backend).

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { formatRelativeTime } from '../../lib/dateUtils'
import { useUnseenActivity } from '../../hooks/useEntitySeen'
import { Face } from '../today/skin'
import type { ActivityEntryItemRow } from './activityRender'
import { threadParticipants } from './threadParticipants'

const SEEN_KEY = (rootId: string) => `thread-seen:${rootId}`

function readSeen(rootId: string): string | null {
  try { return localStorage.getItem(SEEN_KEY(rootId)) } catch { return null }
}
function writeSeen(rootId: string, ts: string): void {
  try { localStorage.setItem(SEEN_KEY(rootId), ts) } catch { /* storage off: New just stays */ }
}

export function ThreadSummary({
  root, replies, replyCount, expanded, onToggle, viewerSlug,
}: {
  root: ActivityEntryItemRow
  /** Replies loaded so far, any order (sorted here). */
  replies: ActivityEntryItemRow[]
  replyCount: number
  expanded: boolean
  onToggle: () => void
  viewerSlug: string
}) {
  const { data: unseen } = useUnseenActivity()
  const bucket = root.entity_type === 'task' ? unseen?.tasks
    : root.entity_type === 'day' ? unseen?.days
    : root.entity_type === 'project' ? unseen?.projects
    : undefined
  // Snapshot the entity's unseen count the first time we see it: the page marks
  // the entity seen on open, which would clear the signal a moment later.
  const [entityUnseen, setEntityUnseen] = useState<number | null>(null)
  if (entityUnseen === null && unseen) setEntityUnseen(bucket?.get(root.entity_id)?.new_count ?? 0)

  const sorted = [...replies].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const others = sorted.filter((r) => r.actor_slug !== viewerSlug)
  const newestOther = others.length ? others[others.length - 1].created_at : null
  const newestAny = sorted.length ? sorted[sorted.length - 1].created_at : null

  const [seenAt, setSeenAt] = useState<string | null>(() => readSeen(root.id))
  // Opening or closing the thread reads it: remember the newest reply so New clears.
  const toggle = () => {
    if (newestAny) { writeSeen(root.id, newestAny); setSeenAt(newestAny) }
    onToggle()
  }

  const hasNew = !!newestOther && !expanded && (seenAt ? newestOther > seenAt : (entityUnseen ?? 0) > 0)
  const people = threadParticipants(root, sorted)
  const last = newestAny ? formatRelativeTime(newestAny).replace(/ ago$/, '') : null

  return (
    <div className="tk">
      <button
        type="button"
        className="tk-thr"
        onClick={toggle}
        aria-expanded={expanded ? 'true' : 'false'}
        aria-label={`${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}${hasNew ? ', new' : ''}. ${expanded ? 'Collapse' : 'Expand'} thread`}
      >
        <span className="tk-faces" aria-hidden="true">
          {people.slice(0, 4).map((s) => (
            s === 'claude-ai'
              ? <span key={s} className="tk-face tk-sm tk-herm" title="Hermes">H</span>
              : <Face key={s} slug={s} sm />
          ))}
          {people.length > 4 && <span className="tk-face tk-sm">+{people.length - 4}</span>}
        </span>
        <span className="tk-thr-n">{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
        {hasNew && <span className="tk-tag tk-ac">New</span>}
        {last && <span className="tk-thr-t">last reply {last}</span>}
        <ChevronRight {...ICON_PROPS} size={12} className="tk-thr-c" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} aria-hidden />
      </button>
    </div>
  )
}
