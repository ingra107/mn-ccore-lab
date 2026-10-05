// shared/attendees.ts -- the rule both the Worker's meeting writers and the
// attendance picker use (#551). The picker half: a stored team email must read
// as the member's slug so the toggle shows them present; an external with a
// team member's local-part must NOT (the prefix LUT's failure).

import { describe, it, expect } from 'vitest'
import { buildAttendeeLookup, resolveAttendee, resolveAttendeeList } from '../../../shared/attendees'

const lookup = buildAttendeeLookup([
  { slug: 'adams-dudley', email: 'Dudley@umn.edu' },
  { slug: 'nate-mesfin', email: 'nmesfin@umn.edu' },
  { slug: 'nick-ingraham' },          // static row: slug only
  { slug: null, email: 'x@umn.edu' }, // no slug: ignored
])

describe('resolveAttendee', () => {
  it('maps an exact team email (any case) to the slug', () => {
    expect(resolveAttendee('dudley@UMN.EDU', lookup)).toBe('adams-dudley')
  })
  it('keeps a known slug', () => {
    expect(resolveAttendee('nick-ingraham', lookup)).toBe('nick-ingraham')
  })
  it('keeps an external email raw (lower-cased) even when its local-part is a team prefix', () => {
    expect(resolveAttendee('nate@stanford.edu', lookup)).toBe('nate@stanford.edu')
    expect(resolveAttendee('Dudley@stanford.edu', lookup)).toBe('dudley@stanford.edu')
  })
  it('keeps a display name as given and drops blanks / non-strings', () => {
    expect(resolveAttendee(' Nick E Ingraham ', lookup)).toBe('Nick E Ingraham')
    expect(resolveAttendee('  ', lookup)).toBeNull()
    expect(resolveAttendee(42, lookup)).toBeNull()
  })
})

describe('resolveAttendeeList', () => {
  it('resolves, dedupes after resolving, and keeps order', () => {
    expect(resolveAttendeeList(
      ['dudley@umn.edu', 'wparker@uchicago.edu', 'adams-dudley', 'x@umn.edu', 'X@umn.edu'],
      lookup,
    )).toEqual(['adams-dudley', 'wparker@uchicago.edu', 'x@umn.edu'])
  })
})
