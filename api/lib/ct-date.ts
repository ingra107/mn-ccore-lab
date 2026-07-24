// Lab-local calendar date helpers, pinned to America/Chicago (the lab's TZ).
//
// Why this exists: `new Date().toISOString().split('T')[0]` returns the UTC
// calendar date. After ~6pm Central it has already rolled to "tomorrow", so
// "today" anchors (overdue cutoffs, "next meeting >= today", due-today filters,
// the daily digest's date) silently shift a day. These helpers resolve the
// calendar date in America/Chicago instead, DST-aware (the runtime's Intl
// database handles CST/CDT — Cloudflare Workers ship full ICU).
//
// Use these for "today/now" anchors that get COMPARED to stored calendar dates
// or DISPLAYED to a user. Do NOT use them for pure aggregation lookback windows
// (e.g. "activity in the last 90 days") — a one-day boundary there is immaterial
// and UTC is fine.

// Resolve a Date to its America/Chicago calendar parts. We assemble YYYY-MM-DD
// from formatToParts rather than relying on a locale's string format (e.g.
// en-CA happening to emit "2026-05-22") — the part values are locale-neutral.
const CT_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The America/Chicago calendar date of an arbitrary instant, as `YYYY-MM-DD`.
 *
 * Exported 2026-07-23 for the inbox-events @hermes lane (#907), which maps a
 * capture's `captured_at` onto the SAME civil day the Today feed shows. The
 * browser's `todayKey()` is LOCAL time; a server-side UTC day key silently
 * routes every evening-CDT capture (19:00 onward) to TOMORROW's feed, where it
 * is invisible on Today. Caught by a live probe at 20:31 CDT landing on
 * 2026-07-24. Use this, never `getUTC*()`, for anything a human reads as "today".
 */
export function ctDateString(d: Date): string {
  const parts = CT_DATE_FMT.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Today's calendar date in America/Chicago as `YYYY-MM-DD`.
 *
 * @param offsetDays  Optional whole-day offset. The offset is applied as pure
 *                    calendar arithmetic on the CT date (not by adding
 *                    milliseconds to "now"), so it stays correct across DST
 *                    transitions. e.g. `ctToday(7)` = one week from today (CT),
 *                    `ctToday(-14)` = fourteen days ago (CT).
 */
export function ctToday(offsetDays = 0): string {
  const todayStr = ctDateString(new Date());
  if (offsetDays === 0) return todayStr;
  // Anchor at UTC midnight of the CT calendar date, then add whole days. This
  // is timezone-neutral integer date math — no DST hour ever enters into it.
  const d = new Date(todayStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split('T')[0];
}
