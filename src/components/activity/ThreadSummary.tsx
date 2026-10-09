// ThreadSummary -- the Slack-style row under a root comment (Today reskin).
//
//   (LS)(NI)(H)  3 replies  [New]  last reply 2h        >
//
// Overlapping initials badges of everyone in the thread (root author first, then
// repliers in the order they joined; Hermes is an H badge), the reply count, a
// "New" tag, and the last reply's time. Click anywhere on the row to expand the
// thread in place under the comment, click again to collapse.
//
// Presentational: it reads the root's own summary fields (reply_count,
// last_reply_at, participants -- sent with the feed under the same visibility
// gate as the replies) and fetches nothing. useThreadNew decides `hasNew`.

import { ChevronRight } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { formatRelativeTime } from '../../lib/dateUtils'
import { Face } from '../today/skin'
import type { ActivityEntryItemRow } from './activityRender'
import { threadParticipants } from './threadParticipants'

export function ThreadSummary({
  root, expanded, onToggle, hasNew,
}: {
  root: ActivityEntryItemRow
  expanded: boolean
  onToggle: () => void
  hasNew: boolean
}) {
  const replyCount = root.reply_count ?? 0
  const people = threadParticipants(root.actor_slug, root.participants)
  const last = root.last_reply_at ? formatRelativeTime(root.last_reply_at).replace(/ ago$/, '') : null
  return (
    <div className="tk">
      <button
        type="button"
        className="tk-thr"
        onClick={onToggle}
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
