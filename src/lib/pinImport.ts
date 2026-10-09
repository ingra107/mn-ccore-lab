// pinImport — which old localStorage pins ('pinned-projects') are DONE after
// the one-shot import POSTs them to /api/pins (useProjectPins).
//
// A slug is settled when the server answered 2xx (pinned) or 404 (a project
// this person cannot see, or one since deleted: there is nothing to pin, ever).
// Anything else -- a network failure (null), a 401/403 from an expired
// session, a 5xx -- is NOT an answer about the pin, so that slug stays in the
// key for the next load to retry. Treating those like a 404 deleted pins the
// person never got back.

/** True when this POST status ends the slug's import for good. */
export function pinPostSettled(status: number | null): boolean {
  return status !== null && ((status >= 200 && status < 300) || status === 404)
}

/** The slugs to keep in localStorage for a retry: those whose POST did not settle. */
export function unsettledPins(slugs: readonly string[], statuses: readonly (number | null)[]): string[] {
  return slugs.filter((_, i) => !pinPostSettled(statuses[i] ?? null))
}
