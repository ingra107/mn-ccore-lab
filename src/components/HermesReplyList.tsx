// HermesReplyList — shared renderer for a list of Hermes ai_request replies.
//
// One card design, reused by every surface that shows @hermes round-trips:
//   - TodayPage    → HermesThoughtReplies (date-keyed daily_thought requests)
//   - Task detail  → TaskHermesReplies (task-id-keyed requests: #519)
//
// Card design matches the Hermes branch of ActivityEntryItem (activityRender.tsx):
//   - gold-tinted bg (var(--gold-hover)) + 3px gold left border + subtle ring
//   - HermesMark avatar + "Hermes" label in gold + relative timestamp
//   - Prompt (the @hermes question) as a muted italic subheader — always visible
//   - Response as MarkdownView, collapsible (default: expanded)
//   - Pending items show HermesPending (animated dots + elapsed timer)
//
// Extracted from HermesThoughtReplies.tsx so the task reader reuses the exact
// rendering rather than forking a second copy (ethos #4). All colors resolve to
// theme-aware CSS tokens, so the card looks right in both the dark Today drawers
// and the lighter TaskDetailPanel surface.

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { DailyThoughtReply } from '../hooks/useApiData'
import HermesMark from './HermesMark'
import HermesPending from './HermesPending'
import MarkdownView from './MarkdownView'
import { ACCENT_GOLD, INK_MUTED, withAlpha } from '../lib/taskGrouping'
import { ICON_PROPS } from '../lib/iconProps'
import { formatRelativeTime } from '../lib/dateUtils'

// border shorthand sets all four sides; borderLeft longhand overrides the left
// side (CSS cascade — longhand wins over shorthand in the same declaration block).
const HERMES_CARD_STYLE: React.CSSProperties = {
  background: 'var(--gold-hover)',
  borderRadius: 'var(--radius-lg)',
  padding: '10px 14px',
  border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
  borderLeft: `3px solid ${withAlpha(ACCENT_GOLD, 35)}`,
}

export function HermesReplyCard({ prompt, response, status, created_at, responded_at }: Omit<DailyThoughtReply, 'id'>) {
  const [expanded, setExpanded] = useState(true)

  const isCompleted = status === 'completed' && !!response
  // Use responded_at when available; fall back to created_at (pending items).
  const ts = responded_at ?? created_at

  const toggleExpand = () => setExpanded((v) => !v)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpand()
    }
  }

  return (
    <div style={HERMES_CARD_STYLE}>
      {/* Attribution line — HermesMark avatar + name + glyph + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minWidth: 0 }}>
        <HermesMark size={18} variant="avatar" />
        <span
          style={{
            fontSize: 'var(--text-small)',
            fontWeight: 'var(--weight-ui)' as React.CSSProperties['fontWeight'],
            color: 'var(--gold)',
            flexShrink: 0,
          }}
        >
          Hermes
        </span>
        <HermesMark size={10} variant="icon" aria-hidden />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: INK_MUTED, flexShrink: 0 }}>
          {formatRelativeTime(ts)}
        </span>
      </div>

      {/* Prompt (question) — collapsible trigger; always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggleExpand}
        onKeyDown={onKeyDown}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse Hermes reply' : 'Expand Hermes reply'}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          cursor: 'pointer',
          marginBottom: expanded ? 10 : 0,
          userSelect: 'none',
        }}
      >
        <span style={{ color: INK_MUTED, marginTop: 2, flexShrink: 0, display: 'flex' }}>
          {expanded
            ? <ChevronDown {...ICON_PROPS} size={12} />
            : <ChevronRight {...ICON_PROPS} size={12} />}
        </span>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: INK_MUTED,
            fontStyle: 'italic',
            lineHeight: 1.45,
            flex: 1,
          }}
        >
          {prompt}
        </p>
      </div>

      {/* Response body — MarkdownView or HermesPending */}
      {expanded && (
        isCompleted
          ? (
            // Chat-list density: MarkdownView's default grew to 16px (#544);
            // Hermes replies deliberately stay compact via the size prop.
            <MarkdownView source={response!} style={{ fontSize: '13px' }} />
          )
          : <HermesPending askedAt={created_at} />
      )}
    </div>
  )
}

interface HermesReplyListProps {
  replies: DailyThoughtReply[]
  /** Merged over the default flex-column container (e.g. to tune marginBottom
   *  per surface). */
  style?: React.CSSProperties
}

/** Renders the reply cards, newest-first as ordered by the caller's query.
 *  Empty → renders nothing (no placeholder box). */
export function HermesReplyList({ replies, style }: HermesReplyListProps) {
  if (replies.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, ...style }}>
      {replies.map((r) => (
        <HermesReplyCard
          key={r.id}
          prompt={r.prompt}
          response={r.response}
          status={r.status}
          created_at={r.created_at}
          responded_at={r.responded_at}
        />
      ))}
    </div>
  )
}
