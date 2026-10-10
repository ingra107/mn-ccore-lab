// Attendees as people, not stored strings (Nick 2026-10-09, rules-ui-design #12:
// an initials badge + FIRST name). A meeting's `attendees` column holds whatever
// was written: a team slug, a team email, an outside email, a display name, or a
// bare UMN internet id ("kaur0147"). This resolves each value the way the picker
// and the Worker do (shared/attendees.ts: slug stays, exact team email -> slug),
// then, for a bare internet id, matches a team member whose address is
// <id>@umn.edu. A value that still reads as an internet id after that shows as
// the raw id, muted, with a ? badge and the value in the tooltip (Nick 2026-10-09).
//
// Presentation only. It never writes, and it does not touch the attendee editor.

import { useMemo } from 'react'
import { useAttendeeViews, type AttendeeView } from '../../hooks/useAttendeeViews'

/** Hover text: the full name for a team member; outsiders and unnamed ids say so. */
function attendeeTitle(a: AttendeeView): string {
  if (a.onTeam) return a.name
  return a.listed ? `${a.name} (not on the team)` : `${a.raw} (not on the team)`
}

function FaceDisc({ a, sm = false }: { a: AttendeeView; sm?: boolean }) {
  return (
    <span role="img" className={`tk-face${sm ? ' tk-sm' : ''}`} title={attendeeTitle(a)} aria-label={a.name}>
      {a.initials}
    </span>
  )
}

/** Up to `max` overlapping faces, then "+n". Nothing when there are no attendees. */
export function AttendeeFaces({ values, max = 3 }: { values: readonly unknown[] | null | undefined; max?: number }) {
  const people = useAttendeeViews(values)
  if (people.length === 0) return null
  return (
    <span className="tk-faces">
      {people.slice(0, max).map((a) => <FaceDisc key={a.key + a.name} a={a} />)}
      {people.length > max && <span className="tk-face" title={people.slice(max).map((a) => a.name).join(', ')}>+{people.length - max}</span>}
    </span>
  )
}

/** Badge + first name for each person, wrapping. The detail panel's attendee
 *  list. With `max`, the rest collapse into a "+n" chip (names in its tooltip). */
export function AttendeePeople({ values, max }: { values: readonly unknown[] | null | undefined; max?: number }) {
  const people = useAttendeeViews(values)
  if (people.length === 0) return null
  return (
    <div className="tk-ppl">
      {(max === undefined ? people : people.slice(0, max)).map((a) => (
        <span key={a.key + a.name} className="tk-per" title={attendeeTitle(a)}>
          <FaceDisc a={a} sm />
          <span className={`tk-pn${a.listed ? '' : ' tk-dim'}`}>{a.first}</span>
        </span>
      ))}
      {max !== undefined && people.length > max && (
        <span className="tk-per tk-pn tk-dim" title={people.slice(max).map((a) => a.name).join(', ')}>+{people.length - max}</span>
      )}
    </div>
  )
}

/** One person, badge + first name: the full meeting page's attendee chip. */
export function AttendeeBadge({ value }: { value: string }) {
  const values = useMemo(() => [value], [value])
  const [a] = useAttendeeViews(values)
  if (!a) return null
  return (
    <>
      <FaceDisc a={a} sm />
      <span className={`tk-pn${a.listed ? '' : ' tk-dim'}`}>{a.first}</span>
    </>
  )
}
