import React from 'react'
import { classifyUrl, shortLabelForUrl } from '../lib/urlClassify'

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

// URL matcher: http(s)://... plus file:/// and bare C:\ paths up to a
// whitespace. Greedy-ish but stops at whitespace. Trailing punctuation
// (.,;:!?) is trimmed after match so "see https://x.com." doesn't
// capture the period.
const URL_RE = /(https?:\/\/\S+|file:\/\/\/\S+|[A-Z]:\\\S+)/g
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>'"]+$/

interface Props {
  text: string
  className?: string
  style?: React.CSSProperties
}

export default function LinkifiedText({ text, className, style }: Props) {
  if (!text) return null
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null
  URL_RE.lastIndex = 0

  while ((match = URL_RE.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    // Trim trailing punctuation from the URL
    const trailingMatch = match[0].match(TRAILING_PUNCT_RE)
    const trail = trailingMatch?.[0] ?? ''
    const rawUrl = trail ? match[0].slice(0, -trail.length) : match[0]
    const urlEnd = end - trail.length

    // Text before this URL
    if (start > lastIdx) {
      parts.push(text.slice(lastIdx, start))
    }

    const { href, Icon, isHttp } = classifyUrl(rawUrl)
    const label = shortLabelForUrl(rawUrl)
    parts.push(
      <a
        key={`url-${start}`}
        href={href}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 align-baseline"
        style={{
          fontSize: 'inherit',
          color: 'var(--teal)',
          background: 'var(--teal-active)',
          borderRadius: 'var(--radius-sm)',
          padding: '1px 6px',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={rawUrl}
      >
        <Icon size={11} />
        <span>{label}</span>
      </a>
    )

    if (trail) parts.push(trail)
    lastIdx = urlEnd + trail.length
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
