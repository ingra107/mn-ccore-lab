// mail-watch.ts -- the mail watcher's routes (schema-v151).
//
// Nick, 2026-10-29: "Build it (Recommended)". A read-only Apps Script runs as
// Nick in slots, reads the Gmail threads tied to open tasks, and reports what
// it saw. It holds MAIL_WATCHER_KEY, which reaches only the three
// auth:'watcher' routes here (route-dsl.ts bindRegistryToHono); this module
// writes only the watcher's own tables and imports no task writer
// (mail-watch.test.ts pins both). Changing a task's status stays a human act.
//
//   POST /api/watcher/runs              open the slot's run; {run:false} outside a slot
//   POST /api/watcher/runs/:id/close    per-thread results + message facts, one batch
//   POST /api/watcher/runs/:id/alert    the script reports its Telegram send
//   GET  /api/mail-watch/snapshot       Nick only: freshness + the threads where the ball is his
//
// Freshness is derived at read time (shared/mailWatch.ts watchFreshness); no
// route returns thread evidence without it.

import {
  alertAllowed, ballOf, classifyParty, displayOf, fromAddress, gmailThreadUrl, GMAIL_THREAD_ID_RX,
  slotFor, threadIdFromUrl, threadPings, watchFreshness,
  type Freshness, type MessageFacts, type RunRow, type StoredMessage, type ThreadReceipt,
} from '../../shared/mailWatch'
import { NOT_QUESTION_SQL_T } from '../../shared/taskKinds'
import { nowInstant } from '../lib/time'

type Json = Record<string, unknown>

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })

/** The most threads one run reads. Apps Script stops a run at 6 minutes;
 *  a metadata read takes well under a second. */
export const MAX_THREADS_PER_RUN = 200

const WAITING_STATUSES = new Set(['waiting', 'waiting_external'])

const OPEN_TASK_SQL = `t.deleted_at IS NULL AND COALESCE(t.completed, 0) = 0
  AND COALESCE(t.status, '') NOT IN ('done', 'completed', 'deleted', 'cancelled') AND ${NOT_QUESTION_SQL_T}`

export interface TiedTask { id: string; title: string; status: string | null }

/** Thread id -> the open tasks tied to it (tasks.source_thread_id, or a live
 *  gmail_thread link on the task). Only Gmail API ids (16 hex) count; a link
 *  holding a 32-char web token is not readable by the API and is skipped. */
export async function tiedThreads(db: D1Database): Promise<Map<string, TiedTask[]>> {
  const bySource = await db.prepare(
    `SELECT t.id, COALESCE(NULLIF(t.short_title, ''), t.title) AS title, t.status, t.source_thread_id AS ref
       FROM tasks t WHERE ${OPEN_TASK_SQL} AND t.source_thread_id IS NOT NULL AND t.source_thread_id != ''`,
  ).all<{ id: string; title: string; status: string | null; ref: string }>()
  const byLink = await db.prepare(
    `SELECT t.id, COALESCE(NULLIF(t.short_title, ''), t.title) AS title, t.status, l.canonical_url AS ref
       FROM links l JOIN tasks t ON t.id = l.owner_id
      WHERE l.owner_table = 'tasks' AND l.type = 'gmail_thread' AND l.deleted_at IS NULL AND ${OPEN_TASK_SQL}`,
  ).all<{ id: string; title: string; status: string | null; ref: string }>()
  const out = new Map<string, TiedTask[]>()
  const add = (tid: string | null, t: { id: string; title: string; status: string | null }) => {
    if (!tid || !GMAIL_THREAD_ID_RX.test(tid)) return
    const list = out.get(tid) ?? []
    if (!list.some((x) => x.id === t.id)) list.push({ id: t.id, title: t.title, status: t.status })
    out.set(tid, list)
  }
  for (const r of bySource.results ?? []) add(r.ref.trim().toLowerCase(), r)
  for (const r of byLink.results ?? []) add(threadIdFromUrl(r.ref), r)
  return out
}

