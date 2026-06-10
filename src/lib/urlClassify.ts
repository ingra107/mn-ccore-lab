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
  const isDrivePath = /^[A-Za-z]:/.test(url)
  const isUncPath = url.startsWith('\\\\')
  const isLocalPath = url.startsWith('file:///') || isDrivePath || isUncPath || (url.startsWith('/') && !url.startsWith('//'))
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
 * Encode a local folder/file path into the `mnccore://` path segment, matching
 * the encoding `classifyUrl` uses for `open/` (strip a leading `file:///`; the
 * handler URL-decodes %20 + maps `/`→`\`). Kept as one helper so the workon /
 * open / launch builders all agree on the path shape the Windows handler parses.
 */
function encodeLocalPath(path: string): string {
  return path.replace(/^file:\/\/\//, '')
}

/**
 * Build `mnccore://workon/<folder>` — the verb that launches
 * "<folder>\Start Claude.bat" in that folder (TODAY.md-parity local launch).
 * The handler refuses unless the folder exists AND contains that exact bat,
 * so a bad/empty `primary_folder` is a safe no-op (clipboard fallback still
 * fires client-side).
 */
export function buildWorkOnUri(folderPath: string): string {
  return `mnccore://workon/${encodeLocalPath(folderPath)}`
}

/** Build `mnccore://open/<folder>` for an Explorer open of a local path. */
export function buildOpenFolderUri(folderPath: string): string {
  return `mnccore://open/${encodeLocalPath(folderPath)}`
}

/**
 * The verb-only `mnccore://process` URI — runs Quick_Process.bat on the local
 * machine. No path segment (the handler matches the bare verb).
 */
export const MNCCORE_PROCESS_URI = 'mnccore://process'

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
    if (url.startsWith('file:///') || /^[A-Za-z]:/.test(url) || url.startsWith('\\\\')) {
      const clean = url.replace(/^file:\/\/\//, '').replace(/\\/g, '/')
      const parts = clean.split('/').filter(Boolean)
      return parts.slice(-3).join(' / ')
    }
    return url
  } catch {
    return url
  }
}
