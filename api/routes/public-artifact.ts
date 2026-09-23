// api/routes/public-artifact.ts — public, link-shareable HTML artifact serving.
//
// Design ref: ~/Peripheral-Brain/Scratch/plans/2026-07-06-hub-hosted-public-artifacts-design.md
// (Nick-approved 2026-07-06, PB #491 follow-on).
//
// ═══ ORIGIN SPLIT (PB backlog #508, Nick-approved Option A, 2026-07-22) ═══
// `GET /a/:id` is served from a SEPARATE, COOKIELESS Pages project:
//   https://mn-ccore-artifacts.pages.dev/a/:id   (artifacts-site/functions/a/[id].ts)
// The Hub's own origin (mn-ccore-lab.pages.dev) now only 301s that path here —
// see handleLegacyPublicArtifactRedirect below + functions/a/[id].ts.
//
// WHY (security review 2026-07-06, HIGH-2): while the body was served from the
// Hub's own host, ALL isolation rested on ONE response header. Any future CSP
// loosening / edge transform / non-conforming client would have turned stored
// artifact HTML into FIRST-PARTY script on the origin that scopes
// `CF_Authorization` → same-origin stored XSS with full `/api/*` access as the
// viewer. `*.pages.dev` is on the Public Suffix List, so the artifact host is a
// different SITE (not merely a different origin) and no cookie can bridge it.
// The wrong state is now unrepresentable by construction rather than blocked by
// a header (ethos #15, Level 1). The hardened CSP below is KEPT anyway as
// defense in depth — it is no longer the only thing standing there.
//
// The SAME handler runs on the artifacts origin — one implementation, one test
// file, two deploy surfaces. Do not fork it.
//
// That path is deliberately OUTSIDE /portal/* (the Cloudflare Access Zero Trust
// application only gates /portal/*, per api/index.ts:362-363) and OUTSIDE
// /api/* (the in-code auth middleware in api/index.ts only runs on '/api/*').
// So this handler is reachable by a signed-out external visitor with NO
// Cloudflare Access JWT and NO API key — same posture as the existing
// functions/og/[type]/[slug].ts share-card generator.
//
// Security-critical invariants:
//   - Serves the raw stored body ONLY when visibility='public' AND
//     content_type='html' (schema-v94). Team artifacts, markdown artifacts,
//     and missing ids all 404 IDENTICALLY — an outside caller can't
//     distinguish "exists but private" from "doesn't exist".
//   - `Content-Security-Policy: sandbox allow-scripts; ...` is the load-bearing
//     header: `sandbox allow-scripts` forces the response into a browser-opaque
//     origin (scripts run, but the document has NO cookies / storage /
//     same-origin access — an artifact script served from the Hub's own domain
//     can never ride a signed-in Hub user's session). `sandbox` ALONE is not
//     sufficient, though: an opaque origin can still issue no-preflight
//     `fetch()`/`XHR` simple requests to the Hub's own `/api/*` carrying the
//     viewer's cookies (blind CSRF) — sandboxing removes the *response*
//     readability, not the network reachability. So the policy also sets
//     `connect-src 'none'` (blocks all fetch/XHR/WebSocket/EventSource
//     regardless of origin) plus `default-src 'none'`, `form-action 'none'`,
//     `base-uri 'none'` as belt-and-suspenders, while `script-src`/`style-src`/
//     `img-src`/`font-src`/`media-src` explicitly allow `'unsafe-inline'` +
//     `data:`/`blob:` so self-contained inline-CSS/JS artifacts still render.
//   - `X-Content-Type-Options: nosniff` — the artifact is served with an
//     explicit `text/html` Content-Type; nosniff stops any client MIME-sniff
//     override.
//   - `Cache-Control: public, max-age=300` — artifact bodies are immutable per
//     version (revise mints a new row via the versioned artifacts table, this
//     route only ever serves the CURRENT body), so edge/browser caching is
//     safe and cuts DoS load on repeated fetches of the same link.
//   - `X-Robots-Tag: noindex` — link-only, never search-indexed.
//   - The id itself (`art_<32-hex>`, unguessable) is the only "auth" — anyone
//     with the link can view. That tradeoff is documented + accepted in the
//     design doc; publishing to `visibility='public'` is opt-in per artifact.

import type { Env } from '../helpers';
import { ensureDoctype } from '../lib/html-doctype';

/**
 * The cookieless origin that actually serves public artifact HTML (#508).
 * Different SITE from the Hub (Public Suffix List boundary on *.pages.dev), so
 * no Hub cookie can ever be sent to or set from it.
 *
 * Kept here — beside the handler and its tests — rather than in a config file,
 * because the ONLY consumer is the legacy redirect below. PB's mirror of this
 * literal lives in scripts/utils/hub_urls.py::hub_artifacts_base(); the PB link
 * contract's `/a/` canonical (scripts/links/link_contract.py) is generated from
 * it and pinned by the cross-repo fixture corpus (src/lib/__tests__/link-fixtures.json).
 */
