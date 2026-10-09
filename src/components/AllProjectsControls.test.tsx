// The admin "Show all projects" switch: drawn only when /api/auth/me said
// canShowAllProjects, off by default, banner while on (#145).
// Runs in real Chromium (vitest.config.ts browser mode); mounts with react-dom
// directly (the repo carries no testing-library).
import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, authUserFromMe, type AuthUser } from '../hooks/useAuth'
import { getAllProjectsOn, setAllProjectsOn } from '../lib/allProjects'
import { AllProjectsBanner, AllProjectsSwitch } from './AllProjectsControls'

let mounted: { host: HTMLElement; root: Root }[] = []

const tick = () => new Promise((r) => setTimeout(r, 30))

async function mount(user: AuthUser): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const ui: ReactElement = (
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={{ user, isAuthenticated: user.isAuthenticated, isLoading: false }}>
        <AllProjectsSwitch />
        <AllProjectsBanner />
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  root.render(ui)
  mounted.push({ host, root })
  await tick()
  return host
}

const me = (extra: Record<string, unknown>) =>
  authUserFromMe({ authenticated: true, isMember: true, email: 'x@umn.edu', slug: 'x-person', ...extra }) as AuthUser

afterEach(() => {
  setAllProjectsOn(false)
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
})

describe('authUserFromMe canShowAllProjects', () => {
  it('is true only when the Worker said exactly true', () => {
    expect(me({ canShowAllProjects: true }).canShowAllProjects).toBe(true)
    expect(me({ canShowAllProjects: false }).canShowAllProjects).toBe(false)
    expect(me({}).canShowAllProjects).toBe(false)
    expect(me({ canShowAllProjects: 'true' as unknown as boolean }).canShowAllProjects).toBe(false)
  })
  it('is false for a non-member even if the field is sent', () => {
    const u = authUserFromMe({ authenticated: true, isMember: false, email: 'y@umn.edu', canShowAllProjects: true }) as AuthUser
    expect(u.canShowAllProjects).toBe(false)
  })
})

describe('AllProjectsSwitch visibility', () => {
  it('draws nothing for a member who cannot show all projects', async () => {
    const host = await mount(me({ isPi: true, canShowAllProjects: false }))
    expect(host.querySelector('[data-testid="all-projects-switch"]')).toBeNull()
  })

  it('draws the switch, off, labelled, for the site admin', async () => {
    const host = await mount(me({ isPi: true, canShowAllProjects: true }))
    const sw = host.querySelector('[data-testid="all-projects-switch"]') as HTMLButtonElement
    expect(sw).not.toBeNull()
    expect(sw.getAttribute('role')).toBe('switch')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(sw.textContent).toContain('Show all projects (admin)')
    expect(getAllProjectsOn()).toBe(false)
    expect(host.querySelector('[data-testid="all-projects-banner"]')).toBeNull()
  })

  it('turns on with a banner, and the banner can turn it off', async () => {
    const host = await mount(me({ isPi: true, canShowAllProjects: true }))
    const sw = host.querySelector('[data-testid="all-projects-switch"]') as HTMLButtonElement
    sw.click()
    await tick()
    expect(getAllProjectsOn()).toBe(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    const banner = host.querySelector('[data-testid="all-projects-banner"]') as HTMLElement
    expect(banner.textContent).toContain('unfiltered')
    const off = Array.from(banner.querySelectorAll('button')).find((b) => b.textContent === 'Turn off') as HTMLButtonElement
    off.click()
    await tick()
    expect(getAllProjectsOn()).toBe(false)
    expect(host.querySelector('[data-testid="all-projects-banner"]')).toBeNull()
  })

  it('shows no banner to someone who cannot use the switch even if the state were on', async () => {
    setAllProjectsOn(true)
    const host = await mount(me({ isPi: false, canShowAllProjects: false }))
    expect(host.querySelector('[data-testid="all-projects-banner"]')).toBeNull()
  })
})
