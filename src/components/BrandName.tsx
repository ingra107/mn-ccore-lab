/**
 * Normalize any variant of the lab name to "MN-CCORE" in plain text.
 * Use in task cards, calendar events, meta labels — anywhere JSX isn't practical.
 *
 * The inline BrandName JSX component was removed 2026-04-23 (unused);
 * file kept for formatBrandName() which 8+ surfaces rely on.
 */
export function formatBrandName(text: string): string {
  return text
    .replace(/\bMNCCORE\b/g, 'MN-CCORE')
    .replace(/\bmnccore\b/gi, 'MN-CCORE')
}
