// #153 moved an entry's reactions and Reply into CollapsibleBody's `actions`
// row. Code review (#156 session close): that row must still show while a
// Hermes answer is pending and while a comment is being edited, as the
// standalone row did before. Runs in real Chromium.
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider } from '../components/UndoToast'
import { ActivityEntryItem } from '../components/activity/activityRender'
import { HERMES_PENDING_PLACEHOLDER } from '../components/hermesPendingUtil'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => vi.unstubAllGlobals())

const user = { email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true, canShowAllProjects: false, piResolved: true }

function wrap(node: ReactElement): ReactElement {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <UndoToastProvider><MemoryRouter>{node}</MemoryRouter></UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const entry = (over: Record<string, unknown>) => ({
  id: 'e1', entity_type: 'project', entity_id: 'p1', project_id: 'p1', kind: 'comment', visibility: 'team',
  actor_slug: 'nick-ingraham', body: 'Draft sent to the DSMB.', mentions_json: null, update_type: null,
  metadata_json: null, created_at: '2026-10-26 13:40:00', reply_count: 0, ...over,
}) as never

const labels = (h: HTMLElement) => [...h.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '')

describe('entry actions row', () => {
  it('a pending Hermes answer keeps its reactions (Reply waits for the answer)', async () => {
    const host = await mount(wrap(<ActivityEntryItem entry={entry({ actor_slug: 'claude-ai', body: HERMES_PENDING_PLACEHOLDER })} showReactions onReply={() => {}} />), {
      ready: (h) => h.querySelector('[data-activity-id], .detail-card, div'), label: 'ActivityEntryItem',
    })
    await expect.poll(() => labels(host)).toContain('Add reaction')
    expect(labels(host)).not.toContain('Reply')
  })

  it('a comment being edited keeps its reactions and Reply under the editor', async () => {
    const host = await mount(wrap(<ActivityEntryItem entry={entry({})} showReactions onReply={() => {}} onEdit={() => {}} />), {
      ready: (h) => h.querySelector('[aria-label="Edit comment"]'), label: 'ActivityEntryItem',
    })
    host.querySelector<HTMLButtonElement>('[aria-label="Edit comment"]')!.click()
    await expect.poll(() => host.querySelector('textarea')).toBeTruthy()
    expect(labels(host)).toContain('Add reaction')
    expect(labels(host)).toContain('Reply')
  })
})
