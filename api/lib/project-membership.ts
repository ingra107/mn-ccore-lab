// project-membership.ts -- the one place a membership row is written by code
// (#145 Lane B, schema-v120). The two triggers in schema-v120 write the other
// two kinds (an assignee joins the task's project; a named PI joins).
//
// Every statement here runs on the caller's handle. INSERT OR IGNORE, never
// an upsert: an existing row (a replayed create, a second add) is left as it
// is, and no statement here can modify a row the caller cannot read.

/** Who put a row in project_members when it was not a person adding someone. */
export const MEMBERSHIP_SOURCES = {
  creator: 'creator',
  backfill: 'backfill-v120',
} as const

/**
 * The creator of a new project becomes its member in the same batch as the
 * project INSERT (D1 batch = one transaction), so a project cannot exist
 * without the person who made it being able to see it. `creatorSlug` is the
 * server-resolved session slug; the PB key's identity is nick-ingraham, which
 * is how a project PB creates reaches Nick. A slug with no team_members row
 * ('anonymous', a credential-less local caller) adds nothing rather than
 * failing the create on the foreign key.
 */
export function creatorMembershipStatement(db: D1Database, projectId: string, creatorSlug: string | null | undefined): D1PreparedStatement | null {
  const slug = (creatorSlug ?? '').trim()
  if (!slug || slug === 'anonymous') return null
  return db.prepare(
    'INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) '
    + 'SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM team_members WHERE slug = ?)',
  ).bind(projectId, slug, MEMBERSHIP_SOURCES.creator, slug)
}
