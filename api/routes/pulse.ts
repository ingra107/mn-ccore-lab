/**
 * api/routes/pulse.ts — the What's new / Lab pulse pill (#156, schema-v148).
 *
 *   GET  /api/pulse?week_start=<iso>      the whole panel in one payload
 *   POST /api/releases                     deploy intake, API key only:
 *                                          { probe: true } | { commitTo, commits }
 *   POST /api/releases/:id                 { action: 'edit' | 'approve' | 'discard' }
 *   POST /api/announcements                { body }   signed-in PI only
 *   POST /api/announcements/:id/delete                signed-in PI only
 *
 * Who may do what (spec, "Settled after the builder check"): the API key
 * writes a draft's words; only a signed-in PI (isPiIdentity, never the key)
 * approves, discards or announces. A non-PI viewer never reads a draft:
 * TABLE_SCOPE hides it, so GET reads drafts through the viewer handle and
 * needs no check of its own.
 *
 * The lab-wide numbers come from labPulseCounts, which the caller binds to
 * the UNSCOPED handle (Rule 90 exemption, Nick 2026-10-26); everything that
 * names a row reads through env.DB, the viewer's handle.
 */

import type { Env } from '../helpers'
import { json, error, generateId, getAuthUser, isPiIdentity } from '../helpers'
import { validateApiKey } from '../middleware/api-key-auth'
import { nowInstant } from '../lib/time'
import type { PulseCounts } from '../lib/pulse-aggregates'
import {
  ANNOUNCEMENT_MAX, RELEASE_BLURBS_MAX, RELEASE_TITLE_MAX,
  type PulsePayload, type PulseRelease, type PulseWin, type ReleaseBlurb,
} from '../../shared/pulse'

type CountsFn = (args: { nowIso: string; weekStartIso: string }) => Promise<PulseCounts>

interface ReleaseRow {
  id: string; status: 'draft' | 'approved' | 'discarded'; title: string; blurbs_json: string
  commit_from: string; commit_to: string; commits_json: string; approved_at: string | null
}
type Commit = { sha: string; subject: string }
const RELEASE_COLS = 'id, status, title, blurbs_json, commit_from, commit_to, commits_json, approved_at'

const isKey = (request: Request, env: Env) => validateApiKey(request, env as unknown as { PB_API_KEY?: string }) === true

/** Monday 00:00 in America/Chicago (the lab's clock) as a UTC instant. */
export function chicagoWeekStartIso(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
    .formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))
  const monday = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) - back))
  // Chicago is UTC-5 (CDT) or UTC-6 (CST): take the offset whose local hour is 0.
  for (const offset of [5, 6]) {
    const candidate = new Date(monday.getTime() + offset * 3_600_000)
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(candidate)
    if (Number(hour) === 0) return candidate.toISOString()
  }
  return new Date(monday.getTime() + 6 * 3_600_000).toISOString()
}

