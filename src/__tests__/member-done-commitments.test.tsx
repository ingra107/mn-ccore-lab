// Rule 43: a parent opacity multiplies with its children, so a done commitment
// is marked by strikethrough and the muted token, never by dimming the block
// (fable-audit-2 G18). Real Chromium; the real MemberPage.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../components/UndoToast'
import MemberPage from '../pages/MemberPage'
import { mount, cleanupMountsAfterEach } from './testMount'

vi.mock('../hooks/useCommitments', () => ({
  useCommitments: () => ({
    data: [{
      id: 'c1', commitment: 'Send the revised figure', status: 'done', to_slug: 'nick-ingraham', to_whom: 'Nick',
      from_slug: null, due_date: null, source: 'meeting: Lab', created_at: '2026-10-01 00:00:00', completed_at: '2026-10-02 00:00:00',
    }],
  }),
}))

cleanupMountsAfterEach()
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

describe('a done commitment', () => {
  it('reads at full opacity from the page down, struck through in the muted token', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: [], count: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = await mount(
      <QueryClientProvider client={qc}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={['/team/nick-ingraham']}>
            <Routes><Route path="/team/:slug" element={<MemberPage />} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </QueryClientProvider>,
      { ready: (h) => /Send the revised figure/.test(h.textContent ?? ''), label: 'done commitment' },
    )
    const text = [...host.querySelectorAll<HTMLElement>('div')].filter((d) => d.textContent === 'Send the revised figure').pop()!
    expect(text.style.textDecorationLine || text.style.textDecoration).toMatch(/line-through/)
    expect(text.style.color).toBe('var(--muted)')
    // No inline dim on the text or the block around it (framer's own card opacity animates to 1).
    expect(text.style.opacity === '' || text.style.opacity === '1').toBe(true)
    const section = host.querySelector<HTMLElement>('#commitments')!
    for (let el: HTMLElement | null = text.parentElement; el && el !== section; el = el.parentElement) {
      if (el.classList.contains('card')) continue
      expect(el.style.opacity === '' || el.style.opacity === '1', `<${el.tagName}> carries opacity ${el.style.opacity}`).toBe(true)
    }
  })
})
