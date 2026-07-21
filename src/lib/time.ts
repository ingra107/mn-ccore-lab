// src/lib/time.ts
// Canonical time chokepoint (Increment 1A). Two branded temporal types:
//   Instant   — UTC, "when X happened". Written by nowInstant() (Z-marked).
//   CivilDate — date + viewer zone, "due May 25"/"today". Via todayCivil().
// Display via formatLocal(). Viewer zone = the browser's own zone by default
// (traveler-aware for free); pass an explicit zone for server-side rendering.

import { dbStampToIso } from '../../shared/dbTime';

export type Instant = string & { readonly __brand: 'Instant' };
export type CivilDate = string & { readonly __brand: 'CivilDate' };

/** The single Instant minter — replaces raw new Date().toISOString(). */
export function nowInstant(): Instant {
  return new Date().toISOString() as Instant;
}

/** Instant (UTC) → viewer-local human string. */
export function formatLocal(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', opts);
}

/**
 * Parse a value that may be a bare D1/SQLite timestamp into a real Date.
 *
 * D1 writes `datetime('now')` as `YYYY-MM-DD HH:MM:SS` (UTC, NO zone suffix).
 * `new Date(thatString)` parses it as LOCAL wall-clock — silently wrong by the
 * viewer's UTC offset (a 07:29 CDT write reads back as 07:29 CDT only by luck of
 * the rendering machine; for everyone else it's off by their offset). This is
 * the single chokepoint that turns a stored UTC instant into a correct Date:
 *
 *   - bare `YYYY-MM-DD HH:MM:SS[.fff]` (space OR `T`, no zone) → treated as UTC.
 *   - already zoned (`...Z`, `...+05:00`, `...-06:00`) → passed straight through.
 *   - date-only `YYYY-MM-DD` → noon LOCAL (avoids the midnight UTC day-rollover
 *     that pushes a calendar day backward/forward; mirrors dateUtils.safeParse).
 *
 * Returns an `Invalid Date` (not a throw) for unparseable input so callers can
 * fall back gracefully.
 */
export function parseDbUtc(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  const s = value.trim();
  // Date-only → noon local (calendar-day anchor, no zone math). This is the one
  // rule that can't move to shared/dbTime: it's a Date-shaping decision, not a
  // statement about the stored wire format.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
  // Everything else is the wire-format question, and shared/dbTime.ts owns it —
  // the SAME normalizer the API emits with, so the two can't drift. It marks a
  // bare datetime as UTC, passes a zoned value through, and returns an unknown
  // shape unchanged for the native last-resort parse below (Invalid Date if so).
  return new Date(dbStampToIso(s));
}

/**
 * A stored DB timestamp → viewer-local display string. The absolute-time
 * companion to formatLocal(), but UTC-correct for bare D1 strings.
 *
 * `style`:
 *   - 'datetime' (default) → "Jun 10, 2026, 7:29 AM"
 *   - 'time'              → "7:29 AM"
 *   - 'date'              → "Jun 10, 2026"
 *   - or pass explicit Intl.DateTimeFormatOptions for full control.
 */
export function formatDbLocal(
  value: string | null | undefined,
  style: 'datetime' | 'time' | 'date' | Intl.DateTimeFormatOptions = 'datetime',
): string {
  const d = parseDbUtc(value);
  if (isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions =
    style === 'datetime'
      ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : style === 'time'
        ? { hour: 'numeric', minute: '2-digit' }
        : style === 'date'
          ? { year: 'numeric', month: 'short', day: 'numeric' }
          : style;
  return d.toLocaleString('en-US', opts);
}

/**
 * Today's civil date YYYY-MM-DD in the viewer zone.
 * Default zone = the browser's resolved zone (traveler-aware). Server callers
 * (digest Worker) pass the resolved machine/recipient zone explicitly.
 */
export function todayCivil(zone?: string): CivilDate {
  const tz = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}` as CivilDate;
}

/** Instant → its civil day in a zone (for grouping by viewer-local day). */
export function civilFromInstant(iso: string, zone?: string): CivilDate {
  const tz = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}` as CivilDate;
}
