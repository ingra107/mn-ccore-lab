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

export interface PageMetaOptions {
  /** og:type — e.g. 'article' for project pages, 'profile' for /team/:slug. */
  ogType?: string
  /** Per-route OG share-card URL — point at /og/<type>/<slug> for branded
   *  preview images instead of the static og-image.svg fallback. */
  ogImage?: string
}

export function usePageMeta(title: string, description: string, ogTypeOrOptions?: string | PageMetaOptions) {
  // Back-compat: callers pass a string for og:type, or an options object.
  const opts: PageMetaOptions = typeof ogTypeOrOptions === 'string'
    ? { ogType: ogTypeOrOptions }
    : ogTypeOrOptions ?? {}

  useEffect(() => {
    document.title = title

    ensureMeta('name', 'description', description)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', description)
    ensureMeta('property', 'og:site_name', 'MN-CCORE Lab')
    ensureMeta('name', 'twitter:title', title)
    ensureMeta('name', 'twitter:description', description)

    if (opts.ogType) ensureMeta('property', 'og:type', opts.ogType)
    if (opts.ogImage) {
      ensureMeta('property', 'og:image', opts.ogImage)
      ensureMeta('name', 'twitter:image', opts.ogImage)
    }
  }, [title, description, opts.ogType, opts.ogImage])
}
