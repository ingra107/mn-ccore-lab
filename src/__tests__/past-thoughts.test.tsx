// Past thoughts on Today (Nick, 2026-10-14: "Show past thoughts"). The compose
// box saves every capture to localStorage today_state_<date>.thoughts; this
// list reads the last 7 days back, newest first, and hides when empty.
//
// Run: npx vitest run src/__tests__/past-thoughts.test.tsx

import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { PastThoughts } from '../components/today/PastThoughts'
import { appendDailyThought, readRecentThoughts } from '../lib/dailyThoughts'
import { todayKey, civilDatePlusDays } from '../lib/taskGrouping'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

function seed(day: string, thoughts: { at: string; kind: string; content: string }[]) {
  window.localStorage.setItem(`today_state_${day}`, JSON.stringify({ thoughts }))
}

function clearThoughtKeys() {
  for (const k of Object.keys(window.localStorage)) {
    if (k.startsWith('today_state_')) window.localStorage.removeItem(k)
  }
}

beforeEach(clearThoughtKeys)

describe('readRecentThoughts', () => {
  it('reads the last 7 days, newest first, and skips older days and junk', () => {
    const today = todayKey()
    seed(today, [{ at: '2026-10-14T15:00:00.000Z', kind: 'note', content: 'today late' }])
    seed(civilDatePlusDays(today, -1), [{ at: '2026-10-13T12:00:00.000Z', kind: 'task', content: 'yesterday' }])
    seed(civilDatePlusDays(today, -6), [{ at: '2026-10-08T12:00:00.000Z', kind: 'task', content: 'six days ago' }])
    seed(civilDatePlusDays(today, -7), [{ at: '2026-10-07T12:00:00.000Z', kind: 'task', content: 'too old' }])
    window.localStorage.setItem(`today_state_${civilDatePlusDays(today, -2)}`, '{not json')

    const got = readRecentThoughts(7, today).map(t => t.content)
    expect(got).toEqual(['today late', 'yesterday', 'six days ago'])
  })

  it('keeps a blob that has a plan but no thoughts out of the list', () => {
    window.localStorage.setItem(`today_state_${todayKey()}`, JSON.stringify({ planned: { t1: { slot: 'strip' } } }))
    expect(readRecentThoughts()).toEqual([])
  })
})

describe('PastThoughts', () => {
  it('renders nothing when there are no thoughts', async () => {
    const host = await mount(<div className="tk"><PastThoughts /><span data-testid="ready" /></div>, {
      ready: h => h.querySelector('[data-testid="ready"]'),
      label: 'PastThoughts (empty)',
    })
    expect(host.querySelector('[data-testid="past-thoughts"]')).toBeNull()
  })

  it('shows a new capture as soon as it is saved, newest first', async () => {
    seed(civilDatePlusDays(todayKey(), -1), [{ at: '2026-10-13T12:00:00.000Z', kind: 'task', content: 'older thought' }])
    const host = await mount(<div className="tk"><PastThoughts /></div>, {
      ready: h => h.querySelector('[data-testid="past-thought"]'),
      label: 'PastThoughts',
    })
    act(() => appendDailyThought('fresh thought', 'note'))
    await waitFor(() => host.querySelectorAll('[data-testid="past-thought"]').length === 2 || null, 'second thought')
    const texts = [...host.querySelectorAll('.tk-past-thoughts-text')].map(e => e.textContent)
    expect(texts).toEqual(['fresh thought', 'older thought'])
  })

  it('shows five and puts the rest behind "Show N more"', async () => {
    const today = todayKey()
    seed(today, Array.from({ length: 7 }, (_, i) => ({
      at: `2026-10-14T1${i}:00:00.000Z`, kind: 'note', content: `t${i}`,
    })))
    const host = await mount(<div className="tk"><PastThoughts /></div>, {
      ready: h => h.querySelector('[data-testid="past-thought"]'),
      label: 'PastThoughts (many)',
    })
    expect(host.querySelectorAll('[data-testid="past-thought"]').length).toBe(5)
    const more = host.querySelector<HTMLButtonElement>('.tk-past-thoughts-more')!
    expect(more.textContent).toBe('Show 2 more')
    act(() => more.click())
    await waitFor(() => host.querySelectorAll('[data-testid="past-thought"]').length === 7 || null, 'all seven')
    expect(host.querySelector('.tk-past-thoughts-more')).toBeNull()
  })
})