export const PUBLIC_ARTIFACT_ORIGIN = 'https://mn-ccore-artifacts.pages.dev';

/** `art_<hex>` — the mint shape (mintArtifactId in artifacts.ts). */
const ARTIFACT_ID_RE = /^art_[0-9a-fA-F]+$/;

interface PublicArtifactRow {
  body_md: string;
  content_type: string;
  visibility: string;
}

interface TeamArtifactRow {
  body_md: string;
  content_type: string;
}

/**
 * Same click-eats-the-frame problem the old blob-url iframe worked around
 * client-side (HtmlArtifactFrame.tsx): embedded in an <iframe>, a plain
 * `<a href>` to an outbound site navigates the FRAME, replacing the artifact
 * with that site rendered in a small box with no way back. Retargeting to a
 * new tab server-side means every sink that serves this body gets the fix,
 * not just the one client component that remembered to add it. Appended
 * AFTER the (already doctype-ensured) body rather than prepended — a leading
 * <script> before <!DOCTYPE> would push the doctype out of leading position
 * and re-trigger quirks mode (#915); a trailing <script> is foster-parented
 * into <body> by every HTML parser and does not move the doctype.
 */
const OUTBOUND_LINK_SHIM =
  '<script>document.addEventListener("click",function(e){' +
  'var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;' +
  'if(a&&/^https?:/i.test(a.getAttribute("href")||"")){a.target="_blank";a.rel="noopener noreferrer";}' +
  '},true);</script>';

/**
 * The message TeamArtifactFrame.tsx (src/lib/artifactOrigin.ts) listens for to
 * tell a broken-page-icon (Cloudflare Access login refusing to render in the
 * frame — see that component's header comment) apart from a genuinely loaded
 * artifact. Duplicated as a literal on the frontend side, same pattern as
 * PUBLIC_ARTIFACT_ORIGIN above — the frontend bundle cannot import from api/.
 *
 * Carries NO data (a bare string, not an object with fields an artifact
 * script could poison) and is sent to `'*'` — that is safe specifically
 * BECAUSE it is content-free: there is nothing here for an eavesdropping
 * parent to learn, so the missing targetOrigin does not leak anything. The
 * receiving side (TeamArtifactFrame) is what actually enforces the trust
 * boundary, by checking `event.origin === PUBLIC_ARTIFACT_ORIGIN_FE` before
 * accepting it — a forged ready message from a different embedded frame or a
 * malicious top-level script cannot originate from that origin.
 */
export const TEAM_ARTIFACT_READY_MESSAGE = 'mnccore-artifact-ready';

/**
 * Appended after OUTBOUND_LINK_SHIM (ordering only matters for the doctype
 * fix in that shim's comment; this one has no such constraint but stays last
 * for readability — "housekeeping first, then announce ready"). Fires once
 * per document load; a team artifact that is revised in place gets a fresh
 * ready message on the next load because the whole document (this script
 * included) is re-served, never cached (`Cache-Control: no-store` below).
 */
