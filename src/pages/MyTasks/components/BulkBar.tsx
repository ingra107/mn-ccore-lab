// BulkBar — appears when ≥1 row is selected. Plan today / Snooze / Status /
// Reassign / Priority / Complete / Archive / Deselect. Picker popover for
// multi-option actions (status, reassign, priority).
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useEffect, useRef } from 'react'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PANEL_BG,
  PRIORITY_COLOR, STATUS_COLOR,
} from '../constants'
import { withAlpha } from '../../../lib/taskGrouping'

interface BulkBarProps {
  count: number
  onClear: () => void
  onPlanToday: () => void
  onSnoozeDay: () => void
  onComplete: () => void
  onArchive: () => void
  onReassign: (slug: string) => void
  onPriority: (priority: string) => void
  onStatus: (status: string) => void
  assigneeOptions: Array<{ slug: string; name: string }>
}

type BulkPicker = 'reassign' | 'priority' | 'status' | null

export function BulkBar({ count, onClear, onPlanToday, onSnoozeDay, onComplete, onArchive, onReassign, onPriority, onStatus, assigneeOptions }: BulkBarProps) {
  const [picker, setPicker] = useState<BulkPicker>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  // Close on outside click
  useEffect(() => {
    if (!picker) return
    const close = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [picker])
  // Close on Escape
  useEffect(() => {
    if (!picker) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picker])

  const btn = (label: string, onClick: () => void, accent?: string, active?: boolean) => (
    <button
      key={label}
      onClick={onClick}
      style={{ padding: '3px 9px', fontSize: 11, border: `1px solid ${active ? ACCENT_TEAL : accent ? withAlpha(accent, 25) : 'rgba(255,255,255,0.12)'}`, borderRadius: 'var(--radius-sm)', background: active ? withAlpha(ACCENT_TEAL, 13) : accent ? withAlpha(accent, 8) : 'transparent', color: active ? ACCENT_TEAL : accent ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
    >{label}</button>
  )

  const PRIORITY_OPTS = ['urgent', 'high', 'medium', 'low']
  const STATUS_OPTS = [
    { v: 'todo', l: 'Todo' },
    { v: 'in_progress', l: 'In progress' },
    { v: 'waiting_external', l: 'Waiting' },
    { v: 'blocked', l: 'Blocked' },
    { v: 'done', l: 'Done' },
  ]

  return (
    <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* P1-1: full-width gold strip + border (outer), band-centered content
          (.mt-band inner) so the bulk bar's controls align to the same left edge
          as the toolbar + views. */}
      <div style={{ paddingTop: 8, paddingBottom: 8, background: 'rgba(201,168,76,0.08)', borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
       <div className="mt-band" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: ACCENT_GOLD, fontWeight: 600 }}>{count} selected</span>
        <span style={{ color: INK_DIM }}>·</span>
        {btn('📌 Plan today', onPlanToday, ACCENT_GOLD)}
        {btn('Snooze +1d', onSnoozeDay)}
        {btn('Status →', () => setPicker(picker === 'status' ? null : 'status'), undefined, picker === 'status')}
        {btn('Reassign', () => setPicker(picker === 'reassign' ? null : 'reassign'), undefined, picker === 'reassign')}
        {btn('Priority', () => setPicker(picker === 'priority' ? null : 'priority'), undefined, picker === 'priority')}
        {btn('✓ Complete', onComplete, ACCENT_GREEN)}
        {btn('Archive', onArchive, ACCENT_CORAL)}
        <div style={{ flex: 1 }} />
        <button onClick={onClear} style={{ background: 'none', border: 'none', color: INK_MUTED, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Deselect</button>
       </div>
      </div>
      {/* Picker popover — replaces window.prompt() (CD spec: dark-first picker, not native modal). Esc / outside-click close. */}
      {picker && (
        <div className="mt-band" style={{ position: 'absolute', top: '100%', left: 0, right: 0, paddingTop: 10, paddingBottom: 10, background: PANEL_BG, borderBottom: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 20, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginRight: 6 }}>
            {picker === 'reassign' ? 'Reassign to' : picker === 'priority' ? 'Set priority' : 'Set status'}
          </span>
          {picker === 'priority' && PRIORITY_OPTS.map((p) => (
            <button
              key={p}
              onClick={() => { onPriority(p); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: `1px solid ${PRIORITY_COLOR[p] ?? INK_DIM}40`, background: `${PRIORITY_COLOR[p] ?? INK_DIM}15`, color: PRIORITY_COLOR[p] ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{p}</button>
          ))}
          {picker === 'status' && STATUS_OPTS.map((s) => (
            <button
              key={s.v}
              onClick={() => { onStatus(s.v); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: `1px solid ${STATUS_COLOR[s.v] ?? INK_DIM}40`, background: `${STATUS_COLOR[s.v] ?? INK_DIM}15`, color: STATUS_COLOR[s.v] ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{s.l}</button>
          ))}
          {picker === 'reassign' && assigneeOptions.map((a) => (
            <button
              key={a.slug}
              onClick={() => { onReassign(a.slug); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{a.name}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => setPicker(null)} style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>esc</button>
        </div>
      )}
    </div>
  )
}
