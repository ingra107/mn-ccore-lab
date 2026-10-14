// Loading is not empty: a number or an empty state must not be drawn from data
// that has not arrived. Real Chromium, the real StatLine and the real
// project-picker hook against a stubbed fetch.
import { describe, it, expect, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatLine } from '../components/today/StatLine'
import { useProjects } from '../hooks/useApiData'
import { useProjectPickerList } from '../hooks/useProjectPickerList'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const zero = { overdue: 0, stalled: 0, planned: 0, meetings: 0, doneToday: 0 }

describe('StatLine pending', () => {
  it('shows a dash and says loading for a stat whose query is pending, a number for the rest', async () => {
    const host = await mount(
      <MemoryRouter>
        <StatLine
          counts={{ ...zero, overdue: 3 }}
          doneThisWeek={0}
          pending={{ planned: true, 'done-week': true }}
        />
      </MemoryRouter>,
      { ready: (h) => h.querySelector('.tk-stats'), label: 'StatLine' },
    )
    const stat = (k: string) => [...host.querySelectorAll('.tk-st')].find((e) => (e.getAttribute('aria-label') ?? '').includes(k))!
    expect(stat('planned').getAttribute('aria-label')).toBe('planned: loading')
    expect(stat('planned').querySelector('.tk-v')!.textContent).toBe('–')
    expect(stat('planned').getAttribute('aria-busy')).toBe('true')
    expect(stat('this week').getAttribute('aria-label')).toBe('done this week: loading')
    // A settled stat is still a real number, and a non-zero one still links.
    expect(stat('overdue').querySelector('.tk-v')!.textContent).toBe('3')
    expect(stat('overdue').tagName).toBe('A')
    // A settled zero is a real zero.
    expect(stat('stalled').getAttribute('aria-label')).toBe('0 stalled')
  })
})

describe('StatLine failed and day progress', () => {
  it('an errored query reads "unavailable", not a false 0, and progress is not "0 of 0" while unknown', async () => {
    const host = await mount(
      <MemoryRouter>
        <StatLine counts={zero} doneThisWeek={0} pending={{ planned: true, done: true }} failed={{ meetings: true }} />
      </MemoryRouter>,
      { ready: (h) => h.querySelector('.tk-stats'), label: 'StatLine' },
    )
    const stat = (k: string) => [...host.querySelectorAll('.tk-st')].find((e) => (e.getAttribute('aria-label') ?? '').includes(k))!
    expect(stat('meeting').getAttribute('aria-label')).toBe('meetings: unavailable')
    expect(stat('meeting').getAttribute('aria-busy')).toBeNull()
    expect(stat('meeting').querySelector('.tk-v')!.textContent).toBe('–')
    expect(host.querySelector('.tk-stats')!.getAttribute('title')).toBe('Day progress: not loaded')
  })
})

describe('project picker shares the list cache', () => {
  it('one /api/projects request serves the list and the picker', async () => {
    let calls = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/projects')) calls++
      return new Response(JSON.stringify({ data: [{ id: 'proj_1', slug: 'p1', title: 'Project One', short_name: 'P1' }], count: 1 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    function Both() {
      const list = useProjects()
      const picker = useProjectPickerList()
      return <span data-testid="out">{list.data?.length ?? 'x'}|{picker.data?.[0]?.title ?? 'x'}|{picker.data?.[0]?.short_name ?? 'x'}</span>
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = await mount(
      <QueryClientProvider client={qc}><Both /></QueryClientProvider>,
      { ready: (h) => h.querySelector('[data-testid="out"]')?.textContent === '1|Project One|P1', label: 'both hooks resolved' },
    )
    await waitFor(() => host.querySelector('[data-testid="out"]'), 'out')
    expect(calls).toBe(1)
  })
})