/** A stored time in either shape ('YYYY-MM-DD HH:MM:SS' UTC, or ISO) as epoch ms. */
function instant(s: string): number {
  return Date.parse(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`)
}

function toRelease(r: ReleaseRow): PulseRelease {
  return {
    id: r.id,
    title: r.title,
    blurbs: JSON.parse(r.blurbs_json) as ReleaseBlurb[],
    approvedAt: r.approved_at,
    status: r.status === 'draft' ? 'draft' : 'approved',
    commits: r.status === 'draft' ? (JSON.parse(r.commits_json) as Commit[]) : [],
  }
}

export async function handleGetPulse(request: Request, env: Env, counts: CountsFn): Promise<Response> {
  const now = new Date()
  const asked = new URL(request.url).searchParams.get('week_start')
  const weekStartIso = asked && !Number.isNaN(Date.parse(asked)) ? new Date(asked).toISOString() : chicagoWeekStartIso(now)
  const nowIso = now.toISOString()

  const [approved, draft, announcement, milestones, papers, numbers] = await Promise.all([
    env.DB.prepare(
      `SELECT ${RELEASE_COLS} FROM hub_releases WHERE status = 'approved' ORDER BY approved_at DESC, id DESC LIMIT 11`,
    ).all<ReleaseRow>(),
    // TABLE_SCOPE answers this with nothing for a non-PI viewer.
    env.DB.prepare(`SELECT ${RELEASE_COLS} FROM hub_releases WHERE status = 'draft' LIMIT 1`).first<ReleaseRow>(),
    env.DB.prepare(
      `SELECT id, body, author_slug, created_at FROM hub_announcements
        WHERE deleted_at IS NULL AND datetime(created_at) > datetime(?1, '-14 days')
        ORDER BY datetime(created_at) DESC, id DESC LIMIT 1`,
    ).bind(nowIso).first<{ id: string; body: string; author_slug: string; created_at: string }>(),
    env.DB.prepare(
      `SELECT title, completed_at AS date FROM tasks
        WHERE kind = 'milestone' AND deleted_at IS NULL AND completed_at IS NOT NULL
          AND datetime(completed_at) > datetime(?1, '-30 days')
        ORDER BY datetime(completed_at) DESC LIMIT 3`,
    ).bind(nowIso).all<{ title: string; date: string }>(),
    env.DB.prepare(
      `SELECT title, created_at AS date FROM publications
        WHERE datetime(created_at) > datetime(?1, '-30 days')
        ORDER BY datetime(created_at) DESC LIMIT 3`,
    ).bind(nowIso).all<{ title: string; date: string }>(),
    counts({ nowIso, weekStartIso }),
  ])

  const releases = approved.results ?? []
  const wins: PulseWin[] = [
    ...(milestones.results ?? []).map((r) => ({ kind: 'milestone' as const, title: r.title, date: r.date, href: null })),
    ...(papers.results ?? []).map((r) => ({ kind: 'publication' as const, title: r.title, date: r.date, href: null })),
  ].sort((a, b) => instant(b.date) - instant(a.date)).slice(0, 3)

  const payload: PulsePayload = {
    release: releases[0] ? toRelease(releases[0]) : null,
    pastReleases: releases.slice(1).map((r) => ({ id: r.id, title: r.title, approvedAt: r.approved_at ?? '' })),
    draft: draft ? toRelease(draft) : null,
    announcement: announcement
      ? { id: announcement.id, body: announcement.body, authorSlug: announcement.author_slug, createdAt: announcement.created_at }
      : null,
    active: numbers.activeSlugs,
    tasksDone: numbers.tasksDone,
    milestonesHit: numbers.milestonesHit,
    newPapers: numbers.newPapers,
    wins,
  }
  return json({ data: payload })
}

/** The newest draft's commit_to, else the newest approved/discarded one's. */
async function lastCommitTo(env: Env): Promise<string | null> {
  const r = await env.DB.prepare(
    `SELECT commit_to FROM hub_releases
      ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, created_at DESC, id DESC LIMIT 1`,
  ).first<{ commit_to: string }>()
  return r?.commit_to ?? null
}

export async function handleReleaseIntake(request: Request, env: Env): Promise<Response> {
  if (!isKey(request, env)) return error('api_key_only', 403)
  const body = await request.json().catch(() => null) as { probe?: boolean; commitTo?: string; commits?: unknown } | null
  if (!body) return error('invalid_json', 400)
  if (body.probe === true) return json({ data: { lastCommitTo: await lastCommitTo(env) } })

  const commits = Array.isArray(body.commits)
    ? (body.commits as Commit[]).filter((c) => c && typeof c.sha === 'string' && c.sha && typeof c.subject === 'string')
    : null
  if (!commits || typeof body.commitTo !== 'string' || !body.commitTo) return error('commitTo and commits required', 400)
  if (commits.length === 0) return json({ data: null })

  const draft = await env.DB.prepare(`SELECT ${RELEASE_COLS} FROM hub_releases WHERE status = 'draft' LIMIT 1`).first<ReleaseRow>()
  if (draft) {
    const have = JSON.parse(draft.commits_json) as Commit[]
    const seen = new Set(have.map((c) => c.sha))
    const merged = [...have, ...commits.filter((c) => !seen.has(c.sha))]
    await env.DB.prepare(`UPDATE hub_releases SET commits_json = ?, commit_to = ? WHERE id = ?`)
      .bind(JSON.stringify(merged), body.commitTo, draft.id).run()
    return json({ data: { id: draft.id, created: false } })
  }
  const id = generateId('release')
  const from = (await lastCommitTo(env)) ?? commits[0].sha
  await env.DB.prepare(
    `INSERT INTO hub_releases (id, status, commit_from, commit_to, commits_json) VALUES (?, 'draft', ?, ?, ?)`,
  ).bind(id, from, body.commitTo, JSON.stringify(commits)).run()
  return json({ data: { id, created: true } })
}

function validWords(body: { title?: unknown; blurbs?: unknown }): { title: string; blurbs: ReleaseBlurb[] } | string {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > RELEASE_TITLE_MAX) return `title must be 1-${RELEASE_TITLE_MAX} characters`
  if (!Array.isArray(body.blurbs) || body.blurbs.length < 1 || body.blurbs.length > RELEASE_BLURBS_MAX) return `blurbs must be 1-${RELEASE_BLURBS_MAX} items`
  const blurbs: ReleaseBlurb[] = []
  for (const b of body.blurbs as { lead?: unknown; text?: unknown }[]) {
    const lead = typeof b?.lead === 'string' ? b.lead.trim() : ''
    const text = typeof b?.text === 'string' ? b.text.trim() : ''
    if (!lead || !text) return 'every blurb needs a lead and a text'
    blurbs.push({ lead, text })
  }
  return { title, blurbs }
}

export async function handleUpdateRelease(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { action?: string; title?: unknown; blurbs?: unknown } | null
  if (!body) return error('invalid_json', 400)
  const pi = await isPiIdentity(request, env)
  if (body.action === 'edit') {
    if (!pi && !isKey(request, env)) return error('forbidden', 403)
  } else if (body.action === 'approve' || body.action === 'discard') {
    if (!pi) return error('forbidden', 403)
  } else {
    return error('action must be edit, approve or discard', 400)
  }

  const row = await env.DB.prepare(`SELECT ${RELEASE_COLS} FROM hub_releases WHERE id = ?`).bind(id).first<ReleaseRow>()
  if (!row) return error('not_found', 404)
  if (row.status !== 'draft') return error('not_a_draft', 409)

  if (body.action === 'edit') {
    const words = validWords(body)
    if (typeof words === 'string') return error(words, 400)
    await env.DB.prepare(`UPDATE hub_releases SET title = ?, blurbs_json = ? WHERE id = ?`)
      .bind(words.title, JSON.stringify(words.blurbs), id).run()
    return json({ data: { id } })
  }
  if (body.action === 'discard') {
    await env.DB.prepare(`UPDATE hub_releases SET status = 'discarded' WHERE id = ?`).bind(id).run()
    return json({ data: { id, status: 'discarded' } })
  }
  if (typeof validWords({ title: row.title, blurbs: JSON.parse(row.blurbs_json) }) === 'string') return error('needs_blurbs', 400)
  const user = await getAuthUser(request, env)
  await env.DB.prepare(
    `UPDATE hub_releases SET status = 'approved', approved_at = ?, approved_by = ? WHERE id = ?`,
  ).bind(nowInstant(), user?.slug ?? null, id).run()
  return json({ data: { id, status: 'approved' } })
}

export async function handleCreateAnnouncement(request: Request, env: Env): Promise<Response> {
  if (!(await isPiIdentity(request, env))) return error('forbidden', 403)
  const body = await request.json().catch(() => null) as { body?: unknown } | null
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text || text.length > ANNOUNCEMENT_MAX) return error(`announcement must be 1-${ANNOUNCEMENT_MAX} characters`, 400)
  const user = await getAuthUser(request, env)
  const id = generateId('announcement')
  await env.DB.prepare(`INSERT INTO hub_announcements (id, body, author_slug) VALUES (?, ?, ?)`)
    .bind(id, text, user?.slug ?? 'nick-ingraham').run()
  return json({ data: { id } })
}

export async function handleDeleteAnnouncement(id: string, request: Request, env: Env): Promise<Response> {
  if (!(await isPiIdentity(request, env))) return error('forbidden', 403)
  const r = await env.DB.prepare(`UPDATE hub_announcements SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .bind(nowInstant(), id).run()
  if (!r.meta?.changes) return error('not_found', 404)
  return json({ data: { id } })
}
