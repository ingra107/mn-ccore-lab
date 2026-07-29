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
