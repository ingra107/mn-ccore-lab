// ShowHiddenToggle — the "N dismissed — show / hide" affordance for the three
// activity feeds (task / project / artifact). One shared control so the copy,
// icon and placement can't drift between feeds (the same reason ActivityThread
// is shared). Backed by each feed's ?include_hidden=1 + hidden_count.
//
// Renders nothing when there is nothing to reveal AND hidden isn't currently
// shown — a feed with zero dismissed threads shows no chrome at all.

import { EyeOff, Eye } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'

export function ShowHiddenToggle({
  count,
  showing,
  onToggle,
}: {
  /** hidden_count from the feed response — dismissed roots the viewer may reveal. */
  count: number
  /** Whether the feed is currently fetched with include_hidden. */
  showing: boolean
  onToggle: () => void
}) {
  if (count <= 0 && !showing) return null
  const Icon = showing ? Eye : EyeOff
  const label = showing
    ? 'Hide dismissed'
    : `${count} dismissed — show`
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showing ? 'true' : 'false'}
      className="cursor-pointer inline-flex items-center gap-1 self-start"
      style={{
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--slate)',
        opacity: 0.85,
        background: 'none',
        border: 'none',
        padding: 0,
      }}
    >
      <Icon {...ICON_PROPS} size={12} aria-hidden="true" />
      {label}
    </button>
  )
}
