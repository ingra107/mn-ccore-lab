// Shared inline primitives for the Today landing component tree:
//   LinkRow   — horizontal cluster of functional key-link icon chips
//   ProjectLink — small "(project name)" link with optional routing
//   Pill      — clickable rounded count+label chip
//
// Extracted from src/pages/portal/TodayPage.tsx during the component split.
// Per HANDOFF §2 these have no dedicated file in the spec; they sit alongside
// the rest of the today/ tree because TaskRow / PlannedTaskRow / RightNow /
// PillStrip all import them.

import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { INK, INK_MUTED, withAlpha } from './constants'
import { classifyUrl } from '../../lib/urlClassify'
import { iconForType } from '../../lib/linkIcon'
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
export function LinkRow({ links }: { links: TaskLink[] }) {
  const { launch } = useProtocolLaunch()
  if (!links.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {links.map((l, i) => {
        // Prefer stored type; fall back to URL-inferred icon for legacy slots.
        const stored = l.type ? iconForType(l.type) : null
        const { href, Icon: FallbackIcon, typeLabel, isHttp } = classifyUrl(l.url)
        const Icon = stored ? stored.Icon : FallbackIcon
        const color = stored ? stored.color : INK_MUTED
        const tooltip = l.type && l.desc
          ? `${l.type} · ${l.desc}`
          : l.desc || typeLabel
        return (
          <a
            key={i}
            href={isHttp ? href : l.url}
            target={isHttp ? '_blank' : undefined}
            rel={isHttp ? 'noopener noreferrer' : undefined}
            title={tooltip}
            aria-label={tooltip}
            onClick={(e) => {
              e.stopPropagation()
              if (!isHttp) {
                e.preventDefault()
                void launch(href, { copyText: l.url, successMessage: `Opening ${typeLabel.toLowerCase()}… (path copied as backup)` })
              }
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, color,
              textDecoration: 'none', transition: 'color 150ms',
            }}
          >
            <Icon {...ICON_PROPS} size={16} aria-hidden="true" />
          </a>
        )
      })}
    </span>
  )
}

export function ProjectLink({ name, slug }: { name: string | null; slug?: string | null }) {
  if (!name) return null
  const inner = (
    <span
      className="b2-proj-link"
      style={{ fontSize: 11, color: INK_MUTED, opacity: 0.7, textDecoration: 'none', transition: 'all 150ms', cursor: slug ? 'pointer' : 'default' }}
    >
      ({name})
    </span>
  )
  if (!slug) return inner
  return (
    <Link to={PATHS.project(slug)} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}

interface PillProps {
  icon: string
  label: string
  count?: number
  color?: string
  onClick?: () => void
  emphasis?: boolean
  title?: string
}

export function Pill({ icon, label, count, color = INK_MUTED, onClick, emphasis = false, title }: PillProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="hov-bg hov-border"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: emphasis ? '6px 12px' : '5px 10px',
        background: emphasis ? withAlpha(color, 8) : 'rgba(255,255,255,0.02)',
        border: `1px solid ${emphasis ? withAlpha(color, 33) : withAlpha(color, 19)}`,
        borderRadius: 999, cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit', color: emphasis ? color : INK,
        fontSize: 12, fontWeight: 500, transition: 'all 150ms', whiteSpace: 'nowrap',
        '--hov-bg': withAlpha(color, 13),
        '--hov-border': withAlpha(color, 44),
      } as React.CSSProperties}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
      {count !== undefined && (
        <span style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
      <span style={{ color: 'inherit' }}>{label}</span>
    </button>
  )
}
