/**
 * Cloudflare Pages Function — TEAM-html artifact serve on the cookieless
 * artifact origin (#2411, following #508's public-artifact split).
 *
 * GET https://mn-ccore-artifacts.pages.dev/a/team/:id
 *
 * WHY THIS ROUTE EXISTS. The Hub's own `/portal/artifacts/:id` page used to
 * embed a live-HTML artifact via a blob: url in an opaque-origin sandboxed
 * iframe (src/components/HtmlArtifactFrame.tsx) — deliberately WITHOUT
 * `allow-same-origin`, so the artifact could never read the Hub session. That
 * held for the security property, but an opaque origin's storage is either
 * inaccessible to scripts or re-keyed on every reload, so the working-desk
 * kit's mark/note localStorage (.claude/skills/working-desk-artifact) never
 * survived a page refresh, and its Copy-for-Claude clipboard button had no
 * `allow="clipboard-write"` permission path to request.
 *
 * The fix keeps the security property by construction rather than loosening
 * it in place: serve from THIS origin (same #508 boundary — mn-ccore-lab.
 * pages.dev and mn-ccore-artifacts.pages.dev are different SITES on the
 * Public Suffix List, so no Hub cookie can ever reach here) and let the Hub
 * embed it with `allow-same-origin`. The iframe then gets real, persistent
 * storage scoped to THIS origin, never the Hub's.
 *
 * "TEAM-only" is enforced by Cloudflare Access, attached in the DASHBOARD to
 * exactly this path (`/a/team/*` on this project) — never by a secret or a
 * signed token here. That is a deliberate choice, not an oversight: the #883
 * minimality gate (scripts/check-artifacts-origin-minimal.mjs) forbids
 * secrets on this origin, so a signed-token scheme would need one, and a
 * capability-token table would need a new D1 write path (a schema migration
 * out of scope for a serve-only route). Access needs neither — it runs at
 * the edge, before this Function is ever invoked.
 *
 * Until that Access application is attached (see the commit's NEEDS-NICK),
 * this path is reachable by anyone with the id — same posture as `/a/:id`
 * today, just for content_type='html' regardless of `visibility`. Do not
 * treat that as "safe because ids are unguessable": team artifacts can
 * contain anything a colleague or @hermes wrote, and the whole point of this
 * route is to be embeddable only from the already-authenticated portal.
 *
 * Imports the SAME shared handler module as `/a/[id].ts` (never fork it) —
 * see api/routes/public-artifact.ts::handleGetTeamArtifactHtml for the
 * response shape, CSP and the allow-same-origin residual-risk writeup.
 */

import { handleGetTeamArtifactHtml } from '../../../../api/routes/public-artifact'

interface Env {
  DB: D1Database
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = String(context.params.id)
  return handleGetTeamArtifactHtml(id, context.env)
}
