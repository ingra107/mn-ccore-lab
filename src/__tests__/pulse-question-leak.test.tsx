// /pulse counts open and overdue tasks. A question for Nick (kind='question')
// has due_date = its snooze date, so a leaked one reads as an overdue task from
// day two. fetchTasks drops it; this renders the page with one question and one
// ordinary overdue task coming back from /api/tasks and checks the page counts one.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import Pulse from '../pages/Pulse'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => vi.unstubAllGlobals())

const task = (id: string, kind: string) => ({
  id, title: id, description: id, assignee: 'nick-ingraham', kind, status: 'todo', priority: 'medium',
  due_date: '2020-01-01', completed: 0, completed_at: null, created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z',
})

describe('Pulse with a question row in /api/tasks', () => {
  it('counts the ordinary task, not the question', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: String(url).startsWith('/api/tasks') ? [task('q1', 'question'), task('t1', 'task')] : [] }),
    })))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const member = { email: 'a@umn.edu', slug: 'a', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true } as AuthUser
    const host = await mount(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ user: member, isAuthenticated: true, isLoading: false }}>
          <Pulse />
        </AuthContext.Provider>
      </QueryClientProvider>,
      { ready: (h) => /[1-9]\d* active tasks/.test(h.textContent ?? ''), label: 'Pulse task count' },
    )
    expect(host.textContent).toMatch(/\b1 active tasks/)
    expect(host.textContent).not.toMatch(/\b2 active tasks/)
  })
})
