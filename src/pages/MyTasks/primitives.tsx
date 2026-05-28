// Shared inline primitives for the MyTasks page tree:
//   Chip      — colored pill (P1, planned, overdue, etc.)
//   LinksBar  — task key_link icon row
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx. Per HANDOFF spec these
// have no dedicated file — they sit alongside the rest of MyTasks/ because
// Card / LaneRow / ListRow / InlineDetail / TaskDrawer all import them.

import { INK_DIM, INK_MUTED, withAlpha } from './constants'
import type { TaskRow } from '../../lib/api'

export function Chip({ children, color = INK_MUTED, filled = false, title }: { children: React.ReactNode; color?: string; filled?: boolean; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', background: filled ? withAlpha(color, 13) : 'transparent', border: `1px solid ${withAlpha(color, 25)}`, color, whiteSpace: 'nowrap' }}>{children}</span>
  )
}

export function LinksBar({ task }: { task: TaskRow }) {
  const items: string[] = []
  if (task.key_link_1) items.push('folder')
  if (task.key_link_2) items.push('claude')
  if (task.key_link_3) items.push('brief')
  if (items.length === 0) return null
  const ICON: Record<string, string> = { folder: '📁', claude: '◆', brief: '📄', email: '✉', draft: '✎' }
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {items.map((l, i) => (
        <span key={i} title={l} style={{ fontSize: 10, width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: INK_DIM, background: 'rgba(255,255,255,0.02)' }}>{ICON[l] ?? '·'}</span>
      ))}
    </span>
  )
}
