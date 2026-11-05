// The task card on a phone, measured in Chromium against the real index.css.
//
// Sweep audit H4/M4/M6/H6 (2026-11-05):
// - the context line gets the card's width: an empty slot and the column under
//   the face reserve nothing, so a short project name shows whole and the
//   Planned pill is never cut.
// - the plan pin and grip sit in one fixed place on every card, whatever the
//   title's length and whichever chips it carries.
// - the rail shows urgency, and the Urgent tag still shows beside the title.
// - the row's select control is not a second square beside the complete box.

import '../index.css'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { page } from 'vitest/browser'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardRow } from '../components/tasks/TaskCardRow'
import { DoneBox, SelectBox } from '../components/tasks/TaskRow'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })) })
afterEach(() => { vi.unstubAllGlobals() })

const task = (id: string, title: string, over: Partial<TaskRow> = {}) => ({
  id, title, short_title: null, description: '', assignee: 'nick-ingraham', assigned_by: null, watchers: null,
  due_date: '2026-12-01', priority: 'medium', status: 'todo', completed: 0, completed_at: null, project_id: 'p',
  acknowledged_at: '2026-01-01', ...over,
}) as unknown as TaskRow

const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><div className="tk" style={{ width: 342 }}>{node}</div></MemoryRouter>
  </QueryClientProvider>
)

const props = { card: true as const, isDone: false, onToggleDone: () => {}, isExpanded: false, onToggleExpand: () => {} }

describe('task card on a phone', () => {
  it('shows a short project name whole and does not cut the Planned pill', async () => {
    await page.viewport(390, 844)
    const host = await mount(
      wrap(<CardRow {...props} task={task('a', 'Upload IRB amendment')} project={{ name: 'Vent Practice', slug: 'p' }} isPlanned onTogglePlan={() => {}} />),
      { ready: (h) => h.querySelector('.tk-tch'), label: 'card' },
    )
    const name = host.querySelector<HTMLElement>('.tk-cs a')!
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
    const pill = host.querySelector<HTMLElement>('.planned-chip')!
    // Its text fits its box. (scrollWidth would count the ::before tap zone.)
    const text = document.createRange()
    text.selectNodeContents(pill)
    expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(pill.getBoundingClientRect().right)
    const card = host.querySelector<HTMLElement>('.tk-tc')!.getBoundingClientRect()
    expect(pill.getBoundingClientRect().right).toBeLessThanOrEqual(card.right)
  })

  it('reserves no room for empty slots on the context line', async () => {
    await page.viewport(390, 844)
    const host = await mount(
      wrap(<CardRow {...props} task={task('a', 'A title')} project={{ name: 'P', slug: 'p' }} />),
      { ready: (h) => h.querySelector('.tk-tch'), label: 'card' },
    )
    expect(host.querySelector<HTMLElement>('.tk-slots')!.getBoundingClientRect().width).toBe(0)
  })

  it('keeps a filled meeting slot flush right on every card, links or not', async () => {
    await page.viewport(390, 844)
    const host = await mount(
      wrap(<>
        <CardRow {...props} task={task('a', 'A')} project={null} meetingSlot={<i>m</i>} />
        <CardRow {...props} task={task('b', 'B')} project={null} meetingSlot={<i>m</i>} linksSlot={<i>l</i>} />
      </>),
      { ready: (h) => h.querySelectorAll('.tk-tch').length === 2 ? h : null, label: 'cards' },
    )
    const rights = [...host.querySelectorAll<HTMLElement>('.tk-mks')].map((m) => Math.round(m.getBoundingClientRect().right))
    expect(new Set(rights).size).toBe(1)
  })
})

describe('task card action slots', () => {
  it.each([[390, 844], [1440, 900]])('the grip and pin hold one x on every card at %ipx', async (w, h) => {
    await page.viewport(w, h)
    const host = await mount(
      wrap(<>
        <CardRow {...props} task={task('a', 'Short')} project={null} draggable onTogglePlan={() => {}} />
        <CardRow {...props} task={task('b', 'A longer title that carries a tag and wraps', { acknowledged_at: null })} project={null} draggable onTogglePlan={() => {}} titleTag={<span className="tk-tag">Today</span>} />
        <CardRow {...props} task={task('c', 'Planned by the section')} project={null} draggable />
      </>),
      { ready: (el) => el.querySelectorAll('.tk-grip').length === 3 ? el : null, label: 'cards' },
    )
    const grips = [...host.querySelectorAll<HTMLElement>('.tk-grip')].map((g) => Math.round(g.getBoundingClientRect().right))
    expect(new Set(grips).size).toBe(1)
    const pins = [...host.querySelectorAll<HTMLElement>('[data-plan-btn]')].map((g) => Math.round(g.getBoundingClientRect().right))
    expect(new Set(pins).size).toBe(1)
  })
})

describe('urgency on a card', () => {
  it('is the rail plus screen-reader text, with no visible tag', async () => {
    await page.viewport(1440, 900)
    const host = await mount(
      wrap(<CardRow {...props} task={task('a', 'Urgent one', { priority: 'urgent' })} project={null} />),
      { ready: (h) => h.querySelector('.tk-tch'), label: 'card' },
    )
    expect(host.querySelector('.tk-tc')!.classList.contains('tk-urg')).toBe(true)
    expect(host.querySelector('.tk-urgtag')).toBeNull()
    expect(host.querySelector('.sr-only')!.textContent).toContain('Urgent')
  })
})

describe('select beside complete', () => {
  it('the select control is round, the complete box stays the only square', async () => {
    await page.viewport(390, 844)
    const host = await mount(
      <div>
        <SelectBox on={false} onToggle={() => {}} />
        <DoneBox done={false} onToggle={() => {}} />
      </div>,
      { ready: (h) => h.querySelector('.done-box'), label: 'boxes' },
    )
    expect(getComputedStyle(host.querySelector('.task-selbox')!).borderRadius).toBe('50%')
    expect(getComputedStyle(host.querySelector('.done-box')!).borderRadius).toBe('5px')
  })
})
