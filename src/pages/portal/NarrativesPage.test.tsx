// Research Narratives (cold audit 2, G20): a related paper lives on the public
// site, so its link says so and leaves the portal open behind it.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NarrativesPage from './NarrativesPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mounted: { host: HTMLElement; root: Root }[] = []
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{
    id: 'arc1', title: 'An arc', projectCount: 1, connectedCount: 0, stageDistribution: [], sharedTopics: [],
    projects: [{ slug: 'p-1', title: 'A project', home_kind: null, home_stage: null, stage_label: null }],
    relatedPubs: [{ id: 'pub1', title: 'A related paper', year: 2024 }],
  }] })))
})

afterEach(() => {
  mounted.forEach(({ host, root }) => { act(() => root.unmount()); host.remove() })
  mounted = []
  vi.unstubAllGlobals()
})

describe('NarrativesPage', () => {
  it('a related publication opens the public page in a new tab and says where it goes', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter><NarrativesPage /></MemoryRouter>
        </QueryClientProvider>,
      )
    })
    mounted.push({ host, root })
    await expect.poll(() => host.textContent).toContain('A related paper')
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent?.includes('A related paper'))!
    expect(link.getAttribute('href')).toBe('/publications/pub1')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('title')).toMatch(/public site/i)
  })
})
