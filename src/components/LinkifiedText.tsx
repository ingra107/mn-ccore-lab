import React from 'react'
import { classifyUrl, shortLabelForUrl } from '../lib/urlClassify'
import { ICON_PROPS } from '../lib/iconProps'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'

/**
 * Render text with auto-linkified URLs. Pure URLs are replaced with
 * classified chips (folder icon for Box / local paths, journal icon for
 * known publishers, ExternalLink for generic). Non-URL text renders
 * unchanged so line breaks (via `whiteSpace: pre-wrap` on the parent)
 * still survive.
 *
 * Matches the visual vocabulary of `KeyLinksEditor` — one URL style
 * across the app, per Nick's 'links must MAKE SENSE + be INTUITIVE'
 * feedback (2026-04-23).
 */

// URL matcher: http(s)://... and file:/// stop at whitespace (URLs are
// %-encoded by convention). Bare drive paths (`C:\...` OR `C:/...` — both
// slash styles appear in live data) are LINE-bounded so paths containing
// spaces ("...\R Proposal\.R03-Grant") chip as ONE link instead of
// truncating at the first space — the 2026-06-10 "chip fired a nonexistent
// path" bug. Cost: prose following a path on the same line over-captures;
// the handler's exists-check + copied-path toast make that recoverable,
// while truncation was silently wrong on EVERY spaced path. Trailing
// punctuation/whitespace is trimmed after match.
const URL_RE = /(https?:\/\/\S+|file:\/\/\/\S+|[A-Za-z]:[\\/][^\n<>"|?*]+)/g
const TRAILING_PUNCT_RE = /[\s.,;:!?)\]}>'"]+$/

interface Props {
  text: string
  className?: string
  style?: React.CSSProperties
}

export default function LinkifiedText({ text, className, style }: Props) {
  const { launch } = useProtocolLaunch()
  if (!text) return null
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null
  URL_RE.lastIndex = 0

  while ((match = URL_RE.exec(text)) !== null) {
    const start = match.index
    let matched = match[0]
    // N1.19 — bare paths are LINE-bounded (so spaced folder names survive),
    // which over-captured trailing prose into the chip. Punctuation-then-
    // space ('. ', ', ', '; ') is a prose boundary that essentially never
    // occurs inside a real path — cut the match there.
    if (/^[A-Za-z]:/.test(matched)) {
      const cut = matched.search(/[.,;!?]\s/)
      if (cut !== -1) matched = matched.slice(0, cut)
    }
    const end = start + matched.length
    // Trim trailing punctuation from the URL
    const trailingMatch = matched.match(TRAILING_PUNCT_RE)
    const trail = trailingMatch?.[0] ?? ''
    const rawUrl = trail ? matched.slice(0, -trail.length) : matched
    const urlEnd = end - trail.length

    // Text before this URL
    if (start > lastIdx) {
      parts.push(text.slice(lastIdx, start))
    }

    const { href, Icon, isHttp, typeLabel } = classifyUrl(rawUrl)
    const label = shortLabelForUrl(rawUrl)
    // Non-http chips fire through the ONE protocol-launch chokepoint
    // (clipboard backup + toast feedback) — the old inline handler copied
    // silently, so a failed fire looked like the click did nothing.
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isHttp) return
      e.preventDefault()
      void launch(href, {
        copyText: rawUrl,
        successMessage: `Opening ${typeLabel.toLowerCase()}… (path copied as backup)`,
      })
    }
    // Mode-B borderless (Nick 2026-06-17): no pill box on icon-only affordances.
    // Text label is kept here because inline linkified text is always labeled
    // (the reader needs context). Icon is URL-inferred (no stored type in
    // free-form prose). Size bumped from 11 to 14 for crispness (ICON_PROPS).
    parts.push(
      <a
        key={`url-${start}`}
        href={isHttp ? href : rawUrl}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        onClick={handleClick}
        title={isHttp ? rawUrl : `Click to copy ${typeLabel.toLowerCase()} path: ${rawUrl}`}
        className="inline-flex items-center gap-1 align-baseline"
        style={{
          fontSize: 'inherit',
          color: 'var(--teal)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <Icon {...ICON_PROPS} size={14} />
        <span>{label}</span>
      </a>
    )

    if (trail) parts.push(trail)
    lastIdx = urlEnd + trail.length
    // The match may have been shortened at a prose boundary — rewind the
    // regex so the text after the cut is scanned as normal prose.
    URL_RE.lastIndex = lastIdx
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx))
  }

  return (
    <span className={className} style={style}>
      {parts}
    </span>
  )
}
