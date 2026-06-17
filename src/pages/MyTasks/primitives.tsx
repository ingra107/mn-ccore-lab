// Shared inline primitives for the MyTasks page tree:
//   Chip      — re-exported from ui/Chip (P5) with bordered=true default for
//               the MyTasks border-style variant. Callers use filled+bordered
//               for tinted pills and bordered-only for outline pills.
//   LinksBar  — task key_link icon row
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx. Per HANDOFF spec these
// have no dedicated file — they sit alongside the rest of MyTasks/ because
// Card / LaneRow / ListRow / InlineDetail / TaskDrawer all import them.

import { INK_DIM, INK_MUTED } from './constants'
import { Chip as UiChip, type ChipProps } from '../../components/ui/Chip'
import { classifyUrl } from '../../lib/urlClassify'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { ICON_PROPS } from '../../lib/iconProps'
import type { TaskRow } from '../../lib/api'

// MyTasks Chip: always bordered (the distinct variant vs today/TaskRow's filled-only).
// filled defaults to false (border-only outline); callers pass filled for tinted pills.
export function Chip({ color = INK_MUTED, filled = false, ...rest }: ChipProps) {
  return <UiChip color={color} filled={filled} bordered={true} {...rest} />
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
            style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: INK_DIM, textDecoration: 'none', transition: 'color 150ms', '--hov-color': INK_MUTED } as React.CSSProperties}
          >
            <Icon {...ICON_PROPS} size={13} aria-hidden="true" />
          </a>
        )
      })}
    </span>
  )
}
