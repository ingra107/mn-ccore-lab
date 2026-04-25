// FilterChip — pill with built-in dropdown, replaces guarded raw <select>.
// Outside-click + selection close. Used by TopBar for Group / Priority /
// Project / Mentee filters.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useEffect, useRef } from 'react'
import { ACCENT_TEAL, INK, INK_DIM, PANEL_BG, type FilterOption } from '../constants'

export function FilterChip({ label, value, options, onChange }: { label: string; value: string | null; options: FilterOption[]; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const active = options.find((o) => o.v === value)
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: 'rgba(255,255,255,0.02)', fontSize: 11, height: 26 }}>
      <span style={{ color: INK_DIM, paddingLeft: 10, paddingRight: 6, letterSpacing: '0.02em' }}>{label}</span>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 22, paddingLeft: 2, fontSize: 11, color: value ? ACCENT_TEAL : INK, background: 'transparent', border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
      >{active?.l ?? options[0]?.l}</button>
      <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', color: INK_DIM, fontSize: 9 }}>▾</span>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 180, maxHeight: 280, overflowY: 'auto', background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          {options.map((o) => (
            <button
              key={o.v ?? '__any__'}
              onClick={() => { onChange(o.v); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 11, background: o.v === value ? 'rgba(92,188,180,0.15)' : 'transparent', border: 'none', color: o.v === value ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: 'pointer' }}
            >{o.l}</button>
          ))}
        </div>
      )}
    </div>
  )
}
