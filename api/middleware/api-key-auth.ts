/**
 * API key authentication for programmatic access (AI Co-Scientist listener).
 * Requests WITH Authorization header use API key auth.
 * Requests WITHOUT continue using browser-based auth (preserves existing Hub behavior).
 */
export function validateApiKey(request: Request, env: { PB_API_KEY?: string }): boolean | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null; // No auth header = use browser auth (existing behavior)

  if (!env.PB_API_KEY) return false; // API key not configured

  const [scheme, key] = authHeader.split(" ");
  if (scheme !== "Bearer") return false;

  return key === env.PB_API_KEY;
}
