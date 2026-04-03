import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface InlineSelectProps {
  value: string
  options: { value: string; label: string; color?: string }[]
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export default function InlineSelect({ value, options, onChange, size = 'sm' }: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = options.find((o) => o.value === value)
  const fontSize = size === 'sm' ? '11px' : '12px'
  const py = size === 'sm' ? '2px' : '4px'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
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
          borderRadius: '6px',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
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

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-card-hover)',
            zIndex: 50,
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
                padding: '10px 12px',
                border: 'none',
                background: opt.value === value ? 'rgba(45,138,138,0.06)' : 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
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
        </div>
      )}
    </div>
  )
}
