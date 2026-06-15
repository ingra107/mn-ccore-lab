// MeLockToggle — shared @me private-note lock pill.
//
// ROW 81: extracted from SmartCompose and TaskDetailPanel which duplicated the
// same "Only me 🔒" pill with slight theme divergence. Both now use this
// component so the anatomy (role=switch, aria-checked, height 22, radius-sm,
// Only me label) is ONE definition.
//
// Theme contract:
//   theme='dark'  — active state uses gold border/bg (for dark drawer chrome).
//   theme='light' — active state uses slate border/bg (CSS vars; default,
//                   matches the TaskDetailPanel + cream-surface usage).

import { Lock } from 'lucide-react'

const ACCENT_GOLD = '#c9a84c'

interface MeLockToggleProps {
  locked: boolean
  onToggle: () => void
  /** 'dark' for TodayPage/drawer chrome; 'light' (default) for cream/panel. */
  theme?: 'dark' | 'light'
}

export function MeLockToggle({ locked, onToggle, theme = 'light' }: MeLockToggleProps) {
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={locked ? 'true' : 'false'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      title={locked ? 'Private note — click to post publicly' : 'Post publicly — click to make private'}
      aria-label={locked ? 'Private note lock on — only you see this' : 'Private note lock off — visible to team'}
      className="flex-shrink-0 inline-flex items-center gap-1"
      style={{
        height: 22,
        paddingLeft: 6,
        paddingRight: 6,
        borderRadius: 'var(--radius-sm)',
        border: locked
          ? `1px solid ${isDark ? 'rgba(201,168,76,0.50)' : 'rgba(100,116,139,0.35)'}`
          : `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'var(--border-subtle)'}`,
        background: locked
          ? (isDark ? 'rgba(201,168,76,0.12)' : 'rgba(100,116,139,0.12)')
          : 'transparent',
        color: locked
          ? (isDark ? ACCENT_GOLD : 'var(--slate)')
          : 'var(--slate)',
        opacity: locked ? 1 : 0.70,
        fontWeight: locked ? 600 : 400,
        fontSize: 10,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        fontFamily: 'inherit',
        flexShrink: 0,
      }}
    >
      <Lock size={9} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      Only me
    </button>
  )
}
