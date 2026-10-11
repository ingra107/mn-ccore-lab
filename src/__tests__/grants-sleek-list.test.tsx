// The Grants list on the sleek row (components/grants/GrantSleekList):
// the header sort, the j/k cursor, Enter / row click opening the detail,
// Esc closing it then clearing the cursor, the status editor keeping its
// clicks, and the progress bar staying the accent past 80% (eval item 100).
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import type { SleekSort } from '../components/table/SleekRows'
import { GrantSleekList } from '../components/grants/GrantSleekList'
import { grantAward, grantPeriod, grantProgress, grantStatusOf, sortGrants } from '../lib/grantRows'
import type { GrantTimelineItem } from '../hooks/useGrantTimeline'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
const key = (k: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

const grant = (id: string, extra: Partial<GrantTimelineItem>): GrantTimelineItem => ({
  id, mechanism: 'R01', title: id, agency: 'NHLBI', pi: 'nick', start_date: '2024-01-01', end_date: '2029-01-01',
  proposed: 0, status: 'funded', bucket: 'active', total_funding: null, milestones: [], ...extra,
})
const G = [
  grant('k23', { mechanism: 'K23', title: 'Provider variation', start_date: '2023-07-01', end_date: '2028-06-30' }),
  grant('r01', { title: 'Lung protective ventilation', start_date: '2022-01-01', end_date: '2027-01-01' }),
  grant('dp2', { mechanism: 'DP2', agency: 'OD', title: 'Decision-maker signature', bucket: 'proposed', status: 'submitted', start_date: '2027-04-01', end_date: '2032-03-31' }),
]
const NOW = new Date('2026-10-10T12:00:00').getTime()

function Harness({ onStatus = () => {}, width = 1100 }: { onStatus?: (id: string, prev: string | null, next: string) => void; width?: number }) {
  const [sort, setSort] = useState<SleekSort>(null)
  const [cursor, setCursor] = useState(-1)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div style={{ width }}>
      <GrantSleekList
        grants={sortGrants(G, sort)}
        sort={sort}
        onSort={setSort}
        cursor={cursor}
        setCursor={setCursor}
        expandedId={open}
        setExpandedId={setOpen}
        onStatusChange={onStatus}
        now={NOW}
      />
    </div>
  )
}
const ready = (h: HTMLElement) => h.querySelectorAll('.sr-row').length === 3
const titles = (h: HTMLElement) => [...h.querySelectorAll('.sr-row [data-col="title"]')].map((c) => c.textContent)

describe('grantRows helpers', () => {
  it('formats the award and the period in month-year', () => {
    expect(grantAward(G[0])).toBe('K23 · NHLBI')
    expect(grantPeriod(G[0])).toBe('Jul 2023 – Jun 2028')
  })
  it('sorts by start date by default; the Award column sorts mechanism then agency', () => {
    expect(sortGrants(G, null).map((g) => g.id)).toEqual(['r01', 'k23', 'dp2'])
    expect(sortGrants(G, { key: 'award', dir: 'asc' }).map((g) => g.id)).toEqual(['dp2', 'k23', 'r01'])
    expect(sortGrants(G, { key: 'status', dir: 'desc' }).map((g) => g.id)[0]).toBe('dp2')
  })
  it('a grant with no stored status shows the status its bucket implies', () => {
    expect(grantStatusOf(grant('a', { status: null, bucket: 'active' }))).toBe('funded')
    expect(grantStatusOf(grant('p', { status: null, bucket: 'proposed' }))).toBe('in_preparation')
    expect(grantStatusOf(grant('e', { status: null, bucket: 'ended' }))).toBe('closed')
    expect(grantStatusOf(grant('s', { status: 'submitted', bucket: 'proposed' }))).toBe('submitted')
  })
  it('progress is for funded (active) grants only', () => {
    expect(grantProgress(G[2], NOW)).toBe(0)
    expect(Math.round(grantProgress(G[0], NOW))).toBe(66)
    expect(grantProgress(G[1], NOW)).toBeGreaterThan(80)
  })
})

