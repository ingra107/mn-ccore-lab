// AttentionChip — THE rendering for the two attention signals (one place to
// style them; TaskRow, MyTasks ListView, and My Items all render through it).
//
//   kind='new'      → gold ✦ NEW   — assigned to you, never opened
//                     (tasks.acknowledged_at IS NULL; auto-ack clears it).
//   kind='activity' → teal ● n NEW — an entity you HAVE seen has team-visible
//                     entries by others since your last look (entity_seen v81).
//
// When both could apply, 'new' wins (callers gate on isNewToViewer first) —
// and they are near-disjoint by construction: the activity signal needs an
// entity_seen row, which only an open creates, and the first open also
// acknowledges. Reassignment clears acknowledged_at (applyPatch), so a task
// handed to you re-fires gold even if you'd seen it under its old owner.
//
// Premium = restraint: hairline border (color @ ~28%), whisper fill (~9%),
// full-radius pill, micro caps with wide tracking, tabular count, and a
// ringed dot for the activity variant. No animation — Rule 44 (axe catches
// mid-transition contrast) and the Right-Now glow stays the only glow.

import type { CSSProperties } from 'react'
import { ACCENT_GOLD, ACCENT_TEAL, withAlpha } from '../../lib/taskGrouping'

export interface AttentionChipProps {
  kind: 'new' | 'activity'
  /** New-entry count for kind='activity'. Ignored for kind='new'. */
  count?: number
  style?: CSSProperties
}

export function AttentionChip({ kind, count = 0, style }: AttentionChipProps) {
  const isNew = kind === 'new'
  const color = isNew ? ACCENT_GOLD : ACCENT_TEAL
  const title = isNew
    ? "New to you — you haven't opened this yet"
    : `${count} new ${count === 1 ? 'entry' : 'entries'} since you last opened this`
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: '0.12em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
        color,
        padding: '2.5px 7px',
        borderRadius: 999,
        background: withAlpha(color, 9),
        border: `1px solid ${withAlpha(color, 28)}`,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {isNew ? (
        <span aria-hidden="true" style={{ fontSize: 8, lineHeight: 1 }}>✦</span>
      ) : (
        <span
          aria-hidden="true"
          style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 0 2.5px ${withAlpha(color, 15)}`, flexShrink: 0 }}
        />
      )}
      {isNew ? 'NEW' : `${count} NEW`}
    </span>
  )
}
