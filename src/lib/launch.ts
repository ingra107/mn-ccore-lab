/**
 * launch.ts — opaque launch-token URI helpers.
 *
 * The seed NEVER appears in the URI. The browser POSTs to /api/launch-log with
 * { tag, seed, origin, project_slug? }, receives back `{ data: { id: "lnch_<hex>" } }`,
 * and fires mnccore://launch/<id>. The Windows handler resolves the seed
 * server-side — no sensitive text ever travels through the protocol URI.
 */

/** Build the protocol URI for an opaque launch token returned by /api/launch-log. */
export function buildLaunchUri(id: string): string {
  return `mnccore://launch/${encodeURIComponent(id)}`
}
