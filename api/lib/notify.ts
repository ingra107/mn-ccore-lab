/**
 * Notify connected WebSocket clients via the hub-realtime Durable Object.
 * Fire-and-forget — never blocks the mutation response.
 *
 * Cross-Worker DO access runs through a service binding (wrangler.toml:
 * `[[services]] binding = "NOTIFICATION_HUB" service = "hub-realtime"`).
 * `env.NOTIFICATION_HUB` is a Fetcher bound to the hub-realtime worker.
 * We POST to `/parties/notification-hub/mnccore`, the party URL that
 * `routePartykitRequest` forwards into the DO's `onRequest`, which calls
 * `broadcast(body)`. Clients receive over their existing PartySocket WS
 * connection within <1s.
 *
 * Fallback: if the binding is missing (e.g. stale wrangler config on a
 * preview deploy), fall back to a public HTTP fetch. Polling still covers
 * the cross-tab case at 15s either way.
 *
 * History:
 *  - Pre-2026-04-18: env.NOTIFICATION_HUB as DurableObjectNamespace —
 *    binding never existed, silent no-op, clients saw updates only on
 *    next /api/version poll.
 *  - 2026-04-18 AM: HTTP-only path via public URL (worked but DNS+TLS).
 *  - 2026-04-18 late: service binding wired; internal fetch is the
 *    primary path, HTTP fallback retained for preview safety.
 */
const PUBLIC_FALLBACK_URL = 'https://hub-realtime.nicholas-ingraham.workers.dev/parties/notification-hub/mnccore';

interface NotifyEnv {
  NOTIFICATION_HUB?: { fetch(request: Request): Promise<Response> };
}

export async function notifyClients(env: NotifyEnv, type: string): Promise<void> {
  const payload = JSON.stringify({ type, timestamp: Date.now() });
  const headers = { 'Content-Type': 'application/json' };

  // Prefer the service binding — routes internally, no network hop.
  if (env?.NOTIFICATION_HUB?.fetch) {
    try {
      await env.NOTIFICATION_HUB.fetch(
        new Request('https://hub-realtime/parties/notification-hub/mnccore', {
          method: 'POST',
          headers,
          body: payload,
        }),
      );
      return;
    } catch (e) {
      console.error('DO service-binding notify failed, falling back to public URL:', e);
    }
  }

  // Fallback: public HTTP POST (used on previews without the binding).
  try {
    await fetch(PUBLIC_FALLBACK_URL, { method: 'POST', headers, body: payload });
  } catch (e) {
    console.error('DO public-URL notify failed:', e);
  }
}
