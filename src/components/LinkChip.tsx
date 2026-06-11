// LinkChip — read-only teal chip that navigates to a classified URL.
//
// Extracted from TaskDetailPanel.tsx (the Gmail email_link chip) and
// KeyLinksEditor.tsx's LinkRow display shell so both surfaces share markup.
// Non-http links fire through useProtocolLaunch (clipboard backup + toast).
//
// Props intentionally minimal: pass a raw url + optional label. The chip
// derives icon + href + type-label from classifyUrl(), so callers never have
// to import urlClassify directly for display-only uses.

import React from 'react'
import { classifyUrl } from '../lib/urlClassify'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'

interface Props {
  /** The raw URL (https://, file://, mnccore://, gmail:// etc.). */
  url: string
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
  label,
  className,
  style,
  onClick,
  stopPropagation = false,
}: Props) {
  const { href, Icon, typeLabel, isHttp } = classifyUrl(url)
  const { launch } = useProtocolLaunch()

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
      title={isHttp ? url : `Click to copy path: ${url}`}
      className={`inline-flex items-center gap-1.5 self-start ${className ?? ''}`}
      style={{
        fontSize: 12,
        color: 'var(--teal)',
        background: 'var(--teal-active)',
        borderRadius: 'var(--radius-sm)',
        padding: '3px 8px',
        textDecoration: 'none',
        fontWeight: 500,
        ...style,
      }}
    >
      <Icon size={12} aria-hidden="true" />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label ?? typeLabel ?? url}
      </span>
    </a>
  )
}
