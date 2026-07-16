// src/lib/seen.ts — pure helpers for the "seen"/attention system (T11/T12,
// schema v81). Dependency-free (no React/react-query) so useEntitySeen.ts's
// data-fetching hook stays thin and this stays independently unit-testable.
//
// #548 (2026-07-16, "cold-start gold-NEW flood"): entity_seen has no rows
// for meetings created/updated before per-viewer seen tracking shipped, so
// the backend's never_seen=1 arm (api/routes/seen.ts:86 — a Worker route,
// out of hub-frontend's realm) legitimately flags EVERY pre-existing,
// never-opened meeting as unseen. That floods the Meetings tab, the
// matched Today-timeline rows, AND the sidebar nav's unseen count
// (Sidebar.tsx:173, unseen.meetings.size) with gold NEW badges until each
// meeting is opened once by hand.
//
// The row's own hypothesis offered two fix-shapes: (a) a one-time backend
// seed of entity_seen, or (b) a recency cap on the meetings arm. (a) is a
// data/Worker-route change (hub-backend/hub-schema-sync territory). This
// implements (b) client-side instead: a never_seen=1 meeting only keeps its
// "unseen" signal within a rolling recency window. Meetings older than the
// window are treated as if they carry no signal at all (no gold, no teal —
// see useEntitySeen.ts) rather than being falsely marked "seen" (which
// would corrupt the per-viewer audit trail the backend actually owns).
//
// Rolls forward with wall-clock "now" — no launch-date bookkeeping to
// maintain or ever remove; self-maintaining by construction.

/** Meetings older than this many days no longer trigger the never-seen badge. */
export const MEETING_UNSEEN_RECENCY_CAP_DAYS = 14

const MS_PER_DAY = 86400000

/**
 * True if a never_seen=1 meeting row (keyed by its `latest_at` — the
 * meeting's updated_at, per api/routes/seen.ts) is recent enough to still
 * badge as unseen. Meetings with no/invalid timestamp are treated as stale
 * (fail closed — no badge) rather than crashing the caller.
 */
export function isMeetingUnseenWithinCap(latestAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!latestAt) return false
  const ts = new Date(latestAt).getTime()
  if (Number.isNaN(ts)) return false
  return (nowMs - ts) / MS_PER_DAY <= MEETING_UNSEEN_RECENCY_CAP_DAYS
}
