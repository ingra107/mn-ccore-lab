/**
 * URL classifier — maps any URL string to a display-friendly shape.
 *
 * Shared by KeyLinksEditor (chip rendering), LinkifiedText (inline text
 * auto-linkify), and any future surface that wants context-aware icons
 * and href rewriting for Box folder paths, .bat scripts, etc.
 */

import { BookText, ExternalLink, FolderOpen, Mail, Play } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ClassifiedUrl {
  href: string
  Icon: LucideIcon
  typeLabel: 'Link' | 'Script' | 'Folder' | 'Obsidian' | 'Gmail'
  isHttp: boolean
}

/**
 * Gmail URL semantics (TODAY.md link-vocabulary parity, Nick 2026-06-10):
 * a mail.google.com URL is a "Gmail draft" when its fragment/path targets a
 * draft, otherwise a "Gmail thread". Used for both the chip icon and label.
 */
export function gmailKind(url: string): 'draft' | 'thread' | null {
  if (!/^https?:\/\/mail\.google\.com\//i.test(url)) return null
  return /#drafts|[/#]drafts?\b/i.test(url) ? 'draft' : 'thread'
}

/**
 * The Obsidian vault that maps to the Peripheral-Brain folder. Verified against
 * PB's own URI builder (scripts/today/utils.py → `?vault=Peripheral-Brain`).
 * Both machines open the same vault name; only the on-disk user dir differs.
 */
const OBSIDIAN_VAULT = 'Peripheral-Brain'

/**
 * Detect a NORMALIZED local path (forward slashes, no file://) that lives inside
 * the Peripheral-Brain Obsidian vault AND is a markdown note. Matches the vault
 * segment for ANY user dir — `/Users/ingra107/Peripheral-Brain/` (work) and
 * `/Users/ingra/Peripheral-Brain/` (home) both resolve, so the same key link
 * opens on either machine. Returns the vault-relative path (no leading slash,
 * `.md` extension stripped — Obsidian's `open` action appends it on resolve), or
 * null when the path is not a vault markdown note.
 */
export function obsidianVaultRelPath(normalizedPath: string): string | null {
  if (!normalizedPath || !/\.md$/i.test(normalizedPath)) return null
  // Split on the vault folder boundary. The leading `/Users/<anything>/` is
  // matched loosely so we don't pin a username; we only require the literal
  // Peripheral-Brain folder segment followed by at least one path component.
  const m = normalizedPath.match(/[/\\]Peripheral-Brain[/\\](.+)$/i)
  if (!m) return null
  const rel = m[1].replace(/\.md$/i, '')
  return rel.length > 0 ? rel : null
}

/**
 * Parse an Obsidian wikilink string: `[[target]]` or `[[target|alias]]`.
 * PB writes key links in this form (TODAY.md link vocabulary) — the target is
 * either a bare note name (`iwd-r03-resubmission-revisions-2026-05-29`) or a
 * vault-relative path (`Projects/lpv-adherence-paper/iwd-...`). Obsidian's
 * `open?file=` resolves BOTH exactly like a wikilink, so the target passes
 * through unchanged (`.md` stripped if present).
 */
export function parseWikilink(value: string): { target: string; alias: string | null } | null {
  const m = value.trim().match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
  if (!m) return null
  const target = m[1].trim().replace(/\.md$/i, '')
  if (!target) return null
  return { target, alias: m[2]?.trim() || null }
}

/**
 * Build `obsidian://open?vault=Peripheral-Brain&file=<vault-relative-path>` for
 * a markdown note inside the vault. The `file` value is the vault-relative path
 * (percent-encoded; `/` separators preserved so Obsidian resolves nested notes).
 */
export function buildObsidianUri(vaultRelPath: string): string {
  // encodeURIComponent escapes `/` to %2F; Obsidian wants the slashes intact
  // for nested folders, so re-introduce them. Spaces → %20, other chars escaped.
  const file = encodeURIComponent(vaultRelPath).replace(/%2F/gi, '/')
  return `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT)}&file=${file}`
}

/**
 * Build the `mnccore://obsidian/<note>` launch URI — the chip href since
 * 2026-06-10. The handler opens the note via the Obsidian CLI when Obsidian is
 * RUNNING (the obsidian:// second-instance handoff drops URIs intermittently;
 * the CLI never does) and falls back to the obsidian:// protocol on cold start.
 * The target is a bare note name or vault-relative path — both resolve like a
 * wikilink on both routes.
 */
export function buildObsidianLaunchUri(target: string): string {
  // encodeURI keeps `/` intact and escapes spaces — the handler decodes %20.
  return `mnccore://obsidian/${encodeURI(target)}`
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
  } else {
    // Collapse consecutive forward slashes that arise from escaped backslashes
    // (e.g. JSON-escaped C:\\X\\proj → C://X//proj → C:/X/proj).
    p = p.replace(/\/{2,}/g, '/')
  }
  // Trim trailing slashes (but never reduce a bare "/" or UNC "//" to empty).
  p = p.replace(/\/+$/, '')
  if (!p && isUnc) return '//'
  return p
}

