/**
 * Per-route OG share cards: GET /og/:type/:slug (functions/og/[type]/[slug].ts
 * is the Pages wrapper). Returns a 1200x630 branded SVG.
 *
 *   /og/project/:slug   project title + PI + stage + category accent
 *   /og/team/:slug      member name (+ title, role, credentials when signed in)
 *   /og/meeting/:id     meeting title + date
 *   /og/artifact/:id    artifact title + version
 *   /og/<anything else> branded fallback
 *
 * WHO CAN SEE WHAT (2026-10-08). /og/* sits outside /portal/* (the only path
 * Cloudflare Access gates) and outside /api/* (the only path the in-code auth
 * runs on), so until now any logged-out caller who knew a slug or id got the
 * D1 title of any project, meeting or artifact, deleted and PB-category rows
 * included. The anonymous /api reads were cut to what the public website shows
 * the same day (api/lib/anon-shape.ts); this applies the same line here:
 *
 *   - signed in (CF Access JWT, header or CF_Authorization cookie) or a valid
 *     PB API key: the full card, through the same checks api/index.ts uses
 *     (getAuthUser, validateApiKey). PB-category projects still need PI.
 *   - logged out: only what is already public. A team card shows the name
 *     (GET /api/team's anonShape is slug + name); an artifact card shows its
 *     title only when the artifact is published (visibility='public' AND
 *     content_type='html', the exact predicate /a/:id serves on). Everything
 *     else, "not found" included, is the generic lab card, so a logged-out
 *     caller cannot tell a private entity from a missing one.
 *
 * WHY THE CARDS EXIST, AND WHO SEES THEM. Phase 36d (ef604db1) added them for
 * link previews: ProjectDetail, MeetingDetail, MemberPage and ArtifactPage
 * pass /og/<type>/<slug> to usePageMeta, which writes og:image in a
 * useEffect. Slack, iMessage and Twitter unfurlers read the HTML without
 * running JS, so they only ever see index.html's static /og-image.svg; and
 * every /portal/* page answers an unfurler with a 302 to the Access login, so
 * no unfurler carries the sharer's session either. Gating therefore costs no
 * working unfurl. Signed-in browsers still get the full card.
 *
 * Caching: a signed-in card is `private, no-store` (it must never land in a
 * shared cache a logged-out caller could read); a logged-out card holds only
 * public data and keeps the 1h public cache. `Vary` names the credential
 * headers. public/_headers no longer sets Cache-Control on /og/*, so this
 * handler is the one place that decides.
 */

import type { Env } from '../types'
import { getAuthUser, canSeePbProjectRow } from '../helpers'
import { validateApiKey } from '../middleware/api-key-auth'

