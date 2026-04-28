// Personal calendar iCal feed endpoints. Issue #45.
//
// Each user can paste a private iCal URL (Google "Secret address in iCal
// format", Outlook publish, iCloud share). Hub stores the URL, polls it
// lazily on Today page load (when last_polled_at >15min stale), parses
// VEVENTs, and serves them back per-user / per-date.
//
// The feed URL itself is the secret. We never return it through GET —
// only an obfuscated host preview ("calendar.google.com/...") so users
// can confirm what they pasted without it being copyable from devtools.

import type { Env, AuthUser } from '../helpers'
import { json, error } from '../helpers'
import { actorSlug } from '../helpers'
import { parseIcs, type IcsEvent, type ParseOptions } from '../lib/ics-parser'

const STALE_MINUTES = 15
const FETCH_TIMEOUT_MS = 8000

// D1 batches with thousands of statements hit the storage timeout
// ("D1_ERROR: D1 DB storage operation exceeded timeout which caused
// object to be reset"). Calendar feeds with daily-recurring events
// expand to 1000+ instances over 90 days; chunk inserts so each batch
// stays well under D1's per-batch ceiling.
const INSERT_CHUNK_SIZE = 100

// Hard cap to prevent a malformed RRULE from running away. With
// FREQ=DAILY and no UNTIL/COUNT, a year window expands to 365 events;
// with sub-hour FREQ=MINUTELY (rare but possible), exponential growth.
// 5000 is plenty for any sane personal calendar.
const MAX_EVENTS_PER_FEED = 5000

// Polling window. Read-side query is bounded by the caller (Today =
// today + 7 days), but the cache here is sized to support that lookup
// without missing recent edits. 30 days forward is enough for the
// "Today timeline + next-week glance" use case; expanding to 90 days
// 3x'd the row count and pushed past the D1 batch timeout.
const WINDOW_BACK_DAYS = 1
const WINDOW_FWD_DAYS = 30

interface FeedRow {
  id: string
  user_slug: string
  feed_url: string
  feed_label: string
  last_polled_at: string | null
  last_error: string | null
  created_at: string
}

