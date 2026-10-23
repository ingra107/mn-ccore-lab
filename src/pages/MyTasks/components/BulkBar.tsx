// BulkBar — appears when ≥1 row is selected. Plan today / Due / Status /
// Reassign / Priority / Complete / Archive / Deselect. Picker popover for
// multi-option actions (status, reassign, priority).
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useEffect, useRef } from 'react'
import { Pin } from 'lucide-react'
import { ICON_PROPS } from '../../../lib/iconProps'
import {
  JOB_ACCENT,
  INK, INK_MUTED, INK_DIM, PANEL_BG,
  PRIORITY_COLOR, STATUS_COLOR,
} from '../constants'
import { withAlpha } from '../../../lib/taskGrouping'
import InlineDatePicker from '../../../components/InlineDatePicker'

interface BulkBarProps {
  count: number
  onClear: () => void
  onPlanToday: () => void
  /** #148: the due date every selected task shares, else null. */
  commonDue: string | null
  onSetDue: (date: string | null) => void
  onComplete: () => void
  onArchive: () => void
  onReassign: (slug: string) => void
  onPriority: (priority: string) => void
  onStatus: (status: string) => void
  assigneeOptions: Array<{ slug: string; name: string }>
}

type BulkPicker = 'reassign' | 'priority' | 'status' | null

export function BulkBar({ count, onClear, onPlanToday, commonDue, onSetDue, onComplete, onArchive, onReassign, onPriority, onStatus, assigneeOptions }: BulkBarProps) {
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
      style={{ padding: '3px 9px', fontSize: 11, border: `1px solid ${active ? JOB_ACCENT : accent ? withAlpha(accent, 25) : 'var(--border-strong)'}`, borderRadius: 'var(--radius-sm)', background: active ? withAlpha(JOB_ACCENT, 13) : accent ? withAlpha(accent, 8) : 'transparent', color: active ? JOB_ACCENT : accent ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
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
      {/* P1-1: full-width accent strip + border (outer); a selection is the accent's job, band-centered content
          (.mt-band inner) so the bulk bar's controls align to the same left edge
          as the toolbar + views. */}
      <div style={{ paddingTop: 8, paddingBottom: 8, background: withAlpha(JOB_ACCENT, 8), borderBottom: `1px solid ${withAlpha(JOB_ACCENT, 20)}` }}>
       <div className="mt-band" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: JOB_ACCENT, fontWeight: 600 }}>{count} selected</span>
        <span style={{ color: INK_DIM }}>·</span>
        <button
          onClick={onPlanToday}
          className="tk-btn"
          style={{ padding: '3px 9px', fontSize: 11, color: INK, gap: 4 }}
        ><Pin {...ICON_PROPS} size={11} /> Plan today</button>
        {/* #148: the shared date picker (presets, cumulative +7d, month grid,
            Clear), not a fixed +1d. Its trigger reads like the buttons beside it. */}
        <span className="bulk-date-host">
          <InlineDatePicker
            value={commonDue}
            onChange={onSetDue}
            display={<span className="bulk-date">Due date ▾</span>}
          />
        </span>
        {btn('Status →', () => setPicker(picker === 'status' ? null : 'status'), undefined, picker === 'status')}
        {btn('Reassign', () => setPicker(picker === 'reassign' ? null : 'reassign'), undefined, picker === 'reassign')}
        {btn('Priority', () => setPicker(picker === 'priority' ? null : 'priority'), undefined, picker === 'priority')}
        {btn('✓ Complete', onComplete, JOB_ACCENT)}
        {btn('Archive', onArchive)}
        <div style={{ flex: 1 }} />
        <button onClick={onClear} style={{ background: 'none', border: 'none', color: INK_MUTED, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Deselect</button>
       </div>
      </div>
      {/* Picker popover — replaces window.prompt() (CD spec: dark-first picker, not native modal). Esc / outside-click close. */}
      {picker && (
        <div className="mt-band" style={{ position: 'absolute', top: '100%', left: 0, right: 0, paddingTop: 10, paddingBottom: 10, background: PANEL_BG, borderBottom: '1px solid var(--border-default)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 20, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: INK_DIM, marginRight: 6 }}>
            {picker === 'reassign' ? 'Reassign to' : picker === 'priority' ? 'Set priority' : 'Set status'}
          </span>
          {picker === 'priority' && PRIORITY_OPTS.map((p) => (
            <button
              key={p}
              onClick={() => { onPriority(p); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: `1px solid ${withAlpha(PRIORITY_COLOR[p] ?? INK_DIM, 25)}`, background: withAlpha(PRIORITY_COLOR[p] ?? INK_DIM, 8), color: PRIORITY_COLOR[p] ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{p}</button>
          ))}
          {picker === 'status' && STATUS_OPTS.map((s) => (
            <button
              key={s.v}
              onClick={() => { onStatus(s.v); setPicker(null) }}
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)', border: `1px solid ${withAlpha(STATUS_COLOR[s.v] ?? INK_DIM, 25)}`, background: withAlpha(STATUS_COLOR[s.v] ?? INK_DIM, 8), color: STATUS_COLOR[s.v] ?? INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{s.l}</button>
          ))}
          {picker === 'reassign' && assigneeOptions.map((a) => (
            <button
              key={a.slug}
              onClick={() => { onReassign(a.slug); setPicker(null) }}
              className="tk-btn"
              style={{ padding: '4px 10px', fontSize: 11, color: INK }}
            >{a.name}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => setPicker(null)} style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>esc</button>
        </div>
      )}
    </div>
  )
}
