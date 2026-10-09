/**
 * The hub-realtime contract: one file read by the hub-realtime worker
 * (workers/hub-realtime), the main API (api/lib/notify.ts, the ticket route)
 * and the SPA (src/lib/realtimeBus.ts), so the three cannot drift apart.
 *
 * Access model (2026-10-08). The worker has no public way in except a
 * WebSocket upgrade that carries a ticket:
 *   - Broadcast is the Durable Object RPC method `notify`. Only a script holding
 *     a binding to the NotificationHub namespace can call it (the Pages project
 *     and the API worker). There is no HTTP route that broadcasts.
 *   - A ticket comes from `issueTicket`, also RPC, which the main API calls from
 *     GET /api/realtime/ticket. That route sits behind the API's auth and member
 *     gate, so only a Hub member gets one. A ticket is single use and expires
 *     after REALTIME_TICKET_TTL_MS; the DO refuses an upgrade without a live one.
 */

export const REALTIME_ROOM = 'mnccore'
export const REALTIME_PARTY = 'notification-hub'
export const REALTIME_TICKET_PATH = '/api/realtime/ticket'
export const REALTIME_TICKET_PARAM = 'ticket'
export const REALTIME_TICKET_TTL_MS = 60_000

/** What the NotificationHub Durable Object answers over RPC. */
export interface RealtimeHubRpc {
  /** Send `body` to every open connection. */
  notify(body: string): Promise<void>
  /** Mint a single-use connect ticket. The caller has already decided the
   *  requester is a member; the DO does not know who anyone is. */
  issueTicket(): Promise<string>
  /** Liveness for /api/health: proves the binding reaches the DO. */
  ping(): Promise<string>
}
