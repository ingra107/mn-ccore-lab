// The public member page (/team/:slug) hides "View Trajectory" and "Watch"
// from a signed-out visitor (prod check 2026-10-11); a signed-in member sees both.
import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import MemberProfileActions from './MemberProfileActions'

let mounted: { host: HTMLElement; root: Root }[] = []
const tick = () => new Promise((r) => setTimeout(r, 20))

const user = (signedIn: boolean): AuthUser => ({
  email: signedIn ? 'casey@umn.edu' : '', slug: signedIn ? 'casey-eddington' : '', isAuthenticated: signedIn,
  isPi: false, isMember: signedIn, canShowAllProjects: false, piResolved: signedIn,
})

async function mount(ui: ReactElement, signedIn: boolean, isLoading = false): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <AuthContext.Provider value={{ user: user(signedIn), isAuthenticated: signedIn, isLoading }}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
  mounted.push({ host, root })
  await tick()
  return host
}

afterEach(() => {
  mounted.forEach(({ host, root }) => { root.unmount(); host.remove() })
  mounted = []
})

const actions = <MemberProfileActions slug="casey-eddington" teamBase="/team" name="Casey Eddington" />

describe('MemberProfileActions', () => {
  it('shows nothing to a signed-out visitor', async () => {
    const h = await mount(actions, false)
    expect(h.querySelector('[data-testid="member-profile-actions"]')).toBeNull()
    expect(h.textContent).not.toMatch(/Trajectory|Watch/)
  })

  it('shows nothing while sign-in is still resolving', async () => {
    const h = await mount(actions, false, true)
    expect(h.textContent).toBe('')
  })

  it('shows View Trajectory and Watch to a signed-in member', async () => {
    const h = await mount(actions, true)
    const link = h.querySelector('a')!
    expect(link.getAttribute('href')).toBe('/team/casey-eddington/trajectory')
    expect(h.textContent).toContain('View Trajectory')
    expect(h.textContent).toContain('Watch')
  })
})
