// src/lib/artifactOrigin.ts — the cookieless artifact origin, frontend copy.
//
// Mirrors api/routes/public-artifact.ts::PUBLIC_ARTIFACT_ORIGIN. Kept as a
// separate literal rather than imported (the frontend bundle cannot import
// from api/) — same duplication pattern that file already documents for
// PB's scripts/utils/hub_urls.py::hub_artifacts_base(). If the artifact host
// ever changes, grep both.
export const PUBLIC_ARTIFACT_ORIGIN_FE = 'https://mn-ccore-artifacts.pages.dev'
