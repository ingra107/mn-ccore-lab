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
import { parseIcs, type IcsEvent } from '../lib/ics-parser'

const STALE_MINUTES = 15
const FETCH_TIMEOUT_MS = 8000

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
export async function handleAddFeed(request: Request, env: Env, user: AuthUser | null): Promise<Response> {
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

  // Eager poll on add so the user sees events immediately. Best-effort —
  // failures land in last_error and surface in the Settings UI.
  await pollFeed(env, { id, user_slug: slug, feed_url: url, feed_label: label, last_polled_at: null, last_error: null, created_at: new Date().toISOString() })

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
    await Promise.allSettled(stale.map((f) => pollFeed(env, f)))
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
async function pollFeed(env: Env, feed: FeedRow): Promise<void> {
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

  let parsed: IcsEvent[]
  try {
    parsed = parseIcs(body)
  } catch (e) {
    await env.DB.prepare(
      'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = ? WHERE id = ?'
    ).bind(new Date().toISOString(), `parse: ${(e as Error).message.slice(0, 180)}`, feed.id).run()
    return
  }

  // Only retain events whose start falls within today-7 .. today+90. Calendar
  // feeds often carry years of history that we don't need on a Today timeline.
  const minDate = new Date(Date.now() - 7 * 86400000).toISOString()
  const maxDate = new Date(Date.now() + 90 * 86400000).toISOString()
  const inWindow = parsed.filter((e) => e.startAt >= minDate && e.startAt <= maxDate)

  // Replace strategy: clear events for this feed, re-insert. Simpler than
  // diffing UIDs, and per-feed event counts are <500 typical so the write
  // cost is fine.
  const stmts: D1PreparedStatement[] = []
  stmts.push(env.DB.prepare('DELETE FROM user_calendar_events WHERE feed_id = ?').bind(feed.id))
  for (const ev of inWindow) {
    stmts.push(env.DB.prepare(
      `INSERT INTO user_calendar_events (id, feed_id, user_slug, uid, summary, description, location, start_at, end_at, is_all_day, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(newId(), feed.id, feed.user_slug, ev.uid, ev.summary, ev.description, ev.location, ev.startAt, ev.endAt, ev.isAllDay ? 1 : 0))
  }
  stmts.push(env.DB.prepare(
    'UPDATE user_calendar_feeds SET last_polled_at = ?, last_error = NULL WHERE id = ?'
  ).bind(new Date().toISOString(), feed.id))

  await env.DB.batch(stmts)
}
