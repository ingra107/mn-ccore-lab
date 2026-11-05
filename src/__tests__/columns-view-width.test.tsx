// Guards My Tasks Columns width (Nick 2026-10-10: "Columns may go full width").
//
// At the width Columns gets on a 1440 viewport (about 1,070px, the page less its gutters) five columns
// must fit with no scroll control (an empty section hides, so five populated
// sections is the common full page; all seven would scroll by design). Narrower, the grid scrolls, and the scroll
// control must not sit on a column header or the Overdue banner (the overlay
// "›" button and right-edge fade did, 2026-10-10 evaluation section 1).
//
// Real Chromium (vitest.config.ts browser mode), so the layout is measured.

import '../index.css'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { page } from 'vitest/browser'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ColumnsView } from '../pages/MyTasks/views/ColumnsView'
import type { TaskRow } from '../lib/api'
import type { SectionKey } from '../lib/taskSections'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const overdue = { id: 't1', title: 'Late task', status: 'todo', due_date: '2020-01-01' } as unknown as TaskRow
const card = (id: string) => ({ ...overdue, id }) as TaskRow
const byGroup: Record<SectionKey, TaskRow[]> = {
  sort: [], review: [card('a')], writing: [card('b')], analysis: [card('c')], admin: [card('d')], etl: [card('e')], others: [],
}

async function render(width: number): Promise<HTMLElement> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div style={{ height: 600, display: 'flex', flexDirection: 'column' }}>
          <ColumnsView
            filtered={Object.values(byGroup).flat()} isEmpty={false} byGroup={byGroup}
            onOpenEditor={() => {}} projectsByPid={new Map()}
          />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelectorAll('h3').length === 5, label: 'ColumnsView', width: `${width}px` },
  )
  // Let the ResizeObserver measure and React commit the pager.
  await new Promise((r) => setTimeout(r, 100))
  return host
}

const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describe('My Tasks Columns width', () => {
  it('runs to the page edge: the view keeps the shared left edge and gives up the right gutter', async () => {
    await page.viewport(1440, 900)
    const host = await render(1130)
    const band = host.querySelector<HTMLElement>('.band-anchored-full')!
    expect(getComputedStyle(band).marginRight).toBe('12px')
    expect(getComputedStyle(band).marginLeft).toBe('48px') // --band-pad at 1024 and up: the shared left edge
  })

  it('fits all five columns at the 1440-viewport width with no scroll control', async () => {
    const host = await render(1130)
    expect(host.querySelector('[data-testid="columns-pager"]')).toBeNull()
    const right = host.getBoundingClientRect().right
    for (const h of host.querySelectorAll('h3')) expect(h.getBoundingClientRect().right).toBeLessThanOrEqual(right)
  })

  it('when it must scroll, the control covers no header and no banner', async () => {
    const host = await render(930)
    const pager = host.querySelector('[data-testid="columns-pager"]')
    expect(pager).not.toBeNull()
    const p = pager!.getBoundingClientRect()
    const banner = host.querySelector('[role="status"]')!.getBoundingClientRect()
    expect(overlaps(p, banner)).toBe(false)
    for (const h of host.querySelectorAll('h3')) expect(overlaps(p, h.parentElement!.getBoundingClientRect())).toBe(false)
  })
})
