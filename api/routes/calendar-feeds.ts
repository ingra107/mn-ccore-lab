// Personal calendar iCal feed endpoints. Issue #45.
//
// Each user can paste a private iCal URL (Google "Secret address in iCal
// format", Outlook publish, iCloud share). Hub stores the URL, polls it
// via a cron trigger (hourly, 24×/day), parses VEVENTs, and serves them
// back per-user / per-date.
//
// HTTP conditional GET (ETag/If-Modified-Since) is used on every poll so
// unchanged calendars return 304 (~200 bytes) instead of a full iCal export
// (~500KB). After the first successful poll, ~95% of subsequent cron firings
// should hit the 304 cheap path.
//
// The feed URL itself is the secret. We never return it through GET —
// only an obfuscated host preview ("calendar.google.com/...") so users
// can confirm what they pasted without it being copyable from devtools.

import type { Env, AuthUser } from '../helpers'
import { json, error } from '../helpers'
import { actorSlug } from '../helpers'
import { parseIcs, type IcsEvent, type ParseOptions } from '../lib/ics-parser'

// Staleness threshold: feeds older than this are eligible for a cron re-poll.
// Set to 50 min so the hourly cron (fires at :00) always picks up feeds last
// polled at :00 of the prior hour (50 min < 60 min gap).
const STALE_MINUTES = 50
// On-demand path (GET /events): 25s keeps us inside the 30s subrequest hard
// cap. Only used for ?force=1 explicit refresh; normal GETs are cache-only.
const FETCH_TIMEOUT_ONDEMAND_MS = 25000
// Cron path: hourly wall-clock budget means 60s per feed is safe even
// for slow Google Calendar iCal exports (the actual bottleneck for Nick's
// busy academic calendar).
const FETCH_TIMEOUT_CRON_MS = 60000

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
  etag: string | null
  last_modified: string | null
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
    'SELECT id, user_slug, feed_url, feed_label, last_polled_at, last_error, created_at, etag, last_modified FROM user_calendar_feeds WHERE user_slug = ? ORDER BY created_at'
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
    { id, user_slug: slug, feed_url: url, feed_label: label, last_polled_at: null, last_error: null, created_at: new Date().toISOString(), etag: null, last_modified: null },
    user.email,
    FETCH_TIMEOUT_ONDEMAND_MS,
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

