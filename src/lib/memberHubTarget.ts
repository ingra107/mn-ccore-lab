// memberHubTarget — where the public site's "Member Hub" tab sends a visitor
// (nav redesign, 2026-10-09). Nick: "researchers can go to the public page
// and the tab for login is there and if they are not a member it kindly
// instructs them about it."
//
//   signed in, a member      -> Today (/portal/dashboard)
//   signed in, not a member  -> the kind join page (/join)
//   not signed in            -> the Cloudflare Access login, which returns
//                               them to Today. Same login URL the portal's
//                               sign-in wall uses (RequireAuth.tsx). The
//                               spec's /api/auth/login has no Worker route
//                               (grep api/index.ts), so it is not used.
//   still checking           -> Today: the portal gate decides once the
//                               session answers, so a fast click never lands
//                               a member on the join page.

import { PATHS, PUBLIC_PATHS } from '../constants/paths'

export interface MemberHubTarget {
  href: string
  /** True for the login URL: a full page load, not a router link. */
  external: boolean
}

export const MEMBER_HUB_LOGIN = `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(PATHS.dashboard)}`

export function memberHubTarget(auth: { isLoading: boolean; isAuthenticated: boolean; isMember: boolean }): MemberHubTarget {
  if (auth.isLoading) return { href: PATHS.dashboard, external: false }
  if (!auth.isAuthenticated) return { href: MEMBER_HUB_LOGIN, external: true }
  if (!auth.isMember) return { href: PUBLIC_PATHS.join, external: false }
  return { href: PATHS.dashboard, external: false }
}
