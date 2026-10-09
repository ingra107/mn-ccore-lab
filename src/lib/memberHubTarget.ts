// memberHubTarget — where the public site's "Member Hub" tab sends a visitor
// (nav redesign, 2026-10-09). Nick: "researchers can go to the public page
// and the tab for login is there and if they are not a member it kindly
// instructs them about it."
//
//   signed in, a member      -> Today (/portal/dashboard), a router link
//   signed in, not a member  -> the kind join page (/join), a router link
//   not signed in            -> a FULL page load of /portal/dashboard. The
//   still checking              Cloudflare Access policy on /portal/* answers
//                               that request with a 302 to the Access login,
//                               which returns them to Today (measured live
//                               2026-10-09: GET /portal/dashboard -> 302 to
//                               peripheral-brain.cloudflareaccess.com).
//
// Never link to /cdn-cgi/access/login on our own host: that path is a live
// 404 (curl -D - .../cdn-cgi/access/login?redirect_url=... -> 404). Never a
// router <Link> for the signed-out case either: a client-side navigation never
// reaches the edge, so Access never gets the chance to intercept. The spec's
// /api/auth/login has no Worker route.

import { PATHS, PUBLIC_PATHS } from '../constants/paths'

export interface MemberHubTarget {
  href: string
  /** True when the href must be a FULL page load (a plain <a>), so the
   *  request reaches the Cloudflare edge; false for a router link. */
  external: boolean
}

export function memberHubTarget(auth: { isLoading: boolean; isAuthenticated: boolean; isMember: boolean }): MemberHubTarget {
  if (auth.isLoading || !auth.isAuthenticated) return { href: PATHS.dashboard, external: true }
  if (!auth.isMember) return { href: PUBLIC_PATHS.join, external: false }
  return { href: PATHS.dashboard, external: false }
}
