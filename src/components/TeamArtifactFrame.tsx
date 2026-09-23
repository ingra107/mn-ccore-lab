// TeamArtifactFrame — renders a content_type='html' artifact for
// /portal/artifacts/:id via the cookieless artifact origin's TEAM route
// (#2411, following #508's public-artifact origin split).
//
// Unlike HtmlArtifactFrame's blob:-url, opaque-origin embed (which stays the
// pattern for anything rendered directly on the Hub origin), this frame
// points `src` at a REAL url on a genuinely separate SITE:
//
//   https://mn-ccore-artifacts.pages.dev/a/team/:id
//
// `*.pages.dev` is on the Public Suffix List, so that host and
// mn-ccore-lab.pages.dev are different SITES — no Hub cookie (CF_Authorization)
// can ever reach it, by construction, regardless of the sandbox attribute
// below. That is what makes it safe to add `allow-same-origin` here (which
// would be a same-origin-stored-XSS-to-Hub-session bug on the Hub's own
// origin — see HtmlArtifactFrame.tsx, and its guard test, for why that
// component must NEVER get this token): `allow-same-origin` on a
// cross-SITE src grants the iframe access to ITS OWN origin's storage, not
// the Hub's. That is the one thing the old blob:-url embed could not give
// the working-desk kit (.claude/skills/working-desk-artifact/assets/deskkit.js)
// — real, persistent localStorage for marks/notes that survives a reload.
//
// `allow="clipboard-write"` on the iframe element delegates the Clipboard API
// permission across the cross-origin boundary, for deskkit's Copy-for-Claude
// button (clipboard access from a cross-origin iframe needs this Permissions
// Policy grant regardless of same-origin/opaque sandbox status).
//
// "Team-only" reachability is enforced by a Cloudflare Access application
// attached to /a/team/* on the artifacts origin (dashboard-side — see
// artifacts-site/functions/a/team/[id].ts) — this component does not (and
// cannot) enforce it; ArtifactPage only mounts it behind the Hub's own
// Access-gated /portal/* in the first place.
//
// Outbound-link retargeting (an <a href> inside the iframe navigating the
// frame away, eating the artifact) is handled SERVER-SIDE now — the served
// body carries the shim (api/routes/public-artifact.ts::OUTBOUND_LINK_SHIM)
// — so this component does not need HtmlArtifactFrame's client-side
// blob-prepend for that.

import { PUBLIC_ARTIFACT_ORIGIN_FE } from '../lib/artifactOrigin'

export default function TeamArtifactFrame({ id, title }: { id: string; title: string }) {
  return (
    <iframe
      title={`${title} (interactive artifact)`}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      allow="clipboard-write"
      src={`${PUBLIC_ARTIFACT_ORIGIN_FE}/a/team/${id}`}
      style={{
        width: '100%',
        minHeight: '70vh',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        background: '#fff',
      }}
    />
  )
}
