// error-ledger.ts -- every Hub error becomes a row in hub_errors (schema-v123).
//
// Why: /api runs as a Pages Function, which keeps no logs, so the 60-odd
// console.error sites in api/ and the request_id onError returns joined to
// nothing. Plan: PB Scratch/plans/2026-10-09-hub-error-ledger-reconciled.md,
// approved by Nick 2026-10-10.
//
// Doors, all through this module:
//   - console.error: patched once per isolate (installConsoleCapture). The
//     original runs first; the call is also buffered. Every existing and future
//     call site is captured with no edit to it.
//   - app.onError: logServerError(), with the request_id as last_request_id.
//   - background work: withErrorLedger() builds the default export, so fetch
//     and scheduled are wrapped and every ctx.waitUntil promise has a recorder
//     on its rejection. No entry point exists outside the wrapper.
//   - POST /api/client-errors pushes member browser errors (source 'client').
//
// The buffer is per isolate and is flushed by one db.batch upsert after each
// request (ctx.waitUntil, so the response is not delayed) and after each cron.
// A row is (fingerprint, day); a repeat adds to `count`.
//
// Flood cap, per isolate: a fingerprint is written at most once per
// REPEAT_WINDOW_MS. Its first occurrence is written by the next flush; repeats
// inside the window accumulate in the buffer and ride a later flush. At most
// MAX_PENDING distinct entries wait at once; past that, new ones are counted
// and reported through rawError, not stored.
//
// Level 2 (one chokepoint). Level 1 is unreachable by mechanism: JavaScript
// lets any code write `catch {}` with no log line, and that error never
// reaches any door. Not covered: silent catches, errors while D1 itself is
// down (the flush fails to rawError), an isolate evicted before its flush,
// the other Pages Functions (functions/og, team, a, assets), hub-realtime,
// console.warn.
//
// Re-entrancy: the module keeps `rawError` (console.error as it was at load)
// and reports its own failures only through it, so a failing flush cannot
// record itself.

import { testDbRequested } from './test-mode'
import { ctDateString } from './ct-date'

export type ErrorSource = 'server' | 'cron' | 'client'
export type LedgerTarget = 'prod' | 'test'

export interface ErrorEntry {
  source: ErrorSource
  message: string
  stack?: string | null
  /** Request path, cron expression, or client pathname. Not part of the fingerprint. */
  path?: string | null
  requestId?: string | null
  actorSlug?: string | null
  /** How many occurrences this entry stands for (a client batch coalesces). */
  count?: number
  /** 'test' = a verified test-mode request; its rows go to DB_TEST. */
  target?: LedgerTarget
}

/** console.error as this isolate started with it. The ledger never logs through the patched one. */
export const rawError: (...args: unknown[]) => void = console.error.bind(console)

export const REPEAT_WINDOW_MS = 60_000
export const MAX_PENDING = 200
const MAX_COUNT = 1_000_000
const MESSAGE_CHARS = 500
const STACK_CHARS = 4000

interface Pending {
  key: string
  source: ErrorSource
  normalized: string
  frame: string
  day: string
  target: LedgerTarget
  message: string
  stack: string | null
  path: string | null
  requestId: string | null
  actorSlug: string | null
  count: number
  firstAt: string
  lastAt: string
}

const pending = new Map<string, Pending>()
const lastWritten = new Map<string, number>()
let dropped = 0

// ── Fingerprint ──────────────────────────────────────────────────────────────

/**
 * The message with everything that varies per occurrence removed: the
 * request_id, ULIDs (typed ids are prefix_ULID), UUIDs, hex runs of 8 or more
 * (generateId's 32-hex ids), then every digit run. What is left names the
 * error, so one bug is one fingerprint whatever id it hit.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/request_id=\S+/g, 'request_id=<id>')
    // Lookarounds, not \b: a typed id is `task_<ULID>`, and `_` is a word char.
    .replace(/(?<![0-9A-Za-z])[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/g, '<ulid>')
    .replace(/(?<![0-9A-Za-z])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9A-Za-z])/gi, '<uuid>')
    .replace(/(?<![0-9A-Za-z])[0-9a-f]{8,}(?![0-9A-Za-z])/gi, '<hex>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The first `at ...` line of a stack, digits stripped (line:col and bundle hashes vary per deploy). */
export function topFrame(stack: string | null | undefined): string {
  if (!stack) return ''
  const line = stack.split('\n').map((l) => l.trim()).find((l) => l.startsWith('at '))
  return line ? line.replace(/\d+/g, '#') : ''
}

