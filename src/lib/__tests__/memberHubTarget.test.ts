import { describe, it, expect } from 'vitest'
import { memberHubTarget } from '../memberHubTarget'

describe('memberHubTarget (the public Member Hub tab)', () => {
  it('a signed-in member goes to Today by router link', () => {
    expect(memberHubTarget({ isLoading: false, isAuthenticated: true, isMember: true })).toEqual({ href: '/portal/dashboard', external: false })
  })

  it('a signed-in non-member goes to the join page', () => {
    expect(memberHubTarget({ isLoading: false, isAuthenticated: true, isMember: false })).toEqual({ href: '/join', external: false })
  })

  it('a visitor who is not signed in gets a FULL page load of Today, which Access intercepts at the edge', () => {
    expect(memberHubTarget({ isLoading: false, isAuthenticated: false, isMember: false })).toEqual({ href: '/portal/dashboard', external: true })
  })

  it('while the session is still loading, also a full page load of Today', () => {
    expect(memberHubTarget({ isLoading: true, isAuthenticated: false, isMember: false })).toEqual({ href: '/portal/dashboard', external: true })
  })

  it('never targets the on-host /cdn-cgi/access/login path (a live 404)', () => {
    for (const isLoading of [true, false]) for (const isAuthenticated of [true, false]) for (const isMember of [true, false]) {
      expect(memberHubTarget({ isLoading, isAuthenticated, isMember }).href).not.toContain('cdn-cgi')
    }
  })
})
