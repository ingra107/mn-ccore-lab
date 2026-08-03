// MeetingOriginTag — "this task came out of a meeting", as one element.
//
// #108. Nick: "i would LOVE if the from a meeting with the icon was the link".
// The icon and the label are ONE target, not a label with a link glued beside
// it — so the whole tag is either a <Link> or a plain <span>, never a mix.
//
// Extracted because the task panel and the Today drawer had grown two copies of
// the same link-or-span chooser; a change to the tooltip copy or the spacing had
// to be made in both. The surfaces differ only in type scale, so that is a prop.

import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { formatBrandName } from '../BrandName'
import { meetingHrefFor, meetingLabelFor, type MeetingOriginFields } from '../../lib/meetingOrigin'

const TIP = 'Open this meeting — its notes and the other tasks from it'

export function MeetingOriginTag({
  task,
  iconSize = 12,
  color = 'var(--teal)',
  style,
}: {
  task: MeetingOriginFields
  iconSize?: number
  /** Link colour. The non-link form inherits the surrounding meta colour instead. */
  color?: string
  style?: React.CSSProperties
}) {
  const href = meetingHrefFor(task)
  const label = formatBrandName(meetingLabelFor(task))
  const icon = <Users size={iconSize} strokeWidth={1.5} absoluteStrokeWidth style={{ color, flexShrink: 0 }} />
  const layout: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, ...style }

  // No href = the meeting could not be identified (its id dangles). The ORIGIN
  // is still stated; only the link is withheld. See lib/meetingOrigin.
  if (!href) return <span style={layout}>{icon}<span>{label}</span></span>

  return (
    <Link to={href} className="link-affordance" style={{ ...layout, color }} data-tip={TIP}>
      {icon}<span>{label}</span>
    </Link>
  )
}

export default MeetingOriginTag
