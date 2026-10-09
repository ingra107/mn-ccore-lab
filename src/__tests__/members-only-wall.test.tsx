// The members-only wall (RequireAuth) and the public /join page show the SAME
// join instructions, from one component (JoinSteps). Nick, 2026-10-09: a
// signed-in non-member is kindly told how to join. Pins: a signed-in
// non-member hitting a portal route gets the three steps, the contact and the
// Request-to-join mailto; a member gets the portal, not the wall.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect } from 'vitest'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import RequireAuth from '../components/RequireAuth'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

function user(isMember: boolean): AuthUser {
  return { email: 'newbie@umn.edu', slug: '', name: 'New Person', isAuthenticated: true, isPi: false, isMember, piResolved: true } as AuthUser
}

function gated(isMember: boolean) {
  return (
    <AuthContext.Provider value={{ user: user(isMember), isAuthenticated: true, isLoading: false }}>
      <RequireAuth><div data-testid="portal">portal</div></RequireAuth>
    </AuthContext.Provider>
  )
}

describe('members-only wall', () => {
  it('shows a signed-in non-member the three join steps, the contact and the mailto', async () => {
    const host = await mount(gated(false), { ready: (h) => h.querySelector('[data-testid="join-steps"]'), label: 'members-only wall' })
    const wall = host.querySelector('[data-testid="members-only"]')
    expect(wall).not.toBeNull()
    const steps = [...host.querySelectorAll('[data-testid="join-steps"] li')].map((li) => li.textContent ?? '')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toContain('Talk to Nick or Nate about a project')
    expect(steps[1]).toContain('Finish your CITI training')
    expect(steps[2]).toContain('Get added')
    expect(wall!.textContent).toContain('ingra107@umn.edu')
    const href = host.querySelector('[data-testid="join-request"]')?.getAttribute('href') ?? ''
    expect(href).toMatch(/^mailto:ingra107@umn\.edu\?/)
    expect(new URLSearchParams(href.split('?')[1]).get('body')).toContain('UMN email: newbie@umn.edu')
    expect(host.querySelector('[data-testid="portal"]')).toBeNull()
  })

  // The sign-in wall's link must be a FULL page load of a /portal/* URL (the
  // Access policy intercepts that at the edge), never the on-host
  // /cdn-cgi/access/login path, which is a live 404.
  it('sign-in wall links a full load of the page you wanted, or Today outside /portal/*', async () => {
    const original = window.location.pathname + window.location.search
    const signedOut = (
      <AuthContext.Provider value={{ user: { ...user(false), isAuthenticated: false }, isAuthenticated: false, isLoading: false }}>
        <RequireAuth><div data-testid="portal">portal</div></RequireAuth>
      </AuthContext.Provider>
    )
    try {
      window.history.replaceState(null, '', '/portal/projects?tab=ideas&strict=1')
      let host = await mount(signedOut, { ready: (h) => h.querySelector('[data-testid="signin-cta"]'), label: 'sign-in wall' })
      let cta = host.querySelector('[data-testid="signin-cta"]')!
      expect(cta.tagName).toBe('A')
      expect(cta.getAttribute('href')).toBe('/portal/projects?tab=ideas&strict=1')

      window.history.replaceState(null, '', '/portal?strict=1')
      host = await mount(signedOut, { ready: (h) => h.querySelector('[data-testid="signin-cta"]'), label: 'sign-in wall (bare /portal)' })
      cta = host.querySelector('[data-testid="signin-cta"]')!
      expect(cta.getAttribute('href')).toBe('/portal/dashboard')
      expect(host.innerHTML).not.toContain('cdn-cgi')
    } finally {
      window.history.replaceState(null, '', original)
    }
  })

  it('lets a member through to the portal', async () => {
    const host = await mount(gated(true), { ready: (h) => h.querySelector('[data-testid="portal"]'), label: 'portal' })
    expect(host.querySelector('[data-testid="members-only"]')).toBeNull()
  })
})
