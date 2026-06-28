/**
 * StoredLinkChip — Mode-A labeled pill chip for a stored link row from the
 * links table. Renders the authoritative per-type brand-color glyph with the
 * link's short_title (or canonical_url as fallback) as the visible label.
 *
 * Non-http links (file://, mnccore://, etc.) are opened via useProtocolLaunch
 * (clipboard backup + toast). Http links open in a new tab.
 *
 * Mode-A design: neutral ice/slate pill + border + brand-color icon.
 * Labeled chips keep the pill box (icon-only affordances go borderless per
 * Nick 2026-06-17 rule).
 *
 * Used by TaskDetailPanel (DetailKeyLinks) and ProjectDetail (Key Links strip).
 * Canonical; do not fork.
 */

import React from 'react'
import { iconForType } from '../lib/linkIcon'
import { classifyUrl } from '../lib/urlClassify'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'
import type { StoredLink } from '../hooks/useApiData'

interface Props {
  link: StoredLink
}

export default function StoredLinkChip({ link }: Props) {
  const { launch } = useProtocolLaunch()
  const { Icon, color } = iconForType(link.type)
  const url = link.canonical_url
  // Route through classifyUrl so [[wikilink]] canonical_urls become the correct
  // mnccore://obsidian/<target> launch URI rather than a raw [[…]] that the
  // browser treats as a relative URL navigation (broken no-op). isHttp is
  // authoritative here — it matches classifyUrl's resolved href, not the raw url.
  const { href: launchUri, isHttp } = classifyUrl(url)
  const displayLabel = link.short_title || link.canonical_url
  const tooltip = `${link.type} · ${displayLabel}`

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation()
    if (!isHttp) {
      e.preventDefault()
      // launchUri is the resolved mnccore:// (or other non-http) URI; url is the
      // raw canonical_url kept as clipboard fallback (e.g. the [[wikilink]] text).
      void launch(launchUri, { copyText: url, successMessage: `Opening ${link.type}… (path copied as backup)` })
    }
  }

  return (
    <a
      href={isHttp ? url : '#'}
      target={isHttp ? '_blank' : undefined}
      rel={isHttp ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
      title={tooltip}
      className="inline-flex items-center gap-1.5 self-start"
      style={{
        padding: '4px 7px 4px 9px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--ice)',
        border: '1px solid var(--border-subtle)',
        maxWidth: 240,
        fontSize: 12,
        fontWeight: 500,
        textDecoration: 'none',
        color: 'var(--slate)',
      }}
    >
      <Icon size={14} strokeWidth={1.5} style={{ color, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {displayLabel}
      </span>
    </a>
  )
}
