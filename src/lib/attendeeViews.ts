// Resolve a meeting's stored attendee values to people (badge + first name).
// Pure: the hook in hooks/useAttendeeViews.ts feeds it the team list, and
// components/meetings/Attendees.tsx renders what it returns. The rules and the
// why are in that component's header.

import { buildAttendeeLookup, resolveAttendeeList } from '../../shared/attendees'
import { fullNameForSlug } from './nameUtils'
import { firstNameFor, firstOf, initialsOfName } from './personLabel'
import type { TeamMember } from '../data/types'

/** A UMN internet id: letters then digits ("kaur0147", "eddin022"). */
const NETID = /^[a-z]{2,}\d{2,}$/i

export interface AttendeeView {
  key: string
  name: string
  first: string
  initials: string
  /** The stored value, kept for the tooltip when the person could not be named. */
  raw: string
  /** Named (shown readable). False = an id nobody could name (shown raw and muted). */
  listed: boolean
  /** A team member. False for outside emails, typed names and unnamed ids; the tooltip says so. */
  onTeam: boolean
}

function words(local: string): string {
  return local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function unlisted(raw: string): AttendeeView {
  return { key: raw, name: raw, first: raw, initials: '?', raw, listed: false, onTeam: false }
}

function fromName(raw: string, name: string, first?: string, onTeam = false): AttendeeView {
  return { key: raw, name, first: first ?? firstOf(name), initials: initialsOfName(name), raw, listed: true, onTeam }
}

export function resolveAttendeeViews(values: readonly unknown[] | null | undefined, team: readonly TeamMember[]): AttendeeView[] {
  const lookup = buildAttendeeLookup(team.map((m) => ({ slug: m.slug, email: m.email })))
  const bySlug = new Map(team.filter((m) => m.slug).map((m) => [m.slug as string, m]))
  const out: AttendeeView[] = []
  const seen = new Set<string>()
  for (const v of resolveAttendeeList(values ?? [], lookup)) {
    let slug: string | null = lookup.slugs.has(v) ? v : null
    // A bare internet id is the left side of a team member's UMN address.
    if (!slug && !v.includes('@') && NETID.test(v)) {
      const hit = team.find((m) => m.slug && m.email?.toLowerCase() === `${v.toLowerCase()}@umn.edu`)
      if (hit?.slug) slug = hit.slug
    }
    let view: AttendeeView
    if (slug) {
      const row = bySlug.get(slug)
      const known = fullNameForSlug(slug) !== slug // the static roster knows this person
      const rowName = row?.name && row.name !== slug && !NETID.test(row.name) ? row.name : null
      const name = known ? fullNameForSlug(slug) : rowName
      view = !name || NETID.test(name)
        ? unlisted(v)
        : fromName(v, name, known ? firstNameFor(slug) : undefined, true)
    } else if (v.includes('@')) {
      const local = v.split('@')[0] ?? ''
      view = NETID.test(local) ? unlisted(v) : fromName(v, words(local) || v)
    } else if (NETID.test(v)) {
      view = unlisted(v)
    } else {
      view = fromName(v, v) // a display name someone typed
    }
    if (seen.has(view.key + '|' + view.name)) continue
    seen.add(view.key + '|' + view.name)
    out.push(view)
  }
  return out
}