const W = 1200
const H = 630

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function svg(content: { eyebrow: string; title: string; subtitle?: string; accent?: string }) {
  const accent = content.accent ?? '#dcb355' // gold
  const eyebrow = escape(content.eyebrow)
  const title = escape(content.title.length > 80 ? content.title.slice(0, 77) + '…' : content.title)
  const subtitle = content.subtitle ? escape(content.subtitle) : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1017"/>
      <stop offset="55%" stop-color="#0f1923"/>
      <stop offset="100%" stop-color="#1a2939"/>
    </linearGradient>
    <linearGradient id="accentBar" x1="0" x2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="0.2" stop-color="${accent}" stop-opacity="0.85"/>
      <stop offset="0.8" stop-color="${accent}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Heartbeat trace, baseline at y=300, faint -->
  <path d="M0 300 L200 300 L260 300 L300 290 L340 250 L380 360 L420 240 L470 320 L520 290 L600 300 L800 300 L860 300 L900 290 L940 250 L980 360 L1020 240 L1070 320 L1120 290 L1200 300"
        stroke="${accent}" stroke-opacity="0.18" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="${W}" height="3" fill="url(#accentBar)"/>

  <!-- Brand mark (top-left) -->
  <g transform="translate(72,72)">
    <rect width="44" height="44" rx="8" fill="${accent}" fill-opacity="0.12"/>
    <path d="M10 22 L16 22 L19 14 L22 30 L25 18 L28 26 L34 22"
          stroke="${accent}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="58" y="28" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
          font-size="20" font-weight="600" fill="#e2e8f0" letter-spacing="0.08em">MN-CCORE LAB</text>
  </g>

  <!-- Eyebrow -->
  <text x="72" y="280" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
        font-size="22" font-weight="600" fill="${accent}" letter-spacing="0.08em" text-transform="uppercase">${eyebrow}</text>

  <!-- Title -->
  <text x="72" y="370" font-family="Georgia, 'Times New Roman', serif"
        font-size="68" font-weight="500" fill="#f1f5f9" letter-spacing="-0.01em">
    <tspan>${title}</tspan>
  </text>

  ${subtitle
    ? `<text x="72" y="450" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
              font-size="28" font-weight="400" fill="#b0b5b9">${subtitle}</text>`
    : ''}

  <!-- Footer URL -->
  <text x="72" y="${H - 56}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
        font-size="20" font-weight="400" fill="#5cbcb4" letter-spacing="0.04em">mn-ccore-lab.pages.dev</text>

  <!-- Bottom accent bar -->
  <rect x="0" y="${H - 3}" width="${W}" height="3" fill="url(#accentBar)"/>
</svg>`
}

const CATEGORY_ACCENT: Record<string, string> = {
  clif: '#f0737e',     // maroon dark-mode
  lab: '#5cbcb4',      // teal dark-mode
  nate: '#f08a5b',     // orange dark-mode
  mentee: '#dcb355',   // gold dark-mode
}

const GENERIC = { eyebrow: 'MN-CCORE LAB', title: 'Research operations', subtitle: 'Tasks · Projects · Meetings · Lab knowledge' }

async function ogProject(slug: string, env: Env, request: Request): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT id, title, pi, stage, category FROM projects WHERE slug = ? OR id = ?'
  ).bind(slug, slug).first<{ id: string; title: string; pi: string | null; stage: string | null; category: string | null }>()
  if (!row) {
    return svg({ eyebrow: 'PROJECT', title: 'Project not found', subtitle: slug })
  }
  // PB-category projects are PI-only everywhere else (canSeePbProject); same here.
  if (!(await canSeePbProjectRow(request, env, row))) return svg(GENERIC)
  const piRow = row.pi
    ? await env.DB.prepare('SELECT name FROM team_members WHERE slug = ?').bind(row.pi).first<{ name: string }>()
    : null
  const piName = piRow?.name ?? row.pi ?? 'unassigned'
  const subtitle = `${row.stage ?? 'Active'} · PI ${piName}`
  const accent = CATEGORY_ACCENT[(row.category ?? '').toLowerCase()] ?? '#dcb355'
  return svg({ eyebrow: 'RESEARCH PROJECT', title: row.title, subtitle, accent })
}

async function ogTeam(slug: string, env: Env, signedIn: boolean): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT name, role, credentials, title FROM team_members WHERE slug = ?'
  ).bind(slug).first<{ name: string; role: string | null; credentials: string | null; title: string | null }>()
  if (!row) return signedIn ? svg({ eyebrow: 'TEAM', title: 'Member not found', subtitle: slug }) : svg(GENERIC)
  if (!signedIn) return svg({ eyebrow: 'MN-CCORE TEAM', title: row.name })
  const display = row.credentials ? `${row.name}, ${row.credentials}` : row.name
  const subtitle = [row.title, row.role].filter(Boolean).join(' · ')
  return svg({ eyebrow: 'MN-CCORE TEAM', title: display, subtitle })
}

// N3c (2026-06-11): share card for Hermes artifact pages (/portal/artifacts/:id).
async function ogArtifact(id: string, env: Env, signedIn: boolean): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT title, version, created_by, created_at, visibility, content_type FROM artifacts WHERE id = ?'
  ).bind(id).first<{
    title: string; version: number; created_by: string | null; created_at: string
    visibility: string | null; content_type: string | null
  }>()
  const published = row?.visibility === 'public' && row?.content_type === 'html'
  if (!signedIn && !published) return svg(GENERIC)
  if (!row) return svg({ eyebrow: 'ARTIFACT', title: 'Artifact not found' })
  const subtitle = `v${row.version} · ${(row.created_at || '').slice(0, 10)}${row.created_by === 'claude-ai' ? ' · by Hermes' : ''}`
  return svg({ eyebrow: 'LAB ARTIFACT', title: row.title, subtitle, accent: '#dcb355' })
}

async function ogMeeting(id: string, env: Env): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT title, date, type FROM meetings WHERE id = ?'
  ).bind(id).first<{ title: string; date: string; type: string | null }>()
  if (!row) return svg({ eyebrow: 'MEETING', title: 'Meeting not found' })
  const subtitle = `${row.date}${row.type ? ` · ${row.type}` : ''}`
  return svg({ eyebrow: 'LAB MEETING', title: row.title, subtitle })
}

/** Same identity checks as the /api/* middleware in api/index.ts. A wrong API
 *  key is not an identity: it reads as logged out, never as an error. */
async function isSignedIn(request: Request, env: Env): Promise<boolean> {
  if (validateApiKey(request, env) === true) return true
  return (await getAuthUser(request, env)) !== null
}

export async function handleOgCard(type: string, slug: string, request: Request, env: Env): Promise<Response> {
  let body: string
  let signedIn = false
  try {
    signedIn = await isSignedIn(request, env)
    if (type === 'team') body = await ogTeam(slug, env, signedIn)
    else if (type === 'artifact') body = await ogArtifact(slug, env, signedIn)
    else if (!signedIn) body = svg(GENERIC)
    else if (type === 'project') body = await ogProject(slug, env, request)
    else if (type === 'meeting') body = await ogMeeting(slug, env)
    else body = svg(GENERIC)
  } catch (e) {
    // Emission protection: the fallback is the public generic card, publicly cacheable.
    console.error('[og-card]', type, (e as Error).message)
    signedIn = false
    body = svg(GENERIC)
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': signedIn ? 'private, no-store' : 'public, max-age=3600, s-maxage=3600',
      'Vary': 'Cookie, Authorization, X-API-Key, Cf-Access-Jwt-Assertion',
    },
  })
}
