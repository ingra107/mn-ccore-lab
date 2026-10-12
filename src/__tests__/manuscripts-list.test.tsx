// The Manuscripts List on the shared sleek row (evaluation item 39): stage
// headers in stage order, j/k cursor, Enter opens, Esc clears, a row click
// opens the project, an inline-edit click does not, a null PI reads
// "Unassigned", the phone layout drops the empty lead slot and keeps status,
// and Esc is only claimed while a row holds the cursor.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ManuscriptsList } from '../pages/portal/ManuscriptsList'
import type { SleekSort } from '../components/table/SleekRows'
import type { Project } from '../data/types'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
// useListKeyboardNav listens on document.
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

const P = (slug: string, stage: string, pi: string | null = 'nick-ingraham'): Project =>
  ({ slug, title: `Paper ${slug}`, stage, status: 'active', category: 'MNCCORE', pi } as unknown as Project)
const ROWS = [P('a', 'writing'), P('b', 'writing', null), P('c', 'review')]
const STAGES = ['writing', 'review'] as const
const LABELS = { writing: 'Writing', review: 'Review' }

function Where() {
  const loc = useLocation()
  return <output data-where>{loc.pathname}</output>
}

function Harness({ width = 1000, initialSort = null }: { width?: number; initialSort?: SleekSort }) {
  const [sort, setSort] = useState<SleekSort>(initialSort)
  return (
    <MemoryRouter initialEntries={['/portal/manuscripts']}>
      <Where />
      <Routes>
        <Route path="*" element={
          <div style={{ width }}>
            <ManuscriptsList
              manuscripts={ROWS}
              sort={sort}
              onSort={setSort}
              stages={STAGES}
              stageLabels={LABELS}
              statusOptions={[{ value: 'active', label: 'Active' }, { value: 'done', label: 'Done' }]}
              piOptions={[{ value: 'nick-ingraham', label: 'Nick Ingraham' }]}
              categoryOptions={[{ value: 'MNCCORE', label: 'MNCCORE' }]}
              categoryLabel={{ MNCCORE: 'MNCCORE' }}
              taskCounts={new Map([['a', 2]])}
              daysInStage={(p) => (p.slug === 'a' ? 90 : 3)}
              stalledThresholdDays={30}
              onFieldChange={() => {}}
              onStageChange={() => {}}
            />
          </div>
        } />
      </Routes>
    </MemoryRouter>
  )
}

const where = (h: HTMLElement) => h.querySelector('[data-where]')?.textContent
const row = (h: HTMLElement, slug: string) => h.querySelector(`[data-slug="${slug}"]`) as HTMLElement

describe('ManuscriptsList (sleek row)', () => {
  it('groups by stage in stage order and drops the headers for another sort', async () => {
    const h = await mount(<Harness />, { ready: (x) => x.querySelector('.sr-row'), label: 'list' })
    expect([...h.querySelectorAll('.sr-grp-h h3')].map((e) => e.textContent)).toEqual(['Writing', 'Review'])
    expect(h.querySelectorAll('.sr-row')).toHaveLength(3)
    expect(row(h, 'a').textContent).toContain('2 tasks')
    const title = await mount(<Harness initialSort={{ key: 'title', dir: 'asc' }} />, { ready: (x) => x.querySelector('.sr-row'), label: 'title sort' })
    expect(title.querySelector('.sr-grp-h')).toBeNull()
  })

  it('j/k move the cursor, Enter opens the project, Esc clears', async () => {
    const h = await mount(<Harness />, { ready: (x) => x.querySelector('.sr-row'), label: 'list' })
    key('j')
    await expect.poll(() => row(h, 'a').classList.contains('sr-cur')).toBe(true)
    key('j')
    await expect.poll(() => row(h, 'b').classList.contains('sr-cur')).toBe(true)
    key('k')
    await expect.poll(() => row(h, 'a').classList.contains('sr-cur')).toBe(true)
    key('Escape'); await tick()
    await expect.poll(() => h.querySelector('.sr-cur')).toBeNull()
    key('j'); key('j')
    await expect.poll(() => row(h, 'b').classList.contains('sr-cur')).toBe(true)
    key('Enter')
    await expect.poll(() => where(h)).toBe('/portal/projects/b')
  })

  it('a row click opens the project; an inline-edit click does not', async () => {
    const h = await mount(<Harness />, { ready: (x) => x.querySelector('.sr-row'), label: 'list' })
    click(row(h, 'c').querySelector('[data-col="status"] .sr-trig')!); await tick()
    expect(where(h)).toBe('/portal/manuscripts')
    click(row(h, 'c').querySelector('[data-col="days_in_stage"]')!)
    await expect.poll(() => where(h)).toBe('/portal/projects/c')
  })

  it('a null PI reads Unassigned with no face; a stalled count is orange', async () => {
    const h = await mount(<Harness />, { ready: (x) => x.querySelector('.sr-row'), label: 'list' })
    const pi = row(h, 'b').querySelector('[data-col="pi"]')!
    expect(pi.textContent).toContain('Unassigned')
    expect(pi.querySelector('.tk-face')).toBeNull()
    expect(row(h, 'a').querySelector('[data-col="pi"] .tk-face')).not.toBeNull()
    const days = row(h, 'a').querySelector('[data-col="days_in_stage"] span') as HTMLElement
    expect(days.getAttribute('title')).toContain('Stalled')
  })

  it('the phone layout has no empty lead slot', async () => {
    const h = await mount(<Harness width={380} />, { ready: (x) => x.querySelector('.sr-narrow .sr-ph'), label: 'phone' })
    expect(h.querySelector('.sr-ph-lead')).toBeNull()
    expect(row(h, 'a').classList.contains('sr-nolead')).toBe(true)
    expect(row(h, 'a').querySelector('.sr-ph-trail .tk-face')).not.toBeNull()
    // Status stays editable on the phone line, ahead of stage.
    const phoneCols = [...row(h, 'a').querySelectorAll('.sr-ph-l [data-col]')].map((e) => e.getAttribute('data-col'))
    expect(phoneCols.slice(0, 2)).toEqual(['status', 'stage'])
    expect(row(h, 'a').querySelector('.sr-ph-l [data-col="status"] .sr-trig')).not.toBeNull()
  })

  it('Escape is left alone when no row holds the cursor', async () => {
    const h = await mount(<Harness />, { ready: (x) => x.querySelector('.sr-row'), label: 'list' })
    const esc = () => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented }
    expect(esc()).toBe(false)
    key('j')
    await expect.poll(() => h.querySelector('.sr-cur')).not.toBeNull()
    expect(esc()).toBe(true)
    await expect.poll(() => h.querySelector('.sr-cur')).toBeNull()
    expect(esc()).toBe(false)
  })
})
