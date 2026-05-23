// src/lib/time.ts
// Canonical time chokepoint (Increment 1A). Two branded temporal types:
//   Instant   — UTC, "when X happened". Written by nowInstant() (Z-marked).
//   CivilDate — date + viewer zone, "due May 25"/"today". Via todayCivil().
// Display via formatLocal(). Viewer zone = the browser's own zone by default
// (traveler-aware for free); pass an explicit zone for server-side rendering.

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
