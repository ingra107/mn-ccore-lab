// clientErrors: a page with no member sender reports nothing; a render loop
// becomes one send with a count; stale chunks and aborted fetches are skipped.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  capture, attachSender, detachSender, flush, fetchSender, SEND_WINDOW_MS, MAX_FINGERPRINTS,
  MAX_MESSAGE_CHARS, MAX_STACK_CHARS, MAX_BODY_BYTES,
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

  it('detachSender() sends what is queued, then drops the queue', () => {
    attachSender((items) => sent.push(items))
    capture(new Error('x'), 'caught', now)
    detachSender(now)
    expect(sent).toHaveLength(1)
    expect(sent[0][0]).toMatchObject({ message: 'Error: x', count: 1 })
    attachSender((items) => sent.push(items))
    vi.advanceTimersByTime(SEND_WINDOW_MS * 2)
    expect(sent).toHaveLength(1)
  })

  it('a white screen is sent: a capture followed by the unmount still reaches the sender', () => {
    attachSender((items) => sent.push(items))
    capture(again(), 'caught', now)
    vi.advanceTimersByTime(1_000)
    clock += 1_000
    // Inside the repeat window, so only a forced send can deliver it.
    capture(again(), 'caught', now)
    detachSender(now)
    expect(sent).toHaveLength(2)
    expect(sent[1][0].count).toBe(1)
  })

  it('an uncaught error is sent at once, not behind the batch timer', () => {
    attachSender((items) => sent.push(items))
    capture(new Error('render crash'), 'uncaught', now)
    expect(sent).toHaveLength(1)
    expect(sent[0][0]).toMatchObject({ kind: 'uncaught', count: 1 })
  })

  it('an uncaught loop is still capped: one send now, the rest counted for the next', () => {
    attachSender((items) => sent.push(items))
    const crash = () => new Error('uncaught loop')
    for (let i = 0; i < 300; i++) capture(crash(), 'uncaught', now)
    expect(sent).toHaveLength(1)
    detachSender(now)
    expect(sent).toHaveLength(2)
    expect(sent[1][0].count).toBe(299)
  })
})

describe('coalescing', () => {
  it('a loop of 500 identical errors is one send with count 500', () => {
    attachSender((items) => sent.push(items))
    const loop = () => new Error('render loop')
    for (let i = 0; i < 500; i++) capture(loop(), 'caught', now)
    vi.advanceTimersByTime(1_000)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(1)
    expect(sent[0][0]).toMatchObject({ message: 'Error: render loop', kind: 'caught', count: 500 })
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

describe('request size (keepalive body quota is 64 KB)', () => {
  const calls: { body: string; keepalive: boolean }[] = []
  beforeEach(() => {
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ body: init.body as string, keepalive: init.keepalive === true })
      return new Response(null, { status: 202 })
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('20 items at max message and stack length go out as more than one request, each under 56 KB', () => {
    const items: ClientErrorItem[] = Array.from({ length: 20 }, (_, i) => ({
      message: `${i}`.padEnd(MAX_MESSAGE_CHARS, 'm'), stack: `${i}`.padEnd(MAX_STACK_CHARS, 's'),
      path: '/portal/dashboard', kind: 'caught', count: 1,
    }))
    fetchSender(items, false)
    expect(calls.length).toBeGreaterThan(1)
    for (const c of calls) expect(new Blob([c.body]).size).toBeLessThan(MAX_BODY_BYTES)
    expect(calls.flatMap((c) => JSON.parse(c.body).errors)).toHaveLength(20)
  })

  it('a stack is cut to MAX_STACK_CHARS at capture', () => {
    attachSender((items) => sent.push(items))
    const e = new Error('long')
    e.stack = 'Error: long\n' + '    at f (x.js:1:1)\n'.repeat(2000)
    capture(e, 'caught', now)
    detachSender(now)
    expect(sent[0][0].stack!.length).toBeLessThanOrEqual(MAX_STACK_CHARS)
  })

  it('keepalive only on the unmount flush', () => {
    attachSender(fetchSender)
    capture(new Error('timed'), 'caught', now)
    vi.advanceTimersByTime(1_000)
    expect(calls.map((c) => c.keepalive)).toEqual([false])
    clock += 1_000
    capture(new Error('at unmount'), 'caught', now)
    detachSender(now)
    expect(calls.map((c) => c.keepalive)).toEqual([false, true])
  })
})
