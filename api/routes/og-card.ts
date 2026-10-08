/**
 * OG share cards: GET /og/:type/:slug (functions/og/[type]/[slug].ts is the
 * Pages wrapper). Returns a 1200x630 branded SVG.
 *
 *   /og/team/:slug      the member's name (the public profile page's card)
 *   /og/<anything else> the generic lab card
 *
 * WHO FETCHES THESE. Link unfurlers (Slack, iMessage, Twitter), and nothing
 * else: a browser never renders og:image. Unfurlers read the HTML without
 * running JS and carry no session, so the only card any of them can reach is
 * the one a page's SERVED HTML names. Since 2026-10-08 that is /team/:slug
 * (functions/team/[slug].ts writes og:image = /og/team/<slug> into the HTML);
 * every other page serves index.html's static /og-image.svg.
 *
 * WHAT WAS RETIRED (2026-10-08). The project, meeting and artifact cards and
 * the signed-in variants of every card. usePageMeta set their URLs in a
 * useEffect, which no unfurler runs, and /portal/* answers an unfurler with an
 * Access redirect; the logged-out project and meeting cards were already the
 * generic card (4f65fee6). No caller could reach any of it.
 *
 * WHAT A CARD MAY SAY. Only what a logged-out visitor can already read: the
 * team card shows the name, as GET /api/team's anonShape does (slug + name).
 * A missing member gets the generic card. No credential is read, so every
 * card is publicly cacheable.
 */

import type { Env } from '../types'

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

const GENERIC = { eyebrow: 'MN-CCORE LAB', title: 'Research operations', subtitle: 'Tasks · Projects · Meetings · Lab knowledge' }

async function ogTeam(slug: string, env: Env): Promise<string> {
  const row = await env.DB.prepare('SELECT name FROM team_members WHERE slug = ?')
    .bind(slug).first<{ name: string }>()
  return row ? svg({ eyebrow: 'MN-CCORE TEAM', title: row.name }) : svg(GENERIC)
}

export async function handleOgCard(type: string, slug: string, env: Env): Promise<Response> {
  let body: string
  try {
    body = type === 'team' ? await ogTeam(slug, env) : svg(GENERIC)
  } catch (e) {
    // Total fallback on the next line: the generic card, logged.
    console.error('[og-card]', type, (e as Error).message)
    body = svg(GENERIC)
  }
  return new Response(body, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
