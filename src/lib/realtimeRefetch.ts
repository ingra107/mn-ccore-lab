// realtimeRefetch.ts -- which queries a lab-wide "something changed" signal
// refetches (useRealtimeSync's invalidateAll). Every query but the version
// poll itself, unless it opts out with `meta: { labChangeRefetch: false }`:
// a query that is lab-wide, mounted in every tab and fresh on its own terms
// (the #156 pulse pill) would otherwise re-run its counts in every member's
// tab on every write anywhere in the lab.
export function refetchesOnLabChange(query: { queryKey: readonly unknown[]; meta?: Record<string, unknown> }): boolean {
  if (query.queryKey[0] === '_version') return false
  return query.meta?.labChangeRefetch !== false
}
