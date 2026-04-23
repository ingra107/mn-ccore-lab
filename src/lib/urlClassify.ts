/**
 * URL classifier — maps any URL string to a display-friendly shape.
 *
 * Shared by KeyLinksEditor (chip rendering), LinkifiedText (inline text
 * auto-linkify), and any future surface that wants context-aware icons
 * and href rewriting for Box folder paths, .bat scripts, etc.
 */

import { ExternalLink, FolderOpen, Play } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ClassifiedUrl {
  href: string
  Icon: LucideIcon
  typeLabel: 'Link' | 'Script' | 'Folder'
  isHttp: boolean
}

export function classifyUrl(url: string): ClassifiedUrl {
  const isHttp = url.startsWith('http')
  const isLocalPath = url.startsWith('file:///') || url.startsWith('C:') || (url.startsWith('/') && !url.startsWith('//'))
  const isBat = url.endsWith('.bat') || url.endsWith('.cmd') || url.endsWith('.ps1')
  if (isBat) {
    return {
      href: `mnccore://launch/${url.replace('file:///', '')}`,
      Icon: Play,
      typeLabel: 'Script',
      isHttp: false,
    }
  }
  if (isLocalPath) {
    return {
      href: `mnccore://open/${url.replace('file:///', '')}`,
      Icon: FolderOpen,
      typeLabel: 'Folder',
      isHttp: false,
    }
  }
  return { href: url, Icon: ExternalLink, typeLabel: 'Link', isHttp }
}

/**
 * Domain-aware short label for a URL. Used in chip text when the link has
 * no user-provided description.
 *   https://github.com/ingra107/mn-ccore-lab/pull/42 -> github.com
 *   https://docs.google.com/document/d/.../edit       -> docs.google.com
 *   file:///C:/Users/.../Box/projects/clif/           -> Box / projects / clif
 */
export function shortLabelForUrl(url: string): string {
  try {
    if (url.startsWith('http')) {
      return new URL(url).hostname.replace(/^www\./, '')
    }
    if (url.startsWith('file:///') || url.startsWith('C:')) {
      const clean = url.replace(/^file:\/\/\//, '').replace(/\\/g, '/')
      const parts = clean.split('/').filter(Boolean)
      return parts.slice(-3).join(' / ')
    }
    return url
  } catch {
    return url
  }
}
