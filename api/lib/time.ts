// api/lib/time.ts
// Worker-side canonical Instant minter (mirrors src/lib/time.ts).
// On Cloudflare Workers, Date is always UTC, so new Date().toISOString()
// is correct — this is a named wrapper so the lint can allowlist it.
export type Instant = string & { readonly __brand: 'Instant' };
export function nowInstant(): Instant {
  return new Date().toISOString() as Instant;
}
