// Today's numbers click through to what they count (fable audit 2026-11-05):
//   F04 "N meetings" counts calendar events too, so it opens the Calendar, not a
//       Meetings list of records only that can be empty beside "6 meetings".
//   F17 an overdue row in Needs attention is a link, like a stalled row beside it.
//   "stalled" names its window, because Lab Overview's "stalled" is a 14-day clock.
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { StatLine } from '../components/today/StatLine'
import { NeedsAttentionCard } from '../components/today/rail/NeedsAttentionCard'
import { PATHS } from '../constants/paths'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const zero = { overdue: 0, stalled: 0, planned: 0, meetings: 0, doneToday: 0 }

describe('StatLine', () => {
  it('sends "meetings" to the Calendar, which shows both kinds it counts', async () => {
    const host = await mount(
      <MemoryRouter><StatLine counts={{ ...zero, meetings: 6 }} /></MemoryRouter>,
      { ready: (h) => h.querySelector('.tk-stats'), label: 'StatLine' },
    )
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent?.includes('meetings'))!
    expect(link.getAttribute('href')).toBe(PATHS.calendar)
  })

  it('says how long "stalled" means', async () => {
    const host = await mount(
      <MemoryRouter><StatLine counts={{ ...zero, stalled: 11 }} stalledDays={30} /></MemoryRouter>,
      { ready: (h) => h.querySelector('.tk-stats'), label: 'StatLine' },
    )
    const link = [...host.querySelectorAll('a')].find((a) => a.getAttribute('href')?.includes('filter=stalled'))!
    expect(link.textContent).toContain('stalled 30d+')
    expect(link.getAttribute('title')).toContain('30 days')
  })
})

describe('NeedsAttentionCard', () => {
  it('links an overdue row to the task, as a stalled row links to its project', async () => {
    const task = { id: 'task_1', title: 'Write the aims', due_date: '2020-01-01' } as TaskRow
    const host = await mount(
      <MemoryRouter><NeedsAttentionCard overdueTasks={[task]} stalledProjects={[{ name: 'Sepsis', days: 40, slug: 'sepsis' }]} /></MemoryRouter>,
      { ready: (h) => h.querySelector('[data-b2-attention]'), label: 'card' },
    )
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent?.includes('Write the aims'))
    expect(link?.getAttribute('href')).toBe(`${PATHS.myTasks}?open=task_1`)
    expect([...host.querySelectorAll('a')].some((a) => a.textContent?.includes('Sepsis'))).toBe(true)
  })
})
