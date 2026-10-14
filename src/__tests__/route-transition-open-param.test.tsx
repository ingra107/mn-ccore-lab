// G10-05: the command palette's "Log Decision" went to /portal/decisions?create=true
// and the create modal was not open. The portal cross-fade (RouteTransition)
// rendered a live <Outlet /> inside the exiting page, so the destination page
// mounted twice: the throwaway copy consumed and stripped ?create=true, then
// unmounted. This drives an in-app navigation through the real RouteTransition
// and the real useOpenParam and checks the page that stays mounted got the param.
//
// Runs in real Chromium (vitest.config.ts browser mode).
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import RouteTransition from '../components/RouteTransition'
import { useOpenParam } from '../hooks/useOpenParam'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

let mounts = 0

function Dashboard() {
  const navigate = useNavigate()
  return <button data-testid="log" onClick={() => navigate('/decisions?create=true')}>Log Decision</button>
}

function Decisions() {
  const [showCreate, setShowCreate] = useState(false)
  const [mountId] = useState(() => ++mounts)
  useOpenParam('create', () => setShowCreate(true))
  return <div data-testid="decisions" data-mount={mountId}>{showCreate ? 'create modal open' : 'no modal'}</div>
}

function Where() {
  const loc = useLocation()
  return <span data-testid="where">{loc.pathname + loc.search}</span>
}

describe('RouteTransition + one-shot URL params', () => {
  it('opens the create modal after an in-app navigation to ?create=true', async () => {
    mounts = 0
    const host = await mount(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<RouteTransition />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/decisions" element={<Decisions />} />
          </Route>
        </Routes>
        <Where />
      </MemoryRouter>,
      { ready: (h) => h.querySelector('[data-testid="log"]'), label: 'dashboard' },
    )
    host.querySelector<HTMLButtonElement>('[data-testid="log"]')!.click()
    // The param gets consumed and stripped...
    await waitFor(() => host.querySelector('[data-testid="where"]')?.textContent === '/decisions', 'param stripped')
    // ...and once the fade settles, the page left on screen is the one that consumed it.
    await waitFor(() => host.querySelectorAll('[data-testid="decisions"]').length === 1 && !host.querySelector('[data-testid="log"]'), 'fade settled')
    await new Promise((r) => setTimeout(r, 400))
    const pages = host.querySelectorAll('[data-testid="decisions"]')
    expect(pages.length).toBe(1)
    expect(pages[0].textContent).toBe('create modal open')
    expect(mounts).toBe(1)
  })
})