const READY_MESSAGE_SHIM =
  `<script>try{window.parent.postMessage(${JSON.stringify(TEAM_ARTIFACT_READY_MESSAGE)},"*")}catch(e){}</script>`;

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export async function handleGetPublicArtifact(id: string, env: Env): Promise<Response> {
  // Cheap shape check before hitting D1 — art_<hex> mint format (mintArtifactId
  // in artifacts.ts). Not a security boundary (the DB query is safe either way,
  // parameterized bind), just avoids a wasted round-trip on obviously-wrong ids.
  if (!id || !id.startsWith('art_')) return notFound();

  const row = await env.DB
    .prepare('SELECT body_md, content_type, visibility FROM artifacts WHERE id = ? LIMIT 1')
    .bind(id)
    .first<PublicArtifactRow>();

  if (!row) return notFound();
  if (row.visibility !== 'public' || row.content_type !== 'html') return notFound();

  // #915: doctype-less fragment bodies (the Claude-Artifact export shape;
  // 2 of 4 prod html artifacts on 2026-07-29, one public) render in QUIRKS
  // MODE. handleCreateArtifact/handleReviseArtifact normalize new html bodies
  // at ingest; this serve-time prepend is the retroactive cover for rows
  // stored before that gate existed. ensureDoctype is idempotent and passes
  // already-complete documents through byte-identical.
  return new Response(ensureDoctype(row.body_md), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // See the file-header comment: `connect-src 'none'` is the load-bearing
      // addition over bare `sandbox allow-scripts` — it closes the blind-CSRF
      // gap (an opaque-origin doc could otherwise still fire no-preflight
      // fetch()/XHR against the Hub's own /api/* carrying the viewer's
      // cookies). data:/blob: stay allowed for script/style/img/font/media so
      // self-contained inline artifacts keep rendering.
      'Content-Security-Policy':
        "sandbox allow-scripts; default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}

/**
 * GET on the cookieless origin's TEAM route (`/a/team/:id`, #2411): serves any
 * `content_type='html'` artifact body regardless of `visibility` ('team' OR
 * 'public'). This is what the Hub's own `/portal/artifacts/:id` page embeds
 * for a live-HTML artifact — the ArtifactPage route is already reachable only
 * through the Cloudflare Access-gated `/portal/*` application, so a signed-in
 * viewer got here once already; this handler does not re-check that.
 *
 * Authorization is NOT this function's job. "Team-only" is enforced entirely
 * at the EDGE by a Cloudflare Access application scoped to exactly this path
 * on the artifacts origin (dashboard-side config, outside git — see the
 * NEEDS-NICK note in the commit that introduced this route). Deliberately NOT
 * a signed-token / D1-row capability check: that would need either a secret
 * on this origin (forbidden by the #883 minimality gate) or a new mutable D1
 * table (a schema migration, out of this route's scope) — Access needs
 * neither. The origin's D1 binding stays a single parameterized read, same
 * shape as handleGetPublicArtifact; #883's allowlist gate is updated in the
 * same commit to admit this second, equally minimal Function route.
 *
 * Residual risk, stated plainly rather than left implied: unlike the public
 * route, the Hub embeds this one with `sandbox="allow-scripts
 * allow-same-origin ..."` (deskkit needs real per-origin localStorage for
 * marks/notes to survive a reload — an opaque origin's storage is either
 * inaccessible or re-keyed every load). `allow-same-origin` grants an
 * artifact's own script access to THIS origin's cookies/storage — i.e. the
 * artifacts-origin's OWN Cloudflare Access session, not the Hub's (different
 * SITE, PSL boundary, see PUBLIC_ARTIFACT_ORIGIN doc). Worst case from a
 * malicious/compromised team artifact is "read other team artifacts an
 * authenticated visitor can already reach," not Hub session takeover —
 * still a Level-2 (Access-gated chokepoint) guarantee here, not the public
 * route's Level-1 (unrepresentable). Documented as a deliberate, accepted
 * trade for the persistence requirement, not an oversight.
 */
export async function handleGetTeamArtifactHtml(id: string, env: Env): Promise<Response> {
  if (!id || !id.startsWith('art_')) return notFound();

  const row = await env.DB
    .prepare('SELECT body_md, content_type FROM artifacts WHERE id = ? LIMIT 1')
    .bind(id)
    .first<TeamArtifactRow>();

  if (!row) return notFound();
  if (row.content_type !== 'html') return notFound();

  // Appended, not prepended — see OUTBOUND_LINK_SHIM's own comment for why
  // ordering matters here (#915 doctype regression).
  const body = ensureDoctype(row.body_md) + OUTBOUND_LINK_SHIM + READY_MESSAGE_SHIM;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Sandbox tokens here must be a SUPERSET of (or equal to) the iframe's
      // own `sandbox` attribute — CSP's `sandbox` directive and the iframe
      // attribute intersect, the more restrictive wins. Omitting a token the
      // iframe grants silently strips it; that is why allow-same-origin and
      // the popup tokens are listed here too, not just connect-src 'none'
      // (still the load-bearing blind-CSRF close — see public-artifact CSP
      // comment above) and the data:/blob: content allowances.
      'Content-Security-Policy':
        "sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox; default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:",
      'X-Content-Type-Options': 'nosniff',
      // Team artifacts are edited/revised in place (version++ on the SAME
      // id) — unlike the public route's immutable-per-version body, caching
      // this response would serve a stale revision after @hermes or a
      // teammate revises it. No-store, not a short max-age.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

/**
 * The Hub origin's `/a/:id` after the #508 origin split: a permanent redirect
 * to the cookieless artifact host. This is what keeps every already-shared
 * link working (exactly one was in the wild when the split shipped —
 * art_b424399a…, the LLM Ethics Workflow Map).
 *
 * Deliberate properties:
 *  - It NEVER touches D1 and NEVER emits a body. The Hub origin no longer has
 *    any code path that can put stored artifact HTML on the wire. That is the
 *    whole point of #508 — not "the HTML is guarded here", but "the HTML is not
 *    here".
 *  - Uniform for EVERY art_-shaped id: public, team, markdown and nonexistent
 *    all 301 identically, so this route is not an existence oracle either (the
 *    visibility/content_type gate still runs, at the destination).
 *  - STRICTER id validation than the serve path: the id lands in a `Location`
 *    response header here, a different sink than the serve path's parameterized
 *    SQL bind, so anything that is not literally `art_<hex>` 404s without
 *    building a URL at all. Header injection / open redirect are unrepresentable.
 *  - `max-age=3600` bounds how long a browser pins the 301 (a 301 with no
 *    freshness hint may be cached indefinitely, which would make a future move
 *    unfixable for prior visitors).
 */
export function handleLegacyPublicArtifactRedirect(id: string): Response {
  if (!id || !ARTIFACT_ID_RE.test(id)) return notFound();

  return new Response(null, {
    status: 301,
    headers: {
      Location: `${PUBLIC_ARTIFACT_ORIGIN}/a/${id}`,
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
    },
  });
}
