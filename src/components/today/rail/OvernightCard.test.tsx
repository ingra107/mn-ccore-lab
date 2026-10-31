// OvernightCard: runs grouped by lane under a hero change count, a lane filter,
// Undo (success and each 409), Seen, empty vs failed fetch, and nothing for
// anyone but Nick. fetch is stubbed per URL; shapes follow api/routes/receipts.ts.
//
// Run: npx vitest run --config vitest.config.ts src/components/today/rail/OvernightCard.test.tsx

import '../../../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { OvernightCard } from './OvernightCard'
import { mount, cleanupMountsAfterEach, waitFor } from '../../../__tests__/testMount'
import { previousEveningIso, overnightSince } from '../../../lib/overnightWindow'
import type { OvernightLine, OvernightResponse, OvernightRun } from '../../../hooks/useOvernight'

cleanupMountsAfterEach()
afterEach(() => vi.unstubAllGlobals())

const line = (id: string, over: Partial<OvernightLine> = {}): OvernightLine => ({
  id, run_id: 'r1', action_id: id, kind: 'change', entity_type: 'tasks', entity_id: `t-${id}`, op: 'update',
  fields_before: null, fields_after: null, landed_version: 3, source_ref: null, summary: `Did ${id}`,
  inverse_kind: 'patch', inverse_reason: null, undoable: true, undone_at: null, undo_line_id: null,
  created_at: `2026-10-31T05:0${id.length}:00.000Z`, seen: true, ...over,
})

const run = (id: string, lane: string, lines: OvernightLine[], over: Partial<OvernightRun> = {}): OvernightRun => ({
  run_id: id, lane, machine: 'home', origin: 'pb', started_at: '2026-10-31T04:00:00.000Z', finished_at: '2026-10-31T04:05:00.000Z',
  seen_at: null, state: 'ok',
  counts: {
    change: lines.filter((l) => l.kind === 'change').length, failure: lines.filter((l) => l.kind === 'failure').length,
    left_for_nick: lines.filter((l) => l.kind === 'left_for_nick').length, undone: 0, unseen: lines.filter((l) => !l.seen).length,
  },
  lines, more_lines: false, next_after: null, ...over,
})

function laneRows(runs: OvernightRun[]) {
  const by = new Map<string, OvernightResponse['lanes'][number]>()
  for (const r of runs) {
    const l = by.get(r.lane) ?? { lane: r.lane, runs: 0, changes: 0, failures: 0, left_for_nick: 0, unseen_runs: 0, unseen_lines: 0 }
    l.runs += 1; l.changes += r.counts.change; l.failures += r.counts.failure; l.left_for_nick += r.counts.left_for_nick
    l.unseen_lines += r.counts.unseen; l.unseen_runs += r.counts.unseen ? 1 : 0
    by.set(r.lane, l)
  }
  return [...by.values()].sort((a, b) => a.lane.localeCompare(b.lane)) // the server orders by lane
}

interface Stub { fetch: ReturnType<typeof vi.fn>; calls: { url: string; method: string; body?: string }[] }

function stub(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }): Stub {
  const calls: Stub['calls'] = []
  const f = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined })
    const r = handler(String(url), init)
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  })
  vi.stubGlobal('fetch', f)
  return { fetch: f, calls }
}

// The server's lanes list ignores the lane filter (api/routes/receipts.ts handleOvernight): `all` is every run in the window.
const overnight = (runs: OvernightRun[], laneFilter: string | null = null, all: OvernightRun[] = runs) => ({
  status: 200,
  body: { since: 'x', lane: laneFilter, runs, lanes: laneRows(all), next_cursor: null } satisfies OvernightResponse,
})

function wrap(node: ReactElement): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}><MemoryRouter><div className="tk">{node}</div></MemoryRouter></QueryClientProvider>
}

const click = (el: Element | null | undefined) => (el as HTMLElement).click()
const btn = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)

async function openRun(host: HTMLElement, runId: string) {
  click(host.querySelector(`[data-testid="overnight-run-${runId}"] button`))
  await waitFor(() => host.querySelector(`[data-testid="overnight-run-${runId}"] [data-testid^="overnight-line-"]`), 'lines')
}

