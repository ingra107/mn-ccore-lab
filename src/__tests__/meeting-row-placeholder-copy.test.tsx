// Guards the #550 copy fix: a cal- row matched to a same-day D1 meeting that
// has no debrief notes yet must NOT claim "no meeting record" — a record
// exists, its live jot textarea just lives on the native untimed row instead
// (7b5188de). Before this fix the placeholder was identical for that case
// and for a truly unmatched personal event, which was flatly wrong.
//
// Runs in real Chromium (vitest.config.ts browser mode). Mounts with
// react-dom directly — the repo carries no testing-library.

import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventRow } from '../components/today/MeetingRow'
import type { TodayEvent } from '../components/today/constants'

let mounted: { host: HTMLElement; root: Root }[] = []

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  mounted.push({ host, root })
  // React 19 commits asynchronously; poll rather than assume one tick is enough.
  for (let i = 0; i < 100; i++) {
    if (host.querySelector('.meeting-row-header')) return host
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('EventRow never rendered')
}

async function expand(host: HTMLElement): Promise<HTMLTextAreaElement> {
  host.querySelector<HTMLElement>('.meeting-row-header')!.click()
  for (let i = 0; i < 100; i++) {
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')
    if (textarea) return textarea
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('notes textarea never rendered after expand')
}

afterEach(() => {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
  vi.unstubAllGlobals()
})

function renderRow(e: TodayEvent): Promise<HTMLElement> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EventRow e={e} onDismiss={() => {}} onNote={() => {}} isCalEvent />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const BASE: TodayEvent = { id: 'cal-1', time: '9:00 AM', title: 'Standup' }

describe('EventRow placeholder copy (#550)', () => {
  it('tells a truly unmatched personal event there is no page, and how to get one', async () => {
    const host = await renderRow(BASE)
    const textarea = await expand(host)
    // Copy changed with the Prep pill: the old wording ("no meeting record")
    // was a dead end, and now there is a button in the header that fixes it.
    expect(textarea.placeholder).toBe('No meeting page yet — press Prep to build an agenda')
  })

  it('does not claim there is no page once matched but undebriefed', async () => {
    const host = await renderRow({ ...BASE, hasUndebriefedMatch: true })
    const textarea = await expand(host)
    expect(textarea.placeholder).not.toContain('No meeting page yet')
    expect(textarea.placeholder).toContain('own row')
  })
})

// The Prep pill itself: offered only for a calendar row with no meeting
// record AND a day to key the D1 row on; replaced by an Agenda link the
// moment a record exists (matched or native).
describe('EventRow Prep pill', () => {
  function pills(host: HTMLElement): string[] {
    return [...host.querySelectorAll('.meeting-row-header a, .meeting-row-header button')]
      .map((el) => el.textContent?.trim() ?? '')
  }

  it('offers Prep on an unmatched calendar row', async () => {
    const host = await renderRow({ ...BASE, dayKey: '2026-08-26' })
    expect(pills(host)).toContain('Prep')
  })

  it('withholds Prep when the row has no day to key the meeting on', async () => {
    const host = await renderRow(BASE)
    expect(pills(host)).not.toContain('Prep')
  })

  it('shows Agenda instead of Prep once a meeting record exists', async () => {
    const host = await renderRow({ ...BASE, dayKey: '2026-08-26', matchedMeetingId: 'mtg-2026-08-26-abc' })
    expect(pills(host)).toContain('Agenda')
    expect(pills(host)).not.toContain('Prep')
  })

  // Regression guard, CLAUDE.md rule 83. `meetings.source_id` is SET-ONCE on
  // the server (COALESCE(source_id, ?)) and belongs to the PB debrief push,
  // which writes `source_id = <manifest meeting_id>` so that
  // `tasks.meeting_id IN (m.id, m.source_id)` can find a meeting's action
  // items. PB mints those as `cal-YYYYMMDDTHHMM-<slug>`; a Today row's id is
  // `cal-<icalUID>@<date>`. If Prep claimed the slot first the debrief's value
  // would be COALESCE'd away and its action items would render nowhere. The
  // first cut of this feature DID send it (c0339323, fixed same day).
  it('sends no source_id — that slot belongs to the PB debrief push', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'mtg-2026-08-26-new' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = await mount(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <EventRow
            e={{ ...BASE, dayKey: '2026-08-26' }}
            onDismiss={() => {}}
            onNote={() => {}}
            isCalEvent
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const prepButton = [...host.querySelectorAll('.meeting-row-header button')]
      .find((el) => el.textContent?.trim() === 'Prep') as HTMLButtonElement
    expect(prepButton).toBeTruthy()
    prepButton.click()

    let call: [string, RequestInit] | undefined
    for (let i = 0; i < 100; i++) {
      call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/meetings')) as
        [string, RequestInit] | undefined
      if (call) break
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(call, 'Prep never POSTed to /api/meetings').toBeTruthy()

    const body = JSON.parse(String(call![1].body))
    expect(body).toEqual({ date: '2026-08-26', title: 'Standup' })
    expect(body).not.toHaveProperty('source_id')
  })
})