function runId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `wr_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function readBody(request: Request): Promise<Json | null> {
  try {
    const b = await request.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Json) : null
  } catch {
    return null
  }
}

async function runThreads(db: D1Database, id: string): Promise<string[]> {
  const rows = await db.prepare('SELECT thread_id FROM watch_run_threads WHERE run_id = ? ORDER BY thread_id')
    .bind(id).all<{ thread_id: string }>()
  return (rows.results ?? []).map((r) => r.thread_id)
}

/** POST /api/watcher/runs. Inside a slot, opens the slot's run (one per slot:
 *  UNIQUE slot_at) with the thread list fixed at open, and returns thread ids
 *  only; the script never sees a task. A re-fire inside the same slot gets the
 *  same open run back; a slot whose run closed answers {run:false}. */
export async function handleOpenRun(request: Request, db: D1Database): Promise<Response> {
  const body = await readBody(request)
  const version = typeof body?.script_version === 'string' ? body.script_version.slice(0, 40) : ''
  if (!version) return reply({ error: 'script_version required', code: 'bad_request' }, 400)
  const now = Date.parse(nowInstant())
  const slot = slotFor(now)
  if (slot === null) return reply({ run: false, reason: 'outside_slot' })
  const slotAt = new Date(slot).toISOString()
  const existing = await db.prepare('SELECT id, closed_at FROM watch_runs WHERE slot_at = ?')
    .bind(slotAt).first<{ id: string; closed_at: string | null }>()
  if (existing?.closed_at) return reply({ run: false, reason: 'slot_done' })
  if (existing) return reply({ run: true, run_id: existing.id, slot_at: slotAt, threads: await runThreads(db, existing.id) })
  const threads = [...(await tiedThreads(db)).keys()].sort().slice(0, MAX_THREADS_PER_RUN)
  const id = runId()
  const opened = nowInstant()
  // Thread rows attach to whichever run holds the slot, so two concurrent
  // fires cannot hand out two lists.
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO watch_runs (id, slot_at, opened_at, threads_expected, script_version)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, slotAt, opened, threads.length, version),
    ...threads.map((tid) => db.prepare(
      `INSERT OR IGNORE INTO watch_run_threads (run_id, thread_id)
       SELECT id, ? FROM watch_runs WHERE slot_at = ? AND closed_at IS NULL`,
    ).bind(tid, slotAt)),
  ])
  const held = await db.prepare('SELECT id FROM watch_runs WHERE slot_at = ?').bind(slotAt).first<{ id: string }>()
  if (!held) return reply({ error: 'run not opened', code: 'run_open_failed' }, 500)
  return reply({ run: true, run_id: held.id, slot_at: slotAt, threads: await runThreads(db, held.id) })
}

interface ThreadResult {
  thread_id: string
  result: 'read' | 'not_found' | 'error'
  error: string | null
  messages: MessageFacts[]
}

function parseThreadResults(raw: unknown): ThreadResult[] | string {
  if (!Array.isArray(raw)) return 'threads must be an array'
  const out: ThreadResult[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') return 'thread entry must be an object'
    const o = t as Json
    const tid = typeof o.thread_id === 'string' ? o.thread_id : ''
    const result = o.result
    if (!tid || (result !== 'read' && result !== 'not_found' && result !== 'error')) return `bad thread entry ${tid}`
    const messages: MessageFacts[] = []
    if (result === 'read') {
      if (!Array.isArray(o.messages)) return `thread ${tid}: messages must be an array`
      for (const m of o.messages as unknown[]) {
        const mm = m as Json
        if (!mm || typeof mm.message_id !== 'string' || typeof mm.internal_date_ms !== 'number') return `thread ${tid}: bad message`
        const headers: Record<string, string> = {}
        for (const [k, v] of Object.entries((mm.headers as Json) ?? {})) if (typeof v === 'string') headers[k.toLowerCase()] = v
        messages.push({
          message_id: mm.message_id,
          internal_date_ms: mm.internal_date_ms,
          label_ids: Array.isArray(mm.label_ids) ? (mm.label_ids as unknown[]).filter((x): x is string => typeof x === 'string') : [],
          headers,
          snippet: typeof mm.snippet === 'string' ? mm.snippet : '',
        })
      }
    }
    out.push({ thread_id: tid, result, error: typeof o.error === 'string' ? o.error.slice(0, 300) : null, messages })
  }
  return out
}

/** The alert text: who replied on which task, and the thread link. No
 *  excerpt and no button; tapping opens Gmail, it writes nothing. */
export function alertText(pings: { from: string; title: string; thread_id: string }[]): string {
  const head = pings.length === 1 ? 'Mail: the ball is back with you on 1 thread.' : `Mail: the ball is back with you on ${pings.length} threads.`
  const lines = pings.slice(0, 10).map((p) => `${p.from || 'Someone'} · ${p.title}\n${gmailThreadUrl(p.thread_id)}`)
  const more = pings.length > 10 ? [`and ${pings.length - 10} more on the Hub Today page`] : []
  return [head, ...lines, ...more].join('\n\n')
}

/** POST /api/watcher/runs/:id/close. One D1 batch: every message stored,
 *  every thread's result, the run closed. The trigger aborts the batch when a
 *  thread handed out at open has no result. Then the alert rule: the reply
 *  that moved the ball to Nick, evaluated once per message. The text comes
 *  back to the script only while the slot's alert window is open. */
export async function handleCloseRun(id: string, request: Request, db: D1Database): Promise<Response> {
  const body = await readBody(request)
  if (!body) return reply({ error: 'JSON object required', code: 'bad_request' }, 400)
  const parsed = parseThreadResults(body.threads)
  if (typeof parsed === 'string') return reply({ error: parsed, code: 'bad_request' }, 400)
  const run = await db.prepare('SELECT id, slot_at, closed_at, outcome FROM watch_runs WHERE id = ?')
    .bind(id).first<{ id: string; slot_at: string; closed_at: string | null; outcome: string | null }>()
  if (!run) return reply({ error: 'no such run', code: 'not_found' }, 404)
  if (run.closed_at) return reply({ outcome: run.outcome, alert: null, replayed: true })
  const handed = new Set(await runThreads(db, id))
  const results = new Map(parsed.map((t) => [t.thread_id, t]))
  const stray = parsed.filter((t) => !handed.has(t.thread_id)).map((t) => t.thread_id)
  if (stray.length) return reply({ error: 'threads not in this run', code: 'thread_not_in_run', threads: stray }, 400)
  const missing = [...handed].filter((t) => !results.has(t))
  if (missing.length) return reply({ error: 'every thread needs a result', code: 'watch_run_incomplete', threads: missing }, 409)

  const self = new Set(
    (Array.isArray(body.self_addresses) ? body.self_addresses : [])
      .filter((a): a is string => typeof a === 'string').map((a) => a.trim().toLowerCase()),
  )
  const readIds = parsed.filter((t) => t.result === 'read').map((t) => t.thread_id)
  const known = new Set<string>()
  for (let i = 0; i < readIds.length; i += 90) {
    const chunk = readIds.slice(i, i + 90)
    const rows = await db.prepare(
      `SELECT thread_id FROM watch_threads WHERE thread_id IN (${chunk.map(() => '?').join(', ')})`,
    ).bind(...chunk).all<{ thread_id: string }>()
    for (const r of rows.results ?? []) known.add(r.thread_id)
  }
  const now = nowInstant()
  const stmts: D1PreparedStatement[] = []
  for (const t of parsed) {
    if (t.result === 'read') {
      const baseline = known.has(t.thread_id) ? 0 : 1
      for (const m of t.messages) {
        const party = classifyParty(m, self)
        if (party === 'draft') continue
        stmts.push(db.prepare(
          `INSERT OR IGNORE INTO mail_messages
             (message_id, thread_id, internal_at, party, from_display, from_addr, excerpt, first_run_id, baseline)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          m.message_id, t.thread_id, new Date(m.internal_date_ms).toISOString(), party,
          displayOf(m.headers['from']).slice(0, 120) || null, fromAddress(m.headers['from']).slice(0, 200) || null,
          m.snippet ? m.snippet.slice(0, 200) : null, id, baseline,
        ))
      }
      stmts.push(db.prepare('INSERT OR IGNORE INTO watch_threads (thread_id, first_read_at) VALUES (?, ?)').bind(t.thread_id, now))
    }
    stmts.push(db.prepare('UPDATE watch_run_threads SET result = ?, error = ? WHERE run_id = ? AND thread_id = ?')
      .bind(t.result, t.error, id, t.thread_id))
  }
  const outcome = parsed.some((t) => t.result === 'error') ? 'partial' : 'complete'
  stmts.push(db.prepare('UPDATE watch_runs SET closed_at = ?, outcome = ? WHERE id = ? AND closed_at IS NULL')
    .bind(now, outcome, id))
  await db.batch(stmts)

  // ── the alert rule ─────────────────────────────────────────────────────
  const tied = await tiedThreads(db)
  const pings: { from: string; title: string; thread_id: string }[] = []
  for (const tid of readIds) {
    const tasks = tied.get(tid)
    if (!tasks?.length) continue
    const msgs = await db.prepare(
      `SELECT message_id, thread_id, internal_at, party, baseline, alerted_at, from_display
         FROM mail_messages WHERE thread_id = ? ORDER BY internal_at`,
    ).bind(tid).all<StoredMessage & { from_display: string | null }>()
    const list = msgs.results ?? []
    const waiting = tasks.some((t) => WAITING_STATUSES.has(t.status ?? ''))
    if (threadPings(list, waiting)) {
      const last = [...list].reverse().find((m) => m.party === 'other' && m.baseline === 0 && m.alerted_at === null)
      pings.push({ from: last?.from_display ?? '', title: tasks[0].title, thread_id: tid })
    }
  }
  // Every message on a read thread is evaluated once, whether or not it pinged.
  for (let i = 0; i < readIds.length; i += 90) {
    const chunk = readIds.slice(i, i + 90)
    await db.prepare(
      `UPDATE mail_messages SET alerted_at = ? WHERE alerted_at IS NULL AND thread_id IN (${chunk.map(() => '?').join(', ')})`,
    ).bind(now, ...chunk).run()
  }
  const allowed = alertAllowed(Date.parse(now), Date.parse(run.slot_at))
  const alert = pings.length && allowed ? { text: alertText(pings), threads: pings.length } : null
  if (alert) {
    await db.prepare('UPDATE watch_runs SET alert_threads = ? WHERE id = ?').bind(alert.threads, id).run()
  }
  return reply({ outcome, alert, held_back: pings.length > 0 && !allowed ? pings.length : 0 })
}

