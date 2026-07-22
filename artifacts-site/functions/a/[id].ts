/**
 * Cloudflare Pages Function — public HTML artifact serving on the COOKIELESS
 * origin (backlog #508, Option A).
 *
 * GET https://mn-ccore-artifacts.pages.dev/a/:id
 *
 * This is the ONLY route this Pages project serves. `*.pages.dev` is on the
 * Public Suffix List, so this host is a different SITE from
 * mn-ccore-lab.pages.dev — the Hub's `CF_Authorization` cookie cannot reach it
 * by any cookie-scoping mechanism. That is the whole point: untrusted,
 * user-authored HTML never executes on the origin that carries Hub auth.
 *
 * The handler itself is the SHARED one in api/routes/public-artifact.ts (same
 * module the old same-origin route used, same unit tests). It keeps the
 * hardened CSP as defense-in-depth; the origin split is what makes the failure
 * mode structural rather than header-dependent.
 *
 * The old same-origin path (mn-ccore-lab.pages.dev/a/:id) now 301s here —
 * see functions/a/[id].ts in the repo root.
 */

import { handleGetPublicArtifact } from '../../../api/routes/public-artifact'

interface Env {
  DB: D1Database
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = String(context.params.id)
  return handleGetPublicArtifact(id, context.env)
}
