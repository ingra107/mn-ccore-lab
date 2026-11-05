// Nick's pick, 2026-11-05 (audit M11): a page's one primary action is solid teal,
// --teal-solid with white text, read here off the computed style against the real
// stylesheet. A secondary action beside it stays quiet.

import '../index.css'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import QuickAddForm from '../components/QuickAddForm'
import Projects from '../pages/Projects'
import ManuscriptsPage from '../pages/portal/ManuscriptsPage'
import { TopBar } from '../pages/MyTasks/components/TopBar'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const TEAL_SOLID = 'rgb(13, 111, 104)'
// --ink-bright is white, written in oklch.
const WHITE = ['rgb(255, 255, 255)', 'oklch(1 0 0)']

const pi: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: true, piResolved: true,
}

const realFetch = window.fetch
beforeEach(() => {
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const data = url.includes('/api/manuscripts/attention') ? { revisions_overdue: [], awaiting_review: [], stale_drafts: [] } : []
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof window.fetch
})
afterEach(() => { window.fetch = realFetch })

const tree = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthContext.Provider value={{ user: pi, isAuthenticated: true, isLoading: false }}>
      <UndoToastProvider><MemoryRouter>{node}</MemoryRouter></UndoToastProvider>
    </AuthContext.Provider>
  </QueryClientProvider>
)

const button = (h: ParentNode, word: string) => [...h.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes(word))

function expectSolid(el: HTMLElement) {
  const s = getComputedStyle(el)
  expect(s.backgroundColor).toBe(TEAL_SOLID)
  expect(WHITE).toContain(s.color)
}

describe('The primary action is solid teal', () => {
  it('Projects: New Project', async () => {
    const host = await mount(tree(<Projects />), { ready: (h) => button(h, 'New Project'), label: 'New Project' })
    expectSolid(button(host, 'New Project')!)
  })

  it('Manuscripts: New Manuscript, keeping the hook the journey spec clicks', async () => {
    const host = await mount(tree(<ManuscriptsPage />), { ready: (h) => button(h, 'New Manuscript'), label: 'New Manuscript' })
    const b = button(host, 'New Manuscript')!
    expectSolid(b)
    expect(b.classList.contains('new-project-btn')).toBe(true)
  })

  it('Tasks: Create Task', async () => {
    const host = await mount(tree(
      <TopBar
        view="list" setView={() => {}} search="" setSearch={() => {}}
        filter={{ priority: null, status: null, project: null, mentee: null, group: null, hideCompleted: true }} setFilter={() => {}}
        quickView="all" setQuickView={() => {}} taskCount={3} projectOptions={[]}
        currentQuery="" onApplyView={() => {}} onCreateTask={() => {}}
      />,
    ), { ready: (h) => button(h, 'Create Task'), label: 'Create Task' })
    expectSolid(button(host, 'Create Task')!)
  })

  it('Meetings: the Record Meeting trigger is primary only where the page asks for it', async () => {
    const host = await mount(tree(
      <>
        <QuickAddForm primary isOpen={false} onToggle={() => {}} onSubmit={() => {}} onCancel={() => {}} triggerLabel="Record Meeting">{null}</QuickAddForm>
        <QuickAddForm isOpen={false} onToggle={() => {}} onSubmit={() => {}} onCancel={() => {}} triggerLabel="Add Action Item">{null}</QuickAddForm>
      </>,
    ), { ready: (h) => button(h, 'Add Action Item'), label: 'triggers' })
    expectSolid(button(host, 'Record Meeting')!)
    expect(getComputedStyle(button(host, 'Add Action Item')!).backgroundColor).not.toBe(TEAL_SOLID)
  })
})
