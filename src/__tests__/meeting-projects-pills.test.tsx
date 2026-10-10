// The meeting page's Projects row (schema-v122) and the Today meeting card's
// new fields. Real Chromium (vitest.config.ts browser mode).
//
// Nick, 2026-10-09: discussed projects are faded pills; clicking one gives
// that project's members access (the pill goes full contrast), clicking again
// takes it away; "+ add project" covers one the debrief missed. Only the
// owner or Nick (the server's can_manage_access) gets the toggles.

import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MeetingProjectsSection from '../components/meetings/MeetingProjectsSection'
import { useUpdateMeetingMeta } from '../hooks/mutations/useMeetingMutations'
import { UndoToastProvider as ToastProvider } from '../components/UndoToast'
import { EventRow } from '../components/today/MeetingRow'
import { meetingCardFields } from '../components/today/constants'
import type { MeetingRow } from '../hooks/useApiData'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const PROJECTS = [
  { id: 'proj_dnr', slug: 'dnr-study', title: 'Do-not-resuscitate orders in the ICU', short_name: 'DNR' },
  { id: 'proj_lpv', slug: 'adhere-lpv', title: 'ADHERE-LPV trial', short_name: 'LPV' },
  { id: 'proj_k23', slug: 'k23', title: 'K23 award', short_name: 'K23' },
]

function Harness({ canManage, granted }: { canManage: boolean; granted: string[] }) {
  const updateMeta = useUpdateMeetingMeta('mtg-1')
  return (
    <MeetingProjectsSection
      meeting={{
        id: 'mtg-1',
        tags: JSON.stringify(['dnr-study', 'adhere-lpv', 'sedation']),
        granted_projects: JSON.stringify(granted.map((id) => {
          const p = PROJECTS.find((x) => x.id === id)!
          return { id, slug: p.slug, short_name: p.short_name, title: p.title }
        })),
        can_manage_access: canManage,
      }}
      allProjects={PROJECTS}
      updateMeta={updateMeta}
    />
  )
}

async function render(canManage: boolean, granted: string[]) {
  const calls: { url: string; method: string; body: string | null }[] = []
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: (init?.body as string) ?? null })
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ data: [] }), text: async () => '{"data":[]}' }
  }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await mount(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter><Harness canManage={canManage} granted={granted} /></MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
    { ready: (h) => !!h.querySelector('[data-testid="meeting-projects"]'), label: 'MeetingProjectsSection' },
  )
  return { host, calls }
}

const pill = (h: HTMLElement, label: string) =>
  [...h.querySelectorAll<HTMLElement>('[data-pill]')].find((e) => e.textContent?.trim() === label)!