/** POST /api/watcher/runs/:id/alert {sent: true} | {sent: false, error}. */
export async function handleAlertReport(id: string, request: Request, db: D1Database): Promise<Response> {
  const body = await readBody(request)
  if (!body || typeof body.sent !== 'boolean') return reply({ error: 'sent (boolean) required', code: 'bad_request' }, 400)
  const err = body.sent ? null : (typeof body.error === 'string' && body.error ? body.error.slice(0, 300) : 'send_failed')
  const res = await db.prepare(
    'UPDATE watch_runs SET alert_reported_at = ?, alert_error = ? WHERE id = ? AND alert_threads > 0',
  ).bind(nowInstant(), err, id).run()
  if (!res.meta?.changes) return reply({ error: 'no alert on this run', code: 'not_found' }, 404)
  return reply({ ok: true })
}

// ── reads ────────────────────────────────────────────────────────────────

export async function loadRuns(db: D1Database, limit = 80): Promise<RunRow[]> {
  const rows = await db.prepare(
    'SELECT id, slot_at, opened_at, closed_at, outcome FROM watch_runs ORDER BY slot_at DESC LIMIT ?',
  ).bind(limit).all<RunRow>()
  return rows.results ?? []
}

/** Per-thread receipts: the latest closed run that read each thread. A thread
 *  a run skipped or failed on keeps its older receipt, so it ages honestly. */
