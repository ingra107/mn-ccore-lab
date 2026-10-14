// Shared inline primitive for the Today landing component tree:
//   LinkRow   — horizontal cluster of functional key-link icon chips
//
// Extracted from src/pages/portal/TodayPage.tsx during the component split.
// Per HANDOFF §2 these have no dedicated file in the spec; they sit alongside
// the rest of the today/ tree because TaskRow and PlannedTaskRow import it
// (and MyTasks TableView).

import { INK_MUTED } from './constants'
import { classifyUrl } from '../../lib/urlClassify'
import { normalizeLink } from '../../lib/pbLinks.generated'
import { iconForType, linkTintForType } from '../../lib/linkIcon'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { ICON_PROPS } from '../../lib/iconProps'

/** A task key-link: the raw URL + its optional human description.
 *  `type` is the stored PB link type (e.g. 'google_doc', 'box_folder').
 *  When present, iconForType() resolves the brand glyph; otherwise falls
 *  back to URL-inferred classifyUrl() icon. */
export interface TaskLink { url: string; desc?: string | null; type?: string | null }

// Mode-B icon-only link buttons (Nick 2026-06-17): borderless, sharp (size 16
// via ICON_PROPS), brand-color glyph from stored type, hover tooltip shows
// "type · desc". Uses stored link.type when available; falls back to
// classifyUrl() icon for legacy key_link_* slots without a type field.
//
// `slot` (Today card, 2026-10-09): every glyph is 14px inside a 24x24
// grid-centered box with no gap, so three links fill the card's fixed 74px
// links slot and sit on the same baseline as the folder / Work-on icons.
export function LinkRow({ links, slot = false }: { links: TaskLink[]; slot?: boolean }) {
  const { launch } = useProtocolLaunch()
  if (!links.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: slot ? 0 : 6 }}>
      {links.map((l, i) => {
        // Prefer stored type; then canonical normalizer (15-type icons from URL);
        // finally classifyUrl's coarse 5-bucket fallback.
        const { href, Icon: FallbackIcon, typeLabel, isHttp } = classifyUrl(l.url)
        const resolvedType = l.type || normalizeLink(l.url)?.type
        const stored = resolvedType ? iconForType(resolvedType) : null
        const Icon = stored ? stored.Icon : FallbackIcon
        const color = stored ? stored.tint : INK_MUTED
        // Mode-B tooltip (link spec §B): "{type} · {desc}" when a type is
        // present, else fall back to the human desc (then classifyUrl label).
        const tooltip = l.type
          ? (l.desc ? `${l.type} · ${l.desc}` : l.desc || typeLabel)
          : l.desc || typeLabel
        // Gmail / email icons are self-evident (one thing) — no hover tooltip
        // (Nick 2026-07-09). aria-label stays for screen readers.
        const isEmail = typeLabel === 'Gmail' || /gmail|email/i.test(resolvedType ?? '')
        const tint = linkTintForType(resolvedType) ?? (isEmail ? 'email' : null)
        return (
          <a
            key={i}
            href={isHttp ? href : l.url}
            target={isHttp ? '_blank' : undefined}
            rel={isHttp ? 'noopener noreferrer' : undefined}
            className="tk-lkicon"
            data-lk={tint ?? undefined}
            data-tip={isEmail ? undefined : tooltip}
            aria-label={tooltip}
            onClick={(e) => {
              e.stopPropagation()
              if (!isHttp) {
                e.preventDefault()
                void launch(href, { copyText: l.url, successMessage: `Opening ${typeLabel.toLowerCase()}… (path copied as backup)` })
              }
            }}
            style={{
              display: slot ? 'inline-grid' : 'inline-flex', alignItems: 'center', justifyContent: 'center',
              ...(slot ? { placeItems: 'center' } : {}),
              width: slot ? 24 : 20, height: slot ? 24 : 20, color,
              textDecoration: 'none', transition: 'color 150ms',
            }}
          >
            <Icon {...ICON_PROPS} size={slot ? 14 : 16} aria-hidden="true" />
          </a>
        )
      })}
    </span>
  )
}
