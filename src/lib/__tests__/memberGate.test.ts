// memberGate.test.ts — the SPA half of the 2026-10-08 member gate: what the
// page shows a signed-in non-member, the "Request access" mailto, and the
// slug the Add member form previews (the same function the Worker uses).

import { describe, it, expect } from 'vitest'
import { authUserFromMe } from '../../hooks/useAuth'
import { slugForEmail } from '../emailSlug'
import { accessRequestHref, ACCESS_CONTACT, ACCESS_SUBJECT } from '../accessRequest'
import { slugFromName, MEMBER_SLUG, UMN_EMAIL } from '../../../shared/memberSlug'

describe('authUserFromMe — isMember', () => {
  it('a Worker non-member answer: signed in, not a member, no slug', () => {
    const u = authUserFromMe({ authenticated: true, isMember: false, isPi: false, email: 'jdoe@umn.edu', name: 'Jane Doe' })
    expect(u).toEqual({ email: 'jdoe@umn.edu', slug: '', name: 'Jane Doe', isAuthenticated: true, isPi: false, isMember: false })
  })

  it('a non-member answer clears the cached member directory and slug on this device', () => {
    const store = new Map<string, string>()
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    }
    const g = globalThis as { localStorage?: unknown }
    const prev = g.localStorage
    g.localStorage = ls
    try {
      // A member used this browser: the directory and their slug get cached.
      authUserFromMe({ authenticated: true, isMember: true, email: 'eddin022@umn.edu', slug: 'casey-eddington', directory: [{ email: 'eddin022@umn.edu', slug: 'casey-eddington' }] })
      expect(store.get('hub:auth-directory')).toContain('eddin022@umn.edu')
      expect(slugForEmail('eddin022@umn.edu')).toBe('casey-eddington')
      // Then a non-member signs in on it.
      authUserFromMe({ authenticated: true, isMember: false, email: 'eddin022@umn.edu' })
      expect(store.has('hub:auth-directory')).toBe(false)
      expect(store.has('hub:auth-slug:eddin022@umn.edu')).toBe(false)
      expect(slugForEmail('eddin022@umn.edu')).toBe('eddin022')
    } finally {
      g.localStorage = prev
    }
  })

  it('a non-member answer never carries PI, whatever the body says', () => {
    expect(authUserFromMe({ authenticated: true, isMember: false, isPi: true, email: 'x@umn.edu' })?.isPi).toBe(false)
  })

  it('a member answer is a member', () => {
    const u = authUserFromMe({ authenticated: true, isMember: true, email: 'eddin022@umn.edu', slug: 'casey-eddington', directory: [] })
    expect(u).toMatchObject({ isMember: true, slug: 'casey-eddington' })
  })

  it('a Worker without the field (older deploy) is read as a member: the API is the gate', () => {
    expect(authUserFromMe({ authenticated: true, email: 'eddin022@umn.edu', slug: 'casey-eddington' })?.isMember).toBe(true)
  })
})

describe('accessRequestHref', () => {
  it('mails Nick with the fixed subject and the caller name + email in the body', () => {
    const href = accessRequestHref('jdoe@umn.edu', 'Jane Doe')
    expect(href.startsWith(`mailto:${ACCESS_CONTACT}?`)).toBe(true)
    const q = new URLSearchParams(href.slice(href.indexOf('?') + 1))
    expect(q.get('subject')).toBe(ACCESS_SUBJECT)
    expect(ACCESS_SUBJECT).toBe('MN-CCORE Hub access request')
    expect(q.get('body')).toContain('Name: Jane Doe')
    expect(q.get('body')).toContain('UMN email: jdoe@umn.edu')
  })

  it('falls back to the email when the name is blank', () => {
    const q = new URLSearchParams(accessRequestHref('jdoe@umn.edu', '  ').split('?')[1])
    expect(q.get('body')).toContain('Name: jdoe@umn.edu')
  })
})

describe('slugFromName / MEMBER_SLUG / UMN_EMAIL', () => {
  it.each([
    ['Jane Doe', 'jane-doe'],
    ['  José  Q. Newbie ', 'jose-newbie'],
    ['Mary-Kate O’Brien', 'mary-kate-brien'],
    ['Cher', 'cher'],
    ['', ''],
  ])('%j -> %j', (name, slug) => {
    expect(slugFromName(name)).toBe(slug)
  })

  it('every non-empty derived slug passes the server shape check', () => {
    for (const n of ['Jane Doe', 'José Q. Newbie', 'Mary-Kate O’Brien', 'A--B C']) {
      expect(MEMBER_SLUG.test(slugFromName(n)), n).toBe(true)
    }
  })

  it('UMN_EMAIL takes umn.edu and its subdomains only', () => {
    expect(UMN_EMAIL.test('ingra107@umn.edu')).toBe(true)
    expect(UMN_EMAIL.test('kali0135@d.umn.edu')).toBe(true)
    expect(UMN_EMAIL.test('a@gmail.com')).toBe(false)
    expect(UMN_EMAIL.test('a@umn.edu.evil.com')).toBe(false)
    expect(UMN_EMAIL.test('a@notumn.edu')).toBe(false)
  })
})
