/**
 * Cloudflare Pages Function: GET /team/:slug, the public profile page, with
 * the member's og/twitter tags in the served HTML so link unfurlers (which
 * never run JS) see them. Logic and the rule on what it may say live in
 * api/routes/team-page-meta.ts. The member data is the same static
 * src/data/team the page itself renders to a logged-out visitor.
 *
 * Matches one segment only: /team (the list) and /team/:slug/trajectory are
 * not routed here.
 */

import { handleTeamPage, type PublicMember } from '../../api/routes/team-page-meta'
import { getMemberBySlug } from '../../src/data/team'
import { displayName } from '../../src/lib/nameUtils'

export function publicMember(slug: string): PublicMember | undefined {
  const m = getMemberBySlug(slug)
  if (!m || !m.slug) return undefined
  return { slug: m.slug, name: m.name, formalName: displayName(m.slug, 'formal'), role: m.role || undefined }
}

export const onRequestGet: PagesFunction = async (context) => {
  return handleTeamPage(context.request, publicMember(String(context.params.slug)), () => context.next())
}
