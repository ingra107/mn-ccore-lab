// Substring and prefix tests without LIKE.
//
// D1 refuses a LIKE or GLOB pattern over 50 bytes ("LIKE or GLOB pattern too
// complex", SQLITE_ERROR 7500; https://developers.cloudflare.com/d1/platform/limits/
// "Maximum characters (bytes) in a LIKE or GLOB pattern: 50 bytes"). A pattern
// built from a slug, a tag or a search string passes every local test, because
// better-sqlite3 allows 50,000 bytes, and fails on prod the first time a long
// value arrives (the decisions panel on a long project slug, 2026-10-28).
// instr() and substr() have no such limit and no wildcards: `%` and `_` in the
// needle match themselves.
//
// Case: LIKE folds ASCII case by default, and lower() folds the same ASCII
// range, so `contains` matches what `col LIKE '%x%'` matched.
// api/lib/activity-feed-types.test.ts bans a LIKE/GLOB with a bound or built
// pattern, so nothing here is optional.

/** `needle` occurs in `expr`, ASCII case-insensitive. Bind the RAW needle,
 *  without `%` around it. */
export function contains(expr: string): string {
  return `instr(lower(${expr}), lower(?)) > 0`;
}
