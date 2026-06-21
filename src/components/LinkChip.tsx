// LinkChip — Mode-B borderless icon-only affordance that navigates to a
// classified URL.
//
// Extracted from TaskDetailPanel.tsx (the Gmail email_link chip) and
// KeyLinksEditor.tsx's LinkRow display shell so both surfaces share markup.
// Non-http links fire through useProtocolLaunch (clipboard backup + toast).
//
// Nick 2026-06-17 rule: icon-only = no box (Mode B). The old border/ice-bg/
// borderRadius:999 pill styling is retired. Labeled chips (KeyLinksEditor
// Mode-A) keep their pill box because they have visible text.
//
// Props intentionally minimal: pass a raw url + optional label.
// When `type` (stored PB link type) is provided, iconForType() resolves the
// brand glyph; otherwise classifyUrl() infers from the URL.

import React from 'react'
import { classifyUrl, shortLabelForUrl } from '../lib/urlClassify'
import { iconForType } from '../lib/linkIcon'
import { ICON_PROPS } from '../lib/iconProps'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'

interface Props {
  /** The raw URL (https://, file://, mnccore://, gmail:// etc.). */
  url: string
  /** Stored PB link type (e.g. 'gmail_thread'). When set, overrides URL-inferred icon. */
  type?: string | null
  /** Override the displayed label. Falls back to classifyUrl's typeLabel or the url. */
  label?: string | null
  /** Additional className string applied to the chip root element. */
  className?: string
  /** style overrides applied to the chip root (merged after defaults). */
  style?: React.CSSProperties
  /** onClick handler (in addition to / instead of navigation). */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  /** If true, calls stopPropagation before navigation. Default: false. */
  stopPropagation?: boolean
}

export default function LinkChip({
  url,
  type,
  label,
  className,
  style,
  onClick,
  stopPropagation = false,
}: Props) {
  const { href, Icon: FallbackIcon, typeLabel, isHttp } = classifyUrl(url)
  const stored = type ? iconForType(type) : null
  const Icon = stored ? stored.Icon : FallbackIcon
  const color = stored ? stored.color : 'var(--teal)'
  const { launch } = useProtocolLaunch()

  const displayLabel = label ?? typeLabel ?? shortLabelForUrl(url)
  const tooltip = type && displayLabel ? `${type} · ${displayLabel}` : displayLabel

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagation) e.stopPropagation()
    if (!isHttp) {
      e.preventDefault()
      void launch(href, {
        copyText: url,
        successMessage: `Opening ${typeLabel.toLowerCase()}… (path copied as backup)`,
      })
    }
    onClick?.(e)
  }

  return (
    <a
      href={isHttp ? href : url}
      target={isHttp ? '_blank' : undefined}
      rel={isHttp ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
      title={tooltip}
      className={`inline-flex items-center gap-1.5 self-start ${className ?? ''}`}
      style={{
        fontSize: 12,
        color,
        textDecoration: 'none',
        fontWeight: 500,
        ...style,
      }}
    >
      <Icon {...ICON_PROPS} size={14} aria-hidden="true" />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {displayLabel}
      </span>
    </a>
  )
}
