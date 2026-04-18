import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, CalendarDays } from 'lucide-react'
import { formatShortDate } from '../lib/dateUtils'

interface InlineDatePickerProps {
  value: string | null
  onChange: (date: string | null) => void
}

export default function InlineDatePicker({ value, onChange }: InlineDatePickerProps) {
  const [editing, setEditing] = useState(false)
  const [pendingValue, setPendingValue] = useState<string | null>(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDate = value ? new Date(value + 'T12:00:00') : null
  const isOverdue = dueDate && dueDate < today
  const isToday = dueDate && dueDate.toDateString() === today.toDateString()
  const isTomorrow = dueDate && dueDate.toDateString() === new Date(today.getTime() + 86400000).toDateString()
  const isThisWeek = dueDate && !isOverdue && !isToday && !isTomorrow && dueDate < new Date(today.getTime() + 7 * 86400000)

  // Sync pending value when editing starts
  useEffect(() => {
    if (editing) setPendingValue(value)
  }, [editing, value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  const commitAndClose = useCallback(() => {
    if (pendingValue !== value) {
      onChange(pendingValue)
    }
    setEditing(false)
  }, [pendingValue, value, onChange])

  // Close on outside click
  useEffect(() => {
    if (!editing) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commitAndClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editing, commitAndClose])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only update local pending state — don't commit yet.
    // Native date pickers fire onChange on month navigation too.
    setPendingValue(e.target.value || null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitAndClose()
    }
    if (e.key === 'Escape') {
      setPendingValue(value) // revert
      setEditing(false)
    }
  }

  // Quick date presets
  const presets = (() => {
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const tmrw = new Date(today.getTime() + 86400000)
    const tmrwStr = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`
    const nextMon = new Date(today.getTime() + ((8 - today.getDay()) % 7 || 7) * 86400000)
    const nextMonStr = `${nextMon.getFullYear()}-${String(nextMon.getMonth() + 1).padStart(2, '0')}-${String(nextMon.getDate()).padStart(2, '0')}`
    const plusWeek = new Date(today.getTime() + 7 * 86400000)
    const plusWeekStr = `${plusWeek.getFullYear()}-${String(plusWeek.getMonth() + 1).padStart(2, '0')}-${String(plusWeek.getDate()).padStart(2, '0')}`
    return [
      { label: 'Today', value: todayStr },
      { label: 'Tomorrow', value: tmrwStr },
      { label: 'Next Mon', value: nextMonStr },
      { label: '+1 Week', value: plusWeekStr },
    ]
  })()

  if (editing) {
    return (
      <div ref={containerRef} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="date"
          value={pendingValue || ''}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          style={{
            fontSize: '12px',
            color: 'var(--ink)',
            background: 'var(--cream)',
            border: '1px solid var(--teal)',
            borderRadius: 'var(--radius-md)',
            padding: '3px 8px',
            outline: 'none',
            width: '130px',
            cursor: 'pointer',
          }}
        />
        <div
          className="absolute z-50 mt-1 flex gap-1 p-1 rounded-lg border"
          style={{
            top: '100%',
            left: 0,
            background: 'var(--cream)',
            borderColor: 'var(--border-subtle)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {presets.map(p => (
            <button
              key={p.label}
              onMouseDown={(e) => { e.preventDefault(); onChange(p.value); setEditing(false) }}
              className="px-2 py-1 rounded text-[10px] transition-colors"
              style={{
                border: 'none',
                background: value === p.value ? 'var(--teal-emphasis)' : 'transparent',
                color: value === p.value ? 'var(--teal)' : 'var(--slate)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </button>
          ))}
          {value && (
            <button
              onMouseDown={(e) => { e.preventDefault(); onChange(null); setEditing(false) }}
              className="px-2 py-1 rounded text-[10px] transition-colors"
              style={{ border: 'none', background: 'transparent', color: 'var(--maroon)', cursor: 'pointer', opacity: 0.85 }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="inline-flex items-center gap-1 rounded-md transition-colors"
        style={{
          padding: '3px 8px',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize: 'var(--text-label)',
          fontWeight: isOverdue || isToday ? 500 : 400,
          color: isOverdue ? 'var(--maroon)' : isToday ? 'var(--teal)' : isThisWeek ? 'var(--gold)' : value ? 'var(--slate)' : 'var(--slate)',
          opacity: value ? 0.85 : 0.85,
          fontVariantNumeric: 'tabular-nums',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--teal-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}
      >
        <CalendarDays size={11} />
        <span>{!value ? 'Set date' : isOverdue
          ? (() => { const days = Math.ceil((today.getTime() - dueDate!.getTime()) / 86400000); return days === 1 ? 'Yesterday' : `${days}d ago` })()
          : isToday ? 'Today' : isTomorrow ? 'Tomorrow'
          : isThisWeek ? (() => { const days = Math.ceil((dueDate!.getTime() - today.getTime()) / 86400000); return `in ${days}d` })()
          : formatShortDate(value)
        }</span>
        <ChevronDown size={10} style={{ opacity: 0.85 }} />
      </button>
    </div>
  )
}