describe('Projects row on the meeting page', () => {
  it('discussed projects are faded, granted ones full contrast, short names, no "#"', async () => {
    const { host } = await render(true, ['proj_dnr'])
    expect(pill(host, 'DNR').dataset.pill).toBe('granted')
    expect(pill(host, 'LPV').dataset.pill).toBe('discussed')
    expect(pill(host, 'sedation').dataset.pill).toBe('discussed')
    // Faded = dim (--sk-t3), regular-weight text on a dashed hairline; granted = the teal pill.
    const dnr = pill(host, 'DNR').style
    const lpv = pill(host, 'LPV').style
    expect(lpv.borderStyle).toBe('dashed')
    expect(lpv.color).toBe('var(--sk-t3)')
    expect(lpv.fontWeight).toBe('400')
    expect(dnr.borderStyle).toBe('solid')
    expect(dnr.color).toBe('var(--teal)')
    expect(dnr.background).toContain('var(--teal-active)')
    expect(host.textContent).not.toContain('#')
    vi.unstubAllGlobals()
  })

  it('owner or Nick: clicking a faded pill grants it; clicking a granted one revokes', async () => {
    const { host, calls } = await render(true, ['proj_dnr'])
    expect(pill(host, 'LPV').tagName).toBe('BUTTON')
    expect(pill(host, 'LPV').getAttribute('aria-pressed')).toBe('false')
    pill(host, 'LPV').click()
    for (let i = 0; i < 50 && !calls.some((c) => c.method === 'POST'); i++) await new Promise((r) => setTimeout(r, 10))
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('/api/meetings/mtg-1/projects')
    expect(JSON.parse(post.body!)).toEqual({ project: 'proj_lpv' })
    // Toggles are disabled while a grant is in flight; wait for it to settle.
    for (let i = 0; i < 50 && (pill(host, 'DNR') as HTMLButtonElement).disabled; i++) await new Promise((r) => setTimeout(r, 10))
    pill(host, 'DNR').click()
    for (let i = 0; i < 50 && !calls.some((c) => c.method === 'DELETE'); i++) await new Promise((r) => setTimeout(r, 10))
    expect(calls.find((c) => c.method === 'DELETE')!.url).toBe('/api/meetings/mtg-1/projects/proj_dnr')
    vi.unstubAllGlobals()
  })

  it('a topic word that names no project has no toggle, even for the owner', async () => {
    const { host } = await render(true, [])
    expect(pill(host, 'sedation').tagName).toBe('SPAN')
    vi.unstubAllGlobals()
  })

  it('everyone else sees the pills and no toggles; a granted pill links to its project', async () => {
    const { host } = await render(false, ['proj_dnr'])
    expect(host.querySelectorAll('[data-pill][aria-pressed]').length).toBe(0)
    expect(pill(host, 'DNR').tagName).toBe('A')
    expect(pill(host, 'DNR').getAttribute('href')).toContain('dnr-study')
    expect(pill(host, 'LPV').tagName).toBe('SPAN')
    vi.unstubAllGlobals()
  })

  it('"+ add project" lists the projects, and adding one puts it on the discussed list', async () => {
    const { host, calls } = await render(true, [])
    const add = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('add project'))!
    add.click()
    for (let i = 0; i < 50 && ![...host.querySelectorAll('button')].some((b) => b.textContent === 'K23'); i++) await new Promise((r) => setTimeout(r, 10))
    ;[...host.querySelectorAll('button')].find((b) => b.textContent === 'K23')!.click()
    for (let i = 0; i < 50 && !calls.some((c) => c.url.endsWith('/meta')); i++) await new Promise((r) => setTimeout(r, 10))
    const meta = calls.find((c) => c.url.endsWith('/meta'))!
    expect(JSON.parse(meta.body!)).toEqual({ tags: ['dnr-study', 'adhere-lpv', 'sedation', 'k23'] })
    vi.unstubAllGlobals()
  })
})

describe('Today meeting card fields', () => {
  const row = (over: Partial<MeetingRow>): MeetingRow => ({
    id: 'mtg-9', date: '2026-10-09', title: 'MNCCORE', type: '', attendees: null, agenda: null, notes: null,
    decisions: null, tags: null, status: 'upcoming', created_at: '', updated_at: '', ...over,
  })

  it('meetingCardFields: team-slug attendees as faces, the first nameable granted project, the action counts', () => {
    const f = meetingCardFields(row({
      attendees: JSON.stringify(['casey-eddington', 'nate-mesfin', 'x@stanford.edu', 'Some Name', 'casey-eddington']),
      granted_projects: JSON.stringify([{ id: 'proj_h', slug: null, short_name: null, title: null }, { id: 'proj_dnr', slug: 'dnr-study', short_name: 'DNR', title: 'Long' }]),
      action_count: 5, open_action_count: 3,
    }))
    expect(f).toEqual({ people: ['casey-eddington', 'nate-mesfin'], project: { name: 'DNR', slug: 'dnr-study' }, actionCount: 5, openActionCount: 3 })
    expect(meetingCardFields(row({}))).toEqual({ people: [], project: null, actionCount: 0, openActionCount: 0 })
  })

  it('the card shows the faces, the project short name and the open action count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const e = { id: 'mtg-9', time: '—', title: 'MNCCORE', people: ['casey-eddington', 'nate-mesfin'], project: { name: 'DNR', slug: 'dnr-study' }, actionCount: 5, openActionCount: 3 }
    for (const compact of [false, true]) {
      const host = await mount(
        <QueryClientProvider client={qc}><ToastProvider><MemoryRouter><div className="tk"><EventRow e={e} onDismiss={() => {}} onNote={() => {}} compact={compact} /></div></MemoryRouter></ToastProvider></QueryClientProvider>,
        { ready: (h) => !!h.querySelector('.tk-mc'), label: `EventRow compact=${compact}` },
      )
      const card = host.querySelector('.tk-mc')!
      expect(card.querySelectorAll('.tk-face').length).toBe(2)
      expect(card.textContent).toContain('DNR')
      expect(card.querySelector('[aria-label="3 open action items"]')!.textContent).toBe('3')
    }
    vi.unstubAllGlobals()
  })
})
