// Phone task card: a tap on the card opens the card, not the plan pin.
//
// Overnight 2026-10-14 prod probe (390x844 touch): on rows with a short title
// the "Plan task for today" pin sits after the title near the card's middle,
// and its -13px touch ::before reached the header's centre. A plain tap meant
// to open the task planned it for today instead (3 of 16 Today rows; blocked
// POSTs on My Tasks and the project page).
//
// Runs in real Chromium with the real index.css text. The touch media queries
// are unwrapped to `@media all` so the test sees the touch rules at any runner.

import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardRow } from '../components/tasks/TaskCardRow'
import type { TaskRow } from '../lib/api'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const touch = (s: string) => s.replace(/@media \(hover: ?none\)/g, '@media all').replace(/@media \(max-width: ?640px\)/g, '@media all')
const tokens = css.slice(css.indexOf('/* ── Stepped-surface tokens'), css.indexOf('/* ── Z-Index Hierarchy'))
const hit = css.slice(css.indexOf('/* N1.08/N1.16'), css.indexOf('/* MeetingActionList selection bar'))
const skin = css.slice(css.indexOf('/* ══ Today skin'))
const style = document.createElement('style')
style.textContent = '*,::before,::after{box-sizing:border-box}\n' + tokens + '\n' + touch(hit) + '\n' + touch(skin)
document.head.appendChild(style)

function task(title: string): TaskRow {
  return {
    id: 't1', title, short_title: null, description: '', assignee: null,
    assigned_by: null, watchers: null, due_date: null, priority: 'medium', status: 'todo',
    completed: 0, completed_at: null, project_id: 'p', group_override: null, acknowledged_at: '2026-01-01',
  } as unknown as TaskRow
}

describe('phone card plan pin', () => {
  for (const title of ['Upgrade CLIFpy 3.0', 'Locate AMPAC/BMAT', 'Aspiration PNA predict', 'Go']) {
    it(`a tap anywhere on the header's middle band of "${title}" opens the card`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      const host = await mount(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <div className="tk">
              <CardRow card task={task(title)} project={{ name: 'CQODE Backbone', slug: 'p' }} isDone={false}
                onToggleDone={() => {}} isExpanded={false} onToggleExpand={() => {}} onTogglePlan={() => {}} />
            </div>
          </MemoryRouter>
        </QueryClientProvider>,
        { ready: (h) => h.querySelector('[data-plan-btn]'), label: 'CardRow', width: '366px' },
      )
      vi.unstubAllGlobals()
      const header = host.querySelector<HTMLElement>('.tk-tch')!
      const pin = host.querySelector<HTMLElement>('[data-plan-btn]')!
      const r = header.getBoundingClientRect()
      const cy = r.top + r.height / 2
      // the centre line, sampled across the whole card width
      for (let x = r.left + 40; x < r.right - 60; x += 4) {
        const at = document.elementFromPoint(x, cy)
        expect(pin.contains(at), `x=${Math.round(x - r.left)} hit the plan pin`).toBe(false)
      }
      // the pin itself is still tappable at its own centre and keeps a 24px+ target
      const p = pin.getBoundingClientRect()
      expect(pin.contains(document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2))).toBe(true)
      const before = getComputedStyle(pin, '::before')
      const h = p.height - parseFloat(before.top) - parseFloat(before.bottom)
      const w = p.width - parseFloat(before.left) - parseFloat(before.right)
      expect(Math.min(h, w)).toBeGreaterThanOrEqual(24)
    })
  }
})
