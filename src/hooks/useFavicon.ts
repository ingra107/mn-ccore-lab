import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import { useUnreadCount } from './useNotifications'
import { emailToSlug } from '../lib/emailSlug'

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

function setEmojiFavicon(emoji: string, badge?: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.font = '52px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 32, 36)

  // Draw notification badge
  if (badge && badge > 0) {
    ctx.fillStyle = '#dc2626'
    ctx.beginPath()
    ctx.arc(52, 12, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badge > 9 ? '9+' : String(badge), 52, 13)
  }

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
  const { user } = useAuth()
  const userSlug = useMemo(() => emailToSlug(user?.email), [user?.email])
  const { data: unreadCount = 0 } = useUnreadCount(userSlug)

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
      setEmojiFavicon(emoji, unreadCount)
    } else if (pathname.startsWith('/publications')) {
      setEmojiFavicon('📄', unreadCount)
    } else {
      restoreFavicon()
    }

    return () => restoreFavicon()
  }, [pathname, unreadCount])
}
