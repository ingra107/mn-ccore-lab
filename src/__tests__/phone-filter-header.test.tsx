// Tighter phone headers (Nick's mock, 2026-11-05): on a phone the Tasks words and
// chips live behind Filters, every one of them still reachable, and the button counts
// what is on. A row that scrolls sideways fades the edge it continues past.
import '../index.css'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TopBar } from '../pages/MyTasks/components/TopBar'
import { FilterLinks } from '../components/ui/FilterLinks'
import { SegmentedToggle } from '../components/ui/SegmentedToggle'
import type { FilterState, QuickViewKey, ViewMode } from '../pages/MyTasks/constants'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(async () => { await page.viewport(1280, 900) })

const empty: FilterState = { priority: null, status: null, project: null, mentee: null, group: null, hideCompleted: true }

function Bar({ start = empty, quick = 'all' as QuickViewKey, initialSearch = '' }: { start?: FilterState; quick?: QuickViewKey; initialSearch?: string }) {
  const [filter, setFilter] = useState(start)
  const [quickView, setQuickView] = useState<QuickViewKey>(quick)
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState(initialSearch)
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TopBar
          view={view} setView={setView} search={search} setSearch={setSearch}
          filter={filter} setFilter={setFilter} quickView={quickView} setQuickView={setQuickView}
          taskCount={3} projectOptions={[]} currentQuery="" onApplyView={() => {}} onCreateTask={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const filtersBtn = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('.tk-filters-btn')

describe('Tasks header on a phone', () => {
  it('puts the quick views and chips behind Filters, with search on that row', async () => {
    await page.viewport(390, 844)
    const host = await mount(<Bar />, { ready: filtersBtn, label: 'TopBar', width: '390px' })
    expect(host.querySelector('[aria-label="Quick view"]')).toBeNull()
    expect(host.textContent).not.toContain('Priority')
    const search = host.querySelector<HTMLElement>('input[aria-label="Search tasks"]')!
    const btn = filtersBtn(host)!
    expect(Math.abs(search.getBoundingClientRect().top - btn.getBoundingClientRect().top)).toBeLessThan(8)
    const create = [...host.querySelectorAll('button')].find((b) => /Create Task/.test(b.textContent ?? ''))!
    expect(create.getBoundingClientRect().right).toBeLessThanOrEqual(390)
    expect(create.getBoundingClientRect().bottom).toBeLessThanOrEqual(search.getBoundingClientRect().top)
  })

  it('reaches everything that moved from the sheet, and the count follows', async () => {
    await page.viewport(390, 844)
    const host = await mount(<Bar />, { ready: filtersBtn, label: 'TopBar', width: '390px' })
    expect(filtersBtn(host)!.getAttribute('aria-label')).toBe('Filters')
    filtersBtn(host)!.click()
    const sheet = await vi.waitFor(() => {
      const s = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters"]')
      expect(s).not.toBeNull()
      return s!
    })
    for (const w of ['All', 'New', 'Today', 'Planned', 'Done today', 'Overdue', 'Waiting on', 'Stale', 'Declined', 'Section', 'Priority', 'Status', 'Project', 'Mentee', 'Show completed']) {
      expect(sheet.textContent).toContain(w)
    }
    ;[...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Overdue')!.click()
    await vi.waitFor(() => expect(filtersBtn(host)!.getAttribute('aria-label')).toBe('Filters, 1 on'))
    expect(filtersBtn(host)!.textContent).toBe('Filters1')
    ;[...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Clear all')!.click()
    await vi.waitFor(() => expect(filtersBtn(host)!.getAttribute('aria-label')).toBe('Filters'))
  })

  it('counts a filter a link arrived with', async () => {
    await page.viewport(390, 844)
    const host = await mount(<Bar start={{ ...empty, priority: 'urgent' }} quick="overdue" />, { ready: filtersBtn, label: 'TopBar', width: '390px' })
    expect(filtersBtn(host)!.getAttribute('aria-label')).toBe('Filters, 2 on')
  })

  // Show completed widens the list, so it is not a filter the count may claim.
  it('does not count Show completed', async () => {
    await page.viewport(390, 844)
    const host = await mount(<Bar start={{ ...empty, hideCompleted: false }} />, { ready: filtersBtn, label: 'TopBar', width: '390px' })
    expect(filtersBtn(host)!.getAttribute('aria-label')).toBe('Filters')
  })

  // One clearAll: chips, quick view and search go; Show completed stays as set.
  it.each([[390, 844, 'phone'], [1280, 900, 'wide']] as const)('Clear all does the same on %i (%s)', async (w, h, kind) => {
    await page.viewport(w, h)
    const host = await mount(<Bar start={{ ...empty, priority: 'urgent', hideCompleted: false }} quick="overdue" initialSearch="irb" />, {
      ready: (x) => x.querySelector('input[aria-label="Search tasks"]'), label: 'TopBar', width: `${Math.min(w, 1100)}px`,
    })
    if (kind === 'phone') {
      await vi.waitFor(() => expect(filtersBtn(host)).not.toBeNull())
      filtersBtn(host)!.click()
    }
    const root = () => (kind === 'phone' ? document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters"]')! : host)
    await vi.waitFor(() => expect(root()).not.toBeNull())
    const clear = await vi.waitFor(() => {
      const b = [...root().querySelectorAll('button')].find((x) => x.textContent === 'Clear all')
      expect(b).toBeTruthy()
      return b!
    })
    clear.click()
    await vi.waitFor(() => expect(host.querySelector<HTMLInputElement>('input[aria-label="Search tasks"]')!.value).toBe(''))
    expect([...root().querySelectorAll('button')].some((b) => b.textContent === 'Hide completed')).toBe(true)
    expect([...root().querySelectorAll('[aria-label="Quick view"] [aria-pressed="true"]')].map((b) => b.textContent)).toEqual(['All'])
  })

  it('keeps the words and chips on the row at a wide width', async () => {
    await page.viewport(1280, 900)
    const host = await mount(<Bar />, { ready: (h) => h.querySelector('[aria-label="Quick view"]'), label: 'TopBar', width: '1100px' })
    expect(filtersBtn(host)).toBeNull()
    expect(host.textContent).toContain('Priority')
  })
})

describe('edge fade', () => {
  const opts = ['Alpha one', 'Beta two', 'Gamma three', 'Delta four', 'Epsilon five', 'Zeta six'].map((label, i) => ({ value: String(i), label }))

  it('marks a scrolling filter row at the edge it continues past, and drops the mark at the end', async () => {
    await page.viewport(390, 844)
    const host = await mount(<div style={{ width: 160 }}><FilterLinks className="tk-flt-scroll" options={opts} value="0" onChange={() => {}} /></div>, {
      ready: (h) => h.querySelector('.tk-flt'), label: 'FilterLinks',
    })
    const row = host.querySelector<HTMLElement>('.tk-flt')!
    await vi.waitFor(() => expect(row.dataset.fade).toBe('end'))
    row.scrollLeft = 40
    await vi.waitFor(() => expect(row.dataset.fade).toBe('both'))
    row.scrollLeft = row.scrollWidth
    await vi.waitFor(() => expect(row.dataset.fade).toBe('start'))
    expect(getComputedStyle(row).maskImage).toContain('linear-gradient')
  })

  it('marks a scrolling tray, and leaves a row that fits alone', async () => {
    await page.viewport(390, 844)
    const host = await mount(
      <>
        <div style={{ width: 160 }}><SegmentedToggle scrollable options={opts} value="0" onChange={() => {}} ariaLabel="tight" /></div>
        <div style={{ width: 360 }}><FilterLinks className="tk-flt-scroll" options={opts.slice(0, 2)} value="0" onChange={() => {}} ariaLabel="roomy" /></div>
      </>,
      { ready: (h) => h.querySelector('.tk-seg'), label: 'rows' },
    )
    await vi.waitFor(() => expect(host.querySelector<HTMLElement>('.tk-seg')!.dataset.fade).toBe('end'))
    expect(host.querySelector<HTMLElement>('[aria-label="roomy"]')!.dataset.fade).toBeUndefined()
  })
})
