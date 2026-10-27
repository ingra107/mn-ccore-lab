// MeetingActionsCard -- a meeting's action rows, inside its Today card.
//
// Nick (2026-10-12, mockup A): "move a meeting's action rows onto the Today
// card, with a selection bar for bulk actions". The rows are the same
// component the meeting page uses (MeetingActionList): check off, owner, date
// and "Project ~ Product" in place; two or more selected shows a bar at the foot
// of THIS card that can only reach this card's rows.
//
// The card folds once every row is handled (done, or handed to someone else;
// the viewer's own open rows keep it open), and reopens from its header. Open
// is derived, not stored, until the user clicks: unhandled rows keep it open,
// and handling the last row closes it, even if the user had opened it by hand.
// The header counts what it says (#155): rows DONE of the total, plus the
// viewer's own open rows. "6 of 7 handled" read as six done when five were
// merely someone else's.
//
// The meeting card's own caret folds these rows too (#155: one collapse for
// the card): MeetingRow sends each caret click as a `command`, and hears
// whether the rows are showing (`onOpenChange`) to draw its caret.
//
// Each task shows once on Today: while the rows are open they are registered
// with TodayPage (MeetingCardRowsContext), which leaves them out of the task
// groups below. Folded, the card shows no rows and the groups show them again.

import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMeetingDetail } from '../../hooks/useApiData'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MeetingActionList } from '../meetings/MeetingActionList'
import { countHandled, prepareActionItems } from '../../lib/meetingActionItems'
import { isTaskDone } from '../../lib/taskGrouping'
import { MeetingCardRowsContext } from './meetingCardRows'
import { useAuth } from '../../hooks/useAuth'

/** Phone: at most this many rows show, then "Show N more" (inside the card). */
const PHONE_ROW_CAP = 4

export function MeetingActionsCard({ meetingId, placeholder, command, onOpenChange }: {
  meetingId: string
  /** The open-count chip: stands in the header while the rows load, or if they cannot. */
  placeholder?: ReactNode
  /** The parent card's caret click: open or fold the rows. `n` counts clicks. */
  command?: { open: boolean; n: number }
  /** Hears whether the rows are showing. */
  onOpenChange?: (open: boolean) => void
}) {
  const { data: meeting } = useMeetingDetail(meetingId)
  const register = useContext(MeetingCardRowsContext)
  const isPhone = useIsMobile(768)
  const viewer = useAuth().user?.slug ?? ''
  const items = useMemo(() => prepareActionItems(meeting?.action_items), [meeting?.action_items])
  const total = items.length
  const handled = countHandled(items, viewer)
  const allHandled = total > 0 && handled === total
  const done = items.filter(isTaskDone).length
  const yours = total - handled

  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const [seenCommand, setSeenCommand] = useState(command?.n ?? 0)
  if (command && command.n !== seenCommand) {
    setSeenCommand(command.n)
    setUserOpen(command.open)
  }
  // The last row being handled folds the card even after the user opened it by
  // hand: handling the final row is the signal that the card is done.
  const [wasAllHandled, setWasAllHandled] = useState(allHandled)
  if (allHandled !== wasAllHandled) {
    setWasAllHandled(allHandled)
    if (allHandled) setUserOpen(null)
  }
  const open = userOpen ?? !allHandled
  const shown = !!meeting && total > 0 && open
  useEffect(() => { onOpenChange?.(shown) }, [onOpenChange, shown])

  // Tell TodayPage which tasks this card is showing. A string key, not the
  // array: the array is new on every render.
  const shownKey = open ? items.map((t) => t.id).join(',') : ''
  useEffect(() => {
    register(meetingId, shownKey ? shownKey.split(',') : [])
    return () => register(meetingId, [])
  }, [register, meetingId, shownKey])

  if (!meeting) {
    return placeholder ? (
      <div className="tk-mact">
        <div className="tk-mact-hd"><span>Action items</span>{placeholder}</div>
      </div>
    ) : null
  }
  if (total === 0) return null

  return (
    <div className="tk-mact" data-testid="meeting-actions-card" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="tk-mact-hd"
        aria-expanded={open}
        aria-label={`Action items, ${done} of ${total} done${yours > 0 ? `, ${yours} yours open` : ''}`}
        onClick={() => setUserOpen(!open)}
      >
        <span>Action items</span>
        <span className="tk-mact-n">{yours > 0 ? `${yours} yours open · ` : ''}{done} of {total} done</span>
        <span className="tk-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <MeetingActionList meetingId={meetingId} items={items} maxVisible={isPhone ? PHONE_ROW_CAP : undefined} />
      )}
    </div>
  )
}
