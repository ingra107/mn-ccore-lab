// Shared inline primitives for the Today landing component tree:
//   LinkIcon  — single SVG glyph for a link kind
//   LinkRow   — horizontal cluster of LinkIcon chips
//   ProjectLink — small "(project name)" link with optional routing
//   Pill      — clickable rounded count+label chip
//
// Extracted from src/pages/portal/TodayPage.tsx during the component split.
// Per HANDOFF §2 these have no dedicated file in the spec; they sit alongside
// the rest of the today/ tree because TaskRow / PlannedTaskRow / RightNow /
// PillStrip all import them.

import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { ACCENT_GOLD, INK, INK_MUTED, withAlpha, type LinkKind } from './constants'

export function LinkIcon({ kind, size = 12 }: { kind: LinkKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'folder': return (<svg {...common}><path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" /></svg>)
    case 'claude': return (<svg {...common}><polygon points="5,3 13,8 5,13" /></svg>)
    case 'email':  return (<svg {...common}><rect x="2" y="4" width="12" height="9" rx="1" /><path d="m2 5 6 4 6-4" /></svg>)
    case 'draft':  return (<svg {...common}><path d="M10 2 14 6 6 14H2v-4Z" /></svg>)
    case 'brief':
    case 'doc':    return (<svg {...common}><path d="M3 3h7l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M5 8h6M5 11h4" /></svg>)
    default: return null
  }
}

export function LinkRow({ links }: { links: LinkKind[] }) {
  if (!links.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {links.map((k, i) => (
        <a
          key={i}
          href="#"
          title={k}
          onClick={(e) => e.preventDefault()}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 4, color: INK_MUTED,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            textDecoration: 'none', transition: 'all 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = ACCENT_GOLD; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.30)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = INK_MUTED; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          <LinkIcon kind={k} />
        </a>
      ))}
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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: emphasis ? '6px 12px' : '5px 10px',
        background: emphasis ? withAlpha(color, 8) : 'rgba(255,255,255,0.02)',
        border: `1px solid ${emphasis ? withAlpha(color, 33) : withAlpha(color, 19)}`,
        borderRadius: 999, cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit', color: emphasis ? color : INK,
        fontSize: 12, fontWeight: 500, transition: 'all 150ms', whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = withAlpha(color, 13); e.currentTarget.style.borderColor = withAlpha(color, 44) }}
      onMouseLeave={(e) => { e.currentTarget.style.background = emphasis ? withAlpha(color, 8) : 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = emphasis ? withAlpha(color, 33) : withAlpha(color, 19) }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
      {count !== undefined && (
        <span style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
      <span style={{ color: 'inherit' }}>{label}</span>
    </button>
  )
}
