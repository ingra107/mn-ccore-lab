import { useState, useRef, useEffect } from 'react'
import { ChevronDown, CalendarDays } from 'lucide-react'
import { formatShortDate } from '../lib/dateUtils'

interface InlineDatePickerProps {
  value: string | null
  onChange: (date: string | null) => void
}

export default function InlineDatePicker({ value, onChange }: InlineDatePickerProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDate = value ? new Date(value + 'T12:00:00') : null
  const isOverdue = dueDate && dueDate < today
  const isToday = dueDate && dueDate.toDateString() === today.toDateString()
  const isTomorrow = dueDate && dueDate.toDateString() === new Date(today.getTime() + 86400000).toDateString()
  const isThisWeek = dueDate && !isOverdue && !isToday && !isTomorrow && dueDate < new Date(today.getTime() + 7 * 86400000)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      // Try to show the native date picker
      try { inputRef.current.showPicker() } catch { /* not supported in all browsers */ }
    }
  }, [editing])

  // Close on outside click
  useEffect(() => {
    if (!editing) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editing])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value || null
    onChange(newVal)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setEditing(false)
    }
    if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div ref={containerRef} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="date"
          value={value || ''}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          onKeyDown={handleKeyDown}
          style={{
            fontSize: '12px',
            color: 'var(--ink)',
            background: 'var(--cream)',
            border: '1px solid var(--teal)',
            borderRadius: '6px',
            padding: '3px 8px',
            outline: 'none',
            width: '130px',
            cursor: 'pointer',
          }}
        />
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
          fontSize: '12px',
          fontWeight: isOverdue || isToday ? 500 : 400,
          color: isOverdue ? 'var(--maroon)' : isToday ? 'var(--teal)' : isThisWeek ? 'var(--gold)' : value ? 'var(--slate)' : 'var(--slate)',
          opacity: value ? 1 : 0.3,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'rgba(45,138,138,0.04)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}
      >
        <CalendarDays size={11} />
        <span>{!value ? 'Set date' : isOverdue ? formatShortDate(value) : isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatShortDate(value)}</span>
        <ChevronDown size={10} style={{ opacity: 0.3 }} />
      </button>
    </div>
  )
}
