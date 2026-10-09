/**
 * The main API's handle on the hub-realtime Durable Object.
 *
 * Both deployments bind the NotificationHub namespace directly as
 * NOTIFICATION_HUB: the Pages project (dashboard binding, which serves /api)
 * and the API worker (wrangler.toml [env.production], crons only). The API
 * calls the DO's RPC methods (shared/realtime.ts); no HTTP request is made, and
 * the hub-realtime worker has no HTTP route that broadcasts.
 *
 * History:
 *  - Pre-2026-04-18: binding typed as a namespace but never existed; no-op.
 *  - 2026-04-18: POST to the public workers.dev URL, then a worker service
 *    binding with the public URL kept as a fallback "for previews".
 *  - Until 2026-10-08 Pages bound the namespace (not a service), so its env
 *    had no `.fetch` and every Hub write broadcast through the public URL,
 *    which accepted a POST from anyone. Replaced by RPC; the fallback is gone.
 */
import { REALTIME_ROOM, type RealtimeHubRpc } from '../../shared/realtime';

interface HubNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): unknown;
}

export interface RealtimeEnv {
  NOTIFICATION_HUB?: unknown;
}

/** The room's DO stub, or null when this deployment has no namespace binding
 *  (a Pages preview, local dev). */
export function realtimeHub(env: RealtimeEnv | undefined): RealtimeHubRpc | null {
  const ns = env?.NOTIFICATION_HUB as HubNamespace | undefined;
  if (!ns || typeof ns.idFromName !== 'function' || typeof ns.get !== 'function') return null;
  return ns.get(ns.idFromName(REALTIME_ROOM)) as RealtimeHubRpc;
}

/** Fire-and-forget: tell connected clients that data changed. Never throws;
 *  clients still poll /api/version, so a miss costs latency, not data. */
export async function notifyClients(env: RealtimeEnv, type: string): Promise<void> {
  const hub = realtimeHub(env);
  if (!hub) {
    console.warn('[realtime] NOTIFICATION_HUB namespace not bound; no broadcast');
    return;
  }
  try {
    await hub.notify(JSON.stringify({ type, timestamp: Date.now() }));
  } catch (e) {
    console.error('[realtime] notify failed:', e);
  }
}
