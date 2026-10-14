// joinApprovers.ts -- who may approve a request to join a project.
// Shared: the API enforces it (with the schema-v139 CHECK beside it); the UI
// reads it only to decide whether to show Today's JoinRequestsCard.
//
// Nick, 2026-10-13: "Nate and I need to approve that", and either one's first
// approval adds the member. Two named people, not a role: member_type can be
// edited by an admin (api/routes/team.ts), so a director role would quietly
// make a third director an approver.
//
// schema-v139 holds the same list as a CHECK on project_join_requests.decided_by,
// so a decision by anyone else cannot be stored whatever the route does.
// project-join.contract.test.ts reads the migration and checks the two agree.
//
// No imports: api/lib/table-scope.ts reads this, and table-scope is imported
// by viewer-db, which most of the API imports.

export const JOIN_APPROVER_SLUGS = ['nick-ingraham', 'nate-mesfin'] as const

export type JoinApproverSlug = (typeof JOIN_APPROVER_SLUGS)[number]

export function isJoinApprover(slug: string | null | undefined): slug is JoinApproverSlug {
  return (JOIN_APPROVER_SLUGS as readonly string[]).includes((slug ?? '').trim().toLowerCase())
}

/** The one approver with a Telegram chat (the bot is single-chat, Nick's). */
export const JOIN_TELEGRAM_APPROVER: JoinApproverSlug = 'nick-ingraham'