describe('GrantSleekList', () => {
  it('renders one sleek line per grant: plain award text, dim period, PI face', async () => {
    const host = await mount(<Harness />, { ready, label: 'grants' })
    const first = host.querySelector('[data-grant-id="k23"]')!
    expect(first.querySelector('[data-col="award"]')!.textContent).toBe('K23 · NHLBI')
    expect(first.querySelector('[data-col="period"]')!.textContent).toBe('Jul 2023 – Jun 2028')
    expect(first.querySelector('[data-col="pi"] .tk-face')).not.toBeNull()
    expect(host.querySelectorAll('[role="columnheader"]').length).toBe(6)
  })

  it('keeps the progress bar the accent past 80%', async () => {
    const host = await mount(<Harness />, { ready, label: 'grants' })
    const bar = host.querySelector('[data-grant-id="r01"] .gr-bar i') as HTMLElement
    expect(parseFloat(bar.style.width)).toBeGreaterThan(80)
    // No per-percent colour: the bar takes the one accent from `.gr-bar i` (index.css).
    expect(bar.style.background).toBe('')
    expect(bar.style.backgroundColor).toBe('')
    expect(host.querySelector('[data-grant-id="r01"] [data-col="progress"]')!.textContent).toMatch(/^9[0-9]%$/)
  })

  it('header click sorts by title', async () => {
    const host = await mount(<Harness />, { ready, label: 'grants' })
    expect(titles(host)[0]).toBe('Lung protective ventilation')
    click(host.querySelector('[role="columnheader"] button')!); await tick()
    expect(titles(host)).toEqual(['Decision-maker signature', 'Lung protective ventilation', 'Provider variation'])
  })

  it('j/k move the cursor, Enter opens the detail, Esc closes it then clears the cursor', async () => {
    const host = await mount(<Harness />, { ready, label: 'grants' })
    const rows = () => [...host.querySelectorAll('.sr-row')]
    expect(rows().some((r) => r.className.includes('sr-cur'))).toBe(false)
    key('j'); await tick()
    expect(rows()[0].className).toContain('sr-cur')
    key('j'); await tick()
    expect(rows()[1].className).toContain('sr-cur')
    key('k'); await tick()
    expect(rows()[0].className).toContain('sr-cur')
    key('Enter'); await tick()
    expect(rows()[0].className).toContain('sr-exp')
    expect(host.querySelector('.gr-detail')!.textContent).toContain('Lung protective ventilation')
    key('Escape'); await tick()
    expect(host.querySelector('.gr-detail')).toBeNull()
    expect(rows()[0].className).toContain('sr-cur')
    key('Escape'); await tick()
    expect(rows().some((r) => r.className.includes('sr-cur'))).toBe(false)
  })

  it('Enter on a focused button runs the button, not the row detail', async () => {
    const host = await mount(<Harness />, { ready, label: 'grants' })
    key('j'); await tick()
    // A real Enter on a focused control: the browser turns an unprevented Enter
    // on a button into a click, so the hook must leave it unprevented.
    const press = (el: HTMLElement) => {
      el.focus()
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      el.dispatchEvent(ev)
      if (!ev.defaultPrevented) el.click()
      return ev
    }
    const sortBtn = host.querySelector('[role="columnheader"] button') as HTMLElement
    expect(press(sortBtn).defaultPrevented).toBe(false); await tick()
    expect(host.querySelector('[role="columnheader"]')!.getAttribute('aria-sort')).toBe('ascending')
    expect(host.querySelector('.gr-detail')).toBeNull()
    const trigger = host.querySelector('[data-grant-id="r01"] [data-col="status"] button') as HTMLElement
    expect(press(trigger).defaultPrevented).toBe(false); await tick()
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
    expect(host.querySelector('.gr-detail')).toBeNull()
  })

  it('a row click moves the cursor and toggles the detail; the status editor keeps its clicks', async () => {
    const onStatus = vi.fn()
    const host = await mount(<Harness onStatus={onStatus} />, { ready, label: 'grants' })
    const row = () => host.querySelector('[data-grant-id="r01"]')!
    click(row().querySelector('[data-col="status"] button')!); await tick()
    expect(host.querySelector('.gr-detail')).toBeNull()
    // Close the menu the click opened before clicking the row.
    key('Escape'); await tick()
    click(row().querySelector('[data-col="period"]')!); await tick()
    expect(row().className).toContain('sr-cur')
    expect(host.querySelector('.gr-detail')).not.toBeNull()
    click(row().querySelector('[data-col="period"]')!); await tick()
    expect(host.querySelector('.gr-detail')).toBeNull()
  })

  it('phone: one muted award line, the face trailing, and no empty lead track', async () => {
    const host = await mount(<Harness width={380} />, { ready: (h) => h.querySelectorAll('.sr-narrow .sr-row').length === 3, label: 'phone' })
    const row = host.querySelector('[data-grant-id="k23"]')!
    expect(row.className).toContain('sr-nolead')
    expect(row.querySelector('.sr-ph-lead')).toBeNull()
    expect(row.querySelector('.sr-ph-l [data-col="award"]')!.textContent).toBe('K23 · NHLBI · to Jun 2028')
    expect(row.querySelector('.sr-ph-trail .tk-face')).not.toBeNull()
  })
})
