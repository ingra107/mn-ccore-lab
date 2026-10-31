// NoNextStepCard: count as hero, short names, 5-row cap with "and N more",
// "Add next step" opens the existing create-task modal on that project, and the
// card hides at zero. fetch is stubbed per URL; the endpoint shape is
// GET /api/projects/next-step-gaps -> { data: [{ id, slug, title, tier, last_movement }], count }.
//
// Run: npx vitest run --config vitest.config.ts src/components/today/rail/NoNextStepCard.test.tsx

import '../../../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../../hooks/useAuth'
import { UndoToastProvider } from '../../UndoToast'
import { NoNextStepCard } from './NoNextStepCard'
import { mount, cleanupMountsAfterEach, waitFor } from '../../../__tests__/testMount'

cleanupMountsAfterEach()
afterEach(() => vi.unstubAllGlobals())

const user = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}

const gap = (n: number) => ({ id: `p${n}`, slug: `proj-${n}`, title: `Long Title ${n}`, tier: 1, last_movement: null })

function stub(gaps: ReturnType<typeof gap>[], projects: Record<string, unknown>[] = []) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    const u = String(url)
    const body = u.includes('/api/projects/next-step-gaps')
      ? { data: gaps, count: gaps.length }
      : u.includes('/api/projects') ? { data: projects }
      : { data: [] }
    return { ok: true, status: 200, json: async () => body } as Response
  }))
}

function wrap(node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider>
          <MemoryRouter><div className="tk">{node}</div></MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

describe('NoNextStepCard', () => {
  it('shows the count, short names, five rows and "and N more"', async () => {
    stub([1, 2, 3, 4, 5, 6, 7].map(gap), [{ id: 'p1', slug: 'proj-1', title: 'Long Title 1', short_name: 'Short One', status: 'active' }])
    const host = await mount(wrap(<NoNextStepCard />), { ready: (h) => h.querySelector('[data-testid="no-next-step-count"]'), label: 'count' })
    expect(host.querySelector('[data-testid="no-next-step-count"]')?.textContent).toBe('7')
    expect(host.querySelectorAll('[data-testid^="no-next-step-p"]').length).toBe(5)
    expect(host.querySelector('[data-testid="no-next-step-more"]')?.textContent?.trim()).toBe('and 2 more')
    // projects list arrives after the gaps: the short name replaces the title.
    await waitFor(() => host.querySelector('[data-testid="no-next-step-p1"]')?.textContent?.includes('Short One'), 'short name')
    expect(host.textContent).not.toContain('#')
    expect(host.querySelector('[data-testid="no-next-step-p2"]')?.textContent).toContain('Long Title 2')
  })

  it('opens the create-task modal from "Add next step"', async () => {
    stub([gap(1)])
    const host = await mount(wrap(<NoNextStepCard />), { ready: (h) => h.querySelector('[data-testid="no-next-step-p1"]'), label: 'row' })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Add next step') as HTMLButtonElement
    btn.click()
    await waitFor(() => document.querySelector('[role="dialog"]'), 'create task modal')
    expect(document.body.textContent).toContain('Create New Task')
  })

  it('renders nothing when there are no gaps', async () => {
    stub([])
    const host = await mount(wrap(<NoNextStepCard />), { ready: () => true, label: 'mounted' })
    await new Promise((r) => setTimeout(r, 150))
    expect(host.querySelector('[data-pick="no-next-step"]')).toBeNull()
  })
})
