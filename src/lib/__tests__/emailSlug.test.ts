// Contract test for src/lib/emailSlug.ts — DISPLAY resolution of a stored
// email (tasks.assigned_by) to a team slug, from the directory the Worker
// returns on /api/auth/me (#8945).
//
// Before #8945 this wrapped a hand-kept NetID map (EMAIL_PREFIX_TO_SLUG) that
// both the UI and the Worker used to decide who the LOGGED-IN user was; every
// member missing from it got a ghost account on first login. Who the user is
// now comes from `useAuth().user.slug` (resolved server-side from
// team_members.email); this file only renders other people's emails, with
// the same first-row-wins order the Worker's resolveSlug uses.

import { describe, it, expect, beforeEach } from 'vitest'
import { setEmailDirectory, slugForEmail } from '../emailSlug'
import { LEGACY_SLUG_ALIASES, emailPrefix } from '../../../shared/emailSlug'

describe('slugForEmail (display directory from /api/auth/me)', () => {
  beforeEach(() => setEmailDirectory([]))

  it('resolves an email the directory carries, whatever its NetID looks like', () => {
    setEmailDirectory([
      { email: 'eddin022@umn.edu', slug: 'casey-eddington' },
      { email: 'ingra107@umn.edu', slug: 'nick-ingraham' },
    ])
    expect(slugForEmail('eddin022@umn.edu')).toBe('casey-eddington')
    expect(slugForEmail('INGRA107@UMN.EDU')).toBe('nick-ingraham')
  })

  it('first row wins, matching the Worker order (pre-provisioned before auto-created)', () => {
    setEmailDirectory([
      { email: 'bromle012@umn.edu', slug: 'emma-bromley' },
      { email: 'bromle012@umn.edu', slug: 'bromle012' },
    ])
    expect(slugForEmail('bromle012@umn.edu')).toBe('emma-bromley')
  })

  it('falls back to the lowercased prefix before the directory arrives or for an unknown email', () => {
    expect(slugForEmail('Someone@umn.edu')).toBe('someone')
  })

  it('returns "" for null/undefined/empty', () => {
    expect(slugForEmail(null)).toBe('')
    expect(slugForEmail(undefined)).toBe('')
    expect(slugForEmail('')).toBe('')
  })
})

describe('shared/emailSlug.ts — what is left once identity moved to team_members', () => {
  it('emailPrefix lowercases the local part', () => {
    expect(emailPrefix('Eddin022@umn.edu')).toBe('eddin022')
  })

  it('LEGACY_SLUG_ALIASES is the closed pre-36b set, not a member list', () => {
    // A new member never goes here; their row's email is what onboards them.
    expect(LEGACY_SLUG_ALIASES).toEqual({ nick: 'nick-ingraham', ningraha: 'nick-ingraham' })
  })
})
