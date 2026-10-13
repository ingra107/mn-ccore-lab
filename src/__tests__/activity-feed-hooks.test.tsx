// #125: the shared pieces the day and meeting feeds (and Projects) now stand on.
//
//   - nextPollDecision: poll every 10s while Hermes is thinking, give up after the
//     ceiling, and let a NEW placeholder start a fresh wait (items 4 and 5)
//   - useUrlEnumFilter: the URL-backed enum filter Projects copied twice (item 7)
//
// Real Chromium (vitest.config.ts browser mode).

import { describe, it, expect } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { HERMES_PENDING_PLACEHOLDER } from '../components/hermesPendingUtil'
import { nextPollDecision, POLL_MS, POLL_CEILING_MS } from '../hooks/useActivityFeedQuery'
import { useUrlEnumFilter } from '../hooks/useUrlEnumFilter'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const pending = (id: string) => ({ id, body: HERMES_PENDING_PLACEHOLDER })
const said = (id: string) => ({ id, body: 'an ordinary comment' })

describe('nextPollDecision (bounded poll while Hermes is thinking)', () => {
  it('does not poll when nothing is pending, and forgets any earlier wait', () => {
    expect(nextPollDecision([said('a')], { key: 'old', since: 0 }, 5_000)).toEqual({ interval: false, wait: null })
    expect(nextPollDecision([], null, 0)).toEqual({ interval: false, wait: null })
  })

  it('polls every POLL_MS while a placeholder is pending and starts the wait clock', () => {
    const first = nextPollDecision([said('a'), pending('p1')], null, 1_000)
    expect(first).toEqual({ interval: POLL_MS, wait: { key: 'p1', since: 1_000 } })
    const later = nextPollDecision([pending('p1')], first.wait, 1_000 + POLL_CEILING_MS - 1)
    expect(later.interval).toBe(POLL_MS)
  })

  it('gives up once the same placeholder has waited the ceiling, and stays given up', () => {
    const wait = { key: 'p1', since: 1_000 }
    expect(nextPollDecision([pending('p1')], wait, 1_000 + POLL_CEILING_MS).interval).toBe(false)
    expect(nextPollDecision([pending('p1')], wait, 1_000 + 10 * POLL_CEILING_MS).interval).toBe(false)
  })

  it('a NEW placeholder (a fresh ask) restarts the wait, so a dead one never silences the next', () => {
    const dead = { key: 'p1', since: 0 }
    const next = nextPollDecision([pending('p1'), pending('p2')], dead, POLL_CEILING_MS * 5)
    expect(next).toEqual({ interval: POLL_MS, wait: { key: 'p1,p2', since: POLL_CEILING_MS * 5 } })
  })
})

function Probe({ valid }: { valid: string[] }) {
  const [active, set] = useUrlEnumFilter('status', new Set(valid), 'open')
  const loc = useLocation()
  return (
    <div>
      <span data-testid="active">{active}</span>
      <span data-testid="search">{loc.search}</span>
      <button onClick={() => set('done')}>done</button>
      <button onClick={() => set('open')}>open</button>
    </div>
  )
}

describe('useUrlEnumFilter', () => {
  const read = (host: HTMLElement, id: string) => host.querySelector(`[data-testid="${id}"]`)!.textContent
  const click = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === label)!.click()

  it('reads a valid param, falls back to the default for an absent or invalid one', async () => {
    const valid = ['open', 'done']
    const a = await mount(<MemoryRouter initialEntries={['/p?status=done']}><Probe valid={valid} /></MemoryRouter>, { ready: (h) => h.querySelector('[data-testid="active"]'), label: 'valid' })
    expect(read(a, 'active')).toBe('done')
    const b = await mount(<MemoryRouter initialEntries={['/p?status=bogus']}><Probe valid={valid} /></MemoryRouter>, { ready: (h) => h.querySelector('[data-testid="active"]'), label: 'invalid' })
    expect(read(b, 'active')).toBe('open')
    const c = await mount(<MemoryRouter initialEntries={['/p']}><Probe valid={valid} /></MemoryRouter>, { ready: (h) => h.querySelector('[data-testid="active"]'), label: 'absent' })
    expect(read(c, 'active')).toBe('open')
  })

  it('writes the param for a non-default value, clears it for the default, and keeps other params', async () => {
    const host = await mount(
      <MemoryRouter initialEntries={['/p?filter=stalled']}><Probe valid={['open', 'done']} /></MemoryRouter>,
      { ready: (h) => h.querySelector('[data-testid="active"]'), label: 'probe' },
    )
    click(host, 'done')
    await waitFor(() => (read(host, 'active') === 'done' ? true : null), 'status=done')
    expect(read(host, 'search')).toBe('?filter=stalled&status=done')
    click(host, 'open')
    await waitFor(() => (read(host, 'active') === 'open' ? true : null), 'back to default')
    expect(read(host, 'search')).toBe('?filter=stalled')
  })
})