function newId(): string {
  // 32-char hex like other Hub-created entities (matches tasks/projects).
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function obfuscateUrl(u: string): string {
  try {
    const url = new URL(u)
    const path = url.pathname
    const tail = path.length > 16 ? `…${path.slice(-12)}` : path
    return `${url.host}${tail}`
  } catch { return 'invalid url' }
}

function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // webcal:// is iCloud's preferred scheme — equivalent to https for our
  // purposes (it's just a hint to native calendar apps). Rewrite so fetch()
  // accepts it.
  const normalized = trimmed.replace(/^webcal:\/\//i, 'https://')
  try {
    const u = new URL(normalized)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch { return null }
}

// GET /api/integrations/calendar/feeds — list current user's feeds
export async function handleListFeeds(env: Env, user: AuthUser | null): Promise<Response> {
  if (!user) return error('Unauthorized', 401)
  const slug = actorSlug(user.email)
  const r = await env.DB.prepare(
    'SELECT id, user_slug, feed_url, feed_label, last_polled_at, last_error, created_at FROM user_calendar_feeds WHERE user_slug = ? ORDER BY created_at'
  ).bind(slug).all<FeedRow>()
  const feeds = (r.results ?? []).map((row) => ({
    id: row.id,
    label: row.feed_label,
    urlPreview: obfuscateUrl(row.feed_url),
    lastPolledAt: row.last_polled_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  }))
  return json({ feeds })
}

// POST /api/integrations/calendar/feeds — body: { url, label? }
//
// `waitUntil` is the Workers ExecutionContext callback. Used to run the
// initial poll AFTER the response is returned, so the user gets immediate
// 201 instead of waiting 5-10s for a multi-thousand-event calendar to
// fetch + parse + chunk-insert. If the poll fails, last_error surfaces
// in the Settings UI on the next GET.
export async function handleAddFeed(
  request: Request,
  env: Env,
  user: AuthUser | null,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (!user) return error('Unauthorized', 401)
  const slug = actorSlug(user.email)
  const body = await request.json().catch(() => null) as { url?: string; label?: string } | null
  if (!body) return error('Invalid JSON body', 400)
  const url = sanitizeUrl(body.url ?? '')
  if (!url) return error('Invalid iCal URL — must be http(s) or webcal', 400)
  const label = (body.label ?? '').trim().slice(0, 64) || 'Primary'

  const id = newId()
  try {
    await env.DB.prepare(
      'INSERT INTO user_calendar_feeds (id, user_slug, feed_url, feed_label) VALUES (?, ?, ?, ?)'
    ).bind(id, slug, url, label).run()
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('UNIQUE')) return error('Feed already added', 409)
    throw e
  }

  // Initial poll runs in the background. User gets immediate success;
  // events appear on Today after the poll completes (~5-15 seconds for
  // a typical Google Calendar with weekly recurring meetings).
  const pollPromise = pollFeed(
    env,
    { id, user_slug: slug, feed_url: url, feed_label: label, last_polled_at: null, last_error: null, created_at: new Date().toISOString() },
    user.email,
  ).catch((e) => {
    // Swallow background errors so they don't terminate the worker;
    // last_error in D1 is the durable record.
    console.error('[pollFeed background]', (e as Error).message)
  })
  if (waitUntil) waitUntil(pollPromise)

  return json({ id, label, urlPreview: obfuscateUrl(url) }, 201)
}

// DELETE /api/integrations/calendar/feeds/:id
export async function handleDeleteFeed(env: Env, user: AuthUser | null, id: string): Promise<Response> {
  if (!user) return error('Unauthorized', 401)
  const slug = actorSlug(user.email)
  // Confirm ownership before delete (FK cascade clears events automatically).
  const row = await env.DB.prepare('SELECT user_slug FROM user_calendar_feeds WHERE id = ?').bind(id).first<{ user_slug: string }>()
  if (!row) return error('Feed not found', 404)
  if (row.user_slug !== slug) return error('Forbidden', 403)
  await env.DB.prepare('DELETE FROM user_calendar_feeds WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

// GET /api/integrations/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD
// Refreshes any stale feeds (>15min) before returning.
export async function handleListEvents(url: URL, env: Env, user: AuthUser | null): Promise<Response> {
  if (!user) return error('Unauthorized', 401)
  const slug = actorSlug(user.email)
  const start = url.searchParams.get('start') || new Date().toISOString().slice(0, 10)
  // Default range: today + next 7 days.
  const endDefault = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const end = url.searchParams.get('end') || endDefault

  const feeds = await env.DB.prepare(
    'SELECT id, user_slug, feed_url, feed_label, last_polled_at, last_error, created_at FROM user_calendar_feeds WHERE user_slug = ?'
  ).bind(slug).all<FeedRow>()

  // Refresh stale feeds in parallel. Don't block on errors — stale data
  // beats no data, last_error surfaces in Settings.
  const stalenessCutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()
  const stale = (feeds.results ?? []).filter((f) => !f.last_polled_at || f.last_polled_at < stalenessCutoff)
  if (stale.length > 0) {
    await Promise.allSettled(stale.map((f) => pollFeed(env, f, user.email)))
  }

  // Range query is inclusive on both ends. start_at is ISO with 'Z' suffix
  // so a string compare against `${start}T00:00:00.000Z` works naturally.
  const startBound = `${start}T00:00:00.000Z`
  const endBound = `${end}T23:59:59.999Z`
  const rows = await env.DB.prepare(
    `SELECT id, summary, location, start_at, end_at, is_all_day
     FROM user_calendar_events
     WHERE user_slug = ? AND start_at >= ? AND start_at <= ?
     ORDER BY start_at`
  ).bind(slug, startBound, endBound).all<{ id: string; summary: string | null; location: string | null; start_at: string; end_at: string | null; is_all_day: number }>()

  const events = (rows.results ?? []).map((r) => ({
    id: r.id,
    title: r.summary ?? '(no title)',
    location: r.location,
    startAt: r.start_at,
    endAt: r.end_at,
    isAllDay: r.is_all_day === 1,
  }))
  return json({ events, refreshedFeeds: stale.length })
}

// Internal: poll a single feed, parse, upsert events, update last_polled_at.
// ownerEmail is passed through to the parser so it can drop events the
// user has declined (PARTSTAT=DECLINED).
async function pollFeed(env: Env, feed: FeedRow, ownerEmail: string): Promise<void> {
  let body = ''
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(feed.feed_url, {
      headers: { 'User-Agent': 'mn-ccore-lab-hub/1.0 (calendar-feed-poller)' },
      signal: ctrl.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    } as RequestInit)
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.text()
    if (!body.includes('BEGIN:VCALENDAR')) throw new Error('Response not iCalendar')
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200)
    await env.DB.prepare(
      'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ? WHERE id = ?'
    ).bind(new Date().toISOString(), msg, feed.id).run()
    return
  }

  // Bound the parser's RRULE expansion to the polling window. Without a
  // bound, an event with FREQ=DAILY and no UNTIL would expand for years.
  const parseOpts: ParseOptions = {
    windowStart: new Date(Date.now() - WINDOW_BACK_DAYS * 86400000).toISOString(),
    windowEnd: new Date(Date.now() + WINDOW_FWD_DAYS * 86400000).toISOString(),
    ownerEmail,
  }
  let parsed: IcsEvent[]
  try {
    parsed = parseIcs(body, parseOpts)
  } catch (e) {
    await env.DB.prepare(
      'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ? WHERE id = ?'
    ).bind(new Date().toISOString(), `parse: ${(e as Error).message.slice(0, 180)}`, feed.id).run()
    return
  }

  // Hard cap on instances per feed. Past this, drop the tail and surface
  // a non-fatal error message so the user knows their feed is unusually
  // large (probably a runaway RRULE in a third-party calendar).
  let inWindow = parsed
  let truncated = false
  if (inWindow.length > MAX_EVENTS_PER_FEED) {
    inWindow = inWindow.slice(0, MAX_EVENTS_PER_FEED)
    truncated = true
  }

  // Replace strategy: clear events for this feed, re-insert. Chunked into
  // batches of INSERT_CHUNK_SIZE so each batch stays under D1's per-batch
  // timeout. The DELETE runs in its own batch first; if a later chunk
  // fails the feed will end up partial — last_error captures it so the
  // next poll retries the full set.
  try {
    await env.DB.prepare('DELETE FROM user_calendar_events WHERE feed_id = ?').bind(feed.id).run()
  } catch (e) {
    await env.DB.prepare(
      'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ? WHERE id = ?'
    ).bind(new Date().toISOString(), `delete: ${(e as Error).message.slice(0, 180)}`, feed.id).run()
    return
  }

  const insertStmt = env.DB.prepare(
    `INSERT INTO user_calendar_events (id, feed_id, user_slug, uid, summary, description, location, start_at, end_at, is_all_day, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )

  for (let i = 0; i < inWindow.length; i += INSERT_CHUNK_SIZE) {
    const chunk = inWindow.slice(i, i + INSERT_CHUNK_SIZE)
    const stmts = chunk.map((ev) => insertStmt.bind(
      newId(), feed.id, feed.user_slug, ev.uid, ev.summary, ev.description, ev.location, ev.startAt, ev.endAt, ev.isAllDay ? 1 : 0,
    ))
    try {
      await env.DB.batch(stmts)
    } catch (e) {
      const msg = `insert chunk ${i}: ${(e as Error).message.slice(0, 160)}`
      await env.DB.prepare(
        'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ? WHERE id = ?'
      ).bind(new Date().toISOString(), msg, feed.id).run()
      return
    }
  }

  const finalErr = truncated ? `Truncated to ${MAX_EVENTS_PER_FEED} events (feed had more — likely runaway RRULE)` : null
  await env.DB.prepare(
    'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ? WHERE id = ?'
  ).bind(new Date().toISOString(), finalErr, feed.id).run()
}
