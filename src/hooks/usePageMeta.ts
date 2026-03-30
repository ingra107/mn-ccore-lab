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

export function usePageMeta(title: string, description: string, ogType?: string) {
  useEffect(() => {
    document.title = title

    ensureMeta('name', 'description', description)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', description)
    ensureMeta('property', 'og:site_name', 'MN-CCORE Lab')

    if (ogType) {
      ensureMeta('property', 'og:type', ogType)
    }
  }, [title, description, ogType])
}
