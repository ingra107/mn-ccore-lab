/**
 * Cloudflare Pages Function — public, unauthenticated HTML artifact serving.
 *
 * GET /a/:id — short shareable path, deliberately outside /api/* and /portal/*
 * so it hits NEITHER the in-code /api/* auth middleware (api/index.ts) NOR the
 * Cloudflare Access Zero Trust application (scoped to /portal/*). Mirrors the
 * functions/og/[type]/[slug].ts precedent: a Pages Function file-routed path
 * is matched before the SPA static-asset fallback, so this is never swallowed
 * by client-side routing.
 *
 * All the actual logic (visibility/content_type gating, security headers)
 * lives in api/routes/public-artifact.ts — testable via the same node-mode
 * vitest harness as every other route handler (vitest.config.api.ts includes
 * api/**\/*.test.ts; functions/ is not covered, so this file stays a thin
 * forwarder, same shape as functions/api/[[route]].ts).
 *
 * Design ref: ~/Peripheral-Brain/Scratch/plans/2026-07-06-hub-hosted-public-artifacts-design.md.
 */

import { handleGetPublicArtifact } from '../../api/routes/public-artifact'

interface Env {
  DB: D1Database
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = String(context.params.id)
  return handleGetPublicArtifact(id, context.env)
}
