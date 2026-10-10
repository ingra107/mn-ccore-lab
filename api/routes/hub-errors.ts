// hub-errors.ts -- the two routes of the error ledger (schema-v123).
//
//   POST /api/client-errors     a member's browser reports its errors. The
//                               route is auth 'authed', so the registry gate
//                               refuses anonymous (401) and non-member (403)
//                               callers before this runs. Entries go into the
//                               isolate buffer; withErrorLedger flushes them
//                               on the raw handle after the response.
//   GET  /api/hub-errors/weekly the count per 7-day window, PB API key only
//                               (rows are error text; members never read them).
//
// Plan: PB Scratch/plans/2026-10-09-hub-error-ledger-reconciled.md.

import type { Env, AuthUser } from '../helpers'
import { json, error } from '../helpers'
import { validateApiKey } from '../middleware/api-key-auth'
import { recordError } from '../lib/error-ledger'
import { ctToday } from '../lib/ct-date'

export const MAX_CLIENT_ERRORS = 20
const MAX_MESSAGE = 2000
const MAX_STACK = 8000
const MAX_PATH = 300
const MAX_COUNT = 10_000
const KINDS = new Set(['caught', 'uncaught', 'recoverable', 'window', 'rejection'])

type ClientError = { message: string; stack: string | null; path: string | null; kind: string; count: number }

function parseItem(raw: unknown): ClientError | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.message !== 'string' || r.message.trim() === '') return null
  const kind = typeof r.kind === 'string' && KINDS.has(r.kind) ? r.kind : 'window'
  const count = Number.isInteger(r.count) ? Math.min(MAX_COUNT, Math.max(1, r.count as number)) : 1
  return {
    message: r.message.slice(0, MAX_MESSAGE),
    stack: typeof r.stack === 'string' ? r.stack.slice(0, MAX_STACK) : null,
    path: typeof r.path === 'string' ? r.path.slice(0, MAX_PATH) : null,
    kind,
    count,
  }
}

export async function handleClientErrors(request: Request, user: AuthUser, testDb: boolean): Promise<Response> {
  let body: unknown
  try { body = await request.json() } catch { return error('Body must be JSON', 400) }
  const list = (body as { errors?: unknown })?.errors
  if (!Array.isArray(list) || list.length === 0) return error('errors must be a non-empty array', 400)
  if (list.length > MAX_CLIENT_ERRORS) return error(`at most ${MAX_CLIENT_ERRORS} errors per request`, 400)
  const items = list.map(parseItem)
  if (items.some((i) => i === null)) return error('each error needs a non-empty message', 400)
  const actor = user.slug && user.slug !== 'anonymous' ? user.slug : null
  for (const i of items as ClientError[]) {
    recordError({
      source: 'client',
      message: `[${i.kind}] ${i.message}`,
      stack: i.stack,
      path: i.path,
      actorSlug: actor,
      count: i.count,
      target: testDb ? 'test' : 'prod',
    })
  }
  return json({ accepted: items.length }, 202)
}

/**
 * GET /api/hub-errors/weekly?weeks=N (1..57, default 8). Window 0 is the last
 * 7 America/Chicago days including today (hub_errors.day is a CT civil day);
 * window k ends 7k days ago.
 */
export async function handleHubErrorsWeekly(request: Request, env: Env): Promise<Response> {
  if (validateApiKey(request, env) !== true) return error('Forbidden — API key required', 403)
  const asked = Number(new URL(request.url).searchParams.get('weeks') ?? '8')
  const weeks = Number.isInteger(asked) ? Math.min(57, Math.max(1, asked)) : 8
  const today = ctToday()
  const oldest = ctToday(-(weeks * 7 - 1))
  const res = await env.DB.prepare(
    `SELECT CAST((julianday(?) - julianday(day)) / 7 AS INTEGER) AS weeks_ago, source,
            SUM(count) AS count, COUNT(DISTINCT fingerprint) AS distinct_errors
       FROM hub_errors WHERE day >= ? AND day <= ?
      GROUP BY weeks_ago, source ORDER BY weeks_ago, source`,
  ).bind(today, oldest, today).all<{ weeks_ago: number; source: string; count: number; distinct_errors: number }>()
  const rows = res.results ?? []
  const windows = Array.from({ length: weeks }, (_, k) => {
    const mine = rows.filter((r) => r.weeks_ago === k)
    const bySource: Record<string, number> = { server: 0, cron: 0, client: 0 }
    for (const r of mine) bySource[r.source] = r.count
    return {
      weeks_ago: k,
      start: ctToday(-(7 * k + 6)),
      end: ctToday(-7 * k),
      count: mine.reduce((s, r) => s + r.count, 0),
      distinct_errors_by_source: Object.fromEntries(mine.map((r) => [r.source, r.distinct_errors])),
      by_source: bySource,
    }
  })
  return json({ weeks, windows })
}
