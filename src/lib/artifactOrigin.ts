// src/lib/artifactOrigin.ts — the cookieless artifact origin, frontend copy.
//
// Mirrors api/routes/public-artifact.ts::PUBLIC_ARTIFACT_ORIGIN. Kept as a
// separate literal rather than imported (the frontend bundle cannot import
// from api/) — same duplication pattern that file already documents for
// PB's scripts/utils/hub_urls.py::hub_artifacts_base(). If the artifact host
// ever changes, grep both.
export const PUBLIC_ARTIFACT_ORIGIN_FE = 'https://mn-ccore-artifacts.pages.dev'

// Mirrors api/routes/public-artifact.ts::TEAM_ARTIFACT_READY_MESSAGE — the
// server-side shim appended to a team artifact's HTML body posts this once
// the document loads. TeamArtifactFrame.tsx listens for it (validating
// event.origin === PUBLIC_ARTIFACT_ORIGIN_FE) to tell a genuinely loaded
// artifact apart from the Cloudflare Access login page an unauthenticated
// visitor's browser is showing instead (#2411 follow-on, 2026-09-23). If the
// message string ever changes, grep both.
export const TEAM_ARTIFACT_READY_MESSAGE = 'mnccore-artifact-ready'
