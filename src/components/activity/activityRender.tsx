// activityRender.tsx — shared render metadata + primitives for the unified
// activity timeline (Design C, schema-v77). Both TaskActivityFeed (task detail)
// and ActivityStream (project detail) consume this so the update_type render
// map, the author-only badge, and the viewer-local timestamp can't drift
// between the two feeds.
//
// Scope note: ProjectUpdateFeed's legacy TYPE_CONFIG is deliberately NOT folded
// in here — that surface is retired in Phase 2.

import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Terminal,
  Lock,
} from 'lucide-react'
import { formatRelativeTime } from '../../lib/dateUtils'
import { parseDbUtc, formatDbLocal } from '../../lib/time'
import type { UpdateType } from '../../../shared/activityKinds'

// ── update_type render metadata ───────────────────────────────────────────────
//
// ONE superset map for kind='update' sub-kinds. Keys are typed from UPDATE_TYPES
// (shared/activityKinds.ts) so the render map can never drift from the enum.
// Callers read the fields they need (TaskActivityFeed uses borderColor for its
// left-bar treatment; ActivityStream uses icon/color/bg/label only).

export interface UpdateTypeRenderConfig {
  icon: typeof TrendingUp
  color: string
  bg: string
  borderColor: string
  label: string
}

export const UPDATE_TYPE_CONFIG: Record<UpdateType, UpdateTypeRenderConfig> = {
  progress: { icon: TrendingUp,    color: 'var(--teal)',   bg: 'var(--teal-active)',     borderColor: 'rgba(45,138,138,0.4)',   label: 'Progress' },
  blocker:  { icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122,0,25,0.1)',     borderColor: 'rgba(122,0,25,0.4)',     label: 'Blocker' },
  result:   { icon: CheckCircle,   color: 'var(--green)',  bg: 'rgba(34,197,94,0.1)',    borderColor: 'rgba(34,197,94,0.4)',    label: 'Result' },
  question: { icon: HelpCircle,    color: 'var(--gold)',   bg: 'var(--gold-active)',     borderColor: 'rgba(201,168,76,0.4)',   label: 'Question' },
  session:  { icon: Terminal,      color: 'var(--slate)',  bg: 'rgba(100,116,139,0.08)', borderColor: 'rgba(100,116,139,0.25)', label: 'Session' },
}

// ── Author-only visibility badge ──────────────────────────────────────────────
//
// Subtle 🔒 "only you" hint shown on author-only (@me) rows. PI/server callers
// see all rows; the gate is server-side, so this is purely a viewer affordance.

export function AuthorOnlyBadge() {
  return (
    <span
      title="Visible only to you"
      aria-label="Only visible to you"
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
      style={{
        fontSize: '9px',
        color: 'var(--slate)',
        background: 'rgba(100,116,139,0.1)',
        opacity: 0.85,
        flexShrink: 0,
      }}
    >
      <Lock size={7} aria-hidden="true" />
      only you
    </span>
  )
}

// ── Viewer-local timestamp ────────────────────────────────────────────────────
//
// Relative label, absolute viewer-local tooltip via the time.ts chokepoints
// (parseDbUtc + formatDbLocal). Don't render activity timestamps with a raw
// formatRelativeTime alone — the tooltip must resolve to the viewer's zone.

export function EntryTime({ ts, className }: { ts: string; className?: string }) {
  const d = parseDbUtc(ts)
  const abs = isNaN(d.getTime()) ? ts : formatDbLocal(ts, 'datetime')
  const rel = formatRelativeTime(ts)
  return (
    <span
      className={className}
      title={abs}
      style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', flexShrink: 0 }}
    >
      {rel}
    </span>
  )
}
