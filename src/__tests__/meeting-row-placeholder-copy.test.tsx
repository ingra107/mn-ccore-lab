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
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventRow } from '../components/today/MeetingRow'
import type { TodayEvent } from '../components/today/constants'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'
import { UndoToastProvider } from '../components/UndoToast'

cleanupMountsAfterEach()

function mount(node: ReactElement): Promise<HTMLElement> {
  return mountShared(node, { ready: (h) => h.querySelector('.meeting-row-header'), label: 'EventRow' })
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

  const REF = { uid: 'abc@google.com', startAt: '2026-08-26T14:00:00.000Z' }

  it('offers Prep on an unmatched calendar row', async () => {
    const host = await renderRow({ ...BASE, dayKey: '2026-08-26', calendarRef: REF })
    expect(pills(host)).toContain('Prep')
  })

  it('withholds Prep when the row has no day to key the meeting on', async () => {
    const host = await renderRow({ ...BASE, calendarRef: REF })
    expect(pills(host)).not.toContain('Prep')
  })

  it('withholds Prep when the row has no calendar key to copy attendees from', async () => {
    const host = await renderRow({ ...BASE, dayKey: '2026-08-26' })
    expect(pills(host)).not.toContain('Prep')
  })

  // projectCalendarEventToDay always builds calendarRef, so an events list from
  // a Worker older than #2225 (no `uid`) yields { uid: undefined, ... }; the
  // pill must test the uid, not the object.
  it('withholds Prep when calendarRef carries no uid', async () => {
    const host = await renderRow({
      ...BASE, dayKey: '2026-08-26',
      calendarRef: { uid: undefined as unknown as string, startAt: REF.startAt },
    })
    expect(pills(host)).not.toContain('Prep')
  })

  it("shows the server's message when Prep fails", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Calendar event not found. The calendar may have refreshed; reload and try again.' }),
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = await mount(
      <QueryClientProvider client={queryClient}>
        <UndoToastProvider>
          <MemoryRouter>
            <EventRow e={{ ...BASE, dayKey: '2026-08-26', calendarRef: REF }} onDismiss={() => {}} onNote={() => {}} isCalEvent />
          </MemoryRouter>
        </UndoToastProvider>
      </QueryClientProvider>,
    )
    const prepButton = [...host.querySelectorAll('.meeting-row-header button')]
      .find((el) => el.textContent?.trim() === 'Prep') as HTMLButtonElement
    prepButton.click()
    for (let i = 0; i < 200 && !/Prep failed/.test(host.textContent ?? ''); i++) {
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(host.textContent).toContain('Prep failed: Calendar event not found')
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
  // `cal-<cache row id>@<date>`. If Prep claimed the slot first the debrief's
  // value would be COALESCE'd away and its action items would render nowhere.
  // The first cut of this feature DID send it (c0339323, fixed same day).
  //
  // #2225: Prep posts only the calendar row's key and the day; the server
  // copies title + attendees from the cache. No title, no attendees, no
  // source_id leave the browser.
  it('posts the calendar key to prep-from-event and sends no source_id', async () => {
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
            e={{ ...BASE, dayKey: '2026-08-26', calendarRef: REF }}
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
      call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/meetings/prep-from-event')) as
        [string, RequestInit] | undefined
      if (call) break
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(call, 'Prep never POSTed to /api/meetings/prep-from-event').toBeTruthy()

    const body = JSON.parse(String(call![1].body))
    expect(body).toEqual({ uid: 'abc@google.com', start_at: '2026-08-26T14:00:00.000Z', day: '2026-08-26' })
    expect(body).not.toHaveProperty('source_id')
  })
})
