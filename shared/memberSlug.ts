// shared/memberSlug.ts — the slug a PI-added team member gets, shared by the
// Worker (`POST /api/team`, api/routes/team.ts) and the Team page's Add member
// form (its live preview), so the two can never disagree.

/** `Jane Q. Doe-Smith` -> `jane-doe-smith`: first and last word of the name,
 *  accents folded, lowercase, anything else dropped. The first-last shape
 *  every seeded row has (`casey-eddington`, `nate-mesfin`). */
export function slugFromName(name: string): string {
  const words = name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, '').replace(/-+/g, '-'))
    .filter(Boolean)
  if (words.length === 0) return ''
  const parts = words.length === 1 ? words : [words[0], words[words.length - 1]]
  return parts.join('-')
}

/** The slug shape POST /api/team accepts. */
export const MEMBER_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** A UMN login. CF Access admits only @umn.edu identities (any subdomain, e.g.
 *  Duluth's d.umn.edu), so any other address could never sign in. */
export const UMN_EMAIL = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)*umn\.edu$/
