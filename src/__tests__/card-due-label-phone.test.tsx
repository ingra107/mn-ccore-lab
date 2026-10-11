// Phone task cards: the due label never clips; the project name gives way.
//
// The 640px context-line rule shrank every pill except the project, spacer,
// faces and slots. It outranked `.tk-duepill{flex-shrink:0}`, and the
// non-overdue labels ("Due today", "Tomorrow") did not carry tk-duepill at
// all, so on a 390px phone "Due today" read "Due t" and "1d" read "1c"
// (evaluation items 1, 2, 28: Today, My Tasks List and the project page all
// render this CardRow).
//
// Runs in real Chromium with the Today skin CSS injected. The phone media
// queries are unwrapped to `@media all` so the test sees the phone layout at
// any runner viewport.

import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardRow } from '../components/tasks/TaskCardRow'
import type { TaskRow } from '../lib/api'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const tokens = css.slice(css.indexOf('/* ── Stepped-surface tokens'), css.indexOf('/* ── Z-Index Hierarchy'))
const skin = css.slice(css.indexOf('/* ══ Today skin')).replace(/@media \(max-width: ?640px\)/g, '@media all')
const style = document.createElement('style')
style.textContent = '*,::before,::after{box-sizing:border-box}\n' + tokens + '\n' + skin
document.head.appendChild(style)

function localDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function task(id: string, due: string): TaskRow {
  return {
    id, title: 'Schedule SBO data meeting', short_title: null, description: '', assignee: null,
    assigned_by: null, watchers: null, due_date: due, priority: 'medium', status: 'todo',
    completed: 0, completed_at: null, project_id: 'p', group_override: null, acknowledged_at: '2026-01-01',
  } as unknown as TaskRow
}

const LONG = { name: 'CQODE-CLIF ETL and a much longer project name that cannot fit', slug: 'p' }

describe('phone card context line', () => {
  for (const [label, offset] of [['due today', 0], ['tomorrow', 1], ['overdue', -3]] as const) {
    it(`keeps the ${label} label whole and truncates the project instead`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      const host = await mount(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <div className="tk">
              <CardRow card task={task(label, localDay(offset))} project={LONG} isDone={false}
                onToggleDone={() => {}} isExpanded={false} onToggleExpand={() => {}} />
            </div>
          </MemoryRouter>
        </QueryClientProvider>,
        { ready: (h) => h.querySelector('.tk-ctx .tk-pill'), label: 'CardRow', width: '366px' },
      )
      vi.unstubAllGlobals()
      const pill = host.querySelector<HTMLElement>('.tk-ctx .tk-pill')!
      const project = host.querySelector<HTMLElement>('.tk-ctx .tk-cs')!
      expect(pill.classList.contains('tk-duepill')).toBe(true)
      expect(pill.scrollWidth).toBeLessThanOrEqual(pill.clientWidth + 1)
      expect(project.scrollWidth).toBeGreaterThan(project.clientWidth)
    })
  }
})
