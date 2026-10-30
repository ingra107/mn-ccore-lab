/**
 * API key authentication for programmatic access (AI Co-Scientist listener).
 * Requests WITH an Authorization or X-API-Key header use API key auth.
 * Requests WITHOUT continue using browser-based auth (preserves existing Hub behavior).
 *
 * B8b (SEC-T0-9): accept `X-API-Key: <key>` in addition to
 * `Authorization: Bearer <key>`. PB-side callers (outbox.py, sync/drivers/
 * hub.py, health.py) already send BOTH headers, and a legacy hub.py comment
 * documented an expectation that some PI-only GET routes honour X-API-Key —
 * which validateApiKey never actually checked. Honouring it closes that
 * contract gap. The key must still match env.PB_API_KEY exactly; presence
 * alone is never sufficient (CX-A3).
 */
export function validateApiKey(request: Request, env: { PB_API_KEY?: string }): boolean | null {
  const authHeader = request.headers.get("Authorization");
  const apiKeyHeader = request.headers.get("X-API-Key");
  if (!authHeader && !apiKeyHeader) return null; // No auth header = use browser auth (existing behavior)

  if (!env.PB_API_KEY) return false; // API key not configured

  // X-API-Key path: raw key value (no scheme prefix).
  if (apiKeyHeader) {
    if (apiKeyHeader === env.PB_API_KEY) return true;
    // Fall through to Authorization check only if that header is also present;
    // otherwise an X-API-Key mismatch is a hard reject.
    if (!authHeader) return false;
  }

  if (authHeader) {
    const [scheme, key] = authHeader.split(" ");
    if (scheme !== "Bearer") return false;
    return key === env.PB_API_KEY;
  }

  return false;
}

/**
 * True when the request carries the mail watcher's key (schema-v151) as
 * `Authorization: Bearer <MAIL_WATCHER_KEY>`. Bearer only (no X-API-Key form).
 * A watcher key equal to PB_API_KEY is a misconfiguration and matches nothing,
 * so the watcher can never be mistaken for the all-powerful PB key or the
 * reverse. Where this is true, api/index.ts makes the caller kind 'watcher',
 * which reaches only the auth:'watcher' routes (route-dsl.ts).
 */
export function isMailWatcherKey(
  request: Request, env: { PB_API_KEY?: string; MAIL_WATCHER_KEY?: string },
): boolean {
  const key = env.MAIL_WATCHER_KEY
  if (!key || key === env.PB_API_KEY) return false
  if (request.headers.get("X-API-Key")) return false
  const [scheme, value] = (request.headers.get("Authorization") ?? "").split(" ")
  return scheme === "Bearer" && value === key
}
