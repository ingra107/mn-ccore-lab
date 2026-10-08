import { useEffect } from 'react'

function ensureMeta(attr: string, key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`)
  if (el) {
    el.setAttribute('content', content)
  } else {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    el.setAttribute('content', content)
    document.head.appendChild(el)
  }
}

/**
 * Title and meta tags for the browser tab and in-page readers. Link unfurlers
 * (Slack, iMessage, Twitter) never run this: they read the served HTML. A page
 * that needs its own preview card serves its tags server-side, as
 * functions/team/[slug].ts does for /team/:slug.
 *
 * @param ogType og:type, e.g. 'article' for project pages, 'profile' for /team/:slug.
 */
export function usePageMeta(title: string, description: string, ogType?: string) {
  useEffect(() => {
    document.title = title

    ensureMeta('name', 'description', description)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', description)
    ensureMeta('property', 'og:site_name', 'MN-CCORE Lab')
    ensureMeta('name', 'twitter:title', title)
    ensureMeta('name', 'twitter:description', description)

    if (ogType) ensureMeta('property', 'og:type', ogType)
  }, [title, description, ogType])
}
