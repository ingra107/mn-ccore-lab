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

/**
 * Normalize a heterogeneous local-folder/file path into the ONE canonical
 * forward-slash shape the `mnccore://` Windows handler can `if exist`-check.
 *
 * `projects.primary_folder` (and hand-typed key links) arrive in three shapes
 * seen in live /api/projects data:
 *   - file URL + percent-encoding:  file:///C:/Users/ingra107/Box/K%20proposal/
 *   - plain forward slashes:        C:/Users/ingra107/Box/.../CIRCLE_ORIGIN
 *   - backslashes + spaces:         C:\Users\ingra107\Box\...\ATS Working Group
 * Wrapping the RAW value made the handler receive e.g.
 *   mnccore://open/file:///C:/...   → the exists-check failed → error window.
 *
 * Steps: strip a leading file://[/], percent-DECODE, backslashes→forward,
 * collapse the doubled leading slash a UNC/`file://host` form can leave, trim
 * trailing slashes. UNC paths (`\\server\share`) keep their leading `//`.
 */
export function normalizeLocalFolderPath(raw: string): string {
  if (!raw) return ''
  let p = raw.trim()
  const isUnc = p.startsWith('\\\\') || p.startsWith('//')
  // Strip a leading file:/// or file:// (with or without the third slash).
  p = p.replace(/^file:\/\/\/?/i, '')
  // Percent-decode (%20 → space, etc). Be defensive: a malformed sequence
  // (lone %) throws in decodeURIComponent — fall back to the raw value.
  try {
    p = decodeURIComponent(p)
  } catch {
    /* leave p as-is on a malformed escape sequence */
  }
  // Backslashes → forward slashes.
  p = p.replace(/\\/g, '/')
  if (isUnc) {
    // Preserve exactly one leading `//` for a UNC share.
    p = '//' + p.replace(/^\/+/, '')
  }
  // Trim trailing slashes (but never reduce a bare "/" or UNC "//" to empty).
  p = p.replace(/\/+$/, '')
  if (!p && isUnc) return '//'
  return p
}

export function classifyUrl(url: string): ClassifiedUrl {
  const isHttp = url.startsWith('http')
  const isDrivePath = /^[A-Za-z]:/.test(url)
  const isUncPath = url.startsWith('\\\\')
  const isLocalPath = url.startsWith('file:///') || isDrivePath || isUncPath || (url.startsWith('/') && !url.startsWith('//'))
  const isBat = url.endsWith('.bat') || url.endsWith('.cmd') || url.endsWith('.ps1')
  if (isBat) {
    return {
      href: `mnccore://launch/${normalizeLocalFolderPath(url)}`,
      Icon: Play,
      typeLabel: 'Script',
      isHttp: false,
    }
  }
  if (isLocalPath) {
    return {
      href: buildOpenFolderUri(url),
      Icon: FolderOpen,
      typeLabel: 'Folder',
      isHttp: false,
    }
  }
  return { href: url, Icon: ExternalLink, typeLabel: 'Link', isHttp }
}

/**
 * Build `mnccore://workon/<folder>` — the verb that launches
 * "<folder>\Start Claude.bat" in that folder (TODAY.md-parity local launch).
 * The handler refuses unless the folder exists AND contains that exact bat,
 * so a bad/empty `primary_folder` is a safe no-op (clipboard fallback still
 * fires client-side). The path is normalized to the canonical forward-slash
 * shape first so the handler's `if exist` check sees a real path regardless of
 * the heterogeneous form `primary_folder` arrives in.
 */
export function buildWorkOnUri(folderPath: string): string {
  return `mnccore://workon/${normalizeLocalFolderPath(folderPath)}`
}

/** Build `mnccore://open/<folder>` for an Explorer open of a local path. */
export function buildOpenFolderUri(folderPath: string): string {
  return `mnccore://open/${normalizeLocalFolderPath(folderPath)}`
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
      const clean = normalizeLocalFolderPath(url)
      const parts = clean.split('/').filter(Boolean)
      return parts.slice(-3).join(' / ')
    }
    return url
  } catch {
    return url
  }
}
