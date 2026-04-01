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

  const isOverdue = value && new Date(value + 'T23:59:59') < new Date()

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
            fontFamily: 'var(--font-sans)',
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
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          fontWeight: isOverdue ? 500 : 400,
          color: isOverdue ? 'var(--maroon)' : value ? 'var(--slate)' : 'var(--slate)',
          opacity: value ? 1 : 0.3,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'rgba(45,138,138,0.04)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}
      >
        <CalendarDays size={11} />
        <span>{value ? (isOverdue ? 'Overdue' : formatShortDate(value)) : 'Set date'}</span>
        <ChevronDown size={10} style={{ opacity: 0.3 }} />
      </button>
    </div>
  )
}
