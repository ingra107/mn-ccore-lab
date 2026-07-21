// shared/dbTime.ts — the ONE definition of "what a stored D1 timestamp looks
// like". Imported by BOTH the API (api/lib/time.ts, serving values out) and the
// UI (src/lib/time.ts, parsing them back in) via relative import, so the write
// side and the read side can never disagree about the wire format — the same
// reason shared/activityKinds.ts exists for the kind vocabulary.
//
// The hazard this closes: D1 stores `YYYY-MM-DD HH:MM:SS` with NO zone, but the
// value IS UTC. Handed to the browser unzoned, `new Date(...)` parses it as
// LOCAL time, so every rendered timestamp is silently off by the viewer's
// offset. Normalizing at one chokepoint means neither side can get it wrong.

/** A value that already carries a zone (`...Z` or `...±HH:MM`) — trust it as-is. */
const ZONED = /[zZ]$|[+-]\d{2}:?\d{2}$/;

/** A bare `YYYY-MM-DD[ T]HH:MM[:SS[.fff]]` datetime with no zone — it's UTC. */
const BARE_DATETIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/;

/**
 * A stored D1 timestamp → a zone-explicit ISO instant.
 *
 * - bare `YYYY-MM-DD HH:MM:SS` (space OR `T`, no zone) → marked as UTC (`...Z`)
 * - already zoned → returned untouched
 * - any other shape → returned untouched, so callers keep their own fallback
 *
 * Pure string→string: safe on the Worker (no Date construction) and reusable by
 * the UI's Date-returning `parseDbUtc`.
 */
export function dbStampToIso(value: string): string {
  const s = value.trim();
  if (ZONED.test(s)) return s;
  const m = s.match(BARE_DATETIME);
  return m ? `${m[1]}T${m[2]}Z` : s;
}
