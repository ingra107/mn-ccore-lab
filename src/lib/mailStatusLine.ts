// mailStatusLine -- the Today mail card's always-visible status line
// (schema-v151). Pure: built from the server's snapshot and the moment the
// snapshot was fetched. "Email checked" appears only when the derived
// freshness says the watcher is current; a dead watcher reads in red.

import { localHm } from '../../shared/mailWatch'
import type { MailWatchSnapshot } from '../hooks/useMailWatch'

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "10:42" today, "Fri 18:22" another day (Chicago time). */
function when(iso: string | null, nowMs: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  const day = (t: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
  if (day(ms) === day(nowMs)) return localHm(ms)
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(ms))
  return `${DAY.includes(wd) ? wd : ''} ${localHm(ms)}`.trim()
}

export type StatusTone = 'ok' | 'stale' | 'overdue' | 'quiet'

export interface MailCardQuery {
  data: MailWatchSnapshot | null | undefined
  isError: boolean
  /** When `data` was fetched (React Query dataUpdatedAt). */
  dataUpdatedAt: number
}

/** The card's line from the query state. A failed refetch keeps the last
 *  `data` in React Query, so the error is checked FIRST: a snapshot that
 *  stopped loading never keeps showing its old "Email checked" in the ok tone. */
export function mailCardStatus(q: MailCardQuery): { text: string; tone: StatusTone } | null {
  if (q.isError) {
    const last = q.data?.freshness.last_checked_at
    return { text: `Mail status unavailable${last ? ` · last known check ${when(last, q.dataUpdatedAt)}` : ''}`, tone: 'overdue' }
  }
  return q.data ? mailStatusLine(q.data, q.dataUpdatedAt) : null
}

/** The always-visible status line, from the snapshot alone. */
export function mailStatusLine(snap: MailWatchSnapshot, nowMs: number): { text: string; tone: StatusTone } {
  const f = snap.freshness
  const n = `${f.threads} ${f.threads === 1 ? 'thread' : 'threads'}`
  const failed = snap.alert_error ? ' · Telegram failed' : ''
  const missing = [
    f.unchecked ? `${f.unchecked} not checked` : '',
    f.not_found ? `${f.not_found} not found` : '',
  ].filter(Boolean).join(' · ')
  switch (f.state) {
    case 'never':
      return { text: 'Mail watcher has not run yet', tone: 'stale' }
    case 'down':
      return { text: `Watcher stale since ${when(f.missed_since, nowMs)}${f.last_checked_at ? ` · last check ${when(f.last_checked_at, nowMs)}` : ''}`, tone: 'overdue' }
    case 'late':
      return { text: `Watcher late: ${when(f.missed_since, nowMs)} check missing${failed}`, tone: 'stale' }
    case 'partial':
      return {
        text: `Email checked ${when(f.last_checked_at, nowMs)} · ${n} · ${missing || 'some unreadable'}${failed}`,
        tone: 'stale',
      }
    case 'off_hours':
      return { text: `Email checked ${when(f.last_checked_at, nowMs)} · ${n} · next ${when(f.next_slot_at, nowMs)}${failed}`, tone: failed ? 'overdue' : 'quiet' }
    case 'current':
    default:
      return { text: `Email checked ${when(f.last_checked_at, nowMs)} · ${n}${failed}`, tone: failed ? 'overdue' : 'ok' }
  }
}
