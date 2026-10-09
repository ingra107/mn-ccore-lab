// D3(a): My Hub's recently-viewed chips showed "My Hub" twice and never the
// pages actually visited -- the recorder lived inside the hook whose only
// caller was My Hub, and legacy '/personal' entries survived in storage.
// Pins: the recorder (PortalLayout) records every named portal page, the
// reader drops the current page and pre-/portal legacy paths, and labels
// match the nav.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useRecordRecentlyViewed, useRecentlyViewed } from '../hooks/useRecentlyViewed'
import { PATHS } from '../constants/paths'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const LS_KEY = 'mn-ccore-recently-viewed'

beforeEach(() => {
  localStorage.removeItem(LS_KEY)
})

// The test drives navigation itself, one step at a time (useNavigate's
// identity changes with location, so an effect-driven walk would restart).
type Go = (path: string) => void
function Walk({ onNavigate }: { onNavigate: (go: Go) => void }) {
  useRecordRecentlyViewed()
  const navigate = useNavigate()
  useEffect(() => { onNavigate(navigate) }, [onNavigate, navigate])
  return null
}

function Reader() {
  const { recent } = useRecentlyViewed()
  return <div data-testid="recent">{recent.map((r) => r.label).join('|')}</div>
}

async function until(pred: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}

describe('recently viewed (D3a)', () => {
  it('records every named portal page, newest first, with nav labels', async () => {
    let go: Go = () => {}
    const onNavigate = (g: Go) => { go = g }
    await mount(
      <MemoryRouter initialEntries={[PATHS.personal]}>
        <Walk onNavigate={onNavigate} />
      </MemoryRouter>,
      { ready: () => true, label: 'Walk' },
    )
    const count = () => (JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as unknown[]).length
    await until(() => count() === 1, 'first visit')
    go(PATHS.calendar)
    await until(() => count() === 2, 'calendar visit')
    go(PATHS.overview)
    await until(() => count() === 3, 'overview visit')
    go(PATHS.personal)
    await until(() => JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')[0]?.path === PATHS.personal, 'back to My Hub')
    const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Array<{ path: string; label: string }>
    expect(stored.map((s) => s.label)).toEqual(['My Hub', 'Lab Overview', 'Calendar'])
  })

  it('the reader shows the CURRENT name for a path, not the stored one', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([
      { path: PATHS.dashboard, label: 'Dashboard', timestamp: 2 },
      { path: PATHS.meetingNotes, label: 'Meeting Transcripts', timestamp: 1 },
    ]))
    const host = await mount(
      <MemoryRouter initialEntries={[PATHS.personal]}>
        <Reader />
      </MemoryRouter>,
      { ready: (h) => h.querySelector('[data-testid="recent"]'), label: 'Reader' },
    )
    expect(host.querySelector('[data-testid="recent"]')?.textContent).toBe('Today|Transcripts')
  })

  it('the reader drops the current page and legacy pre-/portal entries', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([
      { path: PATHS.personal, label: 'My Hub', timestamp: 3 },
      { path: '/personal', label: 'My Hub', timestamp: 2 },
      { path: PATHS.projects, label: 'Projects', timestamp: 1 },
    ]))
    const host = await mount(
      <MemoryRouter initialEntries={[PATHS.personal]}>
        <Reader />
      </MemoryRouter>,
      { ready: (h) => h.querySelector('[data-testid="recent"]'), label: 'Reader' },
    )
    expect(host.querySelector('[data-testid="recent"]')?.textContent).toBe('Projects')
  })
})