async function loadReceipts(db: D1Database, threadIds: readonly string[]): Promise<ThreadReceipt[]> {
  const rows = await db.prepare(
    `SELECT wrt.thread_id, MAX(r.closed_at) AS observed_at
       FROM watch_run_threads wrt JOIN watch_runs r ON r.id = wrt.run_id
      WHERE r.closed_at IS NOT NULL AND wrt.result IN ('read', 'not_found')
      GROUP BY wrt.thread_id`,
  ).all<{ thread_id: string; observed_at: string }>()
  const seen = new Map((rows.results ?? []).map((r) => [r.thread_id, r.observed_at]))
  return threadIds.map((tid) => ({ thread_id: tid, observed_at: seen.get(tid) ?? null }))
}

export interface SnapshotThread {
  thread_id: string
  gmail_url: string
  tasks: TiedTask[]
  observed_at: string | null
  ball: 'nick' | 'them' | 'unknown'
  last_from: string | null
  last_at: string | null
  excerpt: string | null
}

export interface Snapshot {
  freshness: Freshness
  /** The last run's Telegram failure, or the last alarm's. Shown on the card. */
  alert_error: string | null
  /** Threads where the latest human message is someone else's: Nick's move. */
  threads: SnapshotThread[]
}

/** The one read shape: evidence never leaves without its freshness. */
export async function buildSnapshot(db: D1Database, nowMs: number): Promise<Snapshot> {
  const tied = await tiedThreads(db)
  const ids = [...tied.keys()].sort()
  const [runs, receipts] = await Promise.all([loadRuns(db), loadReceipts(db, ids)])
  const freshness = watchFreshness(nowMs, runs, receipts)
  const latest = await db.prepare(
    `SELECT message_id, thread_id, internal_at, party, baseline, alerted_at, from_display, excerpt FROM (
       SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.thread_id ORDER BY m.internal_at DESC) AS rn
         FROM mail_messages m WHERE m.party IN ('nick', 'other')) WHERE rn = 1`,
  ).all<StoredMessage & { from_display: string | null; excerpt: string | null }>()
  const lastBy = new Map((latest.results ?? []).map((m) => [m.thread_id, m]))
  const observed = new Map(receipts.map((r) => [r.thread_id, r.observed_at]))
  const threads: SnapshotThread[] = []
  for (const tid of ids) {
    const last = lastBy.get(tid)
    const ball = last ? ballOf([last]) : 'unknown'
    if (ball !== 'nick') continue
    threads.push({
      thread_id: tid, gmail_url: gmailThreadUrl(tid), tasks: tied.get(tid) ?? [],
      observed_at: observed.get(tid) ?? null, ball,
      last_from: last?.from_display ?? null, last_at: last?.internal_at ?? null, excerpt: last?.excerpt ?? null,
    })
  }
  threads.sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''))
  const err = await db.prepare(
    `SELECT e FROM (
       SELECT alert_error AS e, COALESCE(alert_reported_at, opened_at) AS at FROM watch_runs WHERE alert_error IS NOT NULL
       UNION ALL SELECT send_error AS e, created_at AS at FROM watch_alarms WHERE send_error IS NOT NULL)
     ORDER BY at DESC LIMIT 1`,
  ).first<{ e: string }>()
  return { freshness, alert_error: err?.e ?? null, threads }
}

/** GET /api/mail-watch/snapshot. Nick only (`nick` decided by the caller):
 *  his signed-in session or the PB key. Anyone else gets 403. */
export async function handleSnapshot(db: D1Database, nick: boolean): Promise<Response> {
  if (!nick) return reply({ error: 'Nick only', code: 'forbidden' }, 403)
  return reply(await buildSnapshot(db, Date.parse(nowInstant())))
}