export function classifyUrl(url: string): ClassifiedUrl {
  // Obsidian wikilink form `[[note|label]]` (PB-written key links). Without
  // this branch the literal `[[...]]` fell through to the generic Link arm and
  // the browser navigated to it as a RELATIVE URL — the "website flashes,
  // nothing opens" bug (Nick 2026-06-10).
  const wiki = parseWikilink(url)
  if (wiki) {
    return { href: buildObsidianLaunchUri(wiki.target), Icon: BookText, typeLabel: 'Obsidian', isHttp: false }
  }
  const isHttp = url.startsWith('http')
  if (isHttp && gmailKind(url)) {
    return { href: url, Icon: Mail, typeLabel: 'Gmail', isHttp: true }
  }
  const isDrivePath = /^[A-Za-z]:/.test(url)
  const isUncPath = url.startsWith('\\\\')
  const isLocalPath = url.startsWith('file:///') || isDrivePath || isUncPath || (url.startsWith('/') && !url.startsWith('//'))
  const isBat = url.endsWith('.bat') || url.endsWith('.cmd') || url.endsWith('.ps1')
  if (isBat) {
    // @-tag security Wave 2: arbitrary local-script launch via
    // mnccore://launch/<path> is RETIRED. The Windows handler now refuses any
    // launch arg that is not an opaque `lnch_` token, so emitting a path-launch
    // URI here is DEAD (the handler rejects it). A .bat/.cmd/.ps1 link is now a
    // COPY-ONLY affordance: keep the Script icon/label for display, but the href
    // is the raw path (isHttp:false → useProtocolLaunch copies it to the
    // clipboard; the browser will not navigate to a C:\ path). Do NOT fall
    // through to buildOpenFolderUri — that hands the path to explorer.exe, whose
    // file association would re-introduce a script-execution path.
    return {
      href: url,
      Icon: Play,
      typeLabel: 'Script',
      isHttp: false,
    }
  }
  if (isLocalPath) {
    // A markdown note inside the Peripheral-Brain vault opens in Obsidian, not
    // Explorer. Normalize first so the vault-segment match sees forward slashes.
    const normalized = normalizeLocalFolderPath(url)
    const vaultRel = obsidianVaultRelPath(normalized)
    if (vaultRel) {
      return {
        href: buildObsidianLaunchUri(vaultRel),
        Icon: BookText,
        typeLabel: 'Obsidian',
        isHttp: false,
      }
    }
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
    const wiki = parseWikilink(url)
    if (wiki) {
      if (wiki.alias) return wiki.alias
      const noteName = wiki.target.split('/').filter(Boolean).pop() || wiki.target
      return `Obsidian · ${noteName}`
    }
    if (url.startsWith('http')) {
      const gk = gmailKind(url)
      if (gk) return gk === 'draft' ? 'Gmail draft' : 'Gmail thread'
      return new URL(url).hostname.replace(/^www\./, '')
    }
    if (url.startsWith('file:///') || /^[A-Za-z]:/.test(url) || url.startsWith('\\\\')) {
      const clean = normalizeLocalFolderPath(url)
      // A vault markdown note labels as "Obsidian · <note name>".
      const vaultRel = obsidianVaultRelPath(clean)
      if (vaultRel) {
        const noteName = vaultRel.split('/').filter(Boolean).pop() || vaultRel
        return `Obsidian · ${noteName}`
      }
      const parts = clean.split('/').filter(Boolean)
      return parts.slice(-3).join(' / ')
    }
    return url
  } catch {
    return url
  }
}
