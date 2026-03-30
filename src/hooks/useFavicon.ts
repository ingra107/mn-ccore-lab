import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SECTION_EMOJIS: Record<string, string> = {
  '/dashboard': '📊',
  '/personal': '🏠',
  '/tasks': '✅',
  '/my-tasks': '📋',
  '/calendar': '📅',
  '/deadlines': '⏰',
  '/projects': '📁',
  '/manuscripts': '📝',
  '/ideas': '💡',
  '/digest': '📚',
  '/grants': '💰',
  '/meetings': '🤝',
  '/activity': '⚡',
  '/analytics': '📈',
  '/search': '🔍',
  '/settings': '⚙️',
  '/meeting-notes': '🎙️',
  '/pulse': '💓',
}

let originalFavicon: string | null = null

function setEmojiFavicon(emoji: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.font = '52px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 32, 36)

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  if (!originalFavicon) originalFavicon = link.href
  link.href = canvas.toDataURL('image/png')
}

function restoreFavicon() {
  if (originalFavicon) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = originalFavicon
  }
}

/**
 * Sets a section-specific emoji favicon in the browser tab.
 * Restores the original favicon when leaving portal routes.
 */
export function useFavicon() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Find matching section (longest prefix match)
    let emoji: string | null = null
    let bestLen = 0
    for (const [prefix, e] of Object.entries(SECTION_EMOJIS)) {
      if (pathname.startsWith(prefix) && prefix.length > bestLen) {
        emoji = e
        bestLen = prefix.length
      }
    }

    if (emoji) {
      setEmojiFavicon(emoji)
    } else if (pathname.startsWith('/publications')) {
      setEmojiFavicon('📄')
    } else {
      restoreFavicon()
    }

    return () => restoreFavicon()
  }, [pathname])
}
