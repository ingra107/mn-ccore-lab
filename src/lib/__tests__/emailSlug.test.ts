// Contract test for shared/emailSlug.ts — the single map source for
// email-prefix -> canonical team slug (PB backlog #1134).
//
// Before #1134 this map was hand-mirrored in src/lib/emailSlug.ts
// (`emailToSlug`, the UI) and api/helpers.ts (`actorSlug`, the Worker).
// Neither side had a dedicated test pinning it — api/helpers.test.ts only
// covered `actorSlug`, and the UI's `emailToSlug` had no test at all. A
// drift between the two failed CLOSED but silently wrong: #906's evidence
// was a member added to one copy and not the other losing the
// `canEditFeatured` edit button while the API still accepted the write.
//
// Both `emailToSlug` (this file) and `actorSlug` (api/helpers.ts, still
// separately covered by api/helpers.test.ts) now call the SAME
// `resolveEmailSlug` in shared/emailSlug.ts, so there is only one map left
// to pin — this file pins it from the UI side; api/helpers.test.ts pins the
// same function from the Worker side.

import { describe, it, expect } from 'vitest'
import { EMAIL_PREFIX_TO_SLUG, resolveEmailSlug } from '../../../shared/emailSlug'
import { emailToSlug } from '../emailSlug'

describe('resolveEmailSlug (shared/emailSlug.ts)', () => {
  it('maps a known prefix to its canonical team slug', () => {
    expect(resolveEmailSlug('ingra107@umn.edu')).toBe('nick-ingraham')
    expect(resolveEmailSlug('bromley@umn.edu')).toBe('emma-bromley')
    expect(resolveEmailSlug('mceachron@umn.edu')).toBe('kendall-mceachron')
  })

  it('canonicalizes every one of Nick\'s email aliases to the same slug', () => {
    expect(resolveEmailSlug('nick@umn.edu')).toBe('nick-ingraham')
    expect(resolveEmailSlug('ingra107@umn.edu')).toBe('nick-ingraham')
    expect(resolveEmailSlug('ningraha@umn.edu')).toBe('nick-ingraham')
  })

  it('lowercases the prefix before lookup', () => {
    expect(resolveEmailSlug('NINGRAHA@umn.edu')).toBe('nick-ingraham')
    expect(resolveEmailSlug('Bromley@umn.edu')).toBe('emma-bromley')
  })

  it('falls through to the literal lowercased prefix for an unknown email', () => {
    expect(resolveEmailSlug('unknown@umn.edu')).toBe('unknown')
  })

  it('every entry in the map resolves to itself (no unreachable rows)', () => {
    for (const [prefix, slug] of Object.entries(EMAIL_PREFIX_TO_SLUG)) {
      expect(resolveEmailSlug(`${prefix}@umn.edu`)).toBe(slug)
    }
  })
})

describe('emailToSlug (src/lib/emailSlug.ts, the UI wrapper)', () => {
  it('delegates to the same shared map as the Worker\'s actorSlug', () => {
    expect(emailToSlug('ingra107@umn.edu')).toBe(resolveEmailSlug('ingra107@umn.edu'))
    expect(emailToSlug('bromley@umn.edu')).toBe(resolveEmailSlug('bromley@umn.edu'))
    expect(emailToSlug('unknown@umn.edu')).toBe(resolveEmailSlug('unknown@umn.edu'))
  })

  it('returns "" for null/undefined/empty — the pre-auth-hydration case', () => {
    expect(emailToSlug(null)).toBe('')
    expect(emailToSlug(undefined)).toBe('')
    expect(emailToSlug('')).toBe('')
  })
})
