// The Grants list (components/grants/GrantList): a date cell is the shared
// date picker (2026-10-23, Nick: "fix grants date selection"; it was a native
// mm/dd/yyyy box). It shows the year, jumps a year at a time, writes once per
// pick and never while browsing; the PI shows by name, never as a slug.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GrantList, { type TermEdit } from '../components/grants/GrantList'
import type { GrantProduct } from '../lib/grants'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const award: GrantProduct = {
  id: 'prd_K23', project_id: 'proj_K', project_slug: 'k23', project_title: 'K23: Provider Variation', project_short_name: 'K23',
  pi: 'nick-ingraham', kind: 'award', kind_label: 'Award', stage: 'active', stage_label: 'Active', stage_ordinal: 10,
  stage_is_terminal: 0, title: null, short_name: null, venue: 'NHLBI K23', due_date: null, deadline: null,
  period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: 644588, is_home: 1, lineage_rank: 0,
  grew_from_id: null, seq: 3, bucket: 'active', milestones: [],
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

async function render() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
  const onEdit = vi.fn<(e: TermEdit) => void>()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter><GrantList rows={[award]} kinds={[]} onEdit={onEdit} /></MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => !!h.querySelector('[data-testid="grant-row-prd_K23"]'), label: 'GrantList' },
  )
  const end = host.querySelector<HTMLElement>('[data-testid="grant-end-prd_K23"]')!
  return { host, end, onEdit }
}

const picker = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Choose a date"]')
function press(el: Element | null | undefined) {
  if (!el) throw new Error('missing element')
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
}
async function openPicker(end: HTMLElement) {
  end.querySelector<HTMLButtonElement>('button')!.click()
  for (let i = 0; i < 100 && !picker(); i++) await tick(10)
  expect(picker(), 'picker opens').toBeTruthy()
}

describe('GrantList date cells', () => {
  it('shows the full date with its year, named for screen readers', async () => {
    const { end } = await render()
    const trig = end.querySelector('button')!
    expect(trig.textContent).toContain('Nov 30, 2027')
    expect(trig.getAttribute('aria-label')).toBe('End for K23: 2027-11-30, change date')
  })

  it('a year jump moves the calendar a year and writes nothing; a day saves once', async () => {
    const { end, onEdit } = await render()
    await openPicker(end)
    expect(picker()!.textContent).toContain('November 2027')
    press(picker()!.querySelector('[aria-label="Next year"]'))
    await tick()
    expect(picker()!.textContent).toContain('November 2028')
    expect(onEdit).not.toHaveBeenCalled()
    const day = [...picker()!.querySelectorAll('button')].find((b) => b.textContent === '30')
    press(day)
    await tick()
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0][0].fields).toEqual({ period_end: '2028-11-30' })
  })

  it('Escape closes without saving; Clear saves null', async () => {
    const { end, onEdit } = await render()
    await openPicker(end)
    picker()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await tick()
    expect(picker()).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
    await openPicker(end)
    press([...picker()!.querySelectorAll('button')].find((b) => b.textContent === 'Clear'))
    await tick()
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0][0].fields).toEqual({ period_end: null })
  })

  it('names the PI, never the slug', async () => {
    const { host } = await render()
    const sub = host.querySelector('[data-testid="grant-row-prd_K23"] .gl-sub')!.textContent ?? ''
    expect(sub).not.toContain('nick-ingraham')
    expect(sub).toMatch(/Award · \S+/)
  })
})
