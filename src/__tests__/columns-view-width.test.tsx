// Guards My Tasks Columns width (Nick 2026-10-10: "Columns may go full width").
//
// At the width Columns gets on a 1440 viewport (about 1,034px) all five columns
// must fit with no scroll control. Narrower, the grid scrolls, and the scroll
// control must not sit on a column header or the Overdue banner (the overlay
// "›" button and right-edge fade did, 2026-10-10 evaluation section 1).
//
// Real Chromium (vitest.config.ts browser mode), so the layout is measured.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ColumnsView } from '../pages/MyTasks/views/ColumnsView'
import type { TaskRow } from '../lib/api'
import type { GroupKey } from '../pages/MyTasks/constants'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const overdue = { id: 't1', title: 'Late task', status: 'todo', due_date: '2020-01-01' } as unknown as TaskRow
const byGroup: Record<GroupKey, TaskRow[]> = { deep: [], priorities: [], quick: [], pb: [], etl: [] }

async function render(width: number): Promise<HTMLElement> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div style={{ height: 600, display: 'flex', flexDirection: 'column' }}>
          <ColumnsView
            filtered={[overdue]} isEmpty={false} byGroup={byGroup}
            selected={new Set()} toggleSelect={() => {}} selectRange={() => {}} anchorId={null}
            onToggleComplete={() => {}} onOpenEditor={() => {}} expanded={null} setExpanded={() => {}}
            projectsByPid={new Map()} plannedSet={new Set()}
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
  it('fits all five columns at the 1440-viewport width with no scroll control', async () => {
    const host = await render(1034)
    expect(host.querySelector('[data-testid="columns-pager"]')).toBeNull()
    const right = host.getBoundingClientRect().right
    for (const h of host.querySelectorAll('h3')) expect(h.getBoundingClientRect().right).toBeLessThanOrEqual(right)
  })

  it('when it must scroll, the control covers no header and no banner', async () => {
    const host = await render(870)
    const pager = host.querySelector('[data-testid="columns-pager"]')
    expect(pager).not.toBeNull()
    const p = pager!.getBoundingClientRect()
    const banner = host.querySelector('[role="status"]')!.getBoundingClientRect()
    expect(overlaps(p, banner)).toBe(false)
    for (const h of host.querySelectorAll('h3')) expect(overlaps(p, h.parentElement!.getBoundingClientRect())).toBe(false)
  })
})
