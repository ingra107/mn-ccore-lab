// mail-watch-alarm.test.ts -- the dead-watcher alarm (hourly cron) and the
// Hub's one Telegram sender (schema-v151). On the migration-chain database.

import { describe, it, expect, vi } from 'vitest'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'
import { checkMailWatcherAlarm } from './mail-watch-alarm'
import { sendTelegram } from './telegram'

const T = (s: string) => Date.parse(s)
const ENV = { TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' }

function world() {
  const db = prodSchemaDb()
  const run = (slot: string) => {
    const s = T(slot)
    db.prepare(
      `INSERT INTO watch_runs (id, slot_at, opened_at, closed_at, outcome, threads_expected, script_version)
       VALUES (?, ?, ?, ?, 'complete', 0, 't')`,
    ).run(`wr_${s}`, new Date(s).toISOString(), new Date(s + 60_000).toISOString(), new Date(s + 120_000).toISOString())
  }
  return { db, d1: d1Adapter(db) as unknown as D1Database, run }
}

function fakeFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response('{"ok":true}', { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('the quiet-hour sender refuses', () => {
  it('outside 06:00-18:59 Chicago weekdays, nothing is sent', async () => {
    const { f, calls } = fakeFetch()
    for (const at of ['2026-10-29T03:00:00Z', '2026-10-28T10:30:00Z', '2026-10-31T16:00:00Z', '2026-10-29T00:00:00Z']) {
      expect(await sendTelegram(ENV, 'x', T(at), f)).toEqual({ ok: false, error: 'quiet_hours' })
    }
    expect(calls).toHaveLength(0)
  })

  it('inside ping hours it sends text only: no reply_markup, so no button exists', async () => {
    const { f, calls } = fakeFetch()
    expect(await sendTelegram(ENV, 'hello', T('2026-10-28T16:00:00Z'), f)).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.telegram.org/bottok/sendMessage')
    expect(Object.keys(calls[0].body).sort()).toEqual(['chat_id', 'disable_web_page_preview', 'text'])
  })

  it('an unset token is a recorded failure, not a throw', async () => {
    expect(await sendTelegram({}, 'x', T('2026-10-28T16:00:00Z'))).toEqual({ ok: false, error: 'telegram_not_configured' })
  })
})

describe('checkMailWatcherAlarm: one ping per outage', () => {
  it('two missed slots raise one alarm and one send; the next tick sends nothing more', async () => {
    const { db, d1, run } = world()
    run('2026-10-28T15:00:00Z') // 10:00 CDT ok; 11:00 and 12:00 missed
    const { f, calls } = fakeFetch()
    const first = await checkMailWatcherAlarm(d1, ENV, T('2026-10-28T18:20:00Z'), f)
    expect(first).toMatchObject({ state: 'down', raised: true, sent: true })
    expect(calls).toHaveLength(1)
    expect(String(calls[0].body.text)).toContain('11:00')
    const second = await checkMailWatcherAlarm(d1, ENV, T('2026-10-28T20:20:00Z'), f)
    expect(second).toMatchObject({ state: 'down', raised: false })
    expect(calls).toHaveLength(1)
    const alarms = db.prepare('SELECT missed_slot_at, sent_at, send_error FROM watch_alarms').all() as Record<string, unknown>[]
    expect(alarms).toHaveLength(1)
    expect(alarms[0].missed_slot_at).toBe('2026-10-28T16:00:00.000Z')
    expect(alarms[0].sent_at).not.toBeNull()
  })

  it('a recovered watcher, then a new outage, alarms again (a new outage start)', async () => {
    const { d1, run } = world()
    run('2026-10-28T15:00:00Z')
    const { f, calls } = fakeFetch()
    await checkMailWatcherAlarm(d1, ENV, T('2026-10-28T18:20:00Z'), f)
    run('2026-10-28T18:00:00Z'); run('2026-10-28T19:00:00Z') // 13:00, 14:00 recovered
    expect((await checkMailWatcherAlarm(d1, ENV, T('2026-10-28T20:20:00Z'), f)).state).toBe('current')
    // 15:00, 16:00 missed
    expect((await checkMailWatcherAlarm(d1, ENV, T('2026-10-28T22:20:00Z'), f)).raised).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('one missed slot is late, not down: no alarm', async () => {
    const { d1, run } = world()
    run('2026-10-28T15:00:00Z'); run('2026-10-28T16:00:00Z')
    const { f, calls } = fakeFetch()
    expect((await checkMailWatcherAlarm(d1, ENV, T('2026-10-28T18:20:00Z'), f)).state).toBe('late')
    expect(calls).toHaveLength(0)
  })

  it('a watcher that never ran raises nothing (not installed yet)', async () => {
    const { d1 } = world()
    const { f, calls } = fakeFetch()
    expect((await checkMailWatcherAlarm(d1, ENV, T('2026-10-28T18:20:00Z'), f)).state).toBe('never')
    expect(calls).toHaveLength(0)
  })

  it('a night-time outage stores no alarm until ping hours, then pings once', async () => {
    const { db, d1, run } = world()
    run('2026-10-28T15:00:00Z')
    const { f, calls } = fakeFetch()
    expect((await checkMailWatcherAlarm(d1, ENV, T('2026-10-29T04:00:00Z'), f)).error).toBe('quiet_hours') // 23:00
    expect(db.prepare('SELECT COUNT(*) AS n FROM watch_alarms').get()).toEqual({ n: 0 })
    expect((await checkMailWatcherAlarm(d1, ENV, T('2026-10-29T11:10:00Z'), f)).sent).toBe(true) // 06:10
    expect(calls).toHaveLength(1)
  })

  it('no token: the alarm row records the failure for the Today card', async () => {
    const { db, d1, run } = world()
    run('2026-10-28T15:00:00Z')
    await checkMailWatcherAlarm(d1, {}, T('2026-10-28T18:20:00Z'))
    expect(db.prepare('SELECT send_error FROM watch_alarms').get()).toEqual({ send_error: 'telegram_not_configured' })
  })
})
