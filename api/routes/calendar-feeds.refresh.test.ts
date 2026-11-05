// R05, R06, R13: personal calendar feed freshness, overlap and date ranges, on the
// real migration chain. fetch is the only stub.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { AuthUser, Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { handleListEvents, pollAllStaleFeeds } from './calendar-feeds'

const USER: AuthUser = { email: 'bob@umn.edu', name: 'Bob', slug: 'bob' }
const DAY = 86_400_000

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  mockFetch.mockReset()
})
afterEach(() => { vi.useRealTimers() })

function feed(extra: Record<string, unknown> = {}) {
  insertRow(db, 'user_calendar_feeds', {
    id: 'f1', user_slug: 'bob', feed_url: 'https://cal.example.com/f1.ics', feed_label: 'Test', last_polled_at: null, ...extra,
  })
}
function event(id: string, startAt: string, endAt: string | null, extra: Record<string, unknown> = {}) {
  insertRow(db, 'user_calendar_events', {
    id, feed_id: 'f1', user_slug: 'bob', uid: id, summary: id, start_at: startAt, end_at: endAt, is_all_day: 0, poll_token: 'old', ...extra,
  })
}
function ics(summary: string) {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//T//T//EN', 'BEGIN:VEVENT', `UID:${summary}@t`, `SUMMARY:${summary}`,
    `DTSTART:${stamp(Date.now() + 3_600_000)}`, `DTEND:${stamp(Date.now() + 7_200_000)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
}
/** An upstream that honours conditional GET: an unchanged calendar answers 304 when asked conditionally. */
function unchangedUpstream(summary = 'Weekly meeting') {
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>
    if (h['If-None-Match'] || h['If-Modified-Since']) return new Response(null, { status: 304 })
    return new Response(ics(summary), { status: 200, headers: { ETag: 'W/"v1"' } })
  })
}
const sentConditional = () => {
  const h = mockFetch.mock.calls[0][1].headers as Record<string, string>
  return Boolean(h['If-None-Match'] || h['If-Modified-Since'])
}
// eslint-disable-next-line local/time-discipline -- a UTC instant in SQLite's datetime('now') form, not a civil day
const sqlStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const summaries = () => (db.prepare('SELECT summary FROM user_calendar_events ORDER BY summary').all() as { summary: string }[]).map((r) => r.summary)

describe('R05: an unchanged feed still re-expands before its horizon runs out', () => {
  it('asks conditionally while the last full fetch is recent', async () => {
    feed({ etag: 'W/"v1"' })
    event('recent', '2026-06-01T10:00:00.000Z', null, { updated_at: sqlStamp(Date.now() - 2 * DAY) })
    unchangedUpstream()
    await pollAllStaleFeeds(env)
    expect(sentConditional()).toBe(true)
    expect(summaries()).toEqual(['recent'])
  })

  it('fetches in full once the last full fetch nears the 14-day horizon, and the new occurrences land', async () => {
    feed({ etag: 'W/"v1"' })
    event('stale', '2026-06-01T10:00:00.000Z', null, { updated_at: sqlStamp(Date.now() - 7 * DAY) })
    unchangedUpstream()
    await pollAllStaleFeeds(env)
    expect(sentConditional()).toBe(false)
    expect(summaries()).toEqual(['Weekly meeting'])
  })

  it('an empty cache asks in full once a day, not on every poll', async () => {
    feed({ etag: 'W/"v1"' })
    unchangedUpstream()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T14:00:00Z'))
    await pollAllStaleFeeds(env)
    expect(sentConditional()).toBe(true)
    expect(summaries()).toEqual([])

    mockFetch.mockClear()
    db.prepare("UPDATE user_calendar_feeds SET last_polled_at = NULL WHERE id = 'f1'").run()
    vi.setSystemTime(new Date('2026-11-06T08:00:00Z'))
    await pollAllStaleFeeds(env)
    expect(sentConditional()).toBe(false)
    expect(summaries()).toEqual(['Weekly meeting'])
  })

  it('a feed with no validators is unaffected', async () => {
    feed()
    unchangedUpstream()
    await pollAllStaleFeeds(env)
    expect(sentConditional()).toBe(false)
  })
})

describe('R06: overlapping polls of one feed', () => {
  it('only one fetches, and the cache survives', async () => {
    feed()
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    mockFetch.mockImplementation(async () => {
      await held
      return new Response(ics('Standup'), { status: 200 })
    })
    const both = Promise.all([pollAllStaleFeeds(env), pollAllStaleFeeds(env)])
    await new Promise((r) => setTimeout(r, 20))
    release()
    await both
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(summaries()).toEqual(['Standup'])
  })

  it('a later stale poll still runs: the lease is the staleness clock, not a lock left behind', async () => {
    feed({ last_polled_at: new Date(Date.now() - DAY).toISOString() })
    unchangedUpstream()
    await pollAllStaleFeeds(env)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    db.prepare("UPDATE user_calendar_feeds SET last_polled_at = ? WHERE id = 'f1'").run(new Date(Date.now() - DAY).toISOString())
    await pollAllStaleFeeds(env)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('R13: a date range means the viewer-local day', () => {
  async function titles(qs: string) {
    const res = await handleListEvents(new URL(`https://x/api/integrations/calendar/events?${qs}`), env, USER)
    expect(res.status).toBe(200)
    return ((await res.json()) as { events: { title: string }[] }).events.map((e) => e.title)
  }
  beforeEach(() => feed())

  it('keeps a Chicago evening on its own day (no tz given: lab time)', async () => {
    event('evening', '2026-11-06T00:30:00.000Z', '2026-11-06T01:00:00.000Z') // Nov 5, 6:30 PM CST
    event('next-morning', '2026-11-06T14:00:00.000Z', '2026-11-06T15:00:00.000Z')
    event('prior-evening', '2026-11-05T02:00:00.000Z', '2026-11-05T03:00:00.000Z') // Nov 4, 8 PM CST
    expect(await titles('start=2026-11-05&end=2026-11-05')).toEqual(['evening'])
  })

  it('uses the viewer zone when the client names one', async () => {
    event('la-evening', '2026-11-06T03:00:00.000Z', '2026-11-06T04:00:00.000Z') // Nov 5, 7 PM PST
    expect(await titles('start=2026-11-05&end=2026-11-05&tz=America/Los_Angeles')).toEqual(['la-evening'])
    expect(await titles('start=2026-11-06&end=2026-11-06&tz=America/Los_Angeles')).toEqual([])
    // Nov 5, 9 PM in Chicago: the same event, in the lab zone, is on the 5th too.
    expect(await titles('start=2026-11-05&end=2026-11-05')).toEqual(['la-evening'])
  })

  it('an unknown zone falls back to lab time rather than UTC', async () => {
    event('evening', '2026-11-06T00:30:00.000Z', '2026-11-06T01:00:00.000Z')
    expect(await titles('start=2026-11-05&end=2026-11-05&tz=Not/AZone')).toEqual(['evening'])
  })

  it('holds across the fall-back day (25 hours) and the spring-forward day (23 hours)', async () => {
    event('fall-late', '2026-11-02T05:30:00.000Z', '2026-11-02T05:45:00.000Z') // Nov 1, 11:30 PM CST
    event('fall-after', '2026-11-02T06:30:00.000Z', '2026-11-02T06:45:00.000Z') // Nov 2, 12:30 AM CST
    expect(await titles('start=2026-11-01&end=2026-11-01')).toEqual(['fall-late'])
    event('spring-late', '2026-03-09T04:30:00.000Z', '2026-03-09T04:45:00.000Z') // Mar 8, 11:30 PM CDT
    event('spring-after', '2026-03-09T05:30:00.000Z', '2026-03-09T05:45:00.000Z') // Mar 9, 12:30 AM CDT
    expect(await titles('start=2026-03-08&end=2026-03-08')).toEqual(['spring-late'])
  })

  it('an all-day event stays on its calendar date, whatever the zone', async () => {
    const allDay = { is_all_day: 1 }
    event('nov-5', '2026-11-05T00:00:00.000Z', '2026-11-06T00:00:00.000Z', allDay)
    event('nov-6', '2026-11-06T00:00:00.000Z', '2026-11-07T00:00:00.000Z', allDay)
    event('nov-4', '2026-11-04T00:00:00.000Z', '2026-11-05T00:00:00.000Z', allDay)
    event('three-days', '2026-11-04T00:00:00.000Z', '2026-11-07T00:00:00.000Z', allDay)
    event('no-end', '2026-11-05T00:00:00.000Z', null, allDay)
    expect((await titles('start=2026-11-05&end=2026-11-05')).sort()).toEqual(['no-end', 'nov-5', 'three-days'])
    expect((await titles('start=2026-11-05&end=2026-11-05&tz=Asia/Tokyo')).sort()).toEqual(['no-end', 'nov-5', 'three-days'])
  })

  it('still returns an overnight event in flight when the window opens (#107)', async () => {
    event('overnight', '2026-11-05T05:00:00.000Z', '2026-11-05T13:00:00.000Z') // Nov 4 11 PM to Nov 5 7 AM CST
    expect(await titles('start=2026-11-05&end=2026-11-05')).toEqual(['overnight'])
  })

  it('refuses a malformed date', async () => {
    const res = await handleListEvents(new URL('https://x/api/integrations/calendar/events?start=nope&end=2026-11-05'), env, USER)
    expect(res.status).toBe(400)
  })
})