// GET /api/integrations/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD[&force=1]
//
// Normal requests return cached events ONLY — no blocking fetch to upstream
// iCal. Cache is populated by the hourly Cron Trigger, which uses HTTP
// conditional GET (ETag/If-Modified-Since) so unchanged calendars cost ~200
// bytes (304) instead of the full ~500KB iCal export.
//
// ?force=1  — explicit manual refresh: fires stale polls in the background
// via waitUntil (on-demand timeout 25s). Use sparingly; prefer cron cache.
export async function handleListEvents(
  url: URL,
  env: Env,
  user: AuthUser | null,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (!user) return error('Unauthorized', 401)
  const slug = actorSlug(user.email)
  const start = url.searchParams.get('start') || new Date().toISOString().slice(0, 10)
  // Default range: today + next 7 days.
  const endDefault = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const end = url.searchParams.get('end') || endDefault
  const forceRefresh = url.searchParams.get('force') === '1'

  // ?force=1: fire stale-feed polls in the background so the response still
  // returns immediately (cached data). Poll runs after response via waitUntil.
  if (forceRefresh) {
    const feeds = await env.DB.prepare(
      'SELECT id, user_slug, feed_url, feed_label, last_polled_at, last_error, created_at, etag, last_modified FROM user_calendar_feeds WHERE user_slug = ?'
    ).bind(slug).all<FeedRow>()
    const stalenessCutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()
    const stale = (feeds.results ?? []).filter((f) => !f.last_polled_at || f.last_polled_at < stalenessCutoff)
    if (stale.length > 0) {
      const pollAll = Promise.allSettled(stale.map((f) =>
        pollFeed(env, f, user.email, FETCH_TIMEOUT_ONDEMAND_MS).catch((e) => {
          console.error('[handleListEvents force pollFeed]', (e as Error).message)
        })
      ))
      if (waitUntil) {
        waitUntil(pollAll)
      } else {
        await pollAll
      }
    }
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
  return json({ events })
}

// Exported for Cron Trigger: poll all feeds whose last_polled_at is stale
// (>50 min old or never polled, so hourly cron always catches the prior cycle).
// Called from the scheduled() handler with FETCH_TIMEOUT_CRON_MS (60s).
// Uses HTTP conditional GET — most polls will hit 304 once feeds stabilize.
export async function pollAllStaleFeeds(env: Env): Promise<void> {
  const stalenessCutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()
  const r = await env.DB.prepare(
    `SELECT id, user_slug, feed_url, feed_label, last_polled_at, last_error, created_at, etag, last_modified
     FROM user_calendar_feeds
     WHERE last_polled_at IS NULL OR last_polled_at < ?`
  ).bind(stalenessCutoff).all<FeedRow>()
  const stale = r.results ?? []
  if (stale.length === 0) {
    console.log('[CalendarCron] No stale feeds — skipping')
    return
  }
  console.log(`[CalendarCron] Polling ${stale.length} stale feed(s)`)
  // Sequential: avoids overwhelming D1 with parallel batch writes. Each
  // pollFeed does a DELETE + N batched INSERTs; running in parallel risks
  // hitting D1's concurrent statement ceiling on large calendars.
  for (const feed of stale) {
    try {
      await pollFeed(env, feed, feed.user_slug, FETCH_TIMEOUT_CRON_MS)
      console.log(`[CalendarCron] Polled feed ${feed.id} (${feed.user_slug})`)
    } catch (e) {
      console.error(`[CalendarCron] Feed ${feed.id} threw:`, (e as Error).message)
    }
  }
}

// Internal: poll a single feed, parse, upsert events, update last_polled_at.
// ownerEmail is passed through to the parser so it can drop events the
// user has declined (PARTSTAT=DECLINED). timeoutMs defaults to the
// on-demand limit; cron callers pass FETCH_TIMEOUT_CRON_MS (60s).
//
// HTTP conditional GET: if the feed row has a stored ETag or Last-Modified
// header from a prior poll, we send If-None-Match / If-Modified-Since on the
// request. A 304 Not Modified response means the calendar hasn't changed —
// we update last_polled_at and return early without touching the events table.
// This makes the typical cron firing ~200 bytes instead of ~500KB.
async function pollFeed(env: Env, feed: FeedRow, ownerEmail: string, timeoutMs = FETCH_TIMEOUT_ONDEMAND_MS): Promise<void> {
  let body = ''
  let newEtag: string | null = null
  let newLastModified: string | null = null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'mn-ccore-lab-hub/1.0 (calendar-feed-poller)',
      'Accept': 'text/calendar',
    }
    if (feed.etag) reqHeaders['If-None-Match'] = feed.etag
    if (feed.last_modified) reqHeaders['If-Modified-Since'] = feed.last_modified
    const res = await fetch(feed.feed_url, {
      headers: reqHeaders,
      signal: ctrl.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    } as RequestInit)
    clearTimeout(timer)

    // 304 Not Modified: calendar unchanged since last poll. Cheap path.
    if (res.status === 304) {
      console.log(`pollFeed ${feed.id}: 304 Not Modified (cheap path)`)
      await env.DB.prepare(
        'UPDATE user_calendar_feeds SET last_polled_at = ? WHERE id = ?'
      ).bind(new Date().toISOString(), feed.id).run()
      return
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    // Capture conditional GET headers for next poll.
    newEtag = res.headers.get('ETag')
    newLastModified = res.headers.get('Last-Modified')

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
    // Parse failure: don't persist new conditional headers — the body may
    // be corrupt. Clear any stored etag/last_modified so next poll re-fetches
    // the full response rather than risking another 304 against a bad body.
    await env.DB.prepare(
      'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ?, etag = NULL, last_modified = NULL WHERE id = ?'
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
      'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ?, etag = NULL, last_modified = NULL WHERE id = ?'
    ).bind(new Date().toISOString(), `delete: ${(e as Error).message.slice(0, 180)}`, feed.id).run()
    return
  }

  // Batched INSERT OR REPLACE. Schema v61 unique key is (feed_id, uid, start_at),
  // so each recurring instance (same UID, different start_at) lands in its own
  // row. Same UID + same start_at = REPLACE (handles updates from re-poll).
  // The JS Map dedupe block was removed — it was collapsing legitimate recurring
  // instances by keeping only last-seen UID, exactly the bug this fix addresses.
  const insertStmt = env.DB.prepare(
    `INSERT OR REPLACE INTO user_calendar_events
     (id, feed_id, user_slug, uid, summary, description, location, start_at, end_at, is_all_day, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )

  for (let i = 0; i < inWindow.length; i += INSERT_CHUNK_SIZE) {
    const chunk = inWindow.slice(i, i + INSERT_CHUNK_SIZE)
    const stmts = chunk.map((ev) => insertStmt.bind(
      newId(), feed.id, feed.user_slug, ev.uid, ev.summary, ev.description, ev.location,
      ev.startAt, ev.endAt, ev.isAllDay ? 1 : 0,
    ))
    try {
      await env.DB.batch(stmts)
    } catch (e) {
      const msg = `insert chunk ${i}: ${(e as Error).message.slice(0, 160)}`
      // Don't persist conditional headers on partial failure — force a full
      // re-fetch next poll so the events table is rebuilt cleanly.
      await env.DB.prepare(
        'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ?, etag = NULL, last_modified = NULL WHERE id = ?'
      ).bind(new Date().toISOString(), msg, feed.id).run()
      return
    }
  }

  console.log(`pollFeed ${feed.id}: 200 OK, parsed ${inWindow.length} events, inserted ${inWindow.length} (${Math.ceil(inWindow.length / INSERT_CHUNK_SIZE)} chunk(s))`)

  const finalErr = truncated ? `Truncated to ${MAX_EVENTS_PER_FEED} events (feed had more — likely runaway RRULE)` : null
  // Persist ETag + Last-Modified so next poll can send If-None-Match /
  // If-Modified-Since for a cheap 304 response if the calendar hasn't changed.
  await env.DB.prepare(
    'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ?, etag = ?, last_modified = ? WHERE id = ?'
  ).bind(new Date().toISOString(), finalErr, newEtag, newLastModified, feed.id).run()
}
