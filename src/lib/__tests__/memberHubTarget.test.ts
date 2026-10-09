import { describe, it, expect } from 'vitest'
import { memberHubTarget, MEMBER_HUB_LOGIN } from '../memberHubTarget'

describe('memberHubTarget (the public Member Hub tab)', () => {
  it('a signed-in member goes to Today', () => {
    expect(memberHubTarget({ isLoading: false, isAuthenticated: true, isMember: true })).toEqual({ href: '/portal/dashboard', external: false })
  })

  it('a signed-in non-member goes to the join page', () => {
    expect(memberHubTarget({ isLoading: false, isAuthenticated: true, isMember: false })).toEqual({ href: '/join', external: false })
  })

  it('a visitor who is not signed in goes to the login, which returns to Today', () => {
    const t = memberHubTarget({ isLoading: false, isAuthenticated: false, isMember: false })
    expect(t).toEqual({ href: MEMBER_HUB_LOGIN, external: true })
    expect(decodeURIComponent(t.href)).toContain('redirect_url=/portal/dashboard')
  })

  it('while the session is still loading, Today (the portal gate decides)', () => {
    expect(memberHubTarget({ isLoading: true, isAuthenticated: false, isMember: false }).href).toBe('/portal/dashboard')
  })
})
