/**
 * team-page-meta.test.ts — /team/:slug serves its og/twitter tags in the HTML.
 *
 * Drives the real Pages wrapper (functions/team/[slug].ts) with the repo's
 * real index.html as the upstream asset, and reads the result the way a
 * non-JS unfurler does: as a string, no DOM, no scripts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { onRequestGet } from '../../functions/team/[slug]'
import { rewriteHead } from './team-page-meta'

const INDEX_HTML = readFileSync('index.html', 'utf8')

function metaContent(html: string, attr: string, key: string): string | undefined {
  const tag = html.match(new RegExp(`<meta\\b[^>]*\\b${attr}="${key.replace(/[.:]/g, '\\$&')}"[^>]*>`, 'i'))?.[0]
  return tag?.match(/content="([^"]*)"/)?.[1]
}

async function serve(slug: string, upstream?: Response): Promise<{ status: number; html: string }> {
  const request = new Request(`https://mn-ccore-lab.pages.dev/team/${slug}`)
  const next = async () =>
    upstream ?? new Response(INDEX_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (onRequestGet as any)({ request, params: { slug }, next, env: {} })
  return { status: res.status, html: await res.text() }
}

describe('GET /team/:slug link-preview tags', () => {
  it('the static index.html alone carries only the generic site card (the old behavior)', () => {
    expect(metaContent(INDEX_HTML, 'property', 'og:image')).toBe('https://mn-ccore-lab.pages.dev/og-image.svg')
  })

  it('a known member gets og:title, og:image = /og/team/<slug>, and twitter tags in the HTML', async () => {
    const { status, html } = await serve('nick-ingraham')
    expect(status).toBe(200)
    expect(metaContent(html, 'property', 'og:image')).toBe('https://mn-ccore-lab.pages.dev/og/team/nick-ingraham')
    expect(metaContent(html, 'name', 'twitter:image')).toBe('https://mn-ccore-lab.pages.dev/og/team/nick-ingraham')
    expect(metaContent(html, 'property', 'og:title')).toMatch(/^Nick.* \| MN-CCORE Lab$/)
    expect(metaContent(html, 'name', 'twitter:title')).toBe(metaContent(html, 'property', 'og:title'))
    expect(metaContent(html, 'property', 'og:type')).toBe('profile')
    expect(metaContent(html, 'property', 'og:url')).toBe('https://mn-ccore-lab.pages.dev/team/nick-ingraham')
    expect(metaContent(html, 'property', 'og:description')).toMatch(/at MN-CCORE Lab, University of Minnesota\.$/)
    expect(html).toMatch(/<title>Nick.* \| MN-CCORE Lab<\/title>/)
    // One tag per key: replaced, not duplicated.
    expect(html.match(/property="og:image"/g)).toHaveLength(1)
    // The SPA itself is untouched.
    expect(html).toContain('<div id="root">')
  })

  it('an unknown slug is passed through with the generic tags (the SPA redirects it to /team)', async () => {
    const { html } = await serve('no-such-member')
    expect(html).toBe(INDEX_HTML)
  })

  it('a non-HTML or non-200 upstream is passed through untouched', async () => {
    const { status, html } = await serve('nick-ingraham', new Response('gone', { status: 404, headers: { 'Content-Type': 'text/plain' } }))
    expect(status).toBe(404)
    expect(html).toBe('gone')
  })

  it('escapes values and adds a tag the head lacks', () => {
    const out = rewriteHead('<head><title>x</title></head>', 'A "B" <C>', [
      { attr: 'property', key: 'og:title', content: 'A "B" <C>' },
    ])
    expect(out).toContain('<title>A &quot;B&quot; &lt;C&gt;</title>')
    expect(out).toContain('<meta property="og:title" content="A &quot;B&quot; &lt;C&gt;" />')
  })
})
