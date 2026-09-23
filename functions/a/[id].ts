/**
 * Cloudflare Pages Function — LEGACY public-artifact path on the HUB origin.
 *
 * GET https://mn-ccore-lab.pages.dev/a/:id  →  301
 *     https://mn-ccore-artifacts.pages.dev/a/:id
 *
 * Until 2026-07-22 this route SERVED the stored artifact HTML from the Hub's
 * own host — the host that scopes the `CF_Authorization` auth cookie. The
 * origin split (PB backlog #508, Nick-approved Option A; security review
 * HIGH-2, 2026-07-06) moved the serving to a separate, cookieless Pages project
 * so a CSP regression can no longer put user-authored script first-party on the
 * Hub session. This stub is all that remains here, and it exists ONLY so links
 * already shared with external readers keep resolving.
 *
 * NOTE what this file no longer has: no D1 binding use, no body, no CSP
 * dependency. There is now NO code path on the Hub origin that can emit stored
 * artifact HTML. The redirect logic (and its strict `art_<hex>` gate) lives in
 * api/routes/public-artifact.ts so it is covered by the same vitest file as the
 * serve path.
 *
 * DO NOT re-add serving here. To render an artifact inside the AUTHENTICATED
 * portal (/portal/artifacts/:id), use DeskBrokerFrame (src/components/
 * DeskBrokerFrame.tsx), the Hub's own opaque-origin blob iframe with the Hub
 * brokering the working-desk kit's localStorage — no cross-site request to
 * this origin at all (a #2411 cross-site /a/team/:id variant lived here
 * 2026-09-23 and was retired the same day; see
 * Context/Decisions/2026-09-23-team-desks-hub-brokered-opaque-frame.md). For
 * any future need to render artifact HTML OUTSIDE an authenticated context,
 * use HtmlArtifactFrame.tsx's opaque-origin blob-url embed instead — it uses
 * a blob url rather than srcDoc because srcDoc leaves the document at
 * about:srcdoc, where one in-page anchor click blanks the artifact
 * (2026-07-24).
 */

import { handleLegacyPublicArtifactRedirect } from '../../api/routes/public-artifact'

export const onRequestGet: PagesFunction = async (context) => {
  const id = String(context.params.id)
  return handleLegacyPublicArtifactRedirect(id)
}
