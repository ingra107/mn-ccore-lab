// Guards the timeline meeting card's proportional height.
//
// The footer-style meeting card was ~70px tall for EVERY meeting up to ~100 min,
// so a 30 min and a 60 min meeting looked the same (the June defect Nick named
// 2026-06-18: "30min look the same as 60min", and 2026-08-03: "make the timeline
// not as tall"). The timeline's compact card is one line and takes its height
// from the proportional min-height pxForMeeting() gives it.
//
// Runs in real Chromium (vitest.config.ts browser mode) with the Today skin CSS
// injected (the .tk-* block of index.css, read raw: the full file needs Tailwind).

import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventRow } from '../components/today/MeetingRow'
import { pxForMeeting } from '../components/today/timelineModel'
import type { TodayEvent } from '../components/today/constants'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

// Tokens block (:root + .dark --sk-*) and the .tk-* skin, nothing else.
const tokens = css.slice(css.indexOf('/* ── Stepped-surface tokens'), css.indexOf('/* ── Z-Index Hierarchy'))
const skin = css.slice(css.indexOf('/* ══ Today skin'))
const style = document.createElement('style')
// Tailwind preflight sets border-box app-wide; mirror it so heights match the app.
style.textContent = '*,::before,::after{box-sizing:border-box}\n' + tokens + '\n' + skin
document.head.appendChild(style)

function ev(id: string, minutes: number): TodayEvent {
  return { id: `cal-${id}`, title: `Meeting ${id}`, time: '9:00 AM', end: '10:00 AM', startMin: 540, endMin: 540 + minutes, loc: 'PWB 5-212' }
}

async function heights(compactMode: boolean): Promise<{ h30: number; h60: number; h90: number }> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div className="tk" style={{ width: 700 }}>
          {[['a', 30], ['b', 60], ['c', 90]].map(([id, m]) => (
            <div key={id as string} data-h={m as number}>
              <EventRow
                e={ev(id as string, m as number)}
                onDismiss={() => {}}
                onNote={() => {}}
                isCalEvent
                compact={compactMode}
                minHeight={pxForMeeting(m as number)}
              />
            </div>
          ))}
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelectorAll('[data-h]').length === 3, label: 'EventRows', width: '720px' },
  )
  const h = (m: number) => host.querySelector<HTMLElement>(`[data-h="${m}"] .tk-mc`)!.getBoundingClientRect().height
  vi.unstubAllGlobals()
  return { h30: h(30), h60: h(60), h90: h(90) }
}

describe('timeline meeting card height', () => {
  it('a 30 min and a 60 min meeting render at different heights, in order', async () => {
    const { h30, h60, h90 } = await heights(true)
    expect(h60).toBeGreaterThan(h30)
    expect(h90).toBeGreaterThan(h60)
  })

  it('the compact card does not inflate a short meeting past its proportional height', async () => {
    const { h30 } = await heights(true)
    // pxForMeeting(30) is the 27px floor; allow the 2px card border.
    expect(h30).toBeLessThanOrEqual(pxForMeeting(30) + 3)
  })

  it('the full card (Agenda) is taller than the compact one for the same meeting', async () => {
    const compact = await heights(true)
    const full = await heights(false)
    expect(full.h30).toBeGreaterThan(compact.h30)
  })
})
