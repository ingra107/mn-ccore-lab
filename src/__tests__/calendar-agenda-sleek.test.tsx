// Calendar Agenda on the shared sleek row (eval item 87): day headings over
// one panel of sleek rows, no "Task" pill on every row, the kind as one quiet
// glyph, Today's Urgent tag and owner face on a task, and the click contract:
// a row click opens the event's page, the title is a real link (Tab + Enter,
// ctrl-click in a new tab) whose click is not doubled by the row.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgendaView } from '../pages/portal/CalendarPage'
import type { CalendarEvent } from '../lib/api'
import { localDateKey } from '../lib/dateUtils'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

const today = localDateKey()
const later = localDateKey(new Date(Date.now() + 3 * 864e5))
const past = localDateKey(new Date(Date.now() - 3 * 864e5))

const events: CalendarEvent[] = [
  { id: 'm1', date: today, title: 'Lab meeting', type: 'meeting', category: 'biweekly' },
  { id: 't1', date: today, title: 'Submit the long-named data core synthesis', short_title: 'Data core synthesis', type: 'task', category: 'urgent', meta: { assignee: 'nick-ingraham', status: 'in_progress' } },
  { id: 't2', date: later, title: 'Plain task', type: 'task', category: 'medium', meta: { assignee: 'nick-ingraham', status: 'todo' } },
  { id: 'ms1', date: later, title: 'Data freeze', type: 'milestone', category: 'grant', meta: { grant_title: 'R01 LPV' } },
  { id: 'old', date: past, title: 'Gone by', type: 'task', category: 'low', meta: {} },
]

// Counts navigations (each one mints a new location key), so a doubled
// row + link navigation shows up as two.
const seenKeys = new Set<string>()
function Where() {
  const loc = useLocation()
  seenKeys.add(loc.key)
  return <output data-where data-navs={seenKeys.size}>{loc.pathname + loc.search}</output>
}

async function mountAgenda(width = 1000) {
  seenKeys.clear()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/portal/calendar']}>
        <Where />
        <Routes>
          <Route path="*" element={<div style={{ width }}><AgendaView events={events} /></div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelectorAll('.sr-row').length === 4, label: 'AgendaView' },
  )
}

describe('Calendar Agenda: sleek rows', () => {
  it('groups by day under quiet headings, drops past events and the per-row type pill', async () => {
    const host = await mountAgenda()
    const heads = [...host.querySelectorAll('.sr-grp-h h3')].map((h) => h.textContent)
    expect(heads[0]).toBe('Today')
    expect(heads).toHaveLength(2)
    expect(host.querySelector('.sr-grp-now')).not.toBeNull()
    expect(host.textContent).not.toContain('Gone by')
    // No visible type word on any row: the kind is a glyph plus screen-reader text.
    for (const row of host.querySelectorAll('.sr-row')) {
      const visible = [...row.querySelectorAll('*')].filter((el) => !el.closest('.sr-only') && el.childElementCount === 0).map((el) => el.textContent?.trim())
      expect(visible).not.toContain('Task')
      expect(visible).not.toContain('Meeting')
      expect(visible).not.toContain('Milestone')
    }
    expect(host.querySelectorAll('.sr-panel')).toHaveLength(2)
  })

  it('reads a task like Today: short title, Urgent tag, urgent edge, non-default status, owner face', async () => {
    const host = await mountAgenda()
    const t1 = host.querySelector('[data-event-id="t1"]') as HTMLElement
    expect(t1.querySelector('a.sr-lk')?.textContent).toBe('Data core synthesis')
    expect(t1.querySelector('a.sr-lk')?.getAttribute('title')).toContain('long-named')
    expect(t1.querySelector('.tk-urgtag')?.textContent).toBe('Urgent')
    expect(t1.classList.contains('sr-urg')).toBe(true)
    expect(t1.textContent).toContain('In Progress')
    expect(t1.querySelector('[data-col="owner"]')?.children.length).toBe(1)
    // A To Do task does not say "To Do" on its row.
    const t2 = host.querySelector('[data-event-id="t2"]') as HTMLElement
    expect(t2.textContent).not.toContain('To Do')
    expect(t2.classList.contains('sr-urg')).toBe(false)
    // A milestone carries the gold diamond and its grant as context.
    const ms = host.querySelector('[data-event-id="ms1"]') as HTMLElement
    expect(ms.querySelector('.sr-dia')).not.toBeNull()
    expect(ms.textContent).toContain('R01 LPV')
    expect(ms.querySelector('[data-col="owner"]')?.children.length).toBe(0)
  })

  it('a row click opens the event; the title is a real link and its click is not doubled', async () => {
    const host = await mountAgenda()
    const where = () => host.querySelector('[data-where]')?.textContent
    click(host.querySelector('[data-event-id="m1"] [data-col="context"]') as Element)
    await tick()
    expect(where()).toBe('/portal/meetings/m1')
    const link = host.querySelector('[data-event-id="t1"] a.sr-lk') as HTMLAnchorElement
    expect(link.getAttribute('href')).toContain('open=t1')
    const navs = () => Number(host.querySelector('[data-where]')?.getAttribute('data-navs'))
    const before = navs()
    click(link)
    await tick()
    expect(where()).toContain('open=t1')
    expect(navs()).toBe(before + 1)
  })

  it('moves to the phone layout below 640px with the glyph, title, context line and face slots', async () => {
    const host = await mountAgenda(390)
    for (let i = 0; i < 50 && !host.querySelector('.sr-narrow'); i++) await tick(10)
    const t1 = host.querySelector('[data-event-id="t1"]') as HTMLElement
    expect(t1.classList.contains('sr-ph')).toBe(true)
    expect(t1.querySelector('.sr-ph-t a.sr-lk')).not.toBeNull()
    expect(t1.querySelector('.sr-ph-l')?.textContent).toContain('In Progress')
    expect(t1.querySelector('.sr-ph-trail [data-col="owner"]')).not.toBeNull()
  })
})
