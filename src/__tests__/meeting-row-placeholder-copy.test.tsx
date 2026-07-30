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
  it('keeps "no meeting record" for a truly unmatched personal event', async () => {
    const host = await renderRow(BASE)
    const textarea = await expand(host)
    expect(textarea.placeholder).toBe('Personal calendar event — no meeting record')
  })

  it('does not claim "no meeting record" once matched but undebriefed', async () => {
    const host = await renderRow({ ...BASE, hasUndebriefedMatch: true })
    const textarea = await expand(host)
    expect(textarea.placeholder).not.toContain('no meeting record')
    expect(textarea.placeholder).toContain('own row')
  })
})
