// shared/attendees.ts -- the ONE rule for what a stored meeting attendee value
// means (#551). Imported by the Worker's writer (api/lib/meeting-write.ts
// normalizeAttendees, which loads the lookup from team_members) and by the
// attendance picker (src/pages/MeetingDetail.tsx, which builds the lookup from
// the team list it already fetches), so the two cannot disagree.
//
// Per value:
//   - a known team slug stays as is;
//   - an email whose lower-case form EXACTLY equals a team member's email
//     becomes that member's slug;
//   - any other email is kept, lower-cased; anything else (a display name such
//     as "Nick E Ingraham") is kept as given.
// Then the list is deduped, first occurrence wins.
//
// Never resolve by email PREFIX (shared/emailSlug.ts resolveEmailSlug): it
// ignores the domain, so an external `nate@stanford.edu` would become
// `nate-mesfin`. The 2026-07-31 dry run of #551's first fix-shape (actorSlug
// over the whole array) was refuted for exactly that reason.

export interface AttendeeLookup {
  /** Every team member slug. */
  slugs: ReadonlySet<string>
  /** lower-cased team member email -> slug. */
  emailToSlug: ReadonlyMap<string, string>
}

export function buildAttendeeLookup(members: ReadonlyArray<{ slug?: string | null; email?: string | null }>): AttendeeLookup {
  const slugs = new Set<string>()
  const emailToSlug = new Map<string, string>()
  for (const m of members) {
    if (!m.slug) continue
    slugs.add(m.slug)
    const email = m.email?.trim().toLowerCase()
    if (email && !emailToSlug.has(email)) emailToSlug.set(email, m.slug)
  }
  return { slugs, emailToSlug }
}

/** The canonical form of one stored value, or null for a blank/non-string value. */
export function resolveAttendee(value: unknown, lookup: AttendeeLookup): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (lookup.slugs.has(v)) return v
  if (v.includes('@')) {
    const email = v.toLowerCase()
    return lookup.emailToSlug.get(email) ?? email
  }
  return v
}

/** Resolve every value, drop blanks, dedupe preserving order. */
export function resolveAttendeeList(values: readonly unknown[], lookup: AttendeeLookup): string[] {
  const out: string[] = []
  for (const value of values) {
    const r = resolveAttendee(value, lookup)
    if (r !== null && !out.includes(r)) out.push(r)
  }
  return out
}