/** sha256(source | normalized message | top frame), first 16 hex chars. */
export async function fingerprint(source: ErrorSource, normalized: string, frame: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${source}|${normalized}|${frame}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

// ── Buffer ───────────────────────────────────────────────────────────────────

function sqlTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

/** Buffer one error. Synchronous, never throws to its caller's control flow. */
export function recordError(e: ErrorEntry, now: number = Date.now()): void {
  const message = String(e.message ?? '').trim() || '(empty message)'
  const stack = e.stack ? String(e.stack) : null
  const normalized = normalizeMessage(message)
  const frame = topFrame(stack)
  // The America/Chicago civil day: a week of errors is Nick's week, not UTC's.
  const day = ctDateString(new Date(now))
  const target: LedgerTarget = e.target ?? 'prod'
  const n = Math.min(MAX_COUNT, Math.max(1, Math.floor(Number(e.count ?? 1)) || 1))
  const key = [target, e.source, normalized, frame, day].join('\u0000')
  const at = sqlTime(now)
  const hit = pending.get(key)
  if (hit) {
    hit.count = Math.min(MAX_COUNT, hit.count + n)
    hit.lastAt = at
    if (e.path) hit.path = e.path
    if (e.requestId) hit.requestId = e.requestId
    if (e.actorSlug) hit.actorSlug = e.actorSlug
    return
  }
  if (pending.size >= MAX_PENDING) {
    dropped += n
    return
  }
  pending.set(key, {
    key, source: e.source, normalized, frame, day, target,
    message: message.slice(0, MESSAGE_CHARS),
    stack: stack ? stack.slice(0, STACK_CHARS) : null,
    path: e.path ? String(e.path).slice(0, 300) : null,
    requestId: e.requestId ?? null,
    actorSlug: e.actorSlug ?? null,
    count: n, firstAt: at, lastAt: at,
  })
}

/** Record an error and print it on the ORIGINAL console.error, so it is not captured twice. */
export function logServerError(e: ErrorEntry, ...consoleArgs: unknown[]): void {
  recordError(e)
  rawError(...consoleArgs)
}

const UPSERT = `INSERT INTO hub_errors
  (fingerprint, day, source, count, sample_message, sample_stack, path, last_request_id, last_actor_slug, first_seen_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (fingerprint, day) DO UPDATE SET
    count = hub_errors.count + excluded.count,
    last_seen_at = excluded.last_seen_at,
    path = COALESCE(excluded.path, hub_errors.path),
    last_request_id = COALESCE(excluded.last_request_id, hub_errors.last_request_id),
    last_actor_slug = COALESCE(excluded.last_actor_slug, hub_errors.last_actor_slug)`

/**
 * Write every buffered entry that is due to the raw handle (DB, or DB_TEST
 * for test-mode entries). A failure is reported on rawError and the entries
 * are dropped (never re-buffered: a missing table would loop forever).
 */
export async function flushErrors(
  env: { DB?: D1Database; DB_TEST?: D1Database },
  now: number = Date.now(),
): Promise<void> {
  if (dropped > 0) {
    rawError(`[error-ledger] buffer full: ${dropped} error occurrence(s) not recorded`)
    dropped = 0
  }
  if (pending.size === 0) return
  const due: Pending[] = []
  for (const p of pending.values()) {
    const last = lastWritten.get(p.key)
    if (last !== undefined && now - last < REPEAT_WINDOW_MS) continue
    due.push(p)
  }
  for (const p of due) {
    pending.delete(p.key)
    lastWritten.set(p.key, now)
  }
  if (lastWritten.size > MAX_PENDING * 5) {
    for (const [k, t] of lastWritten) if (now - t >= REPEAT_WINDOW_MS) lastWritten.delete(k)
  }
  for (const target of ['prod', 'test'] as const) {
    const rows = due.filter((p) => p.target === target)
    if (rows.length === 0) continue
    const db = target === 'test' ? env.DB_TEST : env.DB
    if (!db) continue
    try {
      const stmts = await Promise.all(rows.map(async (p) => db.prepare(UPSERT).bind(
        await fingerprint(p.source, p.normalized, p.frame), p.day, p.source, p.count,
        p.message, p.stack, p.path, p.requestId, p.actorSlug, p.firstAt, p.lastAt,
      )))
      await db.batch(stmts)
    } catch (err) {
      // Emission protection (ethos #3 shape 1): the ledger's own failure goes
      // to the original console, never back into the buffer.
      rawError(`[error-ledger] flush of ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} failed:`, err instanceof Error ? err.message : err)
    }
  }
}

/** Test-only: empty the buffer and the repeat window. */
export function _resetErrorLedgerForTests(): void {
  pending.clear()
  lastWritten.clear()
  dropped = 0
}

/** Test-only: what is waiting to be flushed. */
export function _pendingForTests(): { source: ErrorSource; message: string; count: number; target: LedgerTarget }[] {
  return [...pending.values()].map((p) => ({ source: p.source, message: p.message, count: p.count, target: p.target }))
}

// ── console.error capture ────────────────────────────────────────────────────

/**
 * Which door this isolate serves. Pages runs fetch only and the cron Worker
 * runs scheduled only, so the entry point that last ran names the source of
 * a captured console.error. (No AsyncLocalStorage: no route attribution, so
 * captured rows carry path NULL.)
 */
let isolateSource: ErrorSource = 'server'
let installed = false

function describe(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  if (typeof arg === 'string') return arg
  try { return JSON.stringify(arg) ?? String(arg) } catch { return String(arg) }
}

export function entryFromConsoleArgs(args: unknown[], source: ErrorSource): ErrorEntry {
  const err = args.find((a): a is Error => a instanceof Error)
  return { source, message: args.map(describe).join(' '), stack: err?.stack ?? null }
}

/** Patch console.error once per isolate: original first, then buffer. */
export function installConsoleCapture(): void {
  if (installed) return
  installed = true
  const previous = console.error
  console.error = function ledgerConsoleError(...args: unknown[]) {
    previous.apply(console, args)
    try {
      recordError(entryFromConsoleArgs(args, isolateSource))
    } catch (e) {
      rawError('[error-ledger] capture failed:', e instanceof Error ? e.message : e)
    }
  }
}

// ── The entry-point wrapper ──────────────────────────────────────────────────

type FetchHandler<E> = (request: Request, env: E, ctx: ExecutionContext) => Response | Promise<Response>
type ScheduledHandler<E> = (event: ScheduledEvent, env: E, ctx: ExecutionContext) => void | Promise<void>
export interface LedgerHandlers<E> {
  fetch: FetchHandler<E>
  scheduled: ScheduledHandler<E>
}
type LedgerEnv = { DB?: D1Database; DB_TEST?: D1Database }

function errorEntry(err: unknown, source: ErrorSource, path: string | null, target: LedgerTarget): ErrorEntry {
  return {
    source, path, target,
    message: err instanceof Error ? `${err.name}: ${err.message}` : describe(err),
    stack: err instanceof Error ? err.stack ?? null : null,
  }
}

/** ctx whose waitUntil records a rejection (and still logs it). Every other member is the original's. */
function recordingCtx(ctx: ExecutionContext, source: ErrorSource, path: string | null, target: LedgerTarget): ExecutionContext {
  if (!ctx || typeof ctx.waitUntil !== 'function') return ctx
  const waitUntil = (p: Promise<unknown>) => ctx.waitUntil(Promise.resolve(p).catch((err) => {
    recordError(errorEntry(err, source, path, target))
    rawError(`[waitUntil] background task failed (${path ?? 'no path'}):`, err instanceof Error ? err.stack ?? err.message : err)
  }))
  return new Proxy(ctx, {
    get(t, k) {
      if (k === 'waitUntil') return waitUntil
      const v = Reflect.get(t, k, t)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
}

/**
 * Build the Worker default export. fetch and scheduled each install the
 * console capture, record an escaping throw (and rethrow it), wrap ctx so a
 * rejected waitUntil is recorded, and flush when done.
 */
export function withErrorLedger<E extends LedgerEnv>(h: LedgerHandlers<E>): LedgerHandlers<E> {
  return {
    async fetch(request, env, ctx) {
      installConsoleCapture()
      isolateSource = 'server'
      const path = new URL(request.url).pathname
      const target: LedgerTarget = testDbRequested(request, env as unknown as Record<string, unknown>) ? 'test' : 'prod'
      try {
        return await h.fetch(request, env, recordingCtx(ctx, 'server', path, target))
      } catch (err) {
        recordError(errorEntry(err, 'server', path, target))
        throw err
      } finally {
        const flushing = flushErrors(env)
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(flushing)
        else await flushing
      }
    },
    async scheduled(event, env, ctx) {
      installConsoleCapture()
      isolateSource = 'cron'
      try {
        await h.scheduled(event, env, recordingCtx(ctx, 'cron', event.cron, 'prod'))
      } catch (err) {
        recordError(errorEntry(err, 'cron', event.cron, 'prod'))
        throw err
      } finally {
        await flushErrors(env)
      }
    },
  }
}
