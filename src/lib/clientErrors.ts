// clientErrors -- a signed-in member's browser errors reach hub_errors
// (schema-v123) through POST /api/client-errors.
//
// Feeds: React 19's root error options (main.tsx) and the window `error` /
// `unhandledrejection` listeners. All call capture().
//
// Public pages never report, by construction: capture() drops everything
// while no sender is attached, and only ErrorReporterBinding attaches one. It
// is mounted inside RequireAuth on the member render path, so a page outside
// RequireAuth (the public site) has no sender and nothing is queued. The
// window listeners are installed by attachSender and removed by detachSender,
// so they too exist only for a member.
//
// Flood cap: one error is one fingerprint (message + top frame). A fingerprint
// is sent at most once per SEND_WINDOW_MS; repeats inside the window are
// counted and ride the next send. At most MAX_FINGERPRINTS distinct errors are
// reported per page load. The server upserts by (fingerprint, day), so a
// render loop is one row with a count.
//
// Skipped: a stale chunk (lazyRoute.tsx reloads the page for it) and an
// AbortError rejection (a cancelled fetch is not an error).

import { isStaleChunkError } from './lazyRoute'

export type ClientErrorKind = 'caught' | 'uncaught' | 'recoverable' | 'window' | 'rejection'
export interface ClientErrorItem { message: string; stack?: string; path: string; kind: ClientErrorKind; count: number }
export type Sender = (items: ClientErrorItem[]) => void

export const SEND_WINDOW_MS = 60_000
export const MAX_FINGERPRINTS = 20
const BATCH_DELAY_MS = 1_000
const MAX_BATCH = 20

interface Slot { item: ClientErrorItem; unsent: number; lastSentAt: number | null }

let sender: Sender | null = null
const slots = new Map<string, Slot>()
let timer: ReturnType<typeof setTimeout> | null = null
let detachListeners: (() => void) | null = null

function describe(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack }
  if (typeof err === 'string') return { message: err }
  try { return { message: JSON.stringify(err) ?? String(err) } } catch { return { message: String(err) } }
}

function isAbortError(err: unknown): boolean {
  return (err instanceof Error || (typeof DOMException !== 'undefined' && err instanceof DOMException))
    && (err as Error).name === 'AbortError'
}

function topFrame(stack: string | undefined): string {
  return stack?.split('\n').map((l) => l.trim()).find((l) => l.startsWith('at ')) ?? ''
}

function currentPath(): string {
  return typeof window === 'undefined' ? '' : window.location.pathname
}

function schedule(now: () => number): void {
  if (timer !== null) return
  timer = setTimeout(() => { timer = null; flush(now) }, BATCH_DELAY_MS)
}

/**
 * Send every slot whose window has passed and that has unsent occurrences.
 * `force` ignores the window: detachSender and an uncaught error use it,
 * because the page (or the root) is going away and a later send never comes.
 */
export function flush(now: () => number = Date.now, force = false): void {
  if (!sender) return
  const t = now()
  const due: ClientErrorItem[] = []
  let waiting = false
  for (const slot of slots.values()) {
    if (slot.unsent === 0) continue
    if (!force && slot.lastSentAt !== null && t - slot.lastSentAt < SEND_WINDOW_MS) { waiting = true; continue }
    if (due.length >= MAX_BATCH) { waiting = true; continue }
    due.push({ ...slot.item, count: slot.unsent })
    slot.unsent = 0
    slot.lastSentAt = t
  }
  if (due.length > 0) sender(due)
  if (waiting && timer === null) {
    timer = setTimeout(() => { timer = null; flush(now) }, SEND_WINDOW_MS)
  }
}

/** Report one error. A no-op unless a member's sender is attached. */
export function capture(err: unknown, kind: ClientErrorKind, now: () => number = Date.now): void {
  if (!sender) return
  if (isStaleChunkError(err)) return
  if (kind === 'rejection' && isAbortError(err)) return
  const { message, stack } = describe(err)
  const key = `${message}\u0000${topFrame(stack)}`
  const slot = slots.get(key)
  if (slot) {
    slot.unsent++
  } else {
    if (slots.size >= MAX_FINGERPRINTS) return
    slots.set(key, { item: { message: message.slice(0, 2000), stack: stack?.slice(0, 8000), path: currentPath(), kind, count: 1 }, unsent: 1, lastSentAt: null })
  }
  // An uncaught render error unmounts the root, and with it the binding that
  // holds the sender: send now rather than behind the batch timer.
  // The repeat window still applies (a crash loop is one send a minute).
  if (kind === 'uncaught') flush(now)
  else schedule(now)
}

/** POST to the Hub. keepalive so a report survives the page unloading; failures stay silent (no report loop). */
export const fetchSender: Sender = (items) => {
  void fetch('/api/client-errors', {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ errors: items }),
  }).catch(() => { /* reporting must never raise a reportable error */ })
}

/** Attach the member's sender and the window listeners. Called by ErrorReporterBinding only. */
export function attachSender(send: Sender = fetchSender): void {
  sender = send
  if (detachListeners || typeof window === 'undefined') return
  const onError = (e: ErrorEvent) => capture(e.error ?? e.message, 'window')
  const onRejection = (e: PromiseRejectionEvent) => capture(e.reason, 'rejection')
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  detachListeners = () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

/**
 * Send whatever is still queued (window ignored, keepalive carries it past an
 * unload), then drop the sender, the listeners and the queue. The binding's
 * cleanup calls this when the root unmounts, which is exactly when a white
 * screen's report is still waiting on the batch timer.
 */
export function detachSender(now: () => number = Date.now): void {
  flush(now, true)
  sender = null
  detachListeners?.()
  detachListeners = null
  if (timer !== null) { clearTimeout(timer); timer = null }
  slots.clear()
}

/** React 19 root options for createRoot: report, then log as React would. */
export const rootErrorOptions = {
  onCaughtError(error: unknown, info: { componentStack?: string }) {
    capture(error, 'caught')
    console.error(error, info.componentStack ?? '')
  },
  onUncaughtError(error: unknown, info: { componentStack?: string }) {
    capture(error, 'uncaught')
    console.error(error, info.componentStack ?? '')
  },
  onRecoverableError(error: unknown) {
    capture(error, 'recoverable')
    console.error(error)
  },
}
