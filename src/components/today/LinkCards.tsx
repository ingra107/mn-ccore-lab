// LinkCards — the task drawer's links, as a left-aligned "Links" block of cards
// (Today round 2, 2026-10-09). Replaces the right-aligned StoredLinkChip pills:
// each link is a card with a tinted type icon and a short title (the
// " (Google Doc)" kind suffix is dropped because the icon already says it).
// Styles: .tk-lkblock / .tk-lkgrid / .tk-lkc in index.css. Launch behavior is
// the chip's: http opens a new tab, everything else goes through
// useProtocolLaunch with the path copied as a backup.

import type { MouseEvent } from 'react'
import { iconForType, linkTintForType, stripLinkKindSuffix } from '../../lib/linkIcon'
import { classifyUrl } from '../../lib/urlClassify'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { ICON_PROPS } from '../../lib/iconProps'
import type { StoredLink } from '../../hooks/useApiData'

function LinkCard({ link }: { link: StoredLink }) {
  const { launch } = useProtocolLaunch()
  const { Icon } = iconForType(link.type)
  const url = link.canonical_url
  // classifyUrl turns [[wikilinks]] into the mnccore://obsidian launch URI and
  // is authoritative for isHttp (same contract as StoredLinkChip).
  const { href: launchUri, isHttp } = classifyUrl(url)
  const label = stripLinkKindSuffix(link.short_title || url)
  const tint = linkTintForType(link.type)

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation()
    if (!isHttp) {
      e.preventDefault()
      void launch(launchUri, { copyText: url, successMessage: `Opening ${link.type || 'link'}… (path copied as backup)` })
    }
  }

  return (
    <a
      href={isHttp ? url : '#'}
      target={isHttp ? '_blank' : undefined}
      rel={isHttp ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      title={`${link.type || 'link'} · ${link.short_title || url}`}
      className="tk-lkc"
      data-lk={tint ?? undefined}
    >
      <Icon {...ICON_PROPS} size={14} aria-hidden="true" />
      <span className="tk-lkt">{label}</span>
    </a>
  )
}

export function LinkCards({ links }: { links: StoredLink[] }) {
  if (links.length === 0) return null
  return (
    <div className="tk-lkblock">
      <div className="tk-lbl">Links</div>
      <div className="tk-lkgrid">
        {links.map((link) => <LinkCard key={link.id} link={link} />)}
      </div>
    </div>
  )
}
