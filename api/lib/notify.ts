/**
 * Notify connected WebSocket clients via Durable Object.
 * Fire-and-forget — never blocks the mutation response.
 *
 * The hub-realtime DO lives in a separate Worker (`workers/hub-realtime`)
 * that owns the `NotificationHub` class. Cross-Worker DO access needs a
 * Pages service binding, which wasn't configured — so we go through the
 * public HTTP endpoint instead. `routePartykitRequest` forwards POST to
 * the DO's `onRequest`, which calls `broadcast(body)`. Clients receive
 * the message over their existing PartySocket WebSocket within <1s.
 *
 * Fixed 2026-04-18 (deep-audit Suite 7). Before: `env.NOTIFICATION_HUB`
 * was always undefined, broadcast never fired, clients fell back to 15s
 * polling only.
 */
const PARTY_ROOM_URL = 'https://hub-realtime.nicholas-ingraham.workers.dev/parties/notification-hub/mnccore';

export async function notifyClients(_env: unknown, type: string): Promise<void> {
  try {
    await fetch(PARTY_ROOM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, timestamp: Date.now() }),
    });
  } catch (e) {
    // Never let notification failure break mutations.
    console.error('DO notification failed:', e);
  }
}
