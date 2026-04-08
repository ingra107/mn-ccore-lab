import { useState, useRef, useEffect, useCallback } from 'react'
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
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
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
          e.currentTarget.style.background = 'rgba(45,138,138,0.06)'
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
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 9999,
            minWidth: '120px',
            overflow: 'hidden',
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(opt.value)
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: opt.value === value ? 'rgba(45,138,138,0.06)' : 'none',
                cursor: 'pointer',
                fontSize,
                fontWeight: opt.value === value ? 600 : 400,
                color: opt.color || 'var(--ink)',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(45,138,138,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = opt.value === value ? 'rgba(45,138,138,0.06)' : 'none' }}
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
