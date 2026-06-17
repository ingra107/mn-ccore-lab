// FilterChip — pill with built-in dropdown, replaces guarded raw <select>.
// Outside-click + selection close. Used by TopBar for Group / Priority /
// Project / Mentee filters.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.
//
// MT-12 — typeahead input shown when options.length >= 5 (Airtable pattern,
// design ethos #3 — "Dropdowns with 5+ options show typeahead filter input
// + arrow key navigation"). Project filter has 71 entries in prod.
//
// MT-29 — aria-haspopup + aria-expanded on the dropdown toggle (was
// inconsistent w/ SavedViewsMenu).

import { useState, useEffect, useMemo, useRef } from 'react'
import { ACCENT_TEAL, INK, INK_DIM, PANEL_BG, withAlpha, type FilterOption } from '../constants'

export function FilterChip({ label, value, options, onChange }: { label: string; value: string | null; options: FilterOption[]; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const showTypeahead = options.length >= 5

  useEffect(() => {
    if (!open) return
    setFilter('')
    setFocusedIdx(-1)
    if (showTypeahead) setTimeout(() => filterInputRef.current?.focus(), 0)
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, showTypeahead])

  const filtered = useMemo(() => {
    if (!filter) return options
    const q = filter.toLowerCase()
    return options.filter(o => o.l.toLowerCase().includes(q))
  }, [options, filter])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(filtered.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && focusedIdx >= 0 && filtered[focusedIdx]) {
      e.preventDefault()
      onChange(filtered[focusedIdx].v)
      setOpen(false)
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const active = options.find((o) => o.v === value)
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: 'rgba(255,255,255,0.02)', fontSize: 11, minHeight: 26 }}>
      <span style={{ color: INK_DIM, paddingLeft: 10, paddingRight: 6, letterSpacing: '0.02em' }}>{label}</span>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 22, paddingLeft: 2, fontSize: 11, color: value ? ACCENT_TEAL : INK, background: 'transparent', border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
      >{active?.l ?? options[0]?.l}</button>
      <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', color: INK_DIM, fontSize: 9 }}>▾</span>
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, maxHeight: 320, overflowY: 'auto', background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          {showTypeahead && (
            <div style={{ position: 'sticky', top: 0, background: PANEL_BG, padding: '6px 8px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                ref={filterInputRef}
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setFocusedIdx(-1) }}
                onKeyDown={onKey}
                placeholder={`Filter ${label.toLowerCase()}…`}
                aria-label={`Filter ${label} options`}
                style={{ width: '100%', padding: '4px 8px', fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, color: INK, outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
          )}
          {filtered.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>no matches</div>
          )}
          {filtered.map((o, i) => {
            const focused = i === focusedIdx
            return (
              <button
                key={o.v ?? '__any__'}
                onClick={() => { onChange(o.v); setOpen(false) }}
                onMouseEnter={() => setFocusedIdx(i)}
                role="option"
                aria-selected={o.v === value}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 11, background: focused ? withAlpha(ACCENT_TEAL, 20) : o.v === value ? withAlpha(ACCENT_TEAL, 15) : 'transparent', border: 'none', color: o.v === value ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: 'pointer' }}
              >{o.l}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}
