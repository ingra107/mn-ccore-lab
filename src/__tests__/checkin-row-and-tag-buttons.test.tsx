// Two Today-skin contracts, checked in real Chromium with the skin CSS injected.
//
// 1. A tag rendered as a <button> (the "Check it" / "Ready" packet tags on a
//    This week pick) looks exactly like the <span> tag. The .tk-plan-link reset
//    once stripped its padding and font, so the label touched the pill's edge
//    (Nick, 2026-11-03: "the check it lettering almost goes outside of the
//    pillbox").
//
// 2. A kind='checkin' task is ONE thin line on every surface (Nick 2026-10-30:
//    "a milestone-style kind, one-line row named 'Check in: ...', one-tap
//    done"). SharedTaskRow dispatches on kind, so neither the card nor the
//    standard row can render it as a full card.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
)

const checkin = (extra: Partial<TaskRow> = {}): TaskRow => ({
  id: 'ci1', title: 'Check in: Casey on the abstract', short_title: null, description: '', kind: 'checkin',
  assignee: 'nick-ingraham', assigned_by: null, watchers: null, due_date: null, priority: 'medium', status: 'todo',
  completed: 0, completed_at: null, project_id: 'p', group_override: null, acknowledged_at: '2026-01-01', ...extra,
}) as unknown as TaskRow

describe('tag buttons', () => {
  it('a <button> tag has the same padding, font, height and pill shape as the <span> tag, and its text fits', async () => {
    const host = await mount(
      <div className="tk">
        <span className="tk-tag tk-stale" data-t="span">Check it</span>
        <button type="button" className="tk-tag tk-plan-link tk-stale" data-t="button">Check it</button>
        <button type="button" className="tk-tag tk-plan-link tk-ac" data-t="button-ac">Ready</button>
      </div>,
      { ready: (h) => h.querySelector('[data-t="button"]'), label: 'tag buttons' },
    )
    const span = host.querySelector<HTMLElement>('[data-t="span"]')!
    const btn = host.querySelector<HTMLElement>('[data-t="button"]')!
    const ac = host.querySelector<HTMLElement>('[data-t="button-ac"]')!
    const s = getComputedStyle(span)
    for (const el of [btn, ac]) {
      const b = getComputedStyle(el)
      for (const prop of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'fontSize', 'fontWeight', 'borderTopLeftRadius', 'backgroundColor'] as const) {
        if (el === ac && prop === 'backgroundColor') continue // accent tint differs by design
        expect(b[prop], prop).toBe(s[prop])
      }
      expect(b.borderTopWidth).toBe('0px')
      expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth)
    }
    // The visible pill is the same size: padding is what keeps the text inside it.
    expect(Math.abs(btn.getBoundingClientRect().height - span.getBoundingClientRect().height)).toBeLessThanOrEqual(2)
    expect(parseFloat(getComputedStyle(btn).paddingLeft)).toBeGreaterThanOrEqual(6)
  })
})

describe('check-in row', () => {
  for (const card of [true, false] as const) {
    it(`renders as one thin line, not a card (${card ? 'card' : 'standard'} row), with a one-tap check and a title that opens the task`, async () => {
      const done: string[] = []
      let opened = 0
      const props = {
        task: checkin(), project: { name: 'Mentoring', slug: 'p' }, isDone: false,
        onToggleDone: () => { done.push('x') }, isExpanded: false, onToggleExpand: () => { opened += 1 },
      }
      const host = await mount(
        wrap(<div className="tk" style={{ width: 600 }}>{card ? <SharedTaskRow card {...props} /> : <SharedTaskRow {...props} />}</div>),
        { ready: (h) => h.querySelector('[data-task-kind="checkin"]'), label: `checkin ${card}`, width: '620px' },
      )
      const row = host.querySelector<HTMLElement>('[data-task-kind="checkin"]')!
      expect(host.querySelector('.tk-card')).toBeNull()
      expect(row.textContent).toContain('Check in')
      expect(row.textContent).toContain('Casey on the abstract')
      expect(row.getBoundingClientRect().height).toBeLessThan(40)
      const check = row.querySelector<HTMLButtonElement>('button[aria-label="Mark done"]')!
      check.click()
      expect(done).toHaveLength(1)
      expect(opened).toBe(0) // the check never opens the task
      row.querySelector<HTMLElement>('[data-testid="checkin-title"]')!.click()
      expect(opened).toBe(1)
    })
  }

  it('a done check-in is struck through with the check filled and reopens from the check', async () => {
    const reopened: string[] = []
    const host = await mount(
      wrap(<div className="tk"><SharedTaskRow card task={checkin()} project={null} isDone onToggleDone={() => { reopened.push('x') }} isExpanded={false} onToggleExpand={() => {}} /></div>),
      { ready: (h) => h.querySelector('[data-task-kind="checkin"]'), label: 'checkin done' },
    )
    const title = host.querySelector<HTMLElement>('[data-testid="checkin-title"]')!
    expect(getComputedStyle(title).textDecorationLine).toBe('line-through')
    host.querySelector<HTMLButtonElement>('button[aria-label="Mark not done"]')!.click()
    expect(reopened).toHaveLength(1)
  })
})
