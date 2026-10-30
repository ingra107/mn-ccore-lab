// mailStatusLine.test.ts -- the Today mail card's always-visible status line
// (schema-v151). It may say "Email checked" only when the server's derived
// freshness says the watcher is current; a dead watcher says so in red.

import { describe, it, expect } from 'vitest'
import { mailStatusLine } from '../mailStatusLine'
import type { MailWatchSnapshot } from '../../hooks/useMailWatch'

const NOW = Date.parse('2026-10-28T16:30:00Z') // Wed 11:30 CDT

function snap(f: Partial<MailWatchSnapshot['freshness']>, alert_error: string | null = null): MailWatchSnapshot {
  return {
    freshness: {
      state: 'current', last_checked_at: '2026-10-28T15:42:00Z', last_complete_at: '2026-10-28T15:42:00Z',
      missed_since: null, next_slot_at: '2026-10-28T17:00:00Z', threads: 14, unchecked: 0, ...f,
    },
    alert_error, threads: [],
  }
}

describe('mailStatusLine', () => {
  it('current: "Email checked 10:42 · 14 threads"', () => {
    expect(mailStatusLine(snap({}), NOW)).toEqual({ text: 'Email checked 10:42 · 14 threads', tone: 'ok' })
  })
  it('down: "Watcher stale since 10:00", red', () => {
    const r = mailStatusLine(snap({ state: 'down', missed_since: '2026-10-28T15:00:00Z', last_checked_at: '2026-10-28T14:05:00Z' }), NOW)
    expect(r.text).toBe('Watcher stale since 10:00 · last check 09:05')
    expect(r.tone).toBe('overdue')
  })
  it('never: says it has not run, never "checked"', () => {
    const r = mailStatusLine(snap({ state: 'never', last_checked_at: null }), NOW)
    expect(r.text).not.toContain('checked')
  })
  it('partial names the unchecked threads', () => {
    expect(mailStatusLine(snap({ state: 'partial', unchecked: 2 }), NOW).text).toBe('Email checked 10:42 · 14 threads · 2 not checked')
  })
  it('off hours shows another day with its weekday', () => {
    const r = mailStatusLine(snap({ state: 'off_hours', last_checked_at: '2026-10-23T23:22:00Z', next_slot_at: '2026-10-26T11:00:00Z' }), NOW)
    expect(r.text).toBe('Email checked Fri 18:22 · 14 threads · next Mon 06:00')
  })
  it('a failed Telegram send shows on the line', () => {
    expect(mailStatusLine(snap({}, 'telegram_http_401'), NOW)).toEqual({ text: 'Email checked 10:42 · 14 threads · Telegram failed', tone: 'overdue' })
  })
})
