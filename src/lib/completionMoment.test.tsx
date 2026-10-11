// The completion moment (color-back pick 5): the box fills on the tick, but the
// ring and the "done this week" count-up wait for the Hub to ACCEPT the write.
// A failed write never celebrates; reduced motion gets the end state instantly.
// Runs in real Chromium (vitest.config.ts browser mode), driving the REAL
// useUpdateTaskStatus mutation against a stubbed fetch the test resolves.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { useUpdateTaskStatus } from '../hooks/mutations/useTaskMutations'
import { CardCheck } from '../components/tasks/TaskCardRow'
import { StatLine } from '../components/today/StatLine'
import { useCompletionMoments, __resetCompletionMoments } from './completionMoment'

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

let mounted: { host: HTMLElement; root: Root }[] = []
const realFetch = globalThis.fetch
const realMatchMedia = window.matchMedia

/** fetch that hangs until the test answers it. */
function stubFetch() {
  let answer: (ok: boolean) => void = () => {}
  globalThis.fetch = (() => new Promise<Response>((resolve) => {
    answer = (ok) => resolve(new Response(JSON.stringify(ok ? { data: { id: 't1', status: 'done' } } : { error: 'nope' }), {
      status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' },
    }))
  })) as typeof fetch
  return { accept: () => answer(true), reject: () => answer(false) }
}

function reducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes('prefers-reduced-motion'),
    media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

const BASE = 52

/** Today in miniature: the box completes t1 through the real mutation; the
 *  week count leaves a still-pending completion out, as TodayPage does. */
function Harness() {
  const update = useUpdateTaskStatus()
  const [done, setDone] = useState(false)
  const { pending } = useCompletionMoments()
  const week = BASE + (done && !pending.has('t1') ? 1 : 0)
  return (
    <div className="tk">
      <CardCheck
        done={done}
        taskId="t1"
        onToggle={() => {
          setDone(true)
          update.mutate({ id: 't1', status: 'done' }, { onError: () => setDone(false) })
        }}
      />
      <StatLine counts={{ overdue: 0, stalled: 0, planned: 0, meetings: 0, doneToday: 0 }} doneThisWeek={week} />
    </div>
  )
}

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter><Harness /></MemoryRouter>
    </QueryClientProvider>,
  )
  mounted.push({ host, root })
  await tick()
  return host
}

const box = (h: HTMLElement) => h.querySelector('button.tk-ck') as HTMLButtonElement
const weekStat = (h: HTMLElement) => h.querySelector('[data-stat="done-week"]') as HTMLElement
const weekValue = (h: HTMLElement) => weekStat(h).querySelector('.tk-v')!.textContent
const weekRuleLit = (h: HTMLElement) => weekStat(h).querySelector('.tk-rl')!.classList.contains('cm-beat')

beforeEach(() => { __resetCompletionMoments(); reducedMotion(false) })
afterEach(() => {
  mounted.forEach(({ host, root }) => { root.unmount(); host.remove() })
  mounted = []
  globalThis.fetch = realFetch
  window.matchMedia = realMatchMedia
})

describe('completion moment', () => {
  it('fills the box on the tick but waits for the accepted write to ring and count', async () => {
    const hub = stubFetch()
    const h = await mount()
    box(h).click()
    await tick()

    // Optimistic: the box is filled, but nothing celebrates yet.
    expect(box(h).classList.contains('tk-on')).toBe(true)
    expect(box(h).classList.contains('cm-ring')).toBe(false)
    expect(weekValue(h)).toBe(String(BASE))
    expect(weekRuleLit(h)).toBe(false)

    hub.accept()
    await tick(60)
    expect(box(h).classList.contains('cm-ring')).toBe(true)
    expect(weekRuleLit(h)).toBe(true)

    await tick(500) // the count-up has run
    expect(weekValue(h)).toBe(String(BASE + 1))

    await tick(600) // the beat is over: everything rests
    expect(box(h).classList.contains('cm-ring')).toBe(false)
    expect(weekRuleLit(h)).toBe(false)
    expect(weekValue(h)).toBe(String(BASE + 1))
  })

  it('never celebrates a write the Hub refused', async () => {
    const hub = stubFetch()
    const h = await mount()
    box(h).click()
    await tick()
    hub.reject()
    await tick(80)

    expect(box(h).classList.contains('tk-on')).toBe(false)
    expect(box(h).classList.contains('cm-ring')).toBe(false)
    expect(weekRuleLit(h)).toBe(false)
    expect(weekValue(h)).toBe(String(BASE))
  })

  it('is instant under prefers-reduced-motion: no ring, no beat, the count just moves', async () => {
    reducedMotion(true)
    const hub = stubFetch()
    const h = await mount()
    box(h).click()
    await tick()
    expect(weekValue(h)).toBe(String(BASE))

    hub.accept()
    await tick(60)
    expect(box(h).classList.contains('tk-on')).toBe(true)
    expect(box(h).classList.contains('cm-ring')).toBe(false)
    expect(weekRuleLit(h)).toBe(false)
    expect(weekValue(h)).toBe(String(BASE + 1))
  })
})
