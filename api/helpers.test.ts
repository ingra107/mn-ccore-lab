import { describe, it, expect } from 'vitest'
import { actorSlug } from './helpers'

// W1 (2026-04-29) — verify EMAIL_PREFIX_TO_SLUG canonicalizes ningraha@umn.edu
// to 'nick-ingraham'. Closes A0 Decision #7: prior to W1, `ningraha:` was missing
// from the LUT so 3 INSERT sites hardcoded the literal `'ningraha'` to compensate.
// W1 added the LUT entry + flipped those 3 sites to use `'nick-ingraham'`.

describe('actorSlug — W1 ningraha canonicalization', () => {
  it('canonicalizes ningraha@umn.edu to nick-ingraham', () => {
    expect(actorSlug('ningraha@umn.edu')).toBe('nick-ingraham')
  })

  it('canonicalizes nick@umn.edu to nick-ingraham (legacy short form)', () => {
    expect(actorSlug('nick@umn.edu')).toBe('nick-ingraham')
  })

  it('canonicalizes ingra107@umn.edu to nick-ingraham (real UMN NetID)', () => {
    expect(actorSlug('ingra107@umn.edu')).toBe('nick-ingraham')
  })

  it('handles uppercase input via lowercasing', () => {
    expect(actorSlug('NINGRAHA@umn.edu')).toBe('nick-ingraham')
  })

  it('falls through to literal prefix for unknown emails', () => {
    expect(actorSlug('unknown@umn.edu')).toBe('unknown')
  })

  it('canonicalizes other team prefixes', () => {
    expect(actorSlug('bromley@umn.edu')).toBe('emma-bromley')
    expect(actorSlug('mceachron@umn.edu')).toBe('kendall-mceachron')
  })
})