const A = run('r1', 'process', [line('a'), line('bb', { kind: 'failure', summary: 'Triage broke', undoable: false, inverse_kind: 'none' })])
const B = run('r2', 'mail', [line('c', { run_id: 'r2' })], { machine: 'work' })

describe('OvernightCard', () => {
  it('shows the change count, the lanes, failures, one collapsed row per run, and lines on open', async () => {
    stub(() => overnight([A, B]))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-changes"]'), label: 'card' })
    expect(host.querySelector('[data-testid="overnight-changes"]')?.textContent).toBe('2')
    const head = host.querySelector('[data-testid="overnight-head"]')?.textContent ?? ''
    expect(head).toContain('mail, process')
    expect(head).toContain('1 failed')
    expect(host.querySelectorAll('[data-testid^="overnight-run-"]').length).toBe(2)
    expect(host.querySelector('[data-testid^="overnight-line-"]')).toBeNull() // collapsed
    await openRun(host, 'r1')
    expect(host.querySelectorAll('[data-testid^="overnight-line-"]').length).toBe(2)
    const failed = host.querySelector('[data-kind="failure"]')
    expect(failed?.textContent).toContain('Failed')
    expect(failed?.textContent).toContain('Triage broke')
    expect(failed?.textContent).not.toContain('Undo') // not undoable: no button
    expect(host.querySelector('[data-testid="overnight-line-a"] a')?.getAttribute('href')).toContain('?open=t-a')
  })

  it('filters by lane through the server', async () => {
    const s = stub((url) => (url.includes('lane=mail') ? overnight([B], 'mail', [A, B]) : overnight([A, B])))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-changes"]'), label: 'card' })
    click(Array.from(host.querySelectorAll('[role="group"] button')).find((b) => b.textContent?.startsWith('mail')))
    await waitFor(() => host.querySelectorAll('[data-testid^="overnight-run-"]').length === 1, 'filtered run')
    expect(s.calls.some((c) => c.url.includes('lane=mail'))).toBe(true)
    expect(host.querySelector('[data-testid="overnight-run-r2"]')).not.toBeNull()
    // The chips and the header keep every lane while one is chosen.
    expect(host.querySelector('[data-testid="overnight-head"]')?.textContent).toContain('process')
  })

  it('Undo success marks the line Undone', async () => {
    const s = stub((url, init) => (init?.method === 'POST' ? { status: 200, body: { undo_line_id: 'u1', line_id: 'a' } } : overnight([A])))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-changes"]'), label: 'card' })
    await openRun(host, 'r1')
    click(host.querySelector('[data-testid="overnight-line-a"] button'))
    await waitFor(() => host.querySelector('[data-testid="overnight-line-a"]')?.textContent?.includes('Undone'), 'undone')
    expect(s.calls.find((c) => c.method === 'POST')?.url).toBe('/api/receipts/lines/a/undo')
  })

  it.each([
    ['changed_since', { code: 'changed_since', error: 'x' }, 'Changed since, undo by hand'],
    ['not_reversible', { code: 'not_reversible', error: 'x' }, 'Pre-image was not kept'],
  ])('Undo 409 %s says why in plain words', async (_n, body, text) => {
    stub((url, init) => (init?.method === 'POST' ? { status: 409, body } : overnight([run('r1', 'process', [line('a', { inverse_reason: 'Pre-image was not kept' })])])))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-changes"]'), label: 'card' })
    await openRun(host, 'r1')
    click(host.querySelector('[data-testid="overnight-line-a"] button'))
    await waitFor(() => host.querySelector('[data-testid="overnight-refusal"]'), 'refusal')
    expect(host.querySelector('[data-testid="overnight-refusal"]')?.textContent).toBe(text)
    expect(host.textContent).not.toContain('Undone')
  })

  it('Undo 409 already_undone shows Undone', async () => {
    stub((url, init) => (init?.method === 'POST' ? { status: 409, body: { code: 'already_undone', error: 'x' } } : overnight([A])))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-changes"]'), label: 'card' })
    await openRun(host, 'r1')
    click(host.querySelector('[data-testid="overnight-line-a"] button'))
    await waitFor(() => host.querySelector('[data-testid="overnight-line-a"]')?.textContent?.includes('Undone'), 'undone')
  })

  it('Seen posts the newest line time and is offered only while lines are new', async () => {
    const fresh = run('r1', 'process', [line('a', { seen: false, created_at: '2026-10-31T05:01:00.000Z' }), line('bb', { seen: false, created_at: '2026-10-31T05:09:00.000Z' })])
    const s = stub((url, init) => (init?.method === 'POST' ? { status: 200, body: { updated: 1, until: 'x' } } : overnight([fresh])))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => btn(h, 'Seen'), label: 'seen button' })
    await openRun(host, 'r1')
    expect(host.querySelectorAll('[data-testid="overnight-unseen-dot"]').length).toBe(2)
    click(btn(host, 'Seen'))
    await waitFor(() => s.calls.some((c) => c.url === '/api/receipts/seen'), 'seen post')
    expect(JSON.parse(s.calls.find((c) => c.url === '/api/receipts/seen')!.body!)).toEqual({ until: '2026-10-31T05:09:00.000Z' })
  })

  it('no Seen button when everything is seen', async () => {
    stub(() => overnight([B]))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-changes"]'), label: 'card' })
    expect(btn(host, 'Seen')).toBeUndefined()
  })

  it('Load more pulls the rest of a long run', async () => {
    const long = run('r1', 'process', [line('a')], { more_lines: true, next_after: 'a' })
    const s = stub((url) => (url.includes('run=r1') ? { status: 200, body: { run_id: 'r1', lines: [line('bb')], next_after: null } } : overnight([long])))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-changes"]'), label: 'card' })
    await openRun(host, 'r1')
    click(btn(host, 'Load more'))
    await waitFor(() => host.querySelector('[data-testid="overnight-line-bb"]'), 'second page')
    expect(s.calls.some((c) => c.url.includes('run=r1') && c.url.includes('after=a'))).toBe(true)
    expect(btn(host, 'Load more')).toBeUndefined()
  })

  it('an empty window says nothing changed', async () => {
    stub(() => overnight([]))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-empty"]'), label: 'empty' })
    expect(host.textContent).toContain('Nothing changed overnight')
  })

  it('a failed fetch says so and never reads as empty', async () => {
    stub(() => ({ status: 500, body: {} }))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: (h) => h.querySelector('[data-testid="overnight-card"]'), label: 'error' })
    expect(host.textContent).toContain('Couldn\'t load overnight changes')
    expect(host.textContent).not.toContain('Nothing changed')
  })

  it('renders nothing, and asks nothing, for a viewer who is not Nick', async () => {
    const s = stub(() => overnight([A]))
    const host = await mount(wrap(<OvernightCard isNick={false} />), { ready: () => true, label: 'mounted' })
    await new Promise((r) => setTimeout(r, 100))
    expect(host.querySelector('[data-testid="overnight-card"]')).toBeNull()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('renders nothing on a 403', async () => {
    const s = stub(() => ({ status: 403, body: { error: 'Forbidden' } }))
    const host = await mount(wrap(<OvernightCard isNick />), { ready: () => true, label: 'mounted' })
    await waitFor(() => s.fetch.mock.calls.length > 0, 'fetched')
    await new Promise((r) => setTimeout(r, 100))
    expect(host.querySelector('[data-testid="overnight-card"]')).toBeNull()
  })
})

describe('overnight window', () => {
  it('starts at the previous 18:00 Chicago', () => {
    // 2026-10-31 09:00 CDT (UTC-5): the evening is 10-30 18:00 CDT = 23:00Z.
    expect(previousEveningIso(new Date('2026-10-31T14:00:00Z'))).toBe('2026-10-30T23:00:00.000Z')
    // 19:00 CDT the same day: the evening is 10-31 18:00 CDT.
    expect(previousEveningIso(new Date('2026-11-01T00:00:00Z'))).toBe('2026-10-31T23:00:00.000Z')
    // After the fall-back (CST, UTC-6): 11-02 07:00 CST -> 11-01 18:00 CST = 11-02 00:00Z.
    expect(previousEveningIso(new Date('2026-11-02T13:00:00Z'))).toBe('2026-11-02T00:00:00.000Z')
  })

  it('the window starts at the previous evening, whatever was seen', () => {
    expect(overnightSince(new Date('2026-10-31T14:00:00Z'))).toBe('2026-10-30T23:00:00.000Z')
  })
})
