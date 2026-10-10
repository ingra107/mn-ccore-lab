// clientErrors: a page with no member sender reports nothing; a render loop
// becomes one send with a count; stale chunks and aborted fetches are skipped.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  capture, attachSender, detachSender, flush, SEND_WINDOW_MS, MAX_FINGERPRINTS,
  type ClientErrorItem,
} from '../clientErrors'

let sent: ClientErrorItem[][]
let clock: number
const now = () => clock
// One throw site, as in a real loop: the top frame is part of the key.
const again = () => new Error('again')

beforeEach(() => {
  vi.useFakeTimers()
  sent = []
  clock = 1_000_000
})
afterEach(() => {
  detachSender()
  vi.useRealTimers()
})

describe('no sender, no report', () => {
  it('capture() with no member sender sends nothing and queues nothing', () => {
    capture(new Error('public page crash'), 'uncaught', now)
    // Attaching later must not deliver what happened before (nothing was queued).
    attachSender((items) => sent.push(items))
    vi.advanceTimersByTime(SEND_WINDOW_MS * 2)
    flush(now)
    expect(sent).toEqual([])
  })

  it('detachSender() drops the queue', () => {
    attachSender((items) => sent.push(items))
    capture(new Error('x'), 'caught', now)
    detachSender()
    attachSender((items) => sent.push(items))
    vi.advanceTimersByTime(SEND_WINDOW_MS * 2)
    expect(sent).toEqual([])
  })
})

describe('coalescing', () => {
  it('a loop of 500 identical errors is one send with count 500', () => {
    attachSender((items) => sent.push(items))
    for (let i = 0; i < 500; i++) capture(new Error('render loop'), 'uncaught', now)
    vi.advanceTimersByTime(1_000)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(1)
    expect(sent[0][0]).toMatchObject({ message: 'Error: render loop', kind: 'uncaught', count: 500 })
  })

  it('a repeat inside the window waits for the window, then sends the new count', () => {
    attachSender((items) => sent.push(items))
    capture(again(), 'caught', now)
    vi.advanceTimersByTime(1_000)
    expect(sent).toHaveLength(1)
    clock += 5_000
    capture(again(), 'caught', now)
    capture(again(), 'caught', now)
    vi.advanceTimersByTime(1_000)
    expect(sent).toHaveLength(1)
    clock += SEND_WINDOW_MS
    vi.advanceTimersByTime(SEND_WINDOW_MS)
    expect(sent).toHaveLength(2)
    expect(sent[1][0].count).toBe(2)
  })

  it(`at most ${MAX_FINGERPRINTS} distinct errors per page load`, () => {
    attachSender((items) => sent.push(items))
    for (let i = 0; i < MAX_FINGERPRINTS + 15; i++) capture(new Error(`distinct ${i}`), 'window', now)
    vi.advanceTimersByTime(1_000)
    expect(sent.flat()).toHaveLength(MAX_FINGERPRINTS)
  })
})

describe('skipped', () => {
  it('a stale chunk and an aborted fetch are not reported', () => {
    attachSender((items) => sent.push(items))
    capture(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js'), 'uncaught', now)
    const abort = new Error('The user aborted a request.')
    abort.name = 'AbortError'
    capture(abort, 'rejection', now)
    vi.advanceTimersByTime(SEND_WINDOW_MS)
    expect(sent).toEqual([])
  })
})
