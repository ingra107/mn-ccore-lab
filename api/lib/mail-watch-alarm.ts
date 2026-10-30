// mail-watch-alarm.ts -- the dead-watcher alarm, run by the Worker's hourly cron.
//
// The watcher (an Apps Script) cannot report that it stopped. The Today card
// already derives "down" at read time; this is the push half: when the two
// latest due slots both have no closed run, one Telegram message per outage.
//
//   * one alarm per outage: watch_alarms' key is the outage's first missed
//     slot (watchFreshness missed_since = the first slot after the latest
//     closed run), a fixed fact, so it cannot slide however long the outage
//     runs (the 6-day due-slot window used to move it, F1 2026-10-29);
//   * only during ping hours (sendTelegram refuses outside them, and this
//     returns before inserting, so a night-time outage alarms at 06:00);
//   * 'never' (no run has ever closed, e.g. before the script is installed)
//     raises nothing: there is no watcher yet to have died.

import { localHm, pingHoursOpen, slotsBetween, watchFreshness } from '../../shared/mailWatch'
import { loadRuns } from '../routes/mail-watch'
import { sendTelegram, type TelegramEnv } from './telegram'

export interface AlarmOutcome {
  state: string
  raised: boolean
  sent: boolean
  error: string | null
}

export async function checkMailWatcherAlarm(
  db: D1Database, env: TelegramEnv, nowMs: number, fetcher: typeof fetch = fetch,
): Promise<AlarmOutcome> {
  const runs = await loadRuns(db)
  const f = watchFreshness(nowMs, runs, [])
  if (f.state !== 'down' || !f.missed_since) return { state: f.state, raised: false, sent: false, error: null }
  if (!pingHoursOpen(nowMs)) return { state: f.state, raised: false, sent: false, error: 'quiet_hours' }
  const nowIso = new Date(nowMs).toISOString()
  const ins = await db.prepare('INSERT OR IGNORE INTO watch_alarms (missed_slot_at, created_at) VALUES (?, ?)')
    .bind(f.missed_since, nowIso).run()
  if (!ins.meta?.changes) return { state: f.state, raised: false, sent: false, error: null }
  const missed = slotsBetween(Date.parse(f.missed_since), nowMs - 75 * 60_000).map((s) => localHm(s))
  const shown = missed.length > 4 ? [...missed.slice(0, 3), `${missed.length - 3} more`] : missed
  const text = `Mail watcher missed ${shown.join(', ')}. The mail list on Today is stale until it runs again.`
  const res = await sendTelegram(env, text, nowMs, fetcher)
  await db.prepare('UPDATE watch_alarms SET sent_at = ?, send_error = ? WHERE missed_slot_at = ?')
    .bind(res.ok ? nowIso : null, res.ok ? null : res.error, f.missed_since).run()
  return { state: f.state, raised: true, sent: res.ok, error: res.ok ? null : res.error }
}
