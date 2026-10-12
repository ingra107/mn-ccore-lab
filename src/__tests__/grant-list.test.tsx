// The Grants list (components/grants/GrantList): a date cell saves when you
// leave it or press Enter, never per keystroke (cold review minor 1: typing a
// year in a native date input fires change for 0002, 0020, ...), Escape puts
// it back; the PI shows by name, never as a slug (minor 5).
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

/** What a typed character does to a native date input: the value moves and
 *  React's change handler runs (the input event). */
function typeValue(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
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
  const end = host.querySelector<HTMLInputElement>('[data-testid="grant-end-prd_K23"]')!
  return { host, end, onEdit }
}

describe('GrantList date cells', () => {
  it('typing a year writes nothing; leaving the field saves once', async () => {
    const { end, onEdit } = await render()
    end.focus()
    for (const v of ['0002-11-30', '0020-11-30', '0202-11-30', '2028-11-30']) typeValue(end, v)
    await tick()
    expect(onEdit).not.toHaveBeenCalled()
    end.blur()
    await tick()
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0][0].fields).toEqual({ period_end: '2028-11-30' })
  })

  it('Enter saves; Escape puts the old date back and saves nothing', async () => {
    const { end, onEdit } = await render()
    end.focus()
    typeValue(end, '2029-01-01')
    end.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await tick()
    expect(onEdit).toHaveBeenCalledTimes(1)
    typeValue(end, '2030-01-01')
    end.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await tick()
    expect(end.value).toBe('2027-11-30')
    end.blur()
    await tick()
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('names the PI, never the slug', async () => {
    const { host } = await render()
    const sub = host.querySelector('[data-testid="grant-row-prd_K23"] .gl-sub')!.textContent ?? ''
    expect(sub).not.toContain('nick-ingraham')
    expect(sub).toMatch(/Award · \S+/)
  })
})
