// Default retry policy for every query. A 4xx (404 unknown slug, 403 no access,
// 401, 400) will answer the same way again, so retrying it three times only
// delays the error state and multiplies the requests (a bad project URL fired
// ~14 sub-queries x 4 attempts). Network failures and 5xx still retry, up to 3.
// 408 and 429 are the two 4xx that can change on a retry.

const MAX_RETRIES = 3

/** The HTTP status carried by an error from fetchApi (ApiError.status) or
 *  fetchJson ("fetch failed: 404 /api/..."), or null when it has none. */
export function errorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status
  }
  const m = err instanceof Error ? /\b(\d{3})\b/.exec(err.message) : null
  return m && err instanceof Error && /^fetch failed:/.test(err.message) ? Number(m[1]) : null
}

export function shouldRetryQuery(failureCount: number, err: unknown): boolean {
  const status = errorStatus(err)
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) return false
  return failureCount < MAX_RETRIES
}
