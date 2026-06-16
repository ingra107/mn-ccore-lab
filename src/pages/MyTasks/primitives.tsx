// Shared inline primitives for the MyTasks page tree:
//   Chip      — colored pill (P1, planned, overdue, etc.)
//   LinksBar  — task key_link icon row
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx. Per HANDOFF spec these
// have no dedicated file — they sit alongside the rest of MyTasks/ because
// Card / LaneRow / ListRow / InlineDetail / TaskDrawer all import them.

import { INK_DIM, INK_MUTED, withAlpha } from './constants'
import { classifyUrl } from '../../lib/urlClassify'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { ICON_PROPS } from '../../lib/iconProps'
import type { TaskRow } from '../../lib/api'

export function Chip({ children, color = INK_MUTED, filled = false, title }: { children: React.ReactNode; color?: string; filled?: boolean; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', background: filled ? withAlpha(color, 13) : 'transparent', border: `1px solid ${withAlpha(color, 25)}`, color, whiteSpace: 'nowrap' }}>{children}</span>
  )
}

// Bug #79: these were non-interactive emoji <span>s — every key-link on My
// Tasks was dead. Now each chip carries the real URL, classifies it to a lucide
// premium icon, and fires through useProtocolLaunch (clipboard + toast for
// mnccore://), matching the Today LinkRow + LinkChip.
export function LinksBar({ task }: { task: TaskRow }) {
  const { launch } = useProtocolLaunch()
  const links = [
    { url: task.key_link_1, desc: task.key_link_1_desc },
    { url: task.key_link_2, desc: task.key_link_2_desc },
    { url: task.key_link_3, desc: task.key_link_3_desc },
  ].filter((l): l is { url: string; desc: string | null } => !!l.url)
  if (links.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {links.map((l, i) => {
        const { href, Icon, typeLabel, isHttp } = classifyUrl(l.url)
        const title = l.desc || typeLabel
        return (
          <a
            key={i}
            href={isHttp ? href : l.url}
            target={isHttp ? '_blank' : undefined}
            rel={isHttp ? 'noopener noreferrer' : undefined}
            title={title}
            aria-label={title}
            onClick={(e) => {
              e.stopPropagation()
              if (!isHttp) {
                e.preventDefault()
                void launch(href, { copyText: l.url, successMessage: `Opening ${typeLabel.toLowerCase()}… (path copied as backup)` })
              }
            }}
            className="hov-color"
            style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: INK_DIM, background: 'rgba(255,255,255,0.02)', textDecoration: 'none', transition: 'color 150ms', '--hov-color': INK_MUTED } as React.CSSProperties}
          >
            <Icon {...ICON_PROPS} size={10} aria-hidden="true" />
          </a>
        )
      })}
    </span>
  )
}
