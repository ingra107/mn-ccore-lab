import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

interface InlineSelectProps {
  value: string
  options: { value: string; label: string; color?: string }[]
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export default function InlineSelect({ value, options, onChange, size = 'sm' }: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', () => setOpen(false), true)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', () => setOpen(false), true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (open) {
      setFilter('')
      setFocusedIdx(-1)
      setTimeout(() => filterRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!filter) return options
    const lower = filter.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(lower))
  }, [options, filter])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focusedIdx >= 0 && filtered[focusedIdx]) {
      e.preventDefault()
      onChange(filtered[focusedIdx].value)
      setOpen(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const current = options.find((o) => o.value === value)
  const fontSize = size === 'sm' ? '11px' : '12px'
  const py = size === 'sm' ? '2px' : '4px'

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: `${py} 8px`,
          borderRadius: 'var(--radius-md)',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize,
          fontWeight: 500,
          color: current?.color || 'var(--slate)',
          transition: 'all 0.12s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--teal-hover)'
          e.currentTarget.style.borderColor = 'var(--border-subtle)'
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.borderColor = 'transparent'
          }
        }}
      >
        {current?.label || value}
        <ChevronDown size={10} style={{ opacity: 0.4 }} />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)',
            zIndex: 'var(--z-toast)',
            minWidth: '120px',
            overflow: 'hidden',
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {options.length >= 5 && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <input
                ref={filterRef}
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setFocusedIdx(0) }}
                onKeyDown={handleKeyDown}
                placeholder="Filter..."
                style={{
                  width: '100%',
                  fontSize: 'var(--text-small)',
                  color: 'var(--ink)',
                  background: 'var(--field-bg)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--sp-xs) var(--sp-sm)',
                  outline: 'none',
                }}
              />
            </div>
          )}
          {filtered.map((opt, idx) => (
            <button
              key={opt.value}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(opt.value)
                setOpen(false)
              }}
              onMouseEnter={() => setFocusedIdx(idx)}
              onMouseLeave={() => setFocusedIdx(-1)}
              onKeyDown={handleKeyDown}
              style={{
                display: 'block',
                width: '100%',
                padding: 'var(--sp-sm) var(--sp-md)',
                border: 'none',
                background: idx === focusedIdx
                  ? 'var(--teal-active)'
                  : opt.value === value
                    ? 'var(--teal-hover)'
                    : 'none',
                cursor: 'pointer',
                fontSize,
                fontWeight: opt.value === value ? 600 : 400,
                color: opt.color || 'var(--ink)',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
