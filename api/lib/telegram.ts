// telegram.ts -- the Hub's one Telegram sender: the dead-watcher alarm.
//
// The mail watcher's reply alerts go out from the watcher's own Apps Script
// (Nick, 2026-10-29: "Store it there"). This sender exists for the one alarm
// the watcher cannot raise itself: that it has stopped running. A dead process
// cannot report its own death, so the Worker's hourly cron raises it.
//
// Rules held here, at the only Telegram call in the Hub:
//   * no message outside ping hours (shared/mailWatch.ts pingHoursOpen), so a
//     night or weekend tick refuses even if a caller asks;
//   * text only, no reply_markup: nothing in a ping can be tapped to write;
//   * a failure is returned, never thrown, so the caller records it.

import { pingHoursOpen } from '../../shared/mailWatch'

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
}

export type SendResult = { ok: true } | { ok: false; error: string }

export async function sendTelegram(
  env: TelegramEnv, text: string, nowMs: number, fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  if (!pingHoursOpen(nowMs)) return { ok: false, error: 'quiet_hours' }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { ok: false, error: 'telegram_not_configured' }
  try {
    const res = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    })
    if (!res.ok) return { ok: false, error: `telegram_http_${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `telegram_fetch: ${(e as Error).message}`.slice(0, 200) }
  }
}
