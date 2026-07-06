// api/routes/public-artifact.ts — public, link-shareable HTML artifact serving.
//
// Design ref: ~/Peripheral-Brain/Scratch/plans/2026-07-06-hub-hosted-public-artifacts-design.md
// (Nick-approved 2026-07-06, PB #491 follow-on).
//
// GET /a/:id — the SHORT public path, wired via functions/a/[id].ts (a
// Cloudflare Pages Function). That path is deliberately OUTSIDE /portal/*
// (the Cloudflare Access Zero Trust application only gates /portal/*, per
// api/index.ts:362-363) and OUTSIDE /api/* (the in-code auth middleware in
// api/index.ts only runs on '/api/*'). So this handler is reachable by a
// signed-out external visitor with NO Cloudflare Access JWT and NO API key —
// same posture as the existing functions/og/[type]/[slug].ts share-card
// generator, which already serves unauthenticated at this Pages project.
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

  return new Response(row.body_md, {
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
