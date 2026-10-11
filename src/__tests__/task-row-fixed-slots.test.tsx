// Two task-row layout contracts from the 2026-10-10 prod site audit.
//
// 1. Card title tail (My Tasks List / Today): the plan pin after the title is
//    hidden until hover. In the text flow it wrapped onto a line of its own
//    when the title nearly filled its last line, so the card grew an empty
//    second line ("CLIF 3.0 baseline + acute dists" at 390px). The tail is
//    zero-width now: whatever the title length, the title block is exactly as
//    tall as the title text, and the pin never reaches the right column.
//
// 2. Narrow-rail rows (My Tasks Columns, 196px): the due label wrapped under
//    the project at a different spot per card, and a long project name was cut
//    with no ellipsis. Now project and due share one line, the due label ends
//    at the same x on every row, and the project name ellipsizes.
//
// Runs in real Chromium with the Today skin CSS injected.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardRow } from '../components/tasks/TaskCardRow'
import { TaskRow as SharedTaskRow } from '../components/tasks/TaskRow'
import type { TaskRow } from '../lib/api'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })) })
afterEach(() => { vi.unstubAllGlobals() })

const tokens = css.slice(css.indexOf('/* ── Stepped-surface tokens'), css.indexOf('/* ── Z-Index Hierarchy'))
const skin = css.slice(css.indexOf('/* ══ Today skin')).replace(/@media \(max-width: ?640px\)/g, '@media all')
const style = document.createElement('style')
style.textContent = '*,::before,::after{box-sizing:border-box}\n' + tokens + '\n' + skin
document.head.appendChild(style)

function task(id: string, title: string, due: string | null = null): TaskRow {
  return {
    id, title, short_title: null, description: '', assignee: 'nick-ingraham',
    assigned_by: null, watchers: null, due_date: due, priority: 'medium', status: 'todo',
    completed: 0, completed_at: null, project_id: 'p', group_override: null, acknowledged_at: '2026-01-01',
  } as unknown as TaskRow
}

const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
)

describe('card title tail', () => {
  it('a hidden plan pin never adds a line or reaches the right column, at any title length', async () => {
    // Step the title one word at a time across several wrap points.
    const words = 'CLIF 3.0 baseline + acute dists for the CQODE cohort and the second site rerun'.split(' ')
    for (let n = 2; n <= words.length; n++) {
      const title = words.slice(0, n).join(' ')
      const host = await mount(
        wrap(
          <div className="tk">
            <CardRow card task={task(`t${n}`, title)} project={{ name: 'CQODE-CLIF ETL', slug: 'p' }} isDone={false}
              onToggleDone={() => {}} isExpanded={false} onToggleExpand={() => {}} onTogglePlan={() => {}} />
          </div>,
        ),
        { ready: (h) => h.querySelector('button[data-plan-btn]'), label: `CardRow ${n}`, width: '366px' },
      )
      const ct = host.querySelector<HTMLElement>('.tk-ct')!
      const text = ct.querySelector<HTMLElement>('.tk-ct > span:not(.tk-tail):not(.sr-only)') ?? ct.firstElementChild as HTMLElement
      const pin = host.querySelector<HTMLElement>('button[data-plan-btn]')!
      const right = host.querySelector<HTMLElement>('.tk-tr-r')!
      const lines = new Set([...text.getClientRects()].map((r) => Math.round(r.top))).size
      const lineH = parseFloat(getComputedStyle(ct).lineHeight)
      expect(ct.getBoundingClientRect().height, title).toBeLessThanOrEqual(lines * lineH + 1)
      expect(pin.getBoundingClientRect().right, title).toBeLessThanOrEqual(right.getBoundingClientRect().left + 0.5)
    }
  })
})

describe('narrow-rail row context line', () => {
  it('keeps the due label on the project line, at one x on every row, and ellipsizes the project', async () => {
    const projects = [
      { name: 'ADHERE-LPV', slug: 'a' },
      { name: 'Epic Physician Builder Certification', slug: 'b' },
      { name: 'C-QODE Real World Data', slug: 'c' },
    ]
    const host = await mount(
      wrap(
        <div className="tk" style={{ width: 196 }}>
          {projects.map((p, i) => (
            <SharedTaskRow key={p.slug} stack task={task(`s${i}`, 'Sign up for Epic Physician Builder class', '2026-12-01')}
              project={p} isDone={false} onToggleDone={() => {}} isExpanded={false} onToggleExpand={() => {}} />
          ))}
        </div>,
      ),
      { ready: (h) => h.querySelectorAll('[aria-label^="Due "]').length === 3 ? h : null, label: 'stack rows', width: '196px' },
    )
    const dues = [...host.querySelectorAll<HTMLElement>('[aria-label^="Due "]')]
    const links = [...host.querySelectorAll<HTMLElement>('a[aria-label^="Open "]')]
    const rights = dues.map((d) => Math.round(d.getBoundingClientRect().right))
    expect(new Set(rights).size).toBe(1)
    dues.forEach((d, i) => {
      const a = d.getBoundingClientRect(), b = links[i].getBoundingClientRect()
      expect(Math.abs(a.top + a.height / 2 - (b.top + b.height / 2))).toBeLessThan(3) // same line
    })
    const long = links[1]
    expect(long.scrollWidth).toBeGreaterThan(long.clientWidth)
    expect(getComputedStyle(long).textOverflow).toBe('ellipsis')
    expect(long.getAttribute('title')).toBe('Epic Physician Builder Certification')
  })
})
