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

// Mode-B icon-only link buttons (Nick 2026-06-17): borderless, sharp (size 14
// via ICON_PROPS), brand-color glyph from stored type, hover tooltip shows
// "type · desc". Uses stored link.type when available; falls back to
// classifyUrl() icon for legacy key_link_* slots without a type field.
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
        // URL-inferred classification for href + isHttp + typeLabel (needed for
        // non-http launch). Brand color comes from iconForType once type lands
        // on the task payload (Task 8 / hub-backend); for now falls back to
        // URL-inferred Icon so existing key_link_* slots still render correctly.
        const { href, Icon: FallbackIcon, typeLabel, isHttp } = classifyUrl(l.url)
        const Icon = FallbackIcon
        const tooltip = l.desc || typeLabel
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
            style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: INK_DIM, textDecoration: 'none', transition: 'color 150ms' }}
          >
            <Icon {...ICON_PROPS} size={14} aria-hidden="true" />
          </a>
        )
      })}
    </span>
  )
}
