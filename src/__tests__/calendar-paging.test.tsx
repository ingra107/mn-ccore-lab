// Calendar on a phone (overnight audit 2026-10-14, G4-1..3).
// G4-1: Prev/Next in Agenda moved the date one day while Agenda listed from
// today, so nothing changed; the labels said "month" in every view.
// G4-2: the month cell's only tap target was the 4x16 date number.
// G4-3: the week's seven ~48px columns broke titles mid-word.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AgendaView, MonthView, WeekView } from '../pages/portal/CalendarPage'
import { agendaEmptyTitle, agendaWindow, showsToday, stepDate, stepLabel } from '../lib/calendarPaging'
import type { CalendarEvent } from '../lib/api'
import { localDateKey } from '../lib/dateUtils'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

// Tailwind is not compiled in browser-mode tests, so inject the real calendar
// rules from index.css (anchored on comments, not newlines) plus `relative`.
const calCss = css.slice(css.indexOf("/* The date button's ::before"), css.indexOf('.pg-hero.pg-hero-zero'))
const style = document.createElement('style')
style.textContent = '.relative{position:relative} ' + calCss
document.head.appendChild(style)

describe('Calendar paging (G4-1)', () => {
  it('steps Agenda and Month by month from the 1st, Week by 7 days, Day by 1', () => {
    const jan31 = new Date(2026, 0, 31)
    expect(localDateKey(stepDate('agenda', jan31, 1))).toBe('2026-02-01')
    expect(localDateKey(stepDate('month', jan31, 1))).toBe('2026-02-01')
    expect(localDateKey(stepDate('month', jan31, -1))).toBe('2025-12-01')
    expect(localDateKey(stepDate('week', jan31, 1))).toBe('2026-02-07')
    expect(localDateKey(stepDate('day', jan31, -1))).toBe('2026-01-30')
  })

  it('labels the arrows with the step of the view', () => {
    expect(stepLabel('agenda', 1)).toBe('Next month')
    expect(stepLabel('week', -1)).toBe('Previous week')
    expect(stepLabel('day', 1)).toBe('Next day')
  })

  it('hides Today when the view already shows today', () => {
    const now = new Date(2026, 9, 14)
    expect(showsToday('agenda', new Date(2026, 9, 1), now)).toBe(true)
    expect(showsToday('agenda', new Date(2026, 10, 1), now)).toBe(false)
    expect(showsToday('week', new Date(2026, 9, 17), now)).toBe(true)
    expect(showsToday('day', new Date(2026, 9, 15), now)).toBe(false)
  })

  it('Agenda window: today to the end of next month this month, exactly the month in any other', () => {
    const now = new Date(2026, 9, 14)
    expect(agendaWindow(new Date(2026, 9, 1), now)).toEqual({ from: '2026-10-14', to: '2026-11-30' })
    expect(agendaWindow(new Date(2026, 10, 1), now)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })

  it('AgendaView lists only the window it is given', async () => {
    const evs: CalendarEvent[] = [
      { id: 'a', date: '2099-01-05', title: 'In window', type: 'meeting', category: 'meeting' },
      { id: 'b', date: '2099-03-05', title: 'After window', type: 'meeting', category: 'meeting' },
    ]
    const h = await mount(<MemoryRouter><AgendaView events={evs} from="2099-01-01" to="2099-02-28" /></MemoryRouter>, { ready: (x) => x.querySelectorAll('.sr-row').length === 1, label: 'AgendaView' })
    expect(h.textContent).toContain('In window')
    expect(h.textContent).not.toContain('After window')
    // Today is outside the window, so no now marker.
    expect(h.querySelectorAll('[data-testid="now-marker"]').length).toBe(0)
  })
})

describe('Calendar month cell on a phone (G4-2)', () => {
  it('the date button covers the whole cell and dots replace chips below md', async () => {
    const date = localDateKey()
    const evs: CalendarEvent[] = [{ id: 'm1', date, title: 'Lab meeting', type: 'meeting', category: 'meeting' }]
    const h = await mount(<MemoryRouter><div style={{ width: 390 }}><MonthView currentDate={new Date()} events={evs} onOpenDay={() => {}} /></div></MemoryRouter>, { ready: (x) => x.querySelector('[data-today="true"]'), label: 'MonthView' })
    const cell = h.querySelector('[data-today="true"]') as HTMLElement
    const btn = cell.querySelector('button.cal-day-open') as HTMLElement
    expect(btn.getAttribute('aria-label')).toMatch(/, 1 event$/)
    const cr = cell.getBoundingClientRect()
    const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.bottom - 4)
    // The test browser runs at a phone width (vitest browser default).
    expect(window.innerWidth).toBeLessThan(768)
    expect(hit).toBe(btn)
    expect(cell.querySelectorAll('.cal-dot').length).toBe(1)
  })
})

describe('Calendar week on a phone (G4-3)', () => {
  it('stacks the days as rows below md, with one-line titles', async () => {
    const start = new Date(); start.setDate(start.getDate() - start.getDay())
    const evs: CalendarEvent[] = [{ id: 't1', date: localDateKey(start), title: 'Pulmonary ambulatory category check', type: 'task', category: 'medium' }]
    const h = await mount(<MemoryRouter><WeekView weekStart={start} events={evs} /></MemoryRouter>, { ready: (x) => x.querySelector('a[title]'), label: 'WeekView' })
    const chip = h.querySelector('a[title]') as HTMLElement
    expect(window.innerWidth).toBeLessThan(768)
    const grid = h.querySelector('.cal-week') as HTMLElement
    expect(getComputedStyle(grid).gridTemplateColumns.split(' ').length).toBe(1)
    expect(getComputedStyle(chip).whiteSpace).toBe('nowrap')
  })
})

// O2B (2026-10-14): paged to an empty November, the Agenda still said "The
// week ahead is open" under "November 2026 / 0 events in November".
describe('the empty Agenda names its window', () => {
  it('names the month it was paged to, and says "coming up" for the current window', () => {
    expect(agendaEmptyTitle('2026-11-01', '2026-11-30', '2026-10-14')).toBe('Nothing in November')
    expect(agendaEmptyTitle('2026-10-14', '2026-11-30', '2026-10-14')).toBe('Nothing coming up')
    expect(agendaEmptyTitle('2026-10-14', undefined, '2026-10-14')).toBe('Nothing coming up')
  })
})
