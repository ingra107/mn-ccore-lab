// One meeting in the Meetings page's left list, as a card in the Today family
// (Nick 2026-10-09: "date, title, attendee faces, project (muted), action count").
// Same anatomy as a task card: the thing in bold, its context muted under it,
// small counts at the foot. Styles: .tk-mlc and friends in index.css, under `.tk`.
//
// `badges` is the slot beside the date for per-meeting flags that belong to other
// work (the meeting-access branch's "Lab" pill goes here).

import type { ReactNode } from 'react'
import { Check, ListChecks } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { emDashifyTitle } from '../../lib/textUtils'
import { formatShortDate } from '../../lib/dateUtils'
import { AttendeeFaces } from './Attendees'

export interface MeetingListCardProps {
  id: string
  date: string
  title: string
  attendees: readonly string[] | undefined
  /** The meeting's project, already a display name; extra projects are a count. */
  project: string | null
  extraProjects: number
  actionCount: number
  pendingCount: number
  isSelected: boolean
  isNext: boolean
  isNeverSeen: boolean
  hasUpdateSinceSeen: boolean
  onSelect: () => void
  badges?: ReactNode
}

export default function MeetingListCard({
  date, title, attendees, project, extraProjects, actionCount, pendingCount,
  isSelected, isNext, isNeverSeen, hasUpdateSinceSeen, onSelect, badges,
}: MeetingListCardProps) {
  return (
    <button
      type="button"
      className={`tk-card tk-mlc${isSelected ? ' tk-sel' : ''}${isNext ? ' tk-nx' : ''}`}
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
    >
      <span className="tk-mlr">
        <span className="tk-mld">{formatShortDate(date)}</span>
        {isNext && <span className="tk-mln">Next meeting</span>}
        <span className="tk-sp" />
        {isNeverSeen && <span className="tk-tag" title="New notes since your last visit">New</span>}
        {hasUpdateSinceSeen && <span className="tk-udot" aria-hidden="true" title="Updated since you last looked" />}
        {badges}
      </span>
      <span className="tk-mlt">{emDashifyTitle(title)}</span>
      <span className="tk-mlr tk-mlf">
        <AttendeeFaces values={attendees} max={3} />
        {project && (
          <span className="tk-cs tk-mlp" title={extraProjects > 0 ? `${project} and ${extraProjects} more` : project}>
            {project}{extraProjects > 0 ? ` +${extraProjects}` : ''}
          </span>
        )}
        <span className="tk-sp" />
        {actionCount > 0 && (
          pendingCount > 0 ? (
            <span className="tk-mt" title={`${pendingCount} open action${pendingCount === 1 ? '' : 's'}`} aria-label={`${pendingCount} open action${pendingCount === 1 ? '' : 's'}`}>
              <ListChecks {...ICON_PROPS} size={13} aria-hidden />{pendingCount}
            </span>
          ) : (
            <span className="tk-mt" title="All actions done" aria-label="All actions done">
              <Check {...ICON_PROPS} size={13} aria-hidden />
            </span>
          )
        )}
      </span>
    </button>
  )
}
