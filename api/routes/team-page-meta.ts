/**
 * Server-side link-preview tags for the public profile page /team/:slug
 * (functions/team/[slug].ts is the Pages wrapper).
 *
 * WHY. usePageMeta writes og:title, og:description and og:image in a React
 * useEffect. Slack, iMessage and Twitter fetch the HTML and never run JS, so a
 * shared profile link unfurled as the generic site card. This rewrites the
 * served index.html head for /team/:slug only, so a non-JS client gets the
 * member's name, the public page's own description line, and the per-member
 * share card /og/team/<slug>.
 *
 * WHAT IT MAY SAY. Only what the public profile page already renders to a
 * logged-out visitor: the member's name and role from src/data/team (the
 * wrapper passes them in; this module never reads D1 or credentials). A slug
 * the page does not know is passed through untouched: the SPA redirects it to
 * /team, so it keeps the generic site tags.
 */

export interface PublicMember {
  slug: string
  /** Display name, as the page title uses it ("Nick Ingraham"). */
  name: string
  /** Formal name with credentials, as the page's description line uses it. */
  formalName: string
  role?: string
}

type Tag = { attr: 'name' | 'property'; key: string; content: string }

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The tags for one member. Mirrors MemberPage's usePageMeta call. */
export function teamPageTags(m: PublicMember, origin: string): { title: string; tags: Tag[] } {
  const title = `${m.name} | MN-CCORE Lab`
  const description = m.role
    ? `${m.formalName} — ${m.role} at MN-CCORE Lab, University of Minnesota.`
    : `${m.formalName}, MN-CCORE Lab, University of Minnesota.`
  const url = `${origin}/team/${encodeURIComponent(m.slug)}`
  const image = `${origin}/og/team/${encodeURIComponent(m.slug)}`
  return {
    title,
    tags: [
      { attr: 'name', key: 'description', content: description },
      { attr: 'property', key: 'og:title', content: title },
      { attr: 'property', key: 'og:description', content: description },
      { attr: 'property', key: 'og:type', content: 'profile' },
      { attr: 'property', key: 'og:url', content: url },
      { attr: 'property', key: 'og:image', content: image },
      { attr: 'property', key: 'og:image:width', content: '1200' },
      { attr: 'property', key: 'og:image:height', content: '630' },
      { attr: 'name', key: 'twitter:card', content: 'summary_large_image' },
      { attr: 'name', key: 'twitter:title', content: title },
      { attr: 'name', key: 'twitter:description', content: description },
      { attr: 'name', key: 'twitter:image', content: image },
    ],
  }
}

/**
 * Replace each tag's existing <meta> (any attribute order) and the <title>;
 * a tag the head lacks is added before </head>.
 */
export function rewriteHead(html: string, title: string, tags: Tag[]): string {
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`)
  const missing: string[] = []
  for (const t of tags) {
    const tag = `<meta ${t.attr}="${t.key}" content="${escapeAttr(t.content)}" />`
    const re = new RegExp(`<meta\\b[^>]*\\b${t.attr}="${escapeRegex(t.key)}"[^>]*>`, 'i')
    if (re.test(out)) out = out.replace(re, () => tag)
    else missing.push(tag)
  }
  if (missing.length) out = out.replace(/<\/head>/i, () => `    ${missing.join('\n    ')}\n  </head>`)
  return out
}

/**
 * Serve /team/:slug: the SPA's index.html with the member's tags, or the
 * upstream response untouched when the member is unknown or the upstream is
 * not a 200 HTML document.
 */
export async function handleTeamPage(
  request: Request,
  member: PublicMember | undefined,
  next: () => Promise<Response>,
): Promise<Response> {
  const res = await next()
  if (!member) return res
  const type = res.headers.get('content-type') || ''
  if (res.status !== 200 || !/text\/html/i.test(type)) return res
  const { title, tags } = teamPageTags(member, new URL(request.url).origin)
  const html = rewriteHead(await res.text(), title, tags)
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.delete('etag')
  return new Response(html, { status: 200, headers })
}
