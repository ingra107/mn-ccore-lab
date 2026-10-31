// packet-owner.ts -- who a packet_prepare request belongs to, in SQL.
//
// Prepared first steps are Nick's alone (task_packets is Nick-only; the
// packet routes use PACKET_OWNER in api/index.ts: the PB key or the site
// admin). A packet_prepare ai_request is made only by week-plan-start.ts, on
// an answer written by that owner, and stores the answering email in
// requested_by. Every read that trusts such a row (the daily cap count, the
// private landing_visibility) also checks requested_by against the owner's
// email, so a row anyone else managed to write can neither use up the cap nor
// read as private. The owner's email is read from team_members by the
// site-admin slug, the same identity isSiteAdmin uses; the PB key's own email
// (PB_SERVICE_EMAIL) is Nick's, so it is the same row.

import { SITE_ADMIN_SLUG } from './viewer-db';

/** True (as SQL) when `col` holds the packet owner's email. Bind-free: the
 *  slug is a code constant, so the fragment can sit in a WHERE that takes no
 *  extra binds. */
export function packetOwnerEmailSql(col: string): string {
  if (!/^[a-z_]+(\.[a-z_]+)?$/.test(col) || !/^[a-z0-9-]+$/.test(SITE_ADMIN_SLUG)) {
    throw new Error('packetOwnerEmailSql: unexpected column or slug');
  }
  return `lower(${col}) IN (SELECT lower(email) FROM team_members WHERE slug = '${SITE_ADMIN_SLUG}' AND email IS NOT NULL)`;
}
